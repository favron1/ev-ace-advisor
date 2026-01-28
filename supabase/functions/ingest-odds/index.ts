const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sharp bookmakers that move first on informed money
const SHARP_BOOKMAKERS = [
  'Pinnacle',
  'Betfair',
  'BetOnline.ag',
  'Bookmaker',
  'Circa Sports',
];

interface RequestBody {
  eventHorizonHours?: number;
  sharpBookWeighting?: boolean;
  sharpBookWeight?: number;
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

    // Parse request body for configuration
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // Default values if no body
    }
    
    const eventHorizonHours = body.eventHorizonHours || 24;
    const sharpBookWeighting = body.sharpBookWeighting !== false;
    const sharpBookWeight = body.sharpBookWeight || 1.5;

    console.log(`Fetching odds with ${eventHorizonHours}h horizon, sharp weighting: ${sharpBookWeighting}`);

    // Calculate cutoff time for event filtering
    const now = new Date();
    const horizonCutoff = new Date(now.getTime() + eventHorizonHours * 60 * 60 * 1000);

    // Outright/futures sports (championship winners)
    const outrightSports = [
      'soccer_epl_winner',
      'soccer_uefa_champs_league_winner',
      'basketball_nba_championship_winner',
      'americanfootball_nfl_super_bowl_winner',
      'icehockey_nhl_championship_winner',
    ];

    // H2H sports for individual match betting - THIS IS KEY FOR SHORT-TERM SIGNALS
    const h2hSports = [
      'soccer_epl',
      'soccer_spain_la_liga',
      'soccer_germany_bundesliga',
      'soccer_italy_serie_a',
      'soccer_france_ligue_one',
      'basketball_nba',
      'basketball_euroleague',
      'americanfootball_nfl',
      'icehockey_nhl',
      'mma_mixed_martial_arts',
      'tennis_atp_aus_open_singles',
      'tennis_wta_aus_open_singles',
    ];

    const allSignals: any[] = [];

    // Fetch outrights (championship winners) - long-term signals
    for (const sport of outrightSports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us,eu,uk&markets=outrights&oddsFormat=decimal`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`Outrights not available for ${sport}: ${response.status}`);
          continue;
        }

        const events = await response.json();
        console.log(`${sport}: ${events.length} outright events`);

        for (const event of events) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          const sportTitle = event.sport_title || sport.replace(/_/g, ' ');
          const outcomeOdds: Record<string, Array<{ odds: number; bookmaker: string; isSharp: boolean }>> = {};

          for (const bookmaker of event.bookmakers) {
            const outrightMarket = bookmaker.markets?.find((m: any) => m.key === 'outrights');
            if (!outrightMarket) continue;

            const isSharp = SHARP_BOOKMAKERS.includes(bookmaker.title);

            for (const outcome of outrightMarket.outcomes) {
              if (!outcomeOdds[outcome.name]) {
                outcomeOdds[outcome.name] = [];
              }
              outcomeOdds[outcome.name].push({
                odds: outcome.price,
                bookmaker: bookmaker.title,
                isSharp,
              });
            }
          }

          for (const [outcomeName, oddsArray] of Object.entries(outcomeOdds)) {
            if (oddsArray.length < 2) continue;

            // Calculate weighted average if sharp book weighting enabled
            let avgOdds: number;
            if (sharpBookWeighting) {
              let totalWeight = 0;
              let weightedSum = 0;
              for (const o of oddsArray) {
                const weight = o.isSharp ? sharpBookWeight : 1;
                weightedSum += o.odds * weight;
                totalWeight += weight;
              }
              avgOdds = weightedSum / totalWeight;
            } else {
              avgOdds = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
            }

            const impliedProb = 1 / avgOdds;
            const hasSharpBook = oddsArray.some(o => o.isSharp);

            allSignals.push({
              event_name: `${sportTitle}: ${outcomeName}`,
              market_type: 'outrights',
              outcome: outcomeName,
              bookmaker: 'consensus',
              odds: avgOdds,
              implied_probability: impliedProb,
              previous_odds: null,
              odds_movement: 0,
              movement_speed: 0,
              confirming_books: oddsArray.length,
              is_sharp_book: hasSharpBook,
              commence_time: null, // Outrights don't have specific times
            });
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport}:`, err);
      }
    }

    // Fetch h2h odds for matches - KEY FOR SHORT-TERM SIGNALS
    for (const sport of h2hSports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us,eu,uk&markets=h2h&oddsFormat=decimal`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Failed to fetch ${sport}: ${response.status}`);
          continue;
        }

        const events = await response.json();
        console.log(`${sport} h2h: ${events.length} events`);

        for (const event of events) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          // Filter by event horizon - only include events within the specified window
          const commenceTime = new Date(event.commence_time);
          if (commenceTime > horizonCutoff) {
            continue; // Skip events too far in the future
          }

          const eventName = `${event.home_team} vs ${event.away_team}`;
          const outcomeOdds: Record<string, Array<{ odds: number; bookmaker: string; isSharp: boolean }>> = {};

          for (const bookmaker of event.bookmakers) {
            const h2hMarket = bookmaker.markets?.find((m: any) => m.key === 'h2h');
            if (!h2hMarket) continue;

            const isSharp = SHARP_BOOKMAKERS.includes(bookmaker.title);

            for (const outcome of h2hMarket.outcomes) {
              if (!outcomeOdds[outcome.name]) {
                outcomeOdds[outcome.name] = [];
              }
              outcomeOdds[outcome.name].push({
                odds: outcome.price,
                bookmaker: bookmaker.title,
                isSharp,
              });
            }
          }

          for (const [outcomeName, oddsArray] of Object.entries(outcomeOdds)) {
            if (oddsArray.length < 2) continue;

            // Calculate weighted average if sharp book weighting enabled
            let avgOdds: number;
            if (sharpBookWeighting) {
              let totalWeight = 0;
              let weightedSum = 0;
              for (const o of oddsArray) {
                const weight = o.isSharp ? sharpBookWeight : 1;
                weightedSum += o.odds * weight;
                totalWeight += weight;
              }
              avgOdds = weightedSum / totalWeight;
            } else {
              avgOdds = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
            }

            const impliedProb = 1 / avgOdds;
            const hasSharpBook = oddsArray.some(o => o.isSharp);

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
              is_sharp_book: hasSharpBook,
              commence_time: event.commence_time,
            });
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport} h2h:`, err);
      }
    }

    console.log(`Generated ${allSignals.length} total signals`);

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

    const outrightCount = allSignals.filter(s => s.market_type === 'outrights').length;
    const h2hCount = allSignals.filter(s => s.market_type === 'h2h').length;
    const nearTermCount = allSignals.filter(s => {
      if (!s.commence_time) return false;
      const hoursUntil = (new Date(s.commence_time).getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursUntil <= 12;
    }).length;

    return new Response(
      JSON.stringify({
        success: true,
        signals_captured: allSignals.length,
        outright_signals: outrightCount,
        h2h_signals: h2hCount,
        near_term_events: nearTermCount,
        event_horizon_hours: eventHorizonHours,
        sharp_weighting_enabled: sharpBookWeighting,
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