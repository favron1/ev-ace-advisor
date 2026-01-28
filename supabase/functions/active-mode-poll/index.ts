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
const MATCH_THRESHOLD = 0.85;

// Team alias mapping for Polymarket matching
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

    // Get Polymarket markets for matching
    const { data: polymarkets } = await supabase
      .from('polymarket_markets')
      .select('*')
      .eq('status', 'active');

    const results = {
      processed: 0,
      confirmed: 0,
      signalOnly: 0,
      dropped: 0,
      continued: 0,
    };

    for (const event of activeEvents as WatchState[]) {
      try {
        // Check if active window expired
        if (event.active_until && new Date(event.active_until) < new Date()) {
          console.log(`[ACTIVE-MODE-POLL] Window expired for: ${event.event_name}`);
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
          
          // Reset hold tracking
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
          
          // Attempt Polymarket match
          const match = findPolymarketMatch(event.event_name, snapshots[0].outcome, polymarkets || []);
          
          if (match && match.confidence >= MATCH_THRESHOLD) {
            // Calculate edge
            const bookmakerProb = currentProb;
            const polyPrice = match.market.yes_price;
            const edgePct = (bookmakerProb - polyPrice) * 100;
            
            if (edgePct >= MIN_EDGE_PCT) {
              console.log(`[ACTIVE-MODE-POLL] CONFIRMED EDGE: ${event.event_name} - ${edgePct.toFixed(1)}%`);
              
              // Create signal opportunity
              await supabase.from('signal_opportunities').insert({
                event_name: event.event_name,
                recommended_outcome: snapshots[0].outcome,
                side: 'YES',
                polymarket_market_id: match.market.id,
                polymarket_price: polyPrice,
                polymarket_yes_price: polyPrice,
                polymarket_volume: match.market.volume,
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
                  polymarket_market_id: match.market.id,
                  polymarket_price: polyPrice,
                  current_probability: currentProb,
                })
                .eq('id', event.id);

              // Log for learning
              await logMovement(supabase, event, 'confirmed', true, edgePct, holdDurationMinutes);
              
              results.confirmed++;
            } else {
              // Edge below threshold
              await transitionToSignalOnly(supabase, event, currentProb, holdDurationMinutes);
              results.signalOnly++;
            }
          } else {
            // No Polymarket match - signal only
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
    console.log(`[ACTIVE-MODE-POLL] Complete in ${duration}ms. Confirmed: ${results.confirmed}, Signal: ${results.signalOnly}, Dropped: ${results.dropped}`);

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

// Helper functions
async function dropEvent(supabase: any, event: WatchState, reason: string) {
  await supabase
    .from('event_watch_state')
    .update({ watch_state: 'dropped' })
    .eq('id', event.id);
    
  await logMovement(supabase, event, 'dropped', false, 0, 0);
}

async function transitionToSignalOnly(supabase: any, event: WatchState, currentProb: number, holdDuration: number) {
  // Create signal-only opportunity
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

function findPolymarketMatch(
  eventName: string, 
  outcome: string, 
  polymarkets: any[]
): { market: any; confidence: number } | null {
  if (!polymarkets || polymarkets.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const eventNorm = normalize(eventName);
  const outcomeNorm = normalize(outcome);
  
  // Expand with aliases
  const eventTokens = expandWithAliases(eventNorm);
  const outcomeTokens = expandWithAliases(outcomeNorm);

  let bestMatch: { market: any; confidence: number } | null = null;

  for (const market of polymarkets) {
    const questionNorm = normalize(market.question);
    const questionTokens = tokenize(questionNorm);
    
    // Jaccard similarity for event
    const eventJaccard = jaccardSimilarity(eventTokens, questionTokens);
    
    // Jaccard similarity for outcome
    const outcomeJaccard = jaccardSimilarity(outcomeTokens, questionTokens);
    
    // Levenshtein similarity
    const levenSim = levenshteinSimilarity(eventNorm, questionNorm);
    
    // Combined score
    const confidence = (eventJaccard * 0.4) + (outcomeJaccard * 0.35) + (levenSim * 0.25);
    
    // Validate market freshness and liquidity
    const hoursSinceUpdate = market.last_updated 
      ? (Date.now() - new Date(market.last_updated).getTime()) / (1000 * 60 * 60)
      : 999;
    
    if (hoursSinceUpdate > 2 || (market.volume || 0) < 2000) {
      continue;
    }
    
    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { market, confidence };
    }
  }

  return bestMatch;
}

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
