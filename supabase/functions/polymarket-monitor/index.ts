import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket CLOB API for live prices
const CLOB_API_BASE = 'https://clob.polymarket.com';

// Odds API for bookmaker data
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sport to API endpoint mapping with market types
const SPORT_ENDPOINTS: Record<string, { sport: string; markets: string }> = {
  'NBA': { sport: 'basketball_nba', markets: 'h2h,spreads,totals' },
  'NFL': { sport: 'americanfootball_nfl', markets: 'h2h,spreads,totals' },
  'NHL': { sport: 'icehockey_nhl', markets: 'h2h,spreads,totals' },
  'MLB': { sport: 'baseball_mlb', markets: 'h2h,spreads,totals' },
  'UFC': { sport: 'mma_mixed_martial_arts', markets: 'h2h' },
  'Tennis': { sport: 'tennis_atp_aus_open_singles', markets: 'h2h' },
  'EPL': { sport: 'soccer_epl', markets: 'h2h,spreads,totals' },
  'UCL': { sport: 'soccer_uefa_champs_league', markets: 'h2h' },
  'LaLiga': { sport: 'soccer_spain_la_liga', markets: 'h2h' },
  'SerieA': { sport: 'soccer_italy_serie_a', markets: 'h2h' },
  'Bundesliga': { sport: 'soccer_germany_bundesliga', markets: 'h2h' },
  'Boxing': { sport: 'boxing_boxing', markets: 'h2h' },
};

// Sharp books for weighting
const SHARP_BOOKS = ['pinnacle', 'betfair', 'betfair_ex_eu'];

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate fair probability by removing vig (supports 2-way and 3-way markets)
function calculateFairProb(odds: number[], targetIndex: number): number {
  const probs = odds.map(o => 1 / o);
  const totalProb = probs.reduce((a, b) => a + b, 0);
  return probs[targetIndex] / totalProb;
}

// Calculate net edge after fees
function calculateNetEdge(rawEdge: number, volume: number, stakeAmount: number = 100): {
  netEdge: number;
  platformFee: number;
  spreadCost: number;
  slippage: number;
} {
  const platformFee = rawEdge > 0 ? rawEdge * 0.01 : 0;
  
  let spreadCost = 0.03;
  if (volume >= 500000) spreadCost = 0.005;
  else if (volume >= 100000) spreadCost = 0.01;
  else if (volume >= 50000) spreadCost = 0.015;
  else if (volume >= 10000) spreadCost = 0.02;
  
  let slippage = 0.03;
  if (volume > 0) {
    const ratio = stakeAmount / volume;
    if (ratio < 0.001) slippage = 0.002;
    else if (ratio < 0.005) slippage = 0.005;
    else if (ratio < 0.01) slippage = 0.01;
    else if (ratio < 0.02) slippage = 0.02;
  }
  
  return { netEdge: rawEdge - platformFee - spreadCost - slippage, platformFee, spreadCost, slippage };
}

// Format time until event
function formatTimeUntil(eventDate: Date): string {
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return hours >= 1 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Send SMS alert
async function sendSmsAlert(
  supabase: any,
  event: any,
  polyPrice: number,
  bookmakerFairProb: number,
  rawEdge: number,
  netEdge: number,
  volume: number,
  stakeAmount: number,
  marketType: string,
  teamName: string | null
): Promise<boolean> {
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone_number')
      .not('phone_number', 'is', null)
      .limit(1);
    
    if (!profiles || profiles.length === 0 || !profiles[0].phone_number) {
      console.log('[POLY-MONITOR] No phone number configured');
      return false;
    }
    
    const phoneNumber = profiles[0].phone_number;
    const eventDate = new Date(event.commence_time);
    const timeUntil = formatTimeUntil(eventDate);
    const netEv = (netEdge * stakeAmount).toFixed(2);
    
    const betSide = teamName || 'YES';
    const message = `🎯 EDGE: ${event.event_name}
BET: ${betSide}
Poly: ${(polyPrice * 100).toFixed(0)}¢ ($${(volume / 1000).toFixed(0)}K)
Book: ${(bookmakerFairProb * 100).toFixed(0)}%
Edge: +${(rawEdge * 100).toFixed(1)}% raw, +$${netEv} net EV
⏰ ${timeUntil} - ACT NOW`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to: phoneNumber, message }),
    });
    
    if (!response.ok) {
      console.error('[POLY-MONITOR] SMS failed:', await response.text());
      return false;
    }
    
    console.log('[POLY-MONITOR] SMS sent');
    return true;
  } catch (error) {
    console.error('[POLY-MONITOR] SMS error:', error);
    return false;
  }
}

// Fetch bookmaker odds for a sport
async function fetchBookmakerOdds(sport: string, markets: string, apiKey: string): Promise<any[]> {
  try {
    const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${apiKey}&markets=${markets}&regions=us,uk,eu&oddsFormat=decimal`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`[POLY-MONITOR] Odds API error for ${sport}: ${response.status}`);
      }
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[POLY-MONITOR] Failed to fetch ${sport}:`, error);
    return [];
  }
}

// Match Polymarket event to bookmaker game
function findBookmakerMatch(
  eventName: string,
  question: string,
  marketType: string,
  bookmakerGames: any[]
): { game: any; targetIndex: number; marketKey: string; teamName: string } | null {
  const eventNorm = normalizeName(`${eventName} ${question}`);
  
  for (const game of bookmakerGames) {
    const homeNorm = normalizeName(game.home_team);
    const awayNorm = normalizeName(game.away_team);
    
    // Check if event matches this game
    const homeWords = homeNorm.split(' ').filter((w: string) => w.length > 2);
    const awayWords = awayNorm.split(' ').filter((w: string) => w.length > 2);
    
    const containsHome = homeWords.some((w: string) => eventNorm.includes(w));
    const containsAway = awayWords.some((w: string) => eventNorm.includes(w));
    
    if (!containsHome && !containsAway) continue;
    
    // Determine which market type to match
    let targetMarketKey = 'h2h';
    if (marketType === 'total') targetMarketKey = 'totals';
    else if (marketType === 'spread') targetMarketKey = 'spreads';
    
    // Find the market in bookmaker data
    const bookmaker = game.bookmakers?.[0];
    const market = bookmaker?.markets?.find((m: any) => m.key === targetMarketKey);
    
    if (!market || !market.outcomes) continue;
    
    // Determine target outcome index and extract team name
    let targetIndex = 0;
    let teamName = '';
    
    if (targetMarketKey === 'h2h') {
      // For H2H, determine if we're betting home or away
      if (containsHome && !containsAway) {
        targetIndex = market.outcomes.findIndex((o: any) => normalizeName(o.name).includes(homeNorm.split(' ').pop() || ''));
        teamName = game.home_team;
      } else if (containsAway && !containsHome) {
        targetIndex = market.outcomes.findIndex((o: any) => normalizeName(o.name).includes(awayNorm.split(' ').pop() || ''));
        teamName = game.away_team;
      } else {
        // Both teams mentioned - check question for team name
        const questionNorm = normalizeName(question);
        if (homeWords.some((w: string) => questionNorm.includes(w))) {
          targetIndex = 0;
          teamName = game.home_team;
        } else if (awayWords.some((w: string) => questionNorm.includes(w))) {
          targetIndex = 1;
          teamName = game.away_team;
        } else {
          // Default to first outcome
          targetIndex = 0;
          teamName = market.outcomes[0]?.name || game.home_team;
        }
      }
    } else if (targetMarketKey === 'totals') {
      // For totals, check if "over" or "under" is in question
      const isOver = /\bover\b/i.test(question);
      targetIndex = market.outcomes.findIndex((o: any) => 
        isOver ? o.name.toLowerCase().includes('over') : o.name.toLowerCase().includes('under')
      );
      teamName = isOver ? 'Over' : 'Under';
    }
    
    if (targetIndex === -1) {
      targetIndex = 0;
      teamName = market.outcomes[0]?.name || '';
    }
    
    // Ensure we have a team name
    if (!teamName && market.outcomes[targetIndex]) {
      teamName = market.outcomes[targetIndex].name;
    }
    
    return { game, targetIndex, marketKey: targetMarketKey, teamName };
  }
  
  return null;
}

// Calculate fair probability from all bookmakers
function calculateConsensusFairProb(game: any, marketKey: string, targetIndex: number): number | null {
  let totalWeight = 0;
  let weightedProb = 0;
  
  for (const bookmaker of game.bookmakers || []) {
    const market = bookmaker.markets?.find((m: any) => m.key === marketKey);
    if (!market?.outcomes || market.outcomes.length < 2) continue;
    
    const odds = market.outcomes.map((o: any) => o.price);
    if (odds.some((o: number) => isNaN(o) || o <= 1)) continue;
    
    const fairProb = calculateFairProb(odds, Math.min(targetIndex, odds.length - 1));
    const weight = SHARP_BOOKS.includes(bookmaker.key) ? 1.5 : 1.0;
    
    weightedProb += fairProb * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedProb / totalWeight : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-MONITOR] Starting multi-sport polling...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!oddsApiKey) {
      throw new Error('ODDS_API_KEY not configured');
    }

    const now = new Date();

    // Load all MONITORED events with their cache data
    const { data: monitoredEvents, error: loadError } = await supabase
      .from('event_watch_state')
      .select('*')
      .eq('watch_state', 'monitored')
      .gt('commence_time', now.toISOString())
      .order('commence_time', { ascending: true });

    if (loadError) throw new Error(`Failed to load events: ${loadError.message}`);

    console.log(`[POLY-MONITOR] Loaded ${monitoredEvents?.length || 0} monitored events`);

    if (!monitoredEvents || monitoredEvents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events_polled: 0, edges_found: 0, message: 'No events to poll' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get cache data for market types and sports
    const conditionIds = monitoredEvents
      .map(e => e.polymarket_condition_id)
      .filter(Boolean);

    const { data: cacheData } = await supabase
      .from('polymarket_h2h_cache')
      .select('condition_id, market_type, extracted_league, extracted_entity')
      .in('condition_id', conditionIds);

    const cacheMap = new Map(cacheData?.map(c => [c.condition_id, c]) || []);

    // Group events by detected sport
    const sportGroups: Map<string, typeof monitoredEvents> = new Map();
    
    for (const event of monitoredEvents) {
      const cache = cacheMap.get(event.polymarket_condition_id);
      const sport = cache?.extracted_league || 'Unknown';
      
      if (!sportGroups.has(sport)) {
        sportGroups.set(sport, []);
      }
      sportGroups.get(sport)!.push(event);
    }

    console.log(`[POLY-MONITOR] Sport groups: ${[...sportGroups.keys()].join(', ')}`);

    // Fetch bookmaker data for each sport group
    const allBookmakerData: Map<string, any[]> = new Map();
    
    for (const [sport] of sportGroups) {
      const endpoint = SPORT_ENDPOINTS[sport];
      if (!endpoint) {
        console.log(`[POLY-MONITOR] No endpoint for sport: ${sport}`);
        continue;
      }
      
      const games = await fetchBookmakerOdds(endpoint.sport, endpoint.markets, oddsApiKey);
      allBookmakerData.set(sport, games);
      console.log(`[POLY-MONITOR] Loaded ${games.length} ${sport} games`);
    }

    // Get stake amount
    const { data: scanConfig } = await supabase
      .from('arbitrage_config')
      .select('default_stake_amount')
      .limit(1)
      .single();

    const stakeAmount = scanConfig?.default_stake_amount || 100;

    // Process each event
    let edgesFound = 0;
    let alertsSent = 0;
    let eventsExpired = 0;
    let eventsMatched = 0;

    for (const event of monitoredEvents) {
      try {
        // Check if event started
        const eventStart = new Date(event.commence_time);
        if (eventStart <= now) {
          await supabase
            .from('event_watch_state')
            .update({ watch_state: 'expired', updated_at: now.toISOString() })
            .eq('id', event.id);
          eventsExpired++;
          continue;
        }

        // Get cache info
        const cache = cacheMap.get(event.polymarket_condition_id);
        const sport = cache?.extracted_league || 'Unknown';
        const marketType = cache?.market_type || 'h2h';
        
        // Get bookmaker data for this sport
        const bookmakerGames = allBookmakerData.get(sport) || [];

        // Fetch fresh Polymarket price
        let livePolyPrice = event.polymarket_yes_price || 0.5;
        let liveVolume = event.polymarket_volume || 0;

        if (event.polymarket_condition_id) {
          try {
            const clobUrl = `${CLOB_API_BASE}/markets/${event.polymarket_condition_id}`;
            const clobResponse = await fetch(clobUrl);
            
            if (clobResponse.ok) {
              const marketData = await clobResponse.json();
              livePolyPrice = parseFloat(marketData.tokens?.[0]?.price || livePolyPrice);
              liveVolume = parseFloat(marketData.volume || liveVolume);
            }
          } catch {
            // Use cached price
          }
        }

        // Find bookmaker match
        const match = findBookmakerMatch(
          event.event_name,
          event.polymarket_question || '',
          marketType,
          bookmakerGames
        );

        let bookmakerFairProb: number | null = null;
        
        if (match) {
          eventsMatched++;
          bookmakerFairProb = calculateConsensusFairProb(match.game, match.marketKey, match.targetIndex);
        }

        // Update event state
        await supabase
          .from('event_watch_state')
          .update({
            polymarket_yes_price: livePolyPrice,
            polymarket_volume: liveVolume,
            last_poly_refresh: now.toISOString(),
            polymarket_matched: bookmakerFairProb !== null,
            current_probability: bookmakerFairProb,
            updated_at: now.toISOString(),
          })
          .eq('id', event.id);

        // Check for edge
        if (bookmakerFairProb !== null && liveVolume >= 5000) {
          const rawEdge = bookmakerFairProb - livePolyPrice;
          
          if (rawEdge >= 0.02) {
            const { netEdge } = calculateNetEdge(rawEdge, liveVolume, stakeAmount);
            
            console.log(`[POLY-MONITOR] Edge found: ${event.event_name} - Raw: ${(rawEdge * 100).toFixed(1)}%, Net: ${(netEdge * 100).toFixed(1)}%`);
            
            if (netEdge >= 0.02) {
              edgesFound++;
              
              // Create signal
              // Extract team name from match result
              const teamName = match?.teamName || null;

              const { data: signal, error: signalError } = await supabase
                .from('signal_opportunities')
                .insert({
                  event_name: event.event_name,
                  recommended_outcome: teamName,
                  side: 'YES',
                  polymarket_price: livePolyPrice,
                  bookmaker_probability: bookmakerFairProb,
                  bookmaker_prob_fair: bookmakerFairProb,
                  edge_percent: rawEdge * 100,
                  confidence_score: Math.min(85, 50 + Math.floor(netEdge * 500)),
                  urgency: eventStart.getTime() - now.getTime() < 3600000 ? 'critical' : 
                          eventStart.getTime() - now.getTime() < 14400000 ? 'high' : 'normal',
                  is_true_arbitrage: true,
                  polymarket_yes_price: livePolyPrice,
                  polymarket_volume: liveVolume,
                  polymarket_updated_at: now.toISOString(),
                  signal_strength: netEdge * 100,
                  status: 'active',
                  signal_factors: {
                    raw_edge: rawEdge * 100,
                    net_edge: netEdge * 100,
                    market_type: marketType,
                    sport: sport,
                    volume: liveVolume,
                    team_name: teamName,
                  },
                })
                .select()
                .single();

              if (!signalError && signal) {
                // Send SMS with team name
                const alertSent = await sendSmsAlert(
                  supabase, event, livePolyPrice, bookmakerFairProb,
                  rawEdge, netEdge, liveVolume, stakeAmount, marketType, teamName
                );
                
                if (alertSent) {
                  alertsSent++;
                  await supabase
                    .from('event_watch_state')
                    .update({ watch_state: 'alerted', updated_at: now.toISOString() })
                    .eq('id', event.id);
                }
              }
            }
          }
        }
      } catch (eventError) {
        console.error(`[POLY-MONITOR] Error processing ${event.event_key}:`, eventError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[POLY-MONITOR] Complete: ${monitoredEvents.length} polled, ${eventsMatched} matched, ${edgesFound} edges, ${alertsSent} alerts in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        events_polled: monitoredEvents.length,
        events_matched: eventsMatched,
        events_expired: eventsExpired,
        edges_found: edgesFound,
        alerts_sent: alertsSent,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POLY-MONITOR] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
