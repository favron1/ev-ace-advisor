const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OddsApiOutright {
  id: string;
  sport_key: string;
  sport_title: string;
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

    console.log('Fetching bookmaker odds (outrights + h2h)...');

    // Sports with outright/futures markets that match Polymarket
    const outrightSports = [
      'soccer_epl',
      'soccer_spain_la_liga', 
      'soccer_italy_serie_a',
      'soccer_germany_bundesliga',
      'soccer_france_ligue_one',
      'soccer_uefa_champs_league',
      'basketball_nba',
      'americanfootball_nfl',
      'icehockey_nhl',
    ];

    // Additional sports for head-to-head matches
    const h2hSports = [
      'soccer_epl',
      'basketball_nba',
      'americanfootball_nfl',
      'mma_mixed_martial_arts',
    ];

    const allSignals: any[] = [];

    // Fetch outright/futures odds (championship winners)
    for (const sport of outrightSports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us,eu,uk&markets=outrights&oddsFormat=decimal`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`Outrights not available for ${sport}`);
          continue;
        }

        const events: OddsApiOutright[] = await response.json();
        console.log(`${sport} outrights: ${events.length} events`);

        for (const event of events) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          // Collect odds from all bookmakers for each outcome
          const outcomeOdds: Record<string, Array<{ odds: number; bookmaker: string }>> = {};

          for (const bookmaker of event.bookmakers) {
            const outrightMarket = bookmaker.markets.find(m => m.key === 'outrights');
            if (!outrightMarket) continue;

            for (const outcome of outrightMarket.outcomes) {
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

            const avgOdds = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
            const impliedProb = 1 / avgOdds;
            
            // Create aggregated signal for this outcome
            allSignals.push({
              event_name: `${event.sport_title} Championship: ${outcomeName}`,
              market_type: 'outrights',
              outcome: outcomeName,
              bookmaker: 'consensus',
              odds: avgOdds,
              implied_probability: impliedProb,
              previous_odds: null,
              odds_movement: 0,
              movement_speed: 0,
              confirming_books: oddsArray.length,
            });
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport} outrights:`, err);
      }
    }

    // Fetch h2h odds for matches (existing logic)
    for (const sport of h2hSports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us,eu,uk&markets=h2h&oddsFormat=decimal`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Failed to fetch ${sport}:`, response.status);
          continue;
        }

        const events = await response.json();
        console.log(`${sport} h2h: ${events.length} events`);

        for (const event of events) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          const eventName = `${event.home_team} vs ${event.away_team}`;
          const outcomeOdds: Record<string, Array<{ odds: number; bookmaker: string }>> = {};

          for (const bookmaker of event.bookmakers) {
            const h2hMarket = bookmaker.markets.find((m: any) => m.key === 'h2h');
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

          for (const [outcomeName, oddsArray] of Object.entries(outcomeOdds)) {
            if (oddsArray.length < 2) continue;

            const avgOdds = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
            const impliedProb = 1 / avgOdds;

            allSignals.push({
              event_name: eventName,
              market_type: 'h2h',
              outcome: outcomeName,
              bookmaker: 'consensus',
              odds: avgOdds,
              implied_probability: impliedProb,
              previous_odds: null,
              odds_movement: 0,
              movement_speed: 0,
              confirming_books: oddsArray.length,
            });
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport} h2h:`, err);
      }
    }

    console.log(`Generated ${allSignals.length} bookmaker signals`);

    // Store signals in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (allSignals.length > 0) {
      const latestSignals = allSignals.slice(0, 1000);

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
        outright_signals: allSignals.filter(s => s.market_type === 'outrights').length,
        h2h_signals: allSignals.filter(s => s.market_type === 'h2h').length,
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
