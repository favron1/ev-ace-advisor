const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
      }>;
    }>;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    if (!oddsApiKey) {
      return new Response(
        JSON.stringify({ error: 'ODDS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching bookmaker odds...');

    // Sports to monitor
    const sports = [
      'soccer_epl',
      'soccer_spain_la_liga',
      'basketball_nba',
      'americanfootball_nfl',
      'mma_mixed_martial_arts',
    ];

    const allSignals: any[] = [];
    const previousOddsMap = new Map<string, number>();

    for (const sport of sports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us,eu,uk&markets=h2h&oddsFormat=decimal`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Failed to fetch ${sport}:`, response.status);
          continue;
        }

        const events: OddsApiEvent[] = await response.json();
        console.log(`${sport}: ${events.length} events`);

        for (const event of events) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          const eventName = `${event.home_team} vs ${event.away_team}`;
          
          // Collect odds from all bookmakers for each outcome
          const outcomeOdds: Record<string, Array<{ odds: number; bookmaker: string }>> = {};

          for (const bookmaker of event.bookmakers) {
            const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
            if (!h2hMarket) continue;

            for (const outcome of h2hMarket.outcomes) {
              if (!outcomeOdds[outcome.name]) {
                outcomeOdds[outcome.name] = [];
              }
              outcomeOdds[outcome.name].push({
                odds: outcome.price,
                bookmaker: bookmaker.title
              });
            }
          }

          // Process each outcome
          for (const [outcomeName, oddsArray] of Object.entries(outcomeOdds)) {
            if (oddsArray.length < 2) continue;

            // Calculate consensus probability (average)
            const avgOdds = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
            const impliedProb = 1 / avgOdds;
            
            // Get previous odds for movement detection
            const signalKey = `${event.id}-${outcomeName}`;
            const previousOdds = previousOddsMap.get(signalKey);
            const movement = previousOdds ? ((avgOdds - previousOdds) / previousOdds) * 100 : 0;
            
            // Create signal for each bookmaker (tracking individual prices)
            for (const oddsData of oddsArray) {
              allSignals.push({
                event_name: eventName,
                market_type: 'h2h',
                outcome: outcomeName,
                bookmaker: oddsData.bookmaker,
                odds: oddsData.odds,
                implied_probability: 1 / oddsData.odds,
                previous_odds: previousOdds || null,
                odds_movement: movement,
                movement_speed: Math.abs(movement) > 5 ? 1 : 0, // Basic speed indicator
                confirming_books: oddsArray.length,
              });
            }

            // Store for next comparison
            previousOddsMap.set(signalKey, avgOdds);
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport}:`, err);
      }
    }

    console.log(`Generated ${allSignals.length} bookmaker signals`);

    // Store signals in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (allSignals.length > 0) {
      // Only keep the latest signal per event/outcome/bookmaker combo
      const latestSignals = allSignals.slice(0, 500); // Limit to avoid overwhelming DB

      const insertResponse = await fetch(
        `${supabaseUrl}/rest/v1/bookmaker_signals`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(latestSignals),
        }
      );

      if (!insertResponse.ok) {
        const error = await insertResponse.text();
        console.error('Database insert error:', error);
      } else {
        console.log('Signals inserted successfully');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        signals_captured: allSignals.length,
        sports_scanned: sports.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
