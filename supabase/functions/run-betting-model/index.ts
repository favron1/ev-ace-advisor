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

// Research events using Perplexity for real-time data
async function researchEventsWithPerplexity(
  events: any[],
  perplexityApiKey: string
): Promise<Map<string, any>> {
  const researchMap = new Map<string, any>();
  
  // Build a batch query for all events
  const eventsQuery = events.slice(0, 10).map(e => 
    `${e.home_team} vs ${e.away_team} (${e.league})`
  ).join(', ');

  const researchPrompt = `Research the following upcoming sports matches and provide betting-relevant analysis for each:

${eventsQuery}

For each match, provide:
1. Recent form (last 5 games for each team)
2. Key injuries or suspensions
3. Head-to-head record
4. Any relevant news (manager changes, motivation factors)
5. Weather conditions if outdoor sport
6. Expert/bookmaker consensus

Format as JSON with match names as keys.`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { 
            role: 'system', 
            content: 'You are a sports betting research analyst. Provide factual, current information about upcoming matches. Focus on data that affects betting decisions: form, injuries, head-to-head, and expert opinions.' 
          },
          { role: 'user', content: researchPrompt }
        ],
        search_recency_filter: 'week',
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      console.error('Perplexity research error:', await response.text());
      return researchMap;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    
    console.log('Perplexity research response received with', citations.length, 'citations');
    
    // Store the research for each event
    for (const event of events) {
      const matchKey = `${event.home_team} vs ${event.away_team}`;
      researchMap.set(event.id, {
        research: content,
        citations,
        matchKey
      });
    }
  } catch (error) {
    console.error('Perplexity research failed:', error);
  }

  return researchMap;
}

// Use Perplexity to analyze bets with real-time context
async function analyzeBetsWithPerplexity(
  events: any[],
  researchData: Map<string, any>,
  context: any,
  perplexityApiKey: string
): Promise<ModelResponse> {
  
  // Build events with odds data
  const eventsWithOdds = events.map(event => {
    const research = researchData.get(event.id);
    
    // Get best odds for each selection
    const marketsBySelection: Record<string, { odds: number; bookmaker: string; market_id: string }> = {};
    
    for (const market of event.markets || []) {
      const key = `${market.market_type}_${market.selection}`;
      if (!marketsBySelection[key] || market.odds_decimal > marketsBySelection[key].odds) {
        marketsBySelection[key] = {
          odds: parseFloat(market.odds_decimal),
          bookmaker: market.bookmaker,
          market_id: market.id
        };
      }
    }

    return {
      event_id: event.id,
      sport: event.sport,
      league: event.league,
      home_team: event.home_team,
      away_team: event.away_team,
      start_time_aedt: event.start_time_aedt,
      research: research?.research || 'No research available',
      available_bets: Object.entries(marketsBySelection).map(([key, data]) => ({
        selection: key.split('_')[1],
        market_type: key.split('_')[0],
        odds: data.odds,
        bookmaker: data.bookmaker,
        market_id: data.market_id,
        implied_prob: (1 / data.odds).toFixed(4)
      }))
    };
  });

  const systemPrompt = `You are an elite quantitative sports betting analyst using Perplexity's real-time research capabilities.

Your job is to identify VALUE BETS where the true probability exceeds the implied probability from bookmaker odds.

METHODOLOGY:
1. Analyze the research data provided for each match
2. Estimate the TRUE probability of each outcome based on:
   - Recent form and momentum
   - Injuries and team news
   - Head-to-head history
   - Home/away factors
   - Motivation and context
3. Compare your probability to the implied probability from odds
4. Only recommend bets where:
   - Your estimated probability significantly exceeds implied probability
   - The edge is at least 3%
   - The bet score is 70 or higher

BET SCORE CALCULATION:
- Base on edge strength (higher edge = higher score)
- Consider confidence in your probability estimate
- Account for information quality and recency
- Range: 0-100, only recommend if >= 70

STAKE SIZING (Kelly Criterion):
- stake = (edge * bankroll) / (odds - 1)
- Cap at max_per_event_exposure
- Be conservative with uncertain probabilities

You MUST return ONLY valid JSON with this structure:
{
  "recommended_bets": [
    {
      "event_id": "string",
      "market_id": "string",
      "sport": "string",
      "league": "string", 
      "selection": "string",
      "selection_label": "Team Name to Win/Draw/etc",
      "odds_decimal": number,
      "bookmaker": "string",
      "model_probability": number (0-1, your estimate),
      "implied_probability": number (0-1),
      "edge": number (model_prob - implied_prob),
      "bet_score": number (70-100),
      "recommended_stake_units": number,
      "rationale": "Brief explanation citing specific research"
    }
  ],
  "portfolio_summary": {
    "total_stake_units": number,
    "bankroll_units": number,
    "expected_value_units": number
  }
}

If no value bets found, return:
{
  "recommended_bets": [],
  "reason": "Analysis complete - no bets met the 70+ bet score threshold"
}`;

  const userPrompt = `CONTEXT:
- Timezone: Australia/Sydney  
- Current time: ${context.now_aedt}
- Bankroll: ${context.bankroll_units} units
- Max daily exposure: ${(context.max_daily_exposure_pct * 100)}%
- Max per event: ${(context.max_per_event_exposure_pct * 100)}%
- Max bets: ${context.max_bets}

EVENTS TO ANALYZE:
${JSON.stringify(eventsWithOdds, null, 2)}

Analyze each event using the research provided. Identify any value bets and return your recommendations as JSON.`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
        temperature: 0.2,
        search_recency_filter: 'day'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity analysis error:', errorText);
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Perplexity response');
    }

    console.log('Perplexity analysis response:', content.substring(0, 500));

    // Parse JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    }
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }

    return JSON.parse(jsonContent.trim());
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
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');

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

    console.log('Running betting model with Perplexity, input:', input);

    // STEP 1: Fetch fresh odds data first
    if (oddsApiKey) {
      console.log('Fetching fresh odds data...');
      try {
        const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-odds-v2`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          }
        });
        
        if (fetchResponse.ok) {
          const fetchResult = await fetchResponse.json();
          console.log('Fetched odds:', fetchResult);
        }
      } catch (fetchError) {
        console.error('Error fetching odds:', fetchError);
      }
    }

    // Calculate time window
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    // STEP 2: Query events from database
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
      .order('start_time_utc', { ascending: true });

    if (eventsError) {
      throw new Error(`Error fetching events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          recommended_bets: [],
          reason: 'No upcoming events found. The odds data may not be available yet - try again in a few minutes.',
          events_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events to analyze`);

    // STEP 3: Research events with Perplexity
    console.log('Researching events with Perplexity...');
    const researchData = await researchEventsWithPerplexity(events, perplexityApiKey);

    // STEP 4: Analyze bets with Perplexity
    console.log('Analyzing bets with Perplexity...');
    const nowAEDT = getNowAEDT();
    
    const modelResponse = await analyzeBetsWithPerplexity(
      events,
      researchData,
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

    // STEP 5: Validate and enforce server-side limits
    const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
    const maxPerEventUnits = bankroll_units * max_per_event_exposure_pct;
    
    let totalStake = 0;
    const validatedBets: RecommendedBet[] = [];

    for (const bet of modelResponse.recommended_bets || []) {
      // Skip if bet score too low
      if (bet.bet_score < 70) continue;
      
      // Cap stake at per-event limit
      const cappedStake = Math.min(bet.recommended_stake_units, maxPerEventUnits);
      
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

    // STEP 6: Save validated bets to database
    if (userId && validatedBets.length > 0) {
      const betsToInsert = validatedBets.map(bet => {
        const event = events.find(e => e.id === bet.event_id);
        const eventName = event ? `${event.home_team} vs ${event.away_team}` : 'Unknown Event';
        
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
            sum + (bet.edge * bet.recommended_stake_units), 0)
        },
        events_analyzed: events.length,
        research_sources: researchData.size,
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
