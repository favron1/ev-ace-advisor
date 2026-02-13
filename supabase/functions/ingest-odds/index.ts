import {
  getAllH2HSports,
  getAllOutrightSports,
} from '../_shared/extended-sports-config.ts';
import { validateOddsApiKey, fetchWithKeyRotation } from '../_shared/odds-api-keys.ts';

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

// Canonical names for database storage
const SHARP_BOOK_CANONICAL: Record<string, string> = {
  'Pinnacle': 'pinnacle',
  'Betfair': 'betfair',
  'BetOnline.ag': 'betonline',
  'Bookmaker': 'bookmaker',
  'Circa Sports': 'circa',
};

interface RequestBody {
  eventHorizonHours?: number;
  sharpBookWeighting?: boolean;
  sharpBookWeight?: number;
}

interface OutcomeOdds {
  odds: number;
  bookmaker: string;
  isSharp: boolean;
}

interface SharpBookSnapshot {
  event_key: string;
  event_name: string;
  outcome: string;
  bookmaker: string;
  implied_probability: number;
  raw_odds: number;
}

// Calculate fair probability with proper per-book vig removal
// For 2-way markets: removes vig from each bookmaker individually, then aggregates
// This eliminates the "average odds then invert" anti-pattern
function calculateFairProbability(
  outcomeOdds: Record<string, OutcomeOdds[]>,
  targetOutcome: string,
  sharpBookWeighting: boolean,
  sharpBookWeight: number
): { fairProb: number; rawProb: number; avgOdds: number } {
  const outcomes = Object.keys(outcomeOdds);
  
  // For 2-way markets, calculate per-book vig-free probabilities
  if (outcomes.length === 2) {
    const [outcome1, outcome2] = outcomes;
    const bookFairProbs: { prob: number; weight: number }[] = [];
    
    // Find matching book pairs (same bookmaker has both outcomes)
    const bookmakers = new Set<string>();
    for (const odds of outcomeOdds[outcome1]) {
      bookmakers.add(odds.bookmaker);
    }
    
    for (const bookmaker of bookmakers) {
      const odds1 = outcomeOdds[outcome1].find(o => o.bookmaker === bookmaker);
      const odds2 = outcomeOdds[outcome2].find(o => o.bookmaker === bookmaker);
      
      if (odds1 && odds2) {
        // Calculate vig-free probability for this book
        // Formula: p_fair = p_raw / (p_raw_1 + p_raw_2)
        const raw1 = 1 / odds1.odds;
        const raw2 = 1 / odds2.odds;
        const total = raw1 + raw2; // This is >1 due to vig
        const fair1 = raw1 / total;
        const fair2 = raw2 / total;
        
        const targetFair = targetOutcome === outcome1 ? fair1 : fair2;
        const weight = sharpBookWeighting && odds1.isSharp ? sharpBookWeight : 1;
        
        bookFairProbs.push({ prob: targetFair, weight });
      }
    }
    
    if (bookFairProbs.length > 0) {
      // Weighted average of vig-free probabilities
      let totalWeight = 0;
      let weightedSum = 0;
      for (const { prob, weight } of bookFairProbs) {
        weightedSum += prob * weight;
        totalWeight += weight;
      }
      const fairProb = weightedSum / totalWeight;
      
      // Also calculate average odds for display
      const targetOdds = outcomeOdds[targetOutcome];
      const avgOdds = targetOdds.reduce((sum, o) => sum + o.odds, 0) / targetOdds.length;
      const rawProb = 1 / avgOdds;
      
      return { fairProb, rawProb, avgOdds };
    }
  }
  
  // Fallback for 3+ way markets or incomplete data: use original logic
  // (outrights with many outcomes can't be perfectly devigged per-book)
  const avgOddsMap: Record<string, number> = {};
  for (const outcome of outcomes) {
    const oddsArray = outcomeOdds[outcome];
    avgOddsMap[outcome] = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
  }
  
  const rawProbs: Record<string, number> = {};
  let totalRawProb = 0;
  for (const outcome of outcomes) {
    rawProbs[outcome] = 1 / avgOddsMap[outcome];
    totalRawProb += rawProbs[outcome];
  }
  
  const targetRawProb = rawProbs[targetOutcome] || 0;
  const targetFairProb = totalRawProb > 0 ? targetRawProb / totalRawProb : 0;
  
  return {
    fairProb: targetFairProb,
    rawProb: targetRawProb,
    avgOdds: avgOddsMap[targetOutcome] || 0,
  };
}

// Generate event key for matching
function generateEventKey(eventName: string, outcome: string): string {
  return `${eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')}::${outcome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate and select a working API key (auto-rotates on 401/429)
    let validatedKey: string;
    try {
      const validation = await validateOddsApiKey('INGEST-ODDS');
      validatedKey = validation.apiKey;
      console.log(`[INGEST-ODDS] Using key #${validation.keyIndex + 1}. Remaining: ${validation.remaining}, Used: ${validation.used}`);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'All Odds API keys exhausted or invalid', details: (err as Error).message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const oddsApiKey = validatedKey;

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

    // Dynamically get all outright/futures sports from extended config
    const outrightSports = getAllOutrightSports();

    // Dynamically get all H2H sports from extended config (includes whale leagues)
    const h2hSports = getAllH2HSports();

    const allSignals: any[] = [];
    const sharpBookSnapshots: SharpBookSnapshot[] = [];

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
          const outcomeOdds: Record<string, OutcomeOdds[]> = {};

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

              // Store individual sharp book snapshots for movement detection
              if (isSharp && SHARP_BOOK_CANONICAL[bookmaker.title]) {
                const eventName = `${sportTitle}: ${outcome.name}`;
                const eventKey = generateEventKey(eventName, outcome.name);
                const impliedProb = 1 / outcome.price;
                
                sharpBookSnapshots.push({
                  event_key: eventKey,
                  event_name: eventName,
                  outcome: outcome.name,
                  bookmaker: SHARP_BOOK_CANONICAL[bookmaker.title],
                  implied_probability: impliedProb,
                  raw_odds: outcome.price,
                });
              }
            }
          }

          for (const [outcomeName, oddsArray] of Object.entries(outcomeOdds)) {
            if (oddsArray.length < 2) continue;

            const { fairProb, avgOdds } = calculateFairProbability(
              outcomeOdds,
              outcomeName,
              sharpBookWeighting,
              sharpBookWeight
            );

            const hasSharpBook = oddsArray.some(o => o.isSharp);

            allSignals.push({
              event_name: `${sportTitle}: ${outcomeName}`,
              market_type: 'outrights',
              outcome: outcomeName,
              bookmaker: 'consensus',
              odds: avgOdds,
              implied_probability: fairProb,
              previous_odds: null,
              odds_movement: 0,
              movement_speed: 0,
              confirming_books: oddsArray.length,
              is_sharp_book: hasSharpBook,
              commence_time: null,
              source: 'odds_api',
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

          // Filter by event horizon
          const commenceTime = new Date(event.commence_time);
          if (commenceTime > horizonCutoff) {
            continue;
          }

          const eventName = `${event.home_team} vs ${event.away_team}`;
          const outcomeOdds: Record<string, OutcomeOdds[]> = {};

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

              // Store individual sharp book snapshots for movement detection
              if (isSharp && SHARP_BOOK_CANONICAL[bookmaker.title]) {
                const eventKey = generateEventKey(eventName, outcome.name);
                const impliedProb = 1 / outcome.price;
                
                sharpBookSnapshots.push({
                  event_key: eventKey,
                  event_name: eventName,
                  outcome: outcome.name,
                  bookmaker: SHARP_BOOK_CANONICAL[bookmaker.title],
                  implied_probability: impliedProb,
                  raw_odds: outcome.price,
                });
              }
            }
          }

          for (const [outcomeName, oddsArray] of Object.entries(outcomeOdds)) {
            if (oddsArray.length < 2) continue;

            const { fairProb, avgOdds } = calculateFairProbability(
              outcomeOdds,
              outcomeName,
              sharpBookWeighting,
              sharpBookWeight
            );

            const hasSharpBook = oddsArray.some(o => o.isSharp);

            allSignals.push({
              event_name: eventName,
              market_type: 'h2h',
              outcome: outcomeName,
              bookmaker: 'consensus',
              odds: avgOdds,
              implied_probability: fairProb,
              previous_odds: null,
              odds_movement: 0,
              movement_speed: 0,
              confirming_books: oddsArray.length,
              is_sharp_book: hasSharpBook,
              commence_time: event.commence_time,
              source: 'odds_api',
            });
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport} h2h:`, err);
      }
    }

    console.log(`Generated ${allSignals.length} total signals, ${sharpBookSnapshots.length} sharp book snapshots`);

    // Store signals in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // FIX #5: Store probability snapshots for movement detection
    // This populates the probability_snapshots table that velocity calculation requires
    const probabilitySnapshots: Array<{
      event_key: string;
      event_name: string;
      outcome: string;
      fair_probability: number;
      source: string;
    }> = [];

    for (const signal of allSignals) {
      if (signal.market_type === 'h2h' && signal.implied_probability > 0) {
        const eventKey = generateEventKey(signal.event_name, signal.outcome);
        probabilitySnapshots.push({
          event_key: eventKey,
          event_name: signal.event_name,
          outcome: signal.outcome,
          fair_probability: signal.implied_probability,
          source: 'bookmaker_consensus',
        });
      }
    }

    // Insert probability snapshots for movement detection
    if (probabilitySnapshots.length > 0) {
      const probResponse = await fetch(
        `${supabaseUrl}/rest/v1/probability_snapshots`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(probabilitySnapshots),
        }
      );

      if (!probResponse.ok) {
        const error = await probResponse.text();
        console.error('Probability snapshot insert error:', error);
      } else {
        console.log(`Inserted ${probabilitySnapshots.length} probability snapshots for movement detection`);
      }
    }

    // Store sharp book snapshots for movement detection
    if (sharpBookSnapshots.length > 0) {
      const snapshotResponse = await fetch(
        `${supabaseUrl}/rest/v1/sharp_book_snapshots`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sharpBookSnapshots),
        }
      );

      if (!snapshotResponse.ok) {
        const error = await snapshotResponse.text();
        console.error('Sharp book snapshot insert error:', error);
      } else {
        console.log(`Inserted ${sharpBookSnapshots.length} sharp book snapshots`);
      }
    }

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

    // Phase 3: Check NBA coverage and trigger backup scraper if needed
    const nbaH2hSignals = allSignals.filter(s => 
      s.market_type === 'h2h' && 
      s.event_name && 
      !s.event_name.includes(':') // Exclude futures which have sport: format
    );
    const uniqueNbaGames = Math.floor(new Set(nbaH2hSignals.map(s => s.event_name)).size / 2);
    
    console.log(`[INGEST-ODDS] NBA H2H coverage: ${uniqueNbaGames} unique games from Odds API`);
    
    let backupResult: { gamesFound?: number } | null = null;
    if (uniqueNbaGames < 8) {
      console.log('[INGEST-ODDS] Low NBA coverage, triggering backup scraper...');
      try {
        const backupResponse = await fetch(
          `${supabaseUrl}/functions/v1/scrape-backup-odds`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sport: 'nba', source: 'draftkings' }),
          }
        );
        
        if (backupResponse.ok) {
          backupResult = await backupResponse.json();
          console.log(`[INGEST-ODDS] Backup scraper found ${backupResult?.gamesFound || 0} games`);
        }
      } catch (backupErr) {
        console.error('[INGEST-ODDS] Backup scraper error:', backupErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        signals_captured: allSignals.length,
        sharp_book_snapshots: sharpBookSnapshots.length,
        outright_signals: outrightCount,
        h2h_signals: h2hCount,
        near_term_events: nearTermCount,
        event_horizon_hours: eventHorizonHours,
        sharp_weighting_enabled: sharpBookWeighting,
        vig_removal: true,
        nba_coverage: {
          odds_api_games: uniqueNbaGames,
          backup_triggered: uniqueNbaGames < 8,
          backup_games: backupResult?.gamesFound || 0,
        },
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
