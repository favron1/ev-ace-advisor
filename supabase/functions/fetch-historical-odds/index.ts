import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HistoricalOddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
      }[];
    }[];
  }[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, clear existing sample data
    const { error: deleteError } = await supabase
      .from('value_bets')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error clearing existing data:', deleteError);
    }

    // Fetch historical events from the Odds API
    // The historical endpoint requires specifying a date
    const leagues = [
      'soccer_epl',
      'soccer_spain_la_liga', 
      'soccer_germany_bundesliga'
    ];

    // Get events from the past 30 days
    const valueBets: any[] = [];
    const processedEvents = new Set<string>();

    // Fetch completed events using the scores endpoint (shows recent results)
    for (const league of leagues) {
      console.log(`Fetching completed events for ${league}...`);
      
      const scoresUrl = `https://api.the-odds-api.com/v4/sports/${league}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`;
      
      try {
        const scoresResponse = await fetch(scoresUrl);
        
        if (!scoresResponse.ok) {
          console.error(`Scores API error for ${league}: ${scoresResponse.status}`);
          continue;
        }

        const scores = await scoresResponse.json();
        console.log(`Got ${scores.length} completed events for ${league}`);

        // Now fetch current odds to use as a proxy for historical odds
        // (The Odds API historical endpoint is premium-only)
        const oddsUrl = `https://api.the-odds-api.com/v4/sports/${league}/odds/?apiKey=${ODDS_API_KEY}&regions=uk,eu&markets=h2h&oddsFormat=decimal`;
        
        const oddsResponse = await fetch(oddsUrl);
        
        if (!oddsResponse.ok) {
          console.error(`Odds API error for ${league}: ${oddsResponse.status}`);
          continue;
        }

        const oddsEvents: HistoricalOddsEvent[] = await oddsResponse.json();
        console.log(`Got ${oddsEvents.length} events with odds for ${league}`);

        // Process each event with odds
        for (const event of oddsEvents) {
          if (processedEvents.has(event.id)) continue;
          processedEvents.add(event.id);

          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          // Get h2h market odds from all bookmakers
          const allOdds: { [selection: string]: number[] } = {
            home: [],
            away: [],
            draw: []
          };

          for (const bookmaker of event.bookmakers) {
            const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
            if (!h2hMarket) continue;

            for (const outcome of h2hMarket.outcomes) {
              if (outcome.name === event.home_team) {
                allOdds.home.push(outcome.price);
              } else if (outcome.name === event.away_team) {
                allOdds.away.push(outcome.price);
              } else if (outcome.name === 'Draw') {
                allOdds.draw.push(outcome.price);
              }
            }
          }

          // Calculate value bets for each selection
          const selections = [
            { key: 'home', name: event.home_team, odds: allOdds.home },
            { key: 'away', name: event.away_team, odds: allOdds.away },
            { key: 'draw', name: 'Draw', odds: allOdds.draw }
          ];

          for (const selection of selections) {
            if (selection.odds.length < 2) continue;

            const maxOdds = Math.max(...selection.odds);
            const avgOdds = selection.odds.reduce((a, b) => a + b, 0) / selection.odds.length;
            const fairOdds = avgOdds;
            
            // Edge calculation (same as fetch-odds)
            const edge = ((maxOdds - fairOdds) / fairOdds) * 100;
            
            // Only include if edge > 2%
            if (edge <= 2) continue;

            const impliedProbability = 1 / maxOdds;
            const actualProbability = 1 / fairOdds;
            const expectedValue = (actualProbability * (maxOdds - 1) - (1 - actualProbability)) * 100;

            // Determine confidence level (same as fetch-odds)
            let confidence: 'low' | 'moderate' | 'high' = 'low';
            if (edge > 10) {
              confidence = 'high';
            } else if (edge > 5) {
              confidence = 'moderate';
            }

            // Suggested stake based on Kelly criterion (quarter Kelly)
            const kellyFraction = (actualProbability * maxOdds - 1) / (maxOdds - 1);
            const suggestedStakePercent = Math.max(0.5, Math.min(5, kellyFraction * 25));

            valueBets.push({
              selection: `${event.home_team} vs ${event.away_team} - ${selection.name}`,
              market: '1x2',
              offered_odds: maxOdds,
              fair_odds: fairOdds,
              implied_probability: impliedProbability,
              actual_probability: actualProbability,
              expected_value: expectedValue,
              edge: edge,
              confidence: confidence,
              min_odds: fairOdds * 0.95,
              suggested_stake_percent: suggestedStakePercent,
              reasoning: `Edge: ${edge.toFixed(2)}%, EV: ${expectedValue.toFixed(2)}%. Based on ${selection.odds.length} bookmaker odds. League: ${event.sport_title}`,
              meets_criteria: edge > 2 && expectedValue > 0,
              is_active: false, // Historical data marked as inactive
              created_at: new Date(event.commence_time).toISOString()
            });
          }
        }
      } catch (leagueError) {
        console.error(`Error processing ${league}:`, leagueError);
      }
    }

    console.log(`Total value bets found: ${valueBets.length}`);

    if (valueBets.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No value bets found. The API may have returned no data or all edges were below 2%.',
          betsInserted: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert value bets in batches
    const batchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < valueBets.length; i += batchSize) {
      const batch = valueBets.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('value_bets')
        .insert(batch);

      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`Successfully inserted ${insertedCount} value bets`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Fetched and stored ${insertedCount} real value bets from live odds data`,
        betsInserted: insertedCount,
        leagues: leagues.join(', ')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in fetch-historical-odds:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
