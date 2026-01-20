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

// Get current time in AEDT ISO format
function getNowAEDT(): string {
  const now = new Date();
  // Format as ISO with Sydney timezone offset
  return now.toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' }).replace(' ', 'T') + '+11:00';
}

// Scrape sports data using Firecrawl search
async function scrapeMatchData(
  teams: { home: string; away: string; league: string; sport: string }[],
  firecrawlApiKey: string
): Promise<Record<string, any>> {
  const scrapedData: Record<string, any> = {};
  
  // Build search queries for each match
  const searchPromises = teams.slice(0, 8).map(async (match) => {
    const matchKey = `${match.home} vs ${match.away}`;
    
    try {
      // Search for recent news and form data
      const searchQuery = `${match.home} vs ${match.away} ${match.league} team news injuries form preview 2026`;
      
      console.log(`Searching for: ${searchQuery}`);
      
      const response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 3,
          tbs: 'qdr:w', // Last week
          scrapeOptions: {
            formats: ['markdown']
          }
        }),
      });

      if (!response.ok) {
        console.error(`Firecrawl search failed for ${matchKey}:`, response.status);
        return { matchKey, data: null };
      }

      const data = await response.json();
      
      // Extract relevant content from search results
      const content = data.data?.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.markdown?.substring(0, 1500) || result.description
      })) || [];

      console.log(`Found ${content.length} results for ${matchKey}`);
      
      return { matchKey, data: content };
    } catch (error) {
      console.error(`Error scraping ${matchKey}:`, error);
      return { matchKey, data: null };
    }
  });

  const results = await Promise.all(searchPromises);
  
  for (const result of results) {
    if (result.data) {
      scrapedData[result.matchKey] = result.data;
    }
  }

  return scrapedData;
}

// Send scraped data + odds to Perplexity for betting decisions
async function analyzeWithPerplexity(
  eventsWithOdds: any[],
  scrapedData: Record<string, any>,
  context: any,
  perplexityApiKey: string
): Promise<any> {
  
  // Build the payload with scraped data included
  const eventsPayload = eventsWithOdds.map(event => {
    const matchKey = `${event.home_team} vs ${event.away_team}`;
    const scraped = scrapedData[matchKey] || [];
    
    return {
      event_id: event.event_id,
      sport: event.sport,
      league: event.league,
      home_team: event.home_team,
      away_team: event.away_team,
      start_time_aedt: event.start_time_aedt,
      // Scraped research data
      scraped_data: scraped.length > 0 ? scraped : 'No scraped data available',
      // Market odds
      markets: event.markets
    };
  });

  // Your original prompt from the spec
  const systemPrompt = `You are an institutional-grade sports betting analyst and quantitative decision engine.

Objective: maximise long-term expected value (EV) and positive Closing Line Value (CLV).
Only consider strictly upcoming events.
Assign a Bet Score from 0–100.
Do not recommend any bet with Bet Score < 70.
Respect bankroll and exposure limits.
Return VALID JSON ONLY.

METHODOLOGY:
1. Analyze the SCRAPED DATA provided for each match - this contains real team news, injuries, form, and previews
2. Use this data to estimate TRUE PROBABILITY for each outcome
3. Compare to implied probability from bookmaker odds (1/odds)
4. Calculate edge = model_probability - implied_probability
5. Only recommend where edge >= 3% AND bet_score >= 70

BET SCORE CALCULATION (0-100):
- Base on edge strength
- Adjust for confidence in scraped data quality
- Adjust for information recency
- Score >= 85: Strong bet
- Score 75-84: Good bet
- Score 70-74: Marginal bet
- Score < 70: Do not recommend

STAKE SIZING (Kelly Criterion):
stake_units = (edge / (odds - 1)) * bankroll * fraction
- Use quarter Kelly (fraction = 0.25) for safety
- Cap at max_per_event_exposure`;

  const userPrompt = `CONTEXT:
{
  "timezone": "Australia/Sydney",
  "now_aedt": "${context.now_aedt}",
  "bankroll_units": ${context.bankroll_units},
  "max_daily_exposure_pct": ${context.max_daily_exposure_pct},
  "max_per_event_exposure_pct": ${context.max_per_event_exposure_pct},
  "max_bets": ${context.max_bets},
  "engine": "${context.engine}"
}

EVENTS WITH SCRAPED DATA AND ODDS:
${JSON.stringify(eventsPayload, null, 2)}

Analyze each event using the SCRAPED DATA provided. This data was gathered from real sports websites and contains actual team news, injuries, and match previews.

Return your analysis as VALID JSON with this structure:
{
  "recommended_bets": [
    {
      "event_id": "string",
      "market_id": "string",
      "sport": "string",
      "league": "string",
      "selection": "string (the outcome name from markets)",
      "selection_label": "string (human readable, e.g. 'Team A to Win')",
      "odds_decimal": number,
      "bookmaker": "string",
      "model_probability": number (0-1),
      "implied_probability": number (0-1),
      "edge": number (positive means value),
      "bet_score": number (0-100),
      "recommended_stake_units": number,
      "rationale": "string (cite specific info from scraped data)"
    }
  ],
  "portfolio_summary": {
    "total_stake_units": number,
    "bankroll_units": number,
    "expected_value_units": number
  }
}

If no bets meet criteria:
{
  "recommended_bets": [],
  "reason": "No bets met Bet Score and risk thresholds."
}`;

  console.log('Sending to Perplexity for analysis...');

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
    console.error('Perplexity API error:', errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const citations = data.citations || [];

  console.log(`Perplexity responded with ${citations.length} citations`);

  if (!content) {
    throw new Error('No content in Perplexity response');
  }

  // Parse JSON from response
  let jsonContent = content.trim();
  
  // Remove markdown code blocks if present
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  }
  
  // Find JSON object
  const jsonStart = jsonContent.indexOf('{');
  const jsonEnd = jsonContent.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
  }

  return JSON.parse(jsonContent.trim());
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

    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
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

    console.log('=== BETTING MODEL START ===');
    console.log('Input:', { sports, window_hours, max_bets });

    // STEP 1: Query events and odds from database
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`*, markets (*)`)
      .in('sport', sports)
      .eq('status', 'upcoming')
      .gte('start_time_utc', now.toISOString())
      .lte('start_time_utc', windowEnd.toISOString())
      .order('start_time_utc', { ascending: true })
      .limit(15);

    if (eventsError) {
      throw new Error(`Error fetching events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          recommended_bets: [],
          reason: 'No upcoming events found. Click "Refresh Odds" first to fetch latest odds data.',
          events_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`STEP 1: Found ${events.length} events`);

    // STEP 2: Scrape match data using Firecrawl
    console.log('STEP 2: Scraping match data with Firecrawl...');
    
    const teamsToScrape = events.map(e => ({
      home: e.home_team,
      away: e.away_team,
      league: e.league,
      sport: e.sport
    }));

    const scrapedData = await scrapeMatchData(teamsToScrape, firecrawlApiKey);
    console.log(`Scraped data for ${Object.keys(scrapedData).length} matches`);

    // STEP 3: Prepare events with best odds
    const eventsWithOdds = events.map(event => {
      // Get best odds for each selection
      const bestOdds: Record<string, { odds: number; bookmaker: string; market_id: string }> = {};
      
      for (const market of event.markets || []) {
        const key = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        if (!bestOdds[key] || odds > bestOdds[key].odds) {
          bestOdds[key] = { odds, bookmaker: market.bookmaker, market_id: market.id };
        }
      }

      return {
        event_id: event.id,
        sport: event.sport,
        league: event.league,
        home_team: event.home_team,
        away_team: event.away_team,
        start_time_aedt: event.start_time_aedt,
        markets: Object.entries(bestOdds).map(([key, data]) => {
          const [marketType, selection] = key.split('_');
          return {
            market_id: data.market_id,
            type: marketType === 'h2h' ? 'moneyline' : marketType,
            selection,
            odds_decimal: data.odds,
            bookmaker: data.bookmaker,
            implied_probability: (1 / data.odds).toFixed(4)
          };
        })
      };
    });

    // STEP 4: Send to Perplexity for analysis
    console.log('STEP 3: Sending scraped data + odds to Perplexity...');
    
    const nowAEDT = getNowAEDT();
    
    const modelResponse = await analyzeWithPerplexity(
      eventsWithOdds,
      scrapedData,
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

    console.log('STEP 4: Perplexity analysis complete');

    // STEP 5: Validate and enforce limits
    const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
    const maxPerEventUnits = bankroll_units * max_per_event_exposure_pct;
    
    let totalStake = 0;
    const validatedBets: RecommendedBet[] = [];

    for (const bet of modelResponse.recommended_bets || []) {
      if (bet.bet_score < 70) continue;
      
      const cappedStake = Math.min(bet.recommended_stake_units || 1, maxPerEventUnits);
      if (totalStake + cappedStake > maxDailyUnits) continue;
      if (validatedBets.length >= max_bets) break;
      
      totalStake += cappedStake;
      validatedBets.push({ ...bet, recommended_stake_units: cappedStake });
    }

    console.log(`STEP 5: Validated ${validatedBets.length} bets`);

    // STEP 6: Save to database
    if (userId && validatedBets.length > 0) {
      const betsToInsert = validatedBets.map(bet => {
        const event = events.find(e => e.id === bet.event_id);
        return {
          user_id: userId,
          event_id: bet.event_id,
          market_id: bet.market_id,
          sport: bet.sport,
          league: bet.league,
          event_name: event ? `${event.home_team} vs ${event.away_team}` : bet.selection_label,
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

      await supabase.from('model_bets').insert(betsToInsert);
      console.log(`Saved ${betsToInsert.length} bets to database`);
    }

    console.log('=== BETTING MODEL COMPLETE ===');

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
        matches_scraped: Object.keys(scrapedData).length,
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
