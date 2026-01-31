import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket CLOB API for live prices
const CLOB_API_BASE = 'https://clob.polymarket.com';

// Odds API for fresh bookmaker data
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sharp books for weighting
const SHARP_BOOKS = ['pinnacle', 'betfair', 'betfair_ex_eu', 'betonline'];

// Sport mapping for Odds API endpoints
const SPORT_ENDPOINTS: Record<string, string> = {
  'NHL': 'icehockey_nhl',
  'NBA': 'basketball_nba',
  'NFL': 'americanfootball_nfl',
  'NCAA': 'basketball_ncaab',
};

interface SignalWithCache {
  id: string;
  expires_at: string | null;
  urgency: string;
  signal_factors: Record<string, any>;
  polymarket_condition_id: string | null;
  side: string;
  bookmaker_prob_fair: number | null;
  polymarket_price: number;
  edge_percent: number;
  event_name: string;
  // Joined from cache
  token_id_yes?: string | null;
  token_id_no?: string | null;
  cache_yes_price?: number;
  cache_no_price?: number;
  cache_volume?: number;
  extracted_league?: string | null;
}

interface ClobPriceRequest {
  token_id: string;
  side: 'BUY' | 'SELL';
}

interface ClobPriceResponse {
  [tokenId: string]: string; // price as string
}

// Calculate fair probability by removing vig (2-way markets)
function calculateFairProb(odds: number[], targetIndex: number): number {
  const probs = odds.map(o => 1 / o);
  const totalProb = probs.reduce((a, b) => a + b, 0);
  return probs[targetIndex] / totalProb;
}

// Calculate consensus fair probability from bookmakers with outlier protection
function calculateConsensusFairProb(
  game: any, 
  marketKey: string, 
  targetIndex: number,
  sport: string = ''
): number | null {
  let totalWeight = 0;
  let weightedProb = 0;
  
  const isIceHockey = sport.toUpperCase() === 'NHL';
  
  for (const bookmaker of game.bookmakers || []) {
    const market = bookmaker.markets?.find((m: any) => m.key === marketKey);
    if (!market?.outcomes || market.outcomes.length < 2) continue;
    
    let outcomes = [...market.outcomes];
    let adjustedTargetIndex = targetIndex;
    
    // For NHL, filter out Draw/Tie and renormalize to 2-way
    if (isIceHockey && outcomes.length >= 3) {
      const drawIndex = outcomes.findIndex((o: any) => 
        o.name.toLowerCase().includes('draw') || o.name.toLowerCase() === 'tie'
      );
      outcomes = outcomes.filter((o: any) => 
        !o.name.toLowerCase().includes('draw') && o.name.toLowerCase() !== 'tie'
      );
      if (drawIndex !== -1 && drawIndex < targetIndex) {
        adjustedTargetIndex = Math.max(0, targetIndex - 1);
      }
      if (outcomes.length < 2) continue;
    }
    
    const odds = outcomes.map((o: any) => o.price);
    if (odds.some((o: number) => isNaN(o) || o <= 1)) continue;
    
    const fairProb = calculateFairProb(odds, Math.min(adjustedTargetIndex, odds.length - 1));
    
    // OUTLIER PROTECTION: Reject extreme probabilities (>92% or <8%)
    if (fairProb > 0.92 || fairProb < 0.08) {
      console.log(`[REFRESH] OUTLIER REJECTED: ${bookmaker.key} fairProb=${(fairProb * 100).toFixed(1)}%`);
      continue;
    }
    
    const weight = SHARP_BOOKS.includes(bookmaker.key) ? 1.5 : 1.0;
    weightedProb += fairProb * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedProb / totalWeight : null;
}

// Fetch fresh bookmaker odds for a sport
async function fetchFreshBookmakerOdds(sport: string, apiKey: string): Promise<any[]> {
  const endpoint = SPORT_ENDPOINTS[sport.toUpperCase()];
  if (!endpoint) {
    console.log(`[REFRESH] No endpoint for sport: ${sport}`);
    return [];
  }
  
  try {
    const url = `${ODDS_API_BASE}/sports/${endpoint}/odds/?apiKey=${apiKey}&markets=h2h&regions=us,uk,eu&oddsFormat=decimal`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.error('[REFRESH] ODDS_API_KEY unauthorized');
      } else if (response.status !== 404) {
        console.error(`[REFRESH] Odds API error for ${sport}: ${response.status}`);
      }
      return [];
    }
    
    const data = await response.json();
    console.log(`[REFRESH] Fetched ${data.length} games from Odds API for ${sport}`);
    return data;
  } catch (error) {
    console.error(`[REFRESH] Failed to fetch ${sport}:`, error);
    return [];
  }
}

// Find matching game from Odds API data by event name
function findMatchingGame(eventName: string, games: any[]): { game: any; targetIndex: number } | null {
  const eventNorm = eventName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  
  for (const game of games) {
    const homeNorm = (game.home_team || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const awayNorm = (game.away_team || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    // Extract last words (nicknames)
    const homeNickname = homeNorm.split(' ').pop() || '';
    const awayNickname = awayNorm.split(' ').pop() || '';
    
    const containsHome = homeNickname.length > 2 && eventNorm.includes(homeNickname);
    const containsAway = awayNickname.length > 2 && eventNorm.includes(awayNickname);
    
    if (containsHome || containsAway) {
      // Determine target index based on which team appears more prominently
      const targetIndex = containsHome && !containsAway ? 0 : 
                          containsAway && !containsHome ? 1 : 0;
      return { game, targetIndex };
    }
  }
  
  return null;
}

// Batch fetch CLOB prices for token IDs (BUY = ask price, what user pays)
async function fetchClobPrices(tokenIds: string[]): Promise<ClobPriceResponse> {
  if (tokenIds.length === 0) return {};
  
  const batchSize = 50; // CLOB API limit per request
  const allPrices: ClobPriceResponse = {};
  
  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const batch = tokenIds.slice(i, i + batchSize);
    const requestBody: ClobPriceRequest[] = batch.map(token_id => ({
      token_id,
      side: 'BUY' as const // Ask price = what user pays to buy
    }));
    
    try {
      const response = await fetch(`${CLOB_API_BASE}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (response.ok) {
        const prices = await response.json();
        Object.assign(allPrices, prices);
      } else {
        console.warn(`[REFRESH] CLOB batch ${i} failed: ${response.status}`);
      }
    } catch (error) {
      console.warn(`[REFRESH] CLOB batch ${i} error:`, error);
    }
    
    // Small delay between batches
    if (i + batchSize < tokenIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return allPrices;
}

// Calculate net edge after platform fees, spread, and slippage
function calculateNetEdge(
  rawEdge: number, 
  volume: number, 
  stakeAmount: number = 100
): number {
  const platformFee = rawEdge > 0 ? rawEdge * 0.01 : 0;
  
  // Volume-based spread cost estimate
  let spreadCost = 0.03;
  if (volume >= 500000) spreadCost = 0.005;
  else if (volume >= 100000) spreadCost = 0.01;
  else if (volume >= 50000) spreadCost = 0.015;
  else if (volume >= 10000) spreadCost = 0.02;
  
  // Slippage based on stake vs volume ratio
  let slippage = 0.03;
  if (volume > 0) {
    const ratio = stakeAmount / volume;
    if (ratio < 0.001) slippage = 0.002;
    else if (ratio < 0.005) slippage = 0.005;
    else if (ratio < 0.01) slippage = 0.01;
    else if (ratio < 0.02) slippage = 0.02;
  }
  
  return rawEdge - platformFee - spreadCost - slippage;
}

function calculateUrgency(hoursUntilEvent: number): string {
  if (hoursUntilEvent <= 1) return 'critical';
  if (hoursUntilEvent <= 4) return 'high';
  if (hoursUntilEvent <= 12) return 'normal';
  return 'low';
}

function getTimeLabel(hoursUntilEvent: number): string {
  if (hoursUntilEvent < 1) return `${Math.round(hoursUntilEvent * 60)}m`;
  if (hoursUntilEvent < 24) return `${Math.round(hoursUntilEvent)}h`;
  return `${Math.round(hoursUntilEvent / 24)}d`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.info('[REFRESH] Starting live signal refresh with bookmaker verification...');

    // Step 1: Fetch all active signals with event_name for matching
    const { data: signals, error: fetchError } = await supabase
      .from('signal_opportunities')
      .select('id, expires_at, urgency, signal_factors, polymarket_condition_id, side, bookmaker_prob_fair, polymarket_price, edge_percent, event_name')
      .eq('status', 'active');

    if (fetchError) throw fetchError;

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({
          refreshed: 0,
          expired: 0,
          price_updates: 0,
          edge_improved: 0,
          edge_gone: 0,
          stale_data_expired: 0,
          unchanged: 0,
          message: 'No active signals to refresh'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[REFRESH] Found ${signals.length} active signals`);

    // Step 2: Get token IDs and extracted_league from polymarket_h2h_cache
    const conditionIds = signals
      .map(s => s.polymarket_condition_id)
      .filter((id): id is string => !!id);

    const cacheMap = new Map<string, { 
      token_id_yes: string | null; 
      token_id_no: string | null;
      yes_price: number;
      no_price: number;
      volume: number | null;
      extracted_league: string | null;
    }>();

    if (conditionIds.length > 0) {
      const { data: cacheData, error: cacheError } = await supabase
        .from('polymarket_h2h_cache')
        .select('condition_id, token_id_yes, token_id_no, yes_price, no_price, volume, extracted_league')
        .in('condition_id', conditionIds);

      if (cacheError) {
        console.warn('[REFRESH] Cache lookup error:', cacheError);
      } else if (cacheData) {
        for (const cache of cacheData) {
          cacheMap.set(cache.condition_id, {
            token_id_yes: cache.token_id_yes,
            token_id_no: cache.token_id_no,
            yes_price: cache.yes_price,
            no_price: cache.no_price,
            volume: cache.volume,
            extracted_league: cache.extracted_league,
          });
        }
      }
    }

    // Step 3: Collect all token IDs for batch CLOB fetch
    const tokenIdSet = new Set<string>();
    for (const cache of cacheMap.values()) {
      if (cache.token_id_yes) tokenIdSet.add(cache.token_id_yes);
      if (cache.token_id_no) tokenIdSet.add(cache.token_id_no);
    }
    const allTokenIds = Array.from(tokenIdSet).filter(id => id && id.length > 0);

    console.info(`[REFRESH] Fetching live CLOB prices for ${allTokenIds.length} tokens`);

    // Step 4: Fetch live CLOB prices
    const clobPrices = allTokenIds.length > 0 ? await fetchClobPrices(allTokenIds) : {};
    console.info(`[REFRESH] Got ${Object.keys(clobPrices).length} live prices from CLOB`);

    // Step 5: Fetch fresh bookmaker odds for sports with active signals (if API key available)
    const freshOddsMap = new Map<string, any[]>(); // sport -> games[]
    
    if (oddsApiKey) {
      // Collect unique sports from signals
      const sportsWithSignals = new Set<string>();
      for (const signal of signals) {
        const cache = signal.polymarket_condition_id ? cacheMap.get(signal.polymarket_condition_id) : null;
        if (cache?.extracted_league) {
          sportsWithSignals.add(cache.extracted_league.toUpperCase());
        }
      }
      
      console.info(`[REFRESH] Fetching fresh bookmaker odds for ${sportsWithSignals.size} sports: ${[...sportsWithSignals].join(', ')}`);
      
      // Fetch fresh odds for each sport
      for (const sport of sportsWithSignals) {
        const games = await fetchFreshBookmakerOdds(sport, oddsApiKey);
        if (games.length > 0) {
          freshOddsMap.set(sport, games);
        }
      }
    } else {
      console.warn('[REFRESH] ODDS_API_KEY not configured - skipping bookmaker probability verification');
    }

    // Step 6: Get commence times for expiry backfill
    const missingExpiryConditionIds = signals
      .filter(s => !s.expires_at && s.polymarket_condition_id)
      .map(s => s.polymarket_condition_id as string);

    const commenceTimeByConditionId = new Map<string, string>();

    if (missingExpiryConditionIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from('event_watch_state')
        .select('polymarket_condition_id, commence_time')
        .in('polymarket_condition_id', missingExpiryConditionIds)
        .not('commence_time', 'is', null);

      if (!eventsError && events) {
        for (const e of events) {
          if (e.polymarket_condition_id && e.commence_time) {
            commenceTimeByConditionId.set(e.polymarket_condition_id, e.commence_time);
          }
        }
      }
    }

    // Step 7: Process each signal
    const now = new Date();
    const toExpire: { id: string; reason: string }[] = [];
    const toUpdate: { 
      id: string; 
      updates: Record<string, any>;
      priceChanged: boolean;
      edgeImproved: boolean;
    }[] = [];
    let unchanged = 0;
    let priceUpdates = 0;
    let edgeImproved = 0;
    let edgeGone = 0;
    let staleDataExpired = 0;

    for (const signal of signals) {
      const cache = signal.polymarket_condition_id 
        ? cacheMap.get(signal.polymarket_condition_id) 
        : null;

      // Get live price from CLOB based on signal side
      // ENHANCED: Also fetch the opposite side for validation logging
      let livePrice: number | null = null;
      let oppositePrice: number | null = null;

      if (cache) {
        const tokenId = signal.side === 'YES' ? cache.token_id_yes : cache.token_id_no;
        const oppositeTokenId = signal.side === 'YES' ? cache.token_id_no : cache.token_id_yes;
        
        if (tokenId && clobPrices[tokenId]) {
          // Use live CLOB price (Gamma API sourced)
          livePrice = parseFloat(clobPrices[tokenId]);
        } else {
          // Fallback: Use cached price from polymarket_h2h_cache (Firecrawl sourced)
          livePrice = signal.side === 'YES' ? cache.yes_price : cache.no_price;
        }
        
        // Also get opposite side price for validation
        if (oppositeTokenId && clobPrices[oppositeTokenId]) {
          oppositePrice = parseFloat(clobPrices[oppositeTokenId]);
        } else {
          oppositePrice = signal.side === 'YES' ? cache.no_price : cache.yes_price;
        }
        
        if (livePrice !== null) {
          console.log(`[REFRESH] PRICE_FETCH: signal=${signal.id.slice(0,8)} side=${signal.side} price=${(livePrice * 100).toFixed(1)}c opposite=${oppositePrice !== null ? (oppositePrice * 100).toFixed(1) + 'c' : 'null'} event="${signal.event_name}"`);
        }
      }

      // STALE DATA CHECK: Verify bookmaker probability against fresh odds
      let bookmakerFairProb = signal.bookmaker_prob_fair;
      let isStaleData = false;
      
      if (cache?.extracted_league && signal.event_name) {
        const sport = cache.extracted_league.toUpperCase();
        const freshGames = freshOddsMap.get(sport) || [];
        
        if (freshGames.length > 0) {
          const matchResult = findMatchingGame(signal.event_name, freshGames);
          
          if (matchResult) {
            const freshFairProb = calculateConsensusFairProb(
              matchResult.game, 
              'h2h', 
              matchResult.targetIndex,
              sport
            );
            
            if (freshFairProb !== null && bookmakerFairProb !== null) {
              const probDiff = Math.abs(freshFairProb - bookmakerFairProb);
              
              // If stored probability differs by >15% from fresh consensus, it's stale data
              if (probDiff > 0.15) {
                console.log(`[REFRESH] STALE DATA DETECTED: ${signal.event_name} - stored=${(bookmakerFairProb * 100).toFixed(1)}%, fresh=${(freshFairProb * 100).toFixed(1)}%, diff=${(probDiff * 100).toFixed(1)}%`);
                isStaleData = true;
                toExpire.push({ id: signal.id, reason: 'stale_bookmaker_data' });
                staleDataExpired++;
                continue;
              } else if (probDiff > 0.005) {
                // Meaningful update - log and update to fresh probability
                console.log(`[REFRESH] Updating bookmaker prob for ${signal.event_name}: ${(bookmakerFairProb * 100).toFixed(1)}% -> ${(freshFairProb * 100).toFixed(1)}%`);
                bookmakerFairProb = freshFairProb;
              }
            }
          }
        }
      }

      // Track if bookmaker prob changed significantly (needs DB update)
      const bookmakerProbChanged = bookmakerFairProb !== null && 
        signal.bookmaker_prob_fair !== null &&
        Math.abs(bookmakerFairProb - signal.bookmaker_prob_fair) > 0.005;

      // Calculate new edge if we have both live price and fair prob
      let newEdge: number | null = null;
      let newNetEdge: number | null = null;
      const volume = cache?.volume || 0;

      if (livePrice !== null && bookmakerFairProb !== null) {
        // Edge = bookmaker fair probability - polymarket ask price
        newEdge = bookmakerFairProb - livePrice;
        newNetEdge = calculateNetEdge(newEdge, volume);
      }

      // Determine if price has meaningfully changed (>0.5% difference)
      const oldPrice = signal.polymarket_price;
      const priceChanged = livePrice !== null && Math.abs(livePrice - oldPrice) > 0.005;

      // Check if edge improved or dropped below threshold
      const oldEdge = signal.edge_percent;
      const edgeHasImproved = newEdge !== null && newEdge > oldEdge + 0.005;
      const edgeDroppedBelowThreshold = newNetEdge !== null && newNetEdge < 0.02;

      // Handle expiration by time
      let expiresAt = signal.expires_at;
      if (!expiresAt && signal.polymarket_condition_id) {
        expiresAt = commenceTimeByConditionId.get(signal.polymarket_condition_id) || null;
      }

      if (expiresAt) {
        const expiresAtDate = new Date(expiresAt);
        if (expiresAtDate <= now) {
          toExpire.push({ id: signal.id, reason: 'event_started' });
          continue;
        }

        // Recalculate urgency
        const hoursUntilEvent = (expiresAtDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        const newUrgency = calculateUrgency(hoursUntilEvent);
        const newTimeLabel = getTimeLabel(hoursUntilEvent);

        // Check if edge has dropped too low - auto expire
        if (edgeDroppedBelowThreshold) {
          toExpire.push({ id: signal.id, reason: 'edge_gone' });
          edgeGone++;
          continue;
        }

        // Build update payload
        const updates: Record<string, any> = {};
        let needsUpdate = false;

        // Update price if changed
        if (priceChanged && livePrice !== null) {
          updates.polymarket_price = livePrice;
          updates.polymarket_updated_at = now.toISOString();
          needsUpdate = true;
        }

        // Update edge if changed
        if (newEdge !== null && Math.abs(newEdge - oldEdge) > 0.001) {
          updates.edge_percent = Math.round(newEdge * 1000) / 1000; // 3 decimal places
          needsUpdate = true;
        }

        // Update bookmaker fair probability if it changed from fresh odds
        if (bookmakerProbChanged && bookmakerFairProb !== null) {
          updates.bookmaker_prob_fair = Math.round(bookmakerFairProb * 1000) / 1000;
          // Also update the display probability (bookmaker_probability is used in UI)
          updates.bookmaker_probability = Math.round(bookmakerFairProb * 100);
          needsUpdate = true;
        }

        // Update urgency/time if changed
        if (newUrgency !== signal.urgency || signal.signal_factors?.time_label !== newTimeLabel) {
          updates.urgency = newUrgency;
          updates.signal_factors = {
            ...signal.signal_factors,
            time_label: newTimeLabel,
            hours_until_event: Math.round(hoursUntilEvent * 10) / 10,
            last_refresh: now.toISOString(),
          };
          needsUpdate = true;
        }

        // Add expires_at if it was backfilled
        if (!signal.expires_at && expiresAt) {
          updates.expires_at = expiresAt;
          needsUpdate = true;
        }

        if (needsUpdate) {
          toUpdate.push({ 
            id: signal.id, 
            updates, 
            priceChanged: priceChanged && livePrice !== null,
            edgeImproved: edgeHasImproved,
          });
          if (priceChanged) priceUpdates++;
          if (edgeHasImproved) edgeImproved++;
        } else {
          unchanged++;
        }
      } else {
        // No expiry time - just check edge expiration
        if (edgeDroppedBelowThreshold) {
          toExpire.push({ id: signal.id, reason: 'edge_gone' });
          edgeGone++;
        } else {
          unchanged++;
        }
      }
    }

    // Step 8: Batch expire signals
    const expiredByReason = {
      event_started: toExpire.filter(e => e.reason === 'event_started').map(e => e.id),
      edge_gone: toExpire.filter(e => e.reason === 'edge_gone').map(e => e.id),
      stale_bookmaker_data: toExpire.filter(e => e.reason === 'stale_bookmaker_data').map(e => e.id),
    };

    for (const [reason, ids] of Object.entries(expiredByReason)) {
      if (ids.length > 0) {
        const { error: expireError } = await supabase
          .from('signal_opportunities')
          .update({ status: 'expired' })
          .in('id', ids);

        if (expireError) {
          console.error(`[REFRESH] Error expiring signals (${reason}):`, expireError);
        } else {
          console.info(`[REFRESH] Expired ${ids.length} signals (${reason})`);
        }
      }
    }

    // Step 9: Batch update signals
    for (const update of toUpdate) {
      const { error: updateError } = await supabase
        .from('signal_opportunities')
        .update(update.updates)
        .eq('id', update.id);

      if (updateError) {
        console.error(`[REFRESH] Error updating signal ${update.id}:`, updateError);
      }
    }

    const result = {
      refreshed: signals.length,
      expired: toExpire.length,
      expired_by_time: expiredByReason.event_started.length,
      expired_by_edge: expiredByReason.edge_gone.length,
      stale_data_expired: staleDataExpired,
      price_updates: priceUpdates,
      edge_improved: edgeImproved,
      updated: toUpdate.length,
      unchanged,
      clob_prices_fetched: Object.keys(clobPrices).length,
      bookmaker_sports_refreshed: freshOddsMap.size,
      timestamp: now.toISOString()
    };

    console.info(`[REFRESH] Complete:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[REFRESH] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
