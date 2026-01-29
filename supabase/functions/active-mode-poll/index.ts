// ============================================================================
// ACTIVE-MODE-POLL: Tier 2 Polymarket-First Edge Confirmation
// ============================================================================
// This function monitors escalated markets for edge persistence:
// 1. For each active event, refresh Polymarket price using condition_id
// 2. Refresh bookmaker price for same market
// 3. Calculate live edge with both fresh prices
// 4. Confirm edge persistence before surfacing signal
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const HOLD_WINDOW_MINUTES = 3;
const SAMPLES_REQUIRED = 2;
const MIN_EDGE_PCT = 2.0;
const REVERSION_THRESHOLD_PCT = 1.5;
const MIN_VOLUME = 10000;

// Team aliases for matching
const TEAM_ALIASES: Record<string, string[]> = {
  'los angeles lakers': ['la lakers', 'lakers', 'lal'],
  'golden state warriors': ['gsw', 'warriors', 'gs warriors', 'golden state'],
  'boston celtics': ['celtics', 'boston', 'bos'],
  'miami heat': ['heat', 'miami', 'mia'],
  'denver nuggets': ['nuggets', 'denver', 'den'],
  'milwaukee bucks': ['bucks', 'milwaukee', 'mil'],
  'philadelphia 76ers': ['76ers', 'sixers', 'philly', 'phi'],
  'new york knicks': ['knicks', 'ny knicks', 'new york', 'nyk'],
  'dallas mavericks': ['mavs', 'mavericks', 'dallas', 'dal'],
  'oklahoma city thunder': ['thunder', 'okc', 'oklahoma'],
  'minnesota timberwolves': ['wolves', 'timberwolves', 'minnesota', 'min'],
  'cleveland cavaliers': ['cavs', 'cavaliers', 'cleveland', 'cle'],
  'kansas city chiefs': ['chiefs', 'kc', 'kansas city'],
  'san francisco 49ers': ['49ers', 'niners', 'sf'],
  'edmonton oilers': ['oilers', 'edmonton', 'edm'],
  'vegas golden knights': ['golden knights', 'vegas', 'vgk'],
};

// Sport to outright endpoint mapping
const SPORT_ENDPOINTS: Record<string, string> = {
  'basketball_nba': 'basketball_nba_championship_winner',
  'americanfootball_nfl': 'americanfootball_nfl_super_bowl_winner',
  'icehockey_nhl': 'icehockey_nhl_championship_winner',
  'soccer_epl': 'soccer_epl_championship_winner',
};

interface WatchState {
  id: string;
  event_key: string;
  event_name: string;
  watch_state: string;
  polymarket_condition_id: string | null;
  polymarket_question: string | null;
  polymarket_yes_price: number | null;
  polymarket_volume: number | null;
  bookmaker_market_key: string | null;
  bookmaker_source: string | null;
  initial_probability: number;
  peak_probability: number;
  current_probability: number;
  movement_pct: number;
  hold_start_at: string | null;
  samples_since_hold: number;
  active_until: string | null;
  polymarket_matched: boolean;
  polymarket_price: number | null;
}

// ============================================================================
// POLYMARKET DIRECT PRICE REFRESH
// ============================================================================

async function refreshPolymarketPrice(conditionId: string): Promise<{
  yesPrice: number;
  noPrice: number;
  volume: number;
} | null> {
  try {
    // Use the CLOB API for direct condition_id price lookup
    const url = `https://clob.polymarket.com/price?token_id=${conditionId}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      // Try fallback to Gamma events search
      console.log(`[ACTIVE-MODE-POLL] CLOB API returned ${response.status}, trying Gamma fallback`);
      return await refreshPolymarketPriceViaGamma(conditionId);
    }
    
    const priceData = await response.json();
    
    if (priceData && priceData.price !== undefined) {
      return {
        yesPrice: parseFloat(priceData.price) || 0.5,
        noPrice: 1 - (parseFloat(priceData.price) || 0.5),
        volume: 0, // CLOB doesn't return volume directly
      };
    }
    
    return await refreshPolymarketPriceViaGamma(conditionId);
  } catch (error) {
    console.error(`[ACTIVE-MODE-POLL] Error refreshing Polymarket price:`, error);
    return await refreshPolymarketPriceViaGamma(conditionId);
  }
}

// Fallback to Gamma API by searching for the market
async function refreshPolymarketPriceViaGamma(conditionId: string): Promise<{
  yesPrice: number;
  noPrice: number;
  volume: number;
} | null> {
  try {
    // Search for market by condition_id
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`[ACTIVE-MODE-POLL] Gamma fallback failed: ${response.status}`);
      return null;
    }
    
    const markets = await response.json();
    
    if (!Array.isArray(markets) || markets.length === 0) {
      console.error(`[ACTIVE-MODE-POLL] No market found for condition_id: ${conditionId}`);
      return null;
    }
    
    const market = markets[0];
    
    if (market.outcomePrices) {
      const prices = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices;
      
      if (Array.isArray(prices) && prices.length >= 2) {
        return {
          yesPrice: parseFloat(prices[0]) || 0.5,
          noPrice: parseFloat(prices[1]) || 0.5,
          volume: parseFloat(market.volume) || 0,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[ACTIVE-MODE-POLL] Gamma fallback error:`, error);
    return null;
  }
}

// ============================================================================
// BOOKMAKER PRICE REFRESH
// ============================================================================

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTeamNames(target: string, bookmakerTeam: string): boolean {
  const targetNorm = normalizeTeamName(target);
  const bookNorm = normalizeTeamName(bookmakerTeam);
  
  if (targetNorm === bookNorm) return true;
  if (targetNorm.includes(bookNorm) || bookNorm.includes(targetNorm)) return true;
  
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const targetIn = targetNorm === canonical || aliases.some(a => targetNorm.includes(a));
    const bookIn = bookNorm === canonical || aliases.some(a => bookNorm.includes(a));
    if (targetIn && bookIn) return true;
  }
  
  return false;
}

async function refreshBookmakerPrice(
  sport: string,
  teamKey: string,
  oddsApiKey: string
): Promise<number | null> {
  const endpoint = SPORT_ENDPOINTS[sport];
  if (!endpoint) return null;
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${endpoint}/odds/?apiKey=${oddsApiKey}&regions=us,uk,eu&oddsFormat=decimal&markets=outrights`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const events = await response.json();
    if (!Array.isArray(events) || events.length === 0) return null;
    
    // Find matching outcome and calculate fair probability
    const outcomeOdds: number[] = [];
    
    for (const event of events) {
      for (const bookmaker of event.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          if (market.key !== 'outrights') continue;
          
          for (const outcome of market.outcomes || []) {
            if (matchTeamNames(teamKey, outcome.name)) {
              outcomeOdds.push(outcome.price);
            }
          }
        }
      }
    }
    
    if (outcomeOdds.length === 0) return null;
    
    const avgPrice = outcomeOdds.reduce((a, b) => a + b, 0) / outcomeOdds.length;
    return 1 / avgPrice; // Fair probability
    
  } catch (error) {
    console.error(`[ACTIVE-MODE-POLL] Error refreshing bookmaker price:`, error);
    return null;
  }
}

// ============================================================================
// SMS ALERT
// ============================================================================

async function sendSmsAlert(supabase: any, event: WatchState, edgePct: number, polyPrice: number) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone_number')
      .not('phone_number', 'is', null)
      .limit(1)
      .maybeSingle();
      
    if (!profile?.phone_number) {
      console.log('[ACTIVE-MODE-POLL] No phone number configured, skipping SMS');
      return;
    }

    // Get team name from bookmaker_market_key
    const teamName = event.bookmaker_market_key || 'YES';
    const smsMessage = `🚨 EDGE CONFIRMED: ${event.event_name?.substring(0, 40)}\nBET: ${teamName}\n+${edgePct.toFixed(1)}% edge. Poly: ${(polyPrice * 100).toFixed(0)}c. Execute now!`;
    
    const smsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        to: profile.phone_number,
        message: smsMessage,
      }),
    });
    
    if (smsResponse.ok) {
      console.log(`[ACTIVE-MODE-POLL] SMS sent successfully`);
    } else {
      console.error('[ACTIVE-MODE-POLL] SMS failed:', await smsResponse.text());
    }
  } catch (err) {
    console.error('[ACTIVE-MODE-POLL] SMS error:', err);
  }
}

// ============================================================================
// SIGNAL SURFACING
// ============================================================================

async function surfaceConfirmedSignal(
  supabase: any,
  event: WatchState,
  liveEdge: number,
  livePolyPrice: number,
  bookmakerProb: number
) {
  // Determine urgency
  let urgency = 'normal';
  if (liveEdge >= 5) urgency = 'critical';
  else if (liveEdge >= 3.5) urgency = 'high';

  // First, check if an active signal already exists for this event
  const { data: existing } = await supabase
    .from('signal_opportunities')
    .select('id')
    .eq('event_name', event.event_name)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    // Update existing signal
    const { error: updateError } = await supabase
      .from('signal_opportunities')
      .update({
        polymarket_price: livePolyPrice,
        polymarket_yes_price: livePolyPrice,
        polymarket_volume: event.polymarket_volume,
        polymarket_updated_at: new Date().toISOString(),
        bookmaker_probability: bookmakerProb,
        bookmaker_prob_fair: bookmakerProb,
        edge_percent: liveEdge,
        confidence_score: Math.min(95, 65 + Math.round(liveEdge * 5)),
        urgency,
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('[ACTIVE-MODE-POLL] Failed to update signal:', updateError);
    } else {
      console.log(`[ACTIVE-MODE-POLL] Updated signal: ${event.event_name?.substring(0, 40)}`);
    }
  } else {
    // Insert new signal
    const { error: insertError } = await supabase.from('signal_opportunities').insert({
      event_name: event.event_name,
      recommended_outcome: event.bookmaker_market_key,
      side: 'YES',
      polymarket_price: livePolyPrice,
      polymarket_yes_price: livePolyPrice,
      polymarket_volume: event.polymarket_volume,
      polymarket_updated_at: new Date().toISOString(),
      polymarket_match_confidence: 1.0,
      bookmaker_probability: bookmakerProb,
      bookmaker_prob_fair: bookmakerProb,
      edge_percent: liveEdge,
      is_true_arbitrage: true,
      confidence_score: Math.min(95, 65 + Math.round(liveEdge * 5)),
      urgency,
      status: 'active',
      signal_factors: {
        edge_type: 'polymarket_first_confirmed',
        condition_id: event.polymarket_condition_id,
        samples_captured: event.samples_since_hold + 1,
        persistence_confirmed: true,
        polymarket_question: event.polymarket_question,
      },
    });

    if (insertError) {
      console.error('[ACTIVE-MODE-POLL] Failed to insert signal:', insertError);
    } else {
      console.log(`[ACTIVE-MODE-POLL] Created signal: ${event.event_name?.substring(0, 40)}`);
    }
  }
}

// ============================================================================
// MOVEMENT LOGGING
// ============================================================================

async function logMovement(
  supabase: any,
  event: WatchState,
  finalState: string,
  edge: number,
  holdDuration: number
) {
  await supabase.from('movement_logs').insert({
    event_key: event.event_key,
    event_name: event.event_name,
    movement_pct: event.movement_pct,
    velocity: 0,
    hold_duration_seconds: Math.round(holdDuration * 60),
    samples_captured: event.samples_since_hold,
    final_state: finalState,
    polymarket_matched: true,
    edge_at_confirmation: edge,
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[ACTIVE-MODE-POLL] Starting Tier 2 edge confirmation...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    // Get all events in ACTIVE state
    const { data: activeEvents, error: fetchError } = await supabase
      .from('event_watch_state')
      .select('*')
      .eq('watch_state', 'active');

    if (fetchError) throw fetchError;

    if (!activeEvents || activeEvents.length === 0) {
      console.log('[ACTIVE-MODE-POLL] No active events to process');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No active events' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ACTIVE-MODE-POLL] Processing ${activeEvents.length} active events`);

    const results = {
      processed: 0,
      confirmed: 0,
      dropped: 0,
      continued: 0,
      polymarket_refreshes: 0,
      bookmaker_refreshes: 0,
    };

    for (const event of activeEvents as WatchState[]) {
      results.processed++;

      // Check if active window expired
      if (event.active_until && new Date(event.active_until) < new Date()) {
        await supabase
          .from('event_watch_state')
          .update({ watch_state: 'dropped' })
          .eq('id', event.id);
        
        await logMovement(supabase, event, 'expired', event.movement_pct, 0);
        results.dropped++;
        console.log(`[ACTIVE-MODE-POLL] Dropped (expired): ${event.event_name?.substring(0, 40)}`);
        continue;
      }

      // ======================================================================
      // STEP 1: Refresh Polymarket price using condition_id (DIRECT LOOKUP)
      // ======================================================================
      let livePolyPrice = event.polymarket_yes_price || 0.5;
      let livePolyVolume = event.polymarket_volume || 0;

      if (event.polymarket_condition_id) {
        const polyData = await refreshPolymarketPrice(event.polymarket_condition_id);
        results.polymarket_refreshes++;
        
        if (polyData) {
          livePolyPrice = polyData.yesPrice;
          livePolyVolume = polyData.volume;
          
          // Update cache with fresh price
          await supabase
            .from('polymarket_h2h_cache')
            .update({
              yes_price: polyData.yesPrice,
              no_price: polyData.noPrice,
              volume: polyData.volume,
              last_price_update: new Date().toISOString(),
            })
            .eq('condition_id', event.polymarket_condition_id);
        }
      }

      // Skip low volume markets
      if (livePolyVolume < MIN_VOLUME) {
        console.log(`[ACTIVE-MODE-POLL] Low volume, skipping: ${event.event_name?.substring(0, 30)}`);
        continue;
      }

      // ======================================================================
      // STEP 2: Refresh bookmaker price
      // ======================================================================
      let liveBookmakerProb = event.current_probability;

      if (event.bookmaker_source && event.bookmaker_market_key) {
        const bookProb = await refreshBookmakerPrice(
          event.bookmaker_source,
          event.bookmaker_market_key,
          ODDS_API_KEY
        );
        results.bookmaker_refreshes++;
        
        if (bookProb) {
          liveBookmakerProb = bookProb;
        }
      }

      // ======================================================================
      // STEP 3: Calculate live edge
      // ======================================================================
      const liveEdge = (liveBookmakerProb - livePolyPrice) * 100;

      console.log(`[ACTIVE-MODE-POLL] ${event.event_name?.substring(0, 30)}... | Edge: ${liveEdge.toFixed(1)}% | Poly: ${(livePolyPrice * 100).toFixed(0)}c | Book: ${(liveBookmakerProb * 100).toFixed(0)}%`);

      // Check for edge reversion
      if (liveEdge < MIN_EDGE_PCT - REVERSION_THRESHOLD_PCT) {
        await supabase
          .from('event_watch_state')
          .update({
            watch_state: 'dropped',
            current_probability: liveBookmakerProb,
            polymarket_yes_price: livePolyPrice,
          })
          .eq('id', event.id);
        
        await logMovement(supabase, event, 'reverted', liveEdge, 0);
        results.dropped++;
        console.log(`[ACTIVE-MODE-POLL] Dropped (reverted): ${event.event_name?.substring(0, 40)}`);
        continue;
      }

      // ======================================================================
      // STEP 4: Check confirmation criteria
      // ======================================================================
      const holdStart = event.hold_start_at ? new Date(event.hold_start_at) : new Date();
      const holdDurationMinutes = (Date.now() - holdStart.getTime()) / (1000 * 60);
      const newSampleCount = event.samples_since_hold + 1;

      if (holdDurationMinutes >= HOLD_WINDOW_MINUTES && newSampleCount >= SAMPLES_REQUIRED && liveEdge >= MIN_EDGE_PCT) {
        // CONFIRMED! Edge has persisted
        console.log(`[ACTIVE-MODE-POLL] ✅ CONFIRMED: ${event.event_name?.substring(0, 40)} | +${liveEdge.toFixed(1)}%`);

        // Update state to confirmed
        await supabase
          .from('event_watch_state')
          .update({
            watch_state: 'confirmed',
            current_probability: liveBookmakerProb,
            polymarket_yes_price: livePolyPrice,
            polymarket_volume: livePolyVolume,
            movement_pct: liveEdge,
            samples_since_hold: newSampleCount,
            last_poly_refresh: new Date().toISOString(),
          })
          .eq('id', event.id);

        // Surface signal
        await surfaceConfirmedSignal(supabase, event, liveEdge, livePolyPrice, liveBookmakerProb);
        
        // Log movement
        await logMovement(supabase, event, 'confirmed', liveEdge, holdDurationMinutes);

        // Send SMS alert
        await sendSmsAlert(supabase, event, liveEdge, livePolyPrice);

        results.confirmed++;
      } else {
        // Continue monitoring
        await supabase
          .from('event_watch_state')
          .update({
            current_probability: liveBookmakerProb,
            polymarket_yes_price: livePolyPrice,
            polymarket_volume: livePolyVolume,
            movement_pct: liveEdge,
            peak_probability: Math.max(event.peak_probability, liveBookmakerProb),
            samples_since_hold: newSampleCount,
            last_poly_refresh: new Date().toISOString(),
          })
          .eq('id', event.id);

        results.continued++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ACTIVE-MODE-POLL] Complete in ${duration}ms. Confirmed: ${results.confirmed}, Dropped: ${results.dropped}`);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ACTIVE-MODE-POLL] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
