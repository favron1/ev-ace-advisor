import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket CLOB API for live prices
const CLOB_API_BASE = 'https://clob.polymarket.com';

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
  // Joined from cache
  token_id_yes?: string | null;
  token_id_no?: string | null;
  cache_yes_price?: number;
  cache_no_price?: number;
  cache_volume?: number;
}

interface ClobPriceRequest {
  token_id: string;
  side: 'BUY' | 'SELL';
}

interface ClobPriceResponse {
  [tokenId: string]: string; // price as string
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
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.info('[REFRESH] Starting live signal refresh...');

    // Step 1: Fetch all active signals
    const { data: signals, error: fetchError } = await supabase
      .from('signal_opportunities')
      .select('id, expires_at, urgency, signal_factors, polymarket_condition_id, side, bookmaker_prob_fair, polymarket_price, edge_percent')
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
          unchanged: 0,
          message: 'No active signals to refresh'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[REFRESH] Found ${signals.length} active signals`);

    // Step 2: Get token IDs from polymarket_h2h_cache for signals with condition_id
    const conditionIds = signals
      .map(s => s.polymarket_condition_id)
      .filter((id): id is string => !!id);

    const cacheMap = new Map<string, { 
      token_id_yes: string | null; 
      token_id_no: string | null;
      yes_price: number;
      no_price: number;
      volume: number | null;
    }>();

    if (conditionIds.length > 0) {
      const { data: cacheData, error: cacheError } = await supabase
        .from('polymarket_h2h_cache')
        .select('condition_id, token_id_yes, token_id_no, yes_price, no_price, volume')
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

    // Step 5: Get commence times for expiry backfill
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

    // Step 6: Process each signal
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

    for (const signal of signals) {
      const cache = signal.polymarket_condition_id 
        ? cacheMap.get(signal.polymarket_condition_id) 
        : null;

      // Get live price from CLOB based on signal side
      // For Firecrawl-sourced signals (no token IDs), fall back to cached prices
      let livePrice: number | null = null;
      if (cache) {
        const tokenId = signal.side === 'YES' ? cache.token_id_yes : cache.token_id_no;
        if (tokenId && clobPrices[tokenId]) {
          // Use live CLOB price (Gamma API sourced)
          livePrice = parseFloat(clobPrices[tokenId]);
        } else {
          // Fallback: Use cached price from polymarket_h2h_cache (Firecrawl sourced)
          livePrice = signal.side === 'YES' ? cache.yes_price : cache.no_price;
          if (livePrice !== null) {
            console.log(`[REFRESH] Using cached price for ${signal.polymarket_condition_id}: ${livePrice}`);
          }
        }
      }

      // Calculate new edge if we have both live price and fair prob
      let newEdge: number | null = null;
      let newNetEdge: number | null = null;
      const bookmakerFairProb = signal.bookmaker_prob_fair;
      const volume = cache?.volume || 0;

      if (livePrice !== null && bookmakerFairProb !== null) {
        // Edge = bookmaker fair probability - polymarket ask price
        // If side is NO, we need to use 1 - price comparisons appropriately
        if (signal.side === 'YES') {
          newEdge = bookmakerFairProb - livePrice;
        } else {
          // For NO side: edge = (1 - bookmaker_fair_yes) - no_ask_price
          // But bookmaker_prob_fair is already for the recommended side
          newEdge = bookmakerFairProb - livePrice;
        }
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

    // Step 7: Batch expire signals
    const expiredByReason = {
      event_started: toExpire.filter(e => e.reason === 'event_started').map(e => e.id),
      edge_gone: toExpire.filter(e => e.reason === 'edge_gone').map(e => e.id),
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

    // Step 8: Batch update signals
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
      price_updates: priceUpdates,
      edge_improved: edgeImproved,
      updated: toUpdate.length,
      unchanged,
      clob_prices_fetched: Object.keys(clobPrices).length,
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
