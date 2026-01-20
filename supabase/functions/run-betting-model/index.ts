import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModelInput {
  sports: string[];
  engine: 'team_sports' | 'horse' | 'greyhound';
  window_hours: number;
  bankroll_units: number;
  max_daily_exposure_pct: number;
  max_per_event_exposure_pct: number;
  max_bets: number;
}

interface RecommendedBet {
  event_id: string;
  market_id: string;
  sport: string;
  league: string;
  selection: string;
  selection_label: string;
  odds_decimal: number;
  bookmaker: string;
  model_probability: number;
  implied_probability: number;
  edge: number;
  bet_score: number;
  recommended_stake_units: number;
  rationale: string;
}

interface ModelResponse {
  recommended_bets: RecommendedBet[];
  portfolio_summary?: {
    total_stake_units: number;
    bankroll_units: number;
    expected_value_units: number;
  };
  reason?: string;
}

// Get current time in AEDT
function getNowAEDT(): string {
  const now = new Date();
  return now.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// Use Perplexity to analyze bets - single call with all data
async function analyzeBetsWithPerplexity(
  events: any[],
  context: any,
  perplexityApiKey: string
): Promise<ModelResponse> {
  
  // Build compact events with best odds for each selection
  const eventsWithOdds = events.slice(0, 15).map(event => {
    // Get best odds for each selection across all bookmakers
    const bestOdds: Record<string, { odds: number; bookmaker: string; market_id: string }> = {};
    
    for (const market of event.markets || []) {
      const key = `${market.market_type}_${market.selection}`;
      const odds = parseFloat(market.odds_decimal);
      if (!bestOdds[key] || odds > bestOdds[key].odds) {
        bestOdds[key] = {
          odds: odds,
          bookmaker: market.bookmaker,
          market_id: market.id
        };
      }
    }

    return {
      event_id: event.id,
      sport: event.sport,
      league: event.league,
      match: `${event.home_team} vs ${event.away_team}`,
      home: event.home_team,
      away: event.away_team,
      kickoff: event.start_time_aedt,
      markets: Object.entries(bestOdds).map(([key, data]) => {
        const [marketType, selection] = key.split('_');
        return {
          market_id: data.market_id,
          type: marketType === 'h2h' ? 'moneyline' : marketType,
          selection,
          odds: data.odds,
          bookmaker: data.bookmaker,
          implied_prob: 1 / data.odds
        };
      })
    };
  });

  const systemPrompt = `You are a sports betting analyst with access to real-time web data. Your job is to find VALUE BETS.

TASK:
1. Search for current info on each match: team form, injuries, news, h2h
2. Estimate TRUE probability for each outcome
3. Compare to bookmaker implied probability 
4. Recommend bets where your probability > implied probability by at least 3%

RULES:
- Only recommend bets with Bet Score >= 70
- Bet Score = confidence in your edge (70-100 scale)
- Use Kelly criterion for stake sizing, capped at max exposure
- Be conservative - if unsure, don't recommend

Return ONLY valid JSON:
{
  "recommended_bets": [
    {
      "event_id": "string",
      "market_id": "string",
      "sport": "string",
      "league": "string", 
      "selection": "outcome name",
      "selection_label": "Team X to Win",
      "odds_decimal": 2.50,
      "bookmaker": "string",
      "model_probability": 0.45,
      "implied_probability": 0.40,
      "edge": 0.05,
      "bet_score": 78,
      "recommended_stake_units": 1.5,
      "rationale": "Brief reason citing form/injuries/etc"
    }
  ],
  "portfolio_summary": {
    "total_stake_units": 1.5,
    "bankroll_units": 100,
    "expected_value_units": 0.08
  }
}

If no value found: {"recommended_bets": [], "reason": "No value bets identified"}`;

  const userPrompt = `Find value bets from these matches. Use your search capabilities to get current form, injuries, and news.

CONTEXT:
- Now: ${context.now_aedt} (Sydney time)
- Bankroll: ${context.bankroll_units} units
- Max daily exposure: ${context.max_daily_exposure_pct * 100}%
- Max per event: ${context.max_per_event_exposure_pct * 100}%
- Max bets: ${context.max_bets}

MATCHES:
${JSON.stringify(eventsWithOdds, null, 2)}

Search for info on these teams, analyze the odds, and return your value bet recommendations as JSON.`;

  console.log(`Sending ${eventsWithOdds.length} events to Perplexity for analysis`);

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const citations = data.citations || [];

    console.log(`Perplexity responded with ${citations.length} citations`);

    if (!content) {
      throw new Error('No content in Perplexity response');
    }

    console.log('Perplexity response preview:', content.substring(0, 300));

    // Parse JSON from response
    let jsonContent = content.trim();
    
    // Remove markdown code blocks if present
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }
    
    // Try to find JSON object in response
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    }

    const parsed = JSON.parse(jsonContent.trim());
    
    // Add citations to rationale if available
    if (citations.length > 0 && parsed.recommended_bets) {
      parsed.recommended_bets = parsed.recommended_bets.map((bet: any) => ({
        ...bet,
        rationale: bet.rationale + ` [Sources: ${citations.slice(0, 2).join(', ')}]`
      }));
    }
    
    return parsed;
  } catch (error) {
    console.error('Perplexity analysis failed:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');

    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    const input: ModelInput = await req.json();
    
    const {
      sports = ['soccer'],
      engine = 'team_sports',
      window_hours = 12,
      bankroll_units = 100,
      max_daily_exposure_pct = 0.10,
      max_per_event_exposure_pct = 0.03,
      max_bets = 10
    } = input;

    console.log('Running betting model with Perplexity:', { sports, window_hours, max_bets });

    // Calculate time window
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    // Query events from database
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`
        *,
        markets (*)
      `)
      .in('sport', sports)
      .eq('status', 'upcoming')
      .gte('start_time_utc', now.toISOString())
      .lte('start_time_utc', windowEnd.toISOString())
      .order('start_time_utc', { ascending: true })
      .limit(20);

    if (eventsError) {
      throw new Error(`Error fetching events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          recommended_bets: [],
          reason: 'No upcoming events found in the selected time window. Try clicking "Refresh Odds" first or expanding the time window.',
          events_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events with ${events.reduce((sum, e) => sum + (e.markets?.length || 0), 0)} markets`);

    // Analyze bets with Perplexity
    const nowAEDT = getNowAEDT();
    
    const modelResponse = await analyzeBetsWithPerplexity(
      events,
      {
        now_aedt: nowAEDT,
        bankroll_units,
        max_daily_exposure_pct,
        max_per_event_exposure_pct,
        max_bets,
        engine
      },
      perplexityApiKey
    );

    // Validate and enforce server-side limits
    const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
    const maxPerEventUnits = bankroll_units * max_per_event_exposure_pct;
    
    let totalStake = 0;
    const validatedBets: RecommendedBet[] = [];

    for (const bet of modelResponse.recommended_bets || []) {
      // Skip if bet score too low
      if (bet.bet_score < 70) continue;
      
      // Cap stake at per-event limit
      const cappedStake = Math.min(bet.recommended_stake_units || 1, maxPerEventUnits);
      
      // Check daily exposure limit
      if (totalStake + cappedStake > maxDailyUnits) continue;
      
      // Check max bets limit
      if (validatedBets.length >= max_bets) break;
      
      totalStake += cappedStake;
      validatedBets.push({
        ...bet,
        recommended_stake_units: cappedStake
      });
    }

    console.log(`Validated ${validatedBets.length} bets, total stake: ${totalStake}`);

    // Save validated bets to database
    if (userId && validatedBets.length > 0) {
      const betsToInsert = validatedBets.map(bet => {
        const event = events.find(e => e.id === bet.event_id);
        const eventName = event ? `${event.home_team} vs ${event.away_team}` : bet.selection_label;
        
        return {
          user_id: userId,
          event_id: bet.event_id,
          market_id: bet.market_id,
          sport: bet.sport,
          league: bet.league,
          event_name: eventName,
          selection_label: bet.selection_label,
          odds_taken: bet.odds_decimal,
          bookmaker: bet.bookmaker,
          model_probability: bet.model_probability,
          implied_probability: bet.implied_probability,
          edge: bet.edge,
          bet_score: bet.bet_score,
          recommended_stake_units: bet.recommended_stake_units,
          rationale: bet.rationale,
          engine,
          result: 'pending'
        };
      });

      const { error: insertError } = await supabase
        .from('model_bets')
        .insert(betsToInsert);

      if (insertError) {
        console.error('Error saving bets:', insertError);
      } else {
        console.log(`Saved ${betsToInsert.length} bets to database`);
      }
    }

    return new Response(
      JSON.stringify({
        recommended_bets: validatedBets,
        portfolio_summary: {
          total_stake_units: totalStake,
          bankroll_units,
          expected_value_units: validatedBets.reduce((sum, bet) => 
            sum + ((bet.edge || 0) * (bet.recommended_stake_units || 0)), 0)
        },
        events_analyzed: events.length,
        reason: validatedBets.length === 0 ? (modelResponse.reason || 'No bets met the 70+ bet score threshold') : undefined,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in run-betting-model:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
