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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
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

    console.log('Running betting model with input:', input);

    // Calculate time window
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    // Query upcoming events within the window
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
          reason: 'No upcoming events found within the specified time window.',
          events_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events to analyze`);

    // Build the events payload for the AI model
    const eventsPayload = events.map(event => {
      // Group markets by type
      const marketsByType: Record<string, any[]> = {};
      
      for (const market of event.markets || []) {
        const key = `${market.market_type}_${market.bookmaker}`;
        if (!marketsByType[key]) {
          marketsByType[key] = [];
        }
        marketsByType[key].push({
          name: market.selection,
          odds_decimal: parseFloat(market.odds_decimal),
          line: market.line ? parseFloat(market.line) : null
        });
      }

      // Build markets array
      const markets = Object.entries(marketsByType).map(([key, selections]) => {
        const [type, bookmaker] = key.split('_');
        return {
          market_id: `${event.id}_${type}_${bookmaker}`,
          type: type === 'h2h' ? 'moneyline' : type,
          bookmaker,
          selections
        };
      });

      // Build features based on engine type
      let features: Record<string, any> = {};
      
      if (engine === 'team_sports') {
        features = {
          form: {
            home_last5: 'N/A',
            away_last5: 'N/A'
          },
          injuries: { home_out: 0, away_out: 0 },
          rest_days: { home: 3, away: 3 }
        };
      }

      return {
        event_id: event.id,
        sport: event.sport,
        league: event.league,
        home_team: event.home_team,
        away_team: event.away_team,
        start_time_aedt: event.start_time_aedt,
        features,
        markets
      };
    });

    // Build the AI prompt
    const nowAEDT = getNowAEDT();
    
    const systemPrompt = `You are an institutional-grade sports betting analyst and quantitative decision engine.

Your objective is to maximise long-term expected value (EV) and positive Closing Line Value (CLV).

CRITICAL RULES:
1. Only consider strictly upcoming events (events that have not started yet)
2. Assign a Bet Score from 0 to 100 for each potential bet
3. Do NOT recommend any bet with Bet Score below 70
4. Respect bankroll and exposure limits strictly
5. Return VALID JSON ONLY - no markdown, no commentary outside JSON
6. Calculate model_probability based on your analysis of the matchup
7. Calculate implied_probability as 1 / odds_decimal
8. Calculate edge as model_probability - implied_probability
9. Recommend stake based on Kelly criterion, capped at max exposure limits

Your response MUST be a JSON object with this exact structure:
{
  "recommended_bets": [
    {
      "event_id": "string",
      "market_id": "string", 
      "sport": "string",
      "league": "string",
      "selection": "string (the outcome name)",
      "selection_label": "string (human readable description)",
      "odds_decimal": number,
      "bookmaker": "string",
      "model_probability": number (0-1),
      "implied_probability": number (0-1),
      "edge": number (positive means value),
      "bet_score": number (0-100),
      "recommended_stake_units": number,
      "rationale": "string (brief explanation)"
    }
  ],
  "portfolio_summary": {
    "total_stake_units": number,
    "bankroll_units": number,
    "expected_value_units": number
  }
}

If no bets meet the criteria, return:
{
  "recommended_bets": [],
  "reason": "No bets met the Bet Score and risk thresholds."
}`;

    const userPrompt = JSON.stringify({
      context: {
        timezone: 'Australia/Sydney',
        now_aedt: nowAEDT,
        bankroll_units,
        max_daily_exposure_pct,
        max_per_event_exposure_pct,
        max_bets,
        engine
      },
      events: eventsPayload
    }, null, 2);

    console.log(`Sending ${eventsPayload.length} events to AI model`);

    // Call the AI model
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response:', content);

    // Parse the AI response
    let modelResponse: ModelResponse;
    try {
      // Clean up potential markdown formatting
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
      
      modelResponse = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Invalid JSON response from AI model');
    }

    // Validate and enforce server-side limits
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

    // Save validated bets to database if user is authenticated
    if (userId && validatedBets.length > 0) {
      const betsToInsert = validatedBets.map(bet => {
        // Find the event to get event_name
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
