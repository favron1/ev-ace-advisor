import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Confirmation thresholds
const HOLD_WINDOW_MINUTES = 3;
const SAMPLES_REQUIRED = 2;
const REVERSION_THRESHOLD_PCT = 1.5;
const MIN_EDGE_PCT = 2.0;
const MATCH_THRESHOLD = 0.75;
const MIN_VOLUME = 2000;

// Team alias mapping for better Polymarket matching
const TEAM_ALIASES: Record<string, string[]> = {
  'los angeles lakers': ['la lakers', 'lakers', 'los angeles lakers'],
  'golden state warriors': ['gsw', 'warriors', 'gs warriors', 'golden state'],
  'boston celtics': ['celtics', 'boston'],
  'miami heat': ['heat', 'miami'],
  'denver nuggets': ['nuggets', 'denver'],
  'phoenix suns': ['suns', 'phoenix'],
  'milwaukee bucks': ['bucks', 'milwaukee'],
  'philadelphia 76ers': ['76ers', 'sixers', 'philly'],
  'new york knicks': ['knicks', 'ny knicks', 'new york'],
  'los angeles clippers': ['la clippers', 'clippers'],
  'manchester united': ['man united', 'man utd', 'mufc'],
  'manchester city': ['man city', 'mcfc'],
  'liverpool': ['liverpool fc', 'lfc'],
  'chelsea': ['chelsea fc', 'cfc'],
  'arsenal': ['arsenal fc', 'afc'],
};

interface WatchState {
  id: string;
  event_key: string;
  event_name: string;
  outcome?: string;
  watch_state: string;
  initial_probability: number;
  peak_probability: number;
  current_probability: number;
  movement_pct: number;
  movement_velocity: number;
  hold_start_at: string | null;
  samples_since_hold: number;
  active_until: string | null;
  polymarket_matched: boolean;
  polymarket_market_id: string | null;
  polymarket_price: number | null;
}

interface PolymarketMatch {
  market_id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume: number;
  confidence: number;
}

// ============================================================================
// POLYMARKET LIVE FETCH - Targeted per-event API calls (not global polling)
// ============================================================================

async function fetchPolymarketForEvent(eventName: string, outcome: string): Promise<PolymarketMatch | null> {
  console.log(`[POLY-FETCH] Searching Polymarket for: ${eventName} / ${outcome}`);
  
  try {
    // Extract team names for better search
    const searchTerms = extractSearchTerms(eventName);
    
    // Try multiple search strategies
    for (const searchTerm of searchTerms) {
      const encodedSearch = encodeURIComponent(searchTerm);
      const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&title_contains=${encodedSearch}`;
      
      console.log(`[POLY-FETCH] Trying search: ${searchTerm}`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        console.error(`[POLY-FETCH] API error ${response.status} for search: ${searchTerm}`);
        continue;
      }
      
      const events = await response.json();
      if (!Array.isArray(events) || events.length === 0) {
        continue;
      }
      
      // Find best matching market
      const match = findBestMatch(eventName, outcome, events);
      if (match && match.confidence >= MATCH_THRESHOLD) {
        console.log(`[POLY-FETCH] Found match: ${match.question} (conf: ${(match.confidence * 100).toFixed(0)}%)`);
        return match;
      }
    }
    
    // Fallback: broad search without filters
    const fallbackUrl = 'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100';
    const fallbackResponse = await fetch(fallbackUrl, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (fallbackResponse.ok) {
      const events = await fallbackResponse.json();
      const match = findBestMatch(eventName, outcome, events);
      if (match && match.confidence >= MATCH_THRESHOLD) {
        console.log(`[POLY-FETCH] Fallback match: ${match.question} (conf: ${(match.confidence * 100).toFixed(0)}%)`);
        return match;
      }
    }
    
    console.log(`[POLY-FETCH] No match found for: ${eventName}`);
    return null;
    
  } catch (error) {
    console.error('[POLY-FETCH] Error:', error);
    return null;
  }
}

function extractSearchTerms(eventName: string): string[] {
  const terms: string[] = [];
  
  // Full event name
  terms.push(eventName);
  
  // Extract team names from "Team A vs Team B" format
  const vsMatch = eventName.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) {
    terms.push(vsMatch[1].trim());
    terms.push(vsMatch[2].trim());
    
    // Try last word of each team (often most distinctive)
    const team1Parts = vsMatch[1].trim().split(' ');
    const team2Parts = vsMatch[2].trim().split(' ');
    if (team1Parts.length > 1) terms.push(team1Parts[team1Parts.length - 1]);
    if (team2Parts.length > 1) terms.push(team2Parts[team2Parts.length - 1]);
  }
  
  return [...new Set(terms)]; // Remove duplicates
}

function findBestMatch(eventName: string, outcome: string, events: any[]): PolymarketMatch | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const eventNorm = normalize(eventName);
  const outcomeNorm = normalize(outcome);
  
  const eventTokens = expandWithAliases(eventNorm);
  const outcomeTokens = expandWithAliases(outcomeNorm);
  
  let bestMatch: PolymarketMatch | null = null;
  
  for (const event of events) {
    const eventMarkets = event.markets || [];
    
    for (const market of eventMarkets) {
      // Skip closed or inactive markets
      if (market.closed || !market.active) continue;
      
      // Skip low volume markets
      const volume = parseFloat(market.volume) || 0;
      if (volume < MIN_VOLUME) continue;
      
      // Parse prices
      let yesPrice = 0.5;
      let noPrice = 0.5;
      
      if (market.outcomePrices) {
        try {
          const prices = typeof market.outcomePrices === 'string' 
            ? JSON.parse(market.outcomePrices) 
            : market.outcomePrices;
          if (Array.isArray(prices) && prices.length >= 2) {
            yesPrice = parseFloat(prices[0]) || 0.5;
            noPrice = parseFloat(prices[1]) || 0.5;
          }
        } catch (e) {
          // Use defaults
        }
      }
      
      // Skip markets with no real price data
      if (yesPrice === 0.5 && noPrice === 0.5) continue;
      
      const questionNorm = normalize(market.question || event.title || '');
      const questionTokens = tokenize(questionNorm);
      
      // Calculate similarity scores
      const eventJaccard = jaccardSimilarity(eventTokens, questionTokens);
      const outcomeJaccard = jaccardSimilarity(outcomeTokens, questionTokens);
      const levenSim = levenshteinSimilarity(eventNorm, questionNorm);
      
      // Combined confidence score
      const confidence = (eventJaccard * 0.4) + (outcomeJaccard * 0.35) + (levenSim * 0.25);
      
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          market_id: market.conditionId || market.id,
          question: market.question || event.title || 'Unknown',
          yes_price: yesPrice,
          no_price: noPrice,
          volume: volume,
          confidence: confidence,
        };
      }
    }
  }
  
  return bestMatch;
}

// ============================================================================
// STRING MATCHING UTILITIES
// ============================================================================

function expandWithAliases(text: string): Set<string> {
  const tokens = tokenize(text);
  
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (text.includes(canonical) || aliases.some(a => text.includes(a))) {
      tokens.add(canonical);
      aliases.forEach(a => tokens.add(a));
    }
  }
  
  return tokens;
}

function tokenize(text: string): Set<string> {
  return new Set(text.split(/\s+/).filter(t => t.length > 2));
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function levenshteinSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================================
// EVENT STATE TRANSITIONS
// ============================================================================

async function dropEvent(supabase: any, event: WatchState, reason: string) {
  await supabase
    .from('event_watch_state')
    .update({ watch_state: 'dropped' })
    .eq('id', event.id);
    
  await logMovement(supabase, event, 'dropped', false, 0, 0);
  console.log(`[ACTIVE-MODE-POLL] Dropped ${event.event_name}: ${reason}`);
}

async function transitionToSignalOnly(supabase: any, event: WatchState, currentProb: number, holdDuration: number) {
  const signalStrength = Math.abs(event.movement_pct);
  
  await supabase.from('signal_opportunities').insert({
    event_name: event.event_name,
    recommended_outcome: null,
    side: event.movement_pct > 0 ? 'YES' : 'NO',
    polymarket_market_id: null,
    polymarket_price: 0,
    bookmaker_probability: currentProb,
    bookmaker_prob_fair: currentProb,
    edge_percent: 0,
    confidence_score: Math.min(85, Math.round(30 + signalStrength * 5)),
    is_true_arbitrage: false,
    signal_strength: signalStrength,
    urgency: 'low',
    status: 'active',
  });
  
  await supabase
    .from('event_watch_state')
    .update({ watch_state: 'signal' })
    .eq('id', event.id);
    
  await logMovement(supabase, event, 'signal', false, 0, holdDuration);
  console.log(`[ACTIVE-MODE-POLL] Signal-only: ${event.event_name}`);
}

async function logMovement(
  supabase: any, 
  event: WatchState, 
  finalState: string, 
  polyMatched: boolean, 
  edge: number,
  holdDuration: number
) {
  await supabase.from('movement_logs').insert({
    event_key: event.event_key,
    event_name: event.event_name,
    movement_pct: event.movement_pct,
    velocity: event.movement_velocity,
    hold_duration_seconds: Math.round(holdDuration * 60),
    samples_captured: event.samples_since_hold,
    final_state: finalState,
    polymarket_matched: polyMatched,
    edge_at_confirmation: edge,
  });
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

    const smsMessage = `🚨 EDGE DETECTED: ${event.event_name}\n+${edgePct.toFixed(1)}% edge. Poly: ${(polyPrice * 100).toFixed(0)}c. Execute now!`;
    
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
      console.log(`[ACTIVE-MODE-POLL] SMS sent to ${profile.phone_number.substring(0, 5)}...`);
    } else {
      console.error('[ACTIVE-MODE-POLL] SMS failed:', await smsResponse.text());
    }
  } catch (err) {
    console.error('[ACTIVE-MODE-POLL] SMS error:', err);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[ACTIVE-MODE-POLL] Starting Tier 2 polling...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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
      signalOnly: 0,
      dropped: 0,
      continued: 0,
      polymarket_calls: 0,
    };

    for (const event of activeEvents as WatchState[]) {
      try {
        // Check if active window expired
        if (event.active_until && new Date(event.active_until) < new Date()) {
          await dropEvent(supabase, event, 'window_expired');
          results.dropped++;
          continue;
        }

        // Get latest snapshots for this event
        const { data: snapshots } = await supabase
          .from('probability_snapshots')
          .select('*')
          .eq('event_key', event.event_key)
          .order('captured_at', { ascending: false })
          .limit(10);

        if (!snapshots || snapshots.length === 0) {
          console.log(`[ACTIVE-MODE-POLL] No snapshots for: ${event.event_name}`);
          continue;
        }

        const currentProb = snapshots[0].fair_probability;
        const peak = Math.max(event.peak_probability, currentProb);
        
        // Check for reversion
        const reversion = (peak - currentProb) * 100;
        const reverted = reversion > REVERSION_THRESHOLD_PCT;

        if (reverted) {
          console.log(`[ACTIVE-MODE-POLL] Reversion detected for ${event.event_name}: ${reversion.toFixed(1)}%`);
          
          await supabase
            .from('event_watch_state')
            .update({
              hold_start_at: new Date().toISOString(),
              samples_since_hold: 0,
              reverted: true,
              current_probability: currentProb,
              peak_probability: peak,
            })
            .eq('id', event.id);
          
          results.continued++;
          continue;
        }

        // Check hold duration
        const holdStart = event.hold_start_at ? new Date(event.hold_start_at) : new Date();
        const holdDurationMinutes = (Date.now() - holdStart.getTime()) / (1000 * 60);
        
        const newSampleCount = event.samples_since_hold + 1;
        
        if (holdDurationMinutes >= HOLD_WINDOW_MINUTES && newSampleCount >= SAMPLES_REQUIRED) {
          console.log(`[ACTIVE-MODE-POLL] Confirmation reached for: ${event.event_name}`);
          
          // ================================================================
          // LIVE POLYMARKET FETCH - Per-event targeted API call
          // ================================================================
          const match = await fetchPolymarketForEvent(event.event_name, snapshots[0].outcome);
          results.polymarket_calls++;
          
          if (match && match.confidence >= MATCH_THRESHOLD) {
            // Calculate edge using LIVE Polymarket price
            const bookmakerProb = currentProb;
            const polyPrice = match.yes_price;
            const edgePct = (bookmakerProb - polyPrice) * 100;
            
            if (edgePct >= MIN_EDGE_PCT) {
              console.log(`[ACTIVE-MODE-POLL] CONFIRMED EDGE: ${event.event_name} - ${edgePct.toFixed(1)}%`);
              
              // Send SMS alert
              await sendSmsAlert(supabase, event, edgePct, polyPrice);
              
              // Create signal opportunity
              await supabase.from('signal_opportunities').insert({
                event_name: event.event_name,
                recommended_outcome: snapshots[0].outcome,
                side: 'YES',
                polymarket_market_id: match.market_id,
                polymarket_price: polyPrice,
                polymarket_yes_price: polyPrice,
                polymarket_volume: match.volume,
                bookmaker_probability: bookmakerProb,
                bookmaker_prob_fair: bookmakerProb,
                edge_percent: edgePct,
                confidence_score: Math.round(match.confidence * 100),
                polymarket_match_confidence: match.confidence,
                is_true_arbitrage: true,
                signal_strength: null,
                urgency: edgePct > 5 ? 'high' : 'normal',
                status: 'active',
              });
              
              // Update watch state to confirmed
              await supabase
                .from('event_watch_state')
                .update({
                  watch_state: 'confirmed',
                  polymarket_matched: true,
                  polymarket_market_id: match.market_id,
                  polymarket_price: polyPrice,
                  current_probability: currentProb,
                })
                .eq('id', event.id);

              await logMovement(supabase, event, 'confirmed', true, edgePct, holdDurationMinutes);
              results.confirmed++;
            } else {
              // Edge below threshold
              console.log(`[ACTIVE-MODE-POLL] Edge too small (${edgePct.toFixed(1)}%) for: ${event.event_name}`);
              await transitionToSignalOnly(supabase, event, currentProb, holdDurationMinutes);
              results.signalOnly++;
            }
          } else {
            // No Polymarket match
            console.log(`[ACTIVE-MODE-POLL] No Poly match for: ${event.event_name}`);
            await transitionToSignalOnly(supabase, event, currentProb, holdDurationMinutes);
            results.signalOnly++;
          }
        } else {
          // Continue monitoring
          await supabase
            .from('event_watch_state')
            .update({
              samples_since_hold: newSampleCount,
              current_probability: currentProb,
              peak_probability: peak,
            })
            .eq('id', event.id);
          
          results.continued++;
        }
        
        results.processed++;
      } catch (err) {
        console.error(`[ACTIVE-MODE-POLL] Error processing ${event.event_name}:`, err);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ACTIVE-MODE-POLL] Complete in ${duration}ms. Confirmed: ${results.confirmed}, Signal: ${results.signalOnly}, Dropped: ${results.dropped}, Poly API calls: ${results.polymarket_calls}`);

    return new Response(
      JSON.stringify({ success: true, ...results, duration_ms: duration }),
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
