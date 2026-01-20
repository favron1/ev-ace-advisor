import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecheckInput {
  event_id: string;
  selection: string;
  market_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!perplexityApiKey || !firecrawlApiKey) {
      throw new Error('API keys not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const input: RecheckInput = await req.json();
    const { event_id, selection, market_id } = input;

    console.log('=== RECHECK BET START ===');
    console.log('Input:', { event_id, selection });

    // Get the event with its markets
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`*, markets (*)`)
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ 
          message: 'Event not found or has ended',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if event has started
    const eventStart = new Date(event.start_time_utc);
    const now = new Date();
    if (eventStart < now) {
      return new Response(
        JSON.stringify({ 
          message: 'Event has already started',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get best current odds for this selection
    const relevantMarkets = event.markets?.filter(
      (m: any) => m.selection === selection
    ) || [];

    if (relevantMarkets.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'Market no longer available',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find best odds
    const bestMarket = relevantMarkets.reduce((best: any, current: any) => {
      return parseFloat(current.odds_decimal) > parseFloat(best.odds_decimal) ? current : best;
    }, relevantMarkets[0]);

    const currentOdds = parseFloat(bestMarket.odds_decimal);
    const currentImpliedProb = 1 / currentOdds;

    // Scrape latest data for this match
    console.log('Scraping latest match data...');
    
    const searchQuery = `${event.home_team} vs ${event.away_team} ${event.league} latest news injuries lineup`;
    
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 3,
        tbs: 'qdr:d', // Last day for rechecks
        scrapeOptions: { formats: ['markdown'] }
      }),
    });

    let scrapedContent = '';
    if (scrapeResponse.ok) {
      const scrapeData = await scrapeResponse.json();
      scrapedContent = scrapeData.data?.map((r: any) => 
        `${r.title}: ${r.markdown?.substring(0, 800) || r.description}`
      ).join('\n\n') || '';
    }

    // Send to Perplexity for updated analysis
    console.log('Getting updated analysis from Perplexity...');

    const systemPrompt = `You are a sports betting analyst. Analyze the latest data for a single bet and provide an updated assessment.

Return ONLY valid JSON with this structure:
{
  "model_probability": number (0-1, your estimated true probability),
  "edge": number (model_probability - implied_probability),
  "bet_score": number (50-100),
  "confidence": "high" | "medium" | "low",
  "rationale": "string (updated reasoning based on latest data)"
}`;

    const userPrompt = `EVENT: ${event.home_team} vs ${event.away_team}
LEAGUE: ${event.league}
START TIME (AEDT): ${event.start_time_aedt}
SELECTION: ${selection}
CURRENT ODDS: ${currentOdds.toFixed(2)}
IMPLIED PROBABILITY: ${(currentImpliedProb * 100).toFixed(1)}%

LATEST SCRAPED DATA:
${scrapedContent || 'No recent data available'}

Analyze this bet and provide updated probability estimates.`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      }),
    });

    if (!perplexityResponse.ok) {
      throw new Error('Perplexity API error');
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Perplexity response');
    }

    // Parse JSON from response
    let jsonContent = content.trim();
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    }

    const analysis = JSON.parse(jsonContent.trim());

    // Calculate recommended stake (25% Kelly)
    const edge = analysis.edge || (analysis.model_probability - currentImpliedProb);
    const kellyStake = edge > 0 ? (0.25 * edge / (currentOdds - 1)) : 0.25;
    const stakeMultiplier = analysis.confidence === 'high' ? 1 : analysis.confidence === 'medium' ? 0.75 : 0.5;
    const recommendedStake = Math.min(Math.max(kellyStake * stakeMultiplier, 0.25), 1.5);

    const updatedBet = {
      event_id,
      market_id: bestMarket.id,
      sport: event.sport,
      league: event.league,
      event_name: `${event.home_team} vs ${event.away_team}`,
      start_time: event.start_time_aedt,
      selection,
      selection_label: selection,
      odds_decimal: currentOdds,
      bookmaker: bestMarket.bookmaker,
      model_probability: analysis.model_probability,
      implied_probability: currentImpliedProb,
      edge: edge,
      bet_score: analysis.bet_score,
      confidence: analysis.confidence,
      recommended_stake_units: recommendedStake,
      rationale: analysis.rationale,
    };

    console.log('=== RECHECK BET COMPLETE ===');

    return new Response(
      JSON.stringify({
        updated_bet: updatedBet,
        message: 'Bet rechecked successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in recheck-bet:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
