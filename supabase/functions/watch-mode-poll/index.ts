import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sharp bookmakers for baseline polling
const SHARP_BOOKS = ['pinnacle', 'betfair', 'betfair_ex_uk', 'matchbook'];

// ============================================================================
// EXPANDED SPORTS COVERAGE - Full spec coverage for H2H markets
// ============================================================================
const SPORTS_MAP: Record<string, string> = {
  // TOP PRIORITY - H2H markets with Polymarket presence
  basketball_nba: 'basketball_nba',
  mma_mixed_martial_arts: 'mma_mixed_martial_arts',
  americanfootball_nfl: 'americanfootball_nfl',
  icehockey_nhl: 'icehockey_nhl',
  
  // TENNIS - Grand Slams + Masters 1000
  tennis_atp_aus_open_singles: 'tennis_atp_aus_open_singles',
  tennis_wta_aus_open_singles: 'tennis_wta_aus_open_singles',
  tennis_atp_french_open: 'tennis_atp_french_open',
  tennis_wta_french_open: 'tennis_wta_french_open',
  tennis_atp_wimbledon: 'tennis_atp_wimbledon',
  tennis_wta_wimbledon: 'tennis_wta_wimbledon',
  tennis_atp_us_open: 'tennis_atp_us_open',
  tennis_wta_us_open: 'tennis_wta_us_open',
  tennis_atp_indian_wells: 'tennis_atp_indian_wells',
  tennis_wta_indian_wells: 'tennis_wta_indian_wells',
  tennis_atp_miami_open: 'tennis_atp_miami_open',
  tennis_wta_miami_open: 'tennis_wta_miami_open',
  tennis_atp_madrid_open: 'tennis_atp_madrid_open',
  tennis_wta_madrid_open: 'tennis_wta_madrid_open',
  tennis_atp_italian_open: 'tennis_atp_italian_open',
  tennis_wta_italian_open: 'tennis_wta_italian_open',
  tennis_atp_canadian_open: 'tennis_atp_canadian_open',
  tennis_wta_canadian_open: 'tennis_wta_canadian_open',
  tennis_atp_cincinnati_open: 'tennis_atp_cincinnati_open',
  tennis_wta_cincinnati_open: 'tennis_wta_cincinnati_open',
  
  // SOCCER - Top Leagues + Champions League
  soccer_epl: 'soccer_epl',
  soccer_spain_la_liga: 'soccer_spain_la_liga',
  soccer_germany_bundesliga: 'soccer_germany_bundesliga',
  soccer_italy_serie_a: 'soccer_italy_serie_a',
  soccer_france_ligue_one: 'soccer_france_ligue_one',
  soccer_uefa_champs_league: 'soccer_uefa_champs_league',
  
  // Legacy mappings for backwards compatibility
  football_nfl: 'americanfootball_nfl',
  hockey_nhl: 'icehockey_nhl',
  mma: 'mma_mixed_martial_arts',
};

// Movement detection thresholds
const MOVEMENT_THRESHOLD_PCT = 6.0;
const MOVEMENT_VELOCITY_MIN = 0.4; // % per minute
const LOOKBACK_MINUTES = 15;
const ACTIVE_WINDOW_MINUTES = 20;
const MAX_SIMULTANEOUS_ACTIVE = 5;
const MIN_CONFIRMING_BOOKS = 2; // Consensus requirement

interface Snapshot {
  event_key: string;
  event_name: string;
  outcome: string;
  fair_probability: number;
  captured_at: string;
}

interface WatchState {
  id: string;
  event_key: string;
  event_name: string;
  watch_state: string;
  initial_probability: number;
  peak_probability: number;
  current_probability: number;
  movement_pct: number;
  movement_velocity: number;
  escalated_at: string | null;
  active_until: string | null;
}

// ============================================================================
// CONSENSUS MOVEMENT DETECTION - Require 2+ books confirming same direction
// ============================================================================
function validateConsensusMovement(outcomeOdds: Record<string, number[]>): { hasConsensus: boolean; confirmingBooks: number } {
  const movements: { book: string; delta: number }[] = [];
  
  for (const [book, oddsHistory] of Object.entries(outcomeOdds)) {
    if (oddsHistory.length >= 1) {
      // Convert odds to probability (1/odds)
      const currentProb = 1 / oddsHistory[0];
      movements.push({ book, delta: currentProb });
    }
  }
  
  if (movements.length < MIN_CONFIRMING_BOOKS) {
    return { hasConsensus: false, confirmingBooks: movements.length };
  }
  
  // For consensus, we check if books agree on probability range
  // Calculate standard deviation - low std dev means consensus
  const probs = movements.map(m => m.delta);
  const avgProb = probs.reduce((a, b) => a + b, 0) / probs.length;
  const variance = probs.reduce((sum, p) => sum + Math.pow(p - avgProb, 2), 0) / probs.length;
  const stdDev = Math.sqrt(variance);
  
  // If std dev is low (< 5%), we have consensus
  const hasConsensus = stdDev < 0.05 && movements.length >= MIN_CONFIRMING_BOOKS;
  
  return { hasConsensus, confirmingBooks: movements.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[WATCH-MODE-POLL] Starting Tier 1 polling...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    // Get scan config (use defaults if none exists)
    const { data: configData } = await supabase
      .from('scan_config')
      .select('enabled_sports, max_simultaneous_active, movement_threshold_pct, focus_mode')
      .limit(1)
      .maybeSingle();

    const enabledSports = configData?.enabled_sports || ['basketball_nba'];
    const maxActive = configData?.max_simultaneous_active || MAX_SIMULTANEOUS_ACTIVE;
    const movementThreshold = configData?.movement_threshold_pct || MOVEMENT_THRESHOLD_PCT;
    const focusMode = (configData as any)?.focus_mode || 'h2h_only';

    console.log(`[WATCH-MODE-POLL] Enabled sports: ${enabledSports.join(', ')}`);
    console.log(`[WATCH-MODE-POLL] Focus mode: ${focusMode}`);

    // Limit to max 2 sports per poll to manage API costs
    const sportsToFetch = enabledSports.slice(0, 2);
    const snapshots: Snapshot[] = [];
    let apiCallsUsed = 0;

    // Fetch odds for each enabled sport
    for (const sportKey of sportsToFetch) {
      const apiSportKey = SPORTS_MAP[sportKey] || sportKey;
      
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${apiSportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us,us2,uk,eu,au&markets=h2h&oddsFormat=decimal&bookmakers=${SHARP_BOOKS.join(',')}`;
        
        console.log(`[WATCH-MODE-POLL] Fetching ${sportKey}...`);
        const response = await fetch(url);
        apiCallsUsed++;
        
        if (!response.ok) {
          console.error(`[WATCH-MODE-POLL] API error for ${sportKey}: ${response.status}`);
          continue;
        }

        const events = await response.json();
        console.log(`[WATCH-MODE-POLL] ${sportKey}: ${events.length} events`);

        // Process each event
        for (const event of events) {
          // Focus mode filter: skip futures (events > 14 days out)
          if (focusMode === 'h2h_only') {
            const commenceTime = new Date(event.commence_time);
            const daysUntilEvent = (commenceTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (daysUntilEvent > 14) {
              continue; // Skip long-dated futures
            }
          }
          
          const eventKey = normalizeEventKey(event.home_team, event.away_team, event.commence_time);
          const eventName = `${event.home_team} vs ${event.away_team}`;

          // Extract H2H odds and calculate fair probabilities
          const outcomeOdds: Record<string, number[]> = {};
          
          for (const bookmaker of event.bookmakers || []) {
            for (const market of bookmaker.markets || []) {
              if (market.key !== 'h2h') continue;
              
              for (const outcome of market.outcomes || []) {
                if (!outcomeOdds[outcome.name]) {
                  outcomeOdds[outcome.name] = [];
                }
                outcomeOdds[outcome.name].push(outcome.price);
              }
            }
          }

          // Check consensus before proceeding
          const outcomes = Object.entries(outcomeOdds);
          if (outcomes.length !== 2) continue; // Only process 2-way markets
          
          // Validate we have consensus from 2+ books
          const consensus = validateConsensusMovement(outcomeOdds);
          if (!consensus.hasConsensus) {
            continue; // Skip events without multi-book consensus
          }

          const [outcome1, outcome2] = outcomes;
          const avg1 = outcome1[1].reduce((a, b) => a + b, 0) / outcome1[1].length;
          const avg2 = outcome2[1].reduce((a, b) => a + b, 0) / outcome2[1].length;

          const rawProb1 = 1 / avg1;
          const rawProb2 = 1 / avg2;
          const total = rawProb1 + rawProb2;

          const fairProb1 = rawProb1 / total;
          const fairProb2 = rawProb2 / total;

          // Store snapshots for both outcomes
          snapshots.push({
            event_key: eventKey,
            event_name: eventName,
            outcome: outcome1[0],
            fair_probability: fairProb1,
            captured_at: new Date().toISOString(),
          });

          snapshots.push({
            event_key: eventKey,
            event_name: eventName,
            outcome: outcome2[0],
            fair_probability: fairProb2,
            captured_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`[WATCH-MODE-POLL] Error fetching ${sportKey}:`, err);
      }
    }

    console.log(`[WATCH-MODE-POLL] Collected ${snapshots.length} snapshots from ${apiCallsUsed} API calls`);

    // Store snapshots in database
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('probability_snapshots')
        .upsert(snapshots, { 
          onConflict: 'event_key,outcome,captured_at',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error('[WATCH-MODE-POLL] Error storing snapshots:', insertError);
      }
    }

    // Analyze movement for each unique event
    const eventKeys = [...new Set(snapshots.map(s => s.event_key))];
    const escalationCandidates: WatchState[] = [];

    for (const eventKey of eventKeys) {
      const eventSnapshots = snapshots.filter(s => s.event_key === eventKey);
      if (eventSnapshots.length === 0) continue;

      // Get historical snapshots for movement detection
      const lookbackTime = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
      const { data: historicalSnapshots } = await supabase
        .from('probability_snapshots')
        .select('*')
        .eq('event_key', eventKey)
        .gte('captured_at', lookbackTime)
        .order('captured_at', { ascending: true });

      if (!historicalSnapshots || historicalSnapshots.length < 2) continue;

      // Calculate movement for the primary outcome (first one alphabetically)
      const primaryOutcome = eventSnapshots[0].outcome;
      const outcomeHistory = historicalSnapshots.filter(s => s.outcome === primaryOutcome);
      
      if (outcomeHistory.length < 2) continue;

      const initial = outcomeHistory[0];
      const current = outcomeHistory[outcomeHistory.length - 1];
      
      const movementPct = (current.fair_probability - initial.fair_probability) * 100;
      const elapsedMinutes = (new Date(current.captured_at).getTime() - new Date(initial.captured_at).getTime()) / (1000 * 60);
      const velocity = elapsedMinutes > 0 ? Math.abs(movementPct) / elapsedMinutes : 0;

      // Check if qualifies for escalation
      if (Math.abs(movementPct) >= movementThreshold && velocity >= MOVEMENT_VELOCITY_MIN) {
        console.log(`[WATCH-MODE-POLL] Movement candidate: ${eventSnapshots[0].event_name} - ${movementPct.toFixed(1)}% @ ${velocity.toFixed(2)}%/min`);
        
        escalationCandidates.push({
          id: '',
          event_key: eventKey,
          event_name: eventSnapshots[0].event_name,
          watch_state: 'watching',
          initial_probability: initial.fair_probability,
          peak_probability: Math.max(...outcomeHistory.map(s => s.fair_probability)),
          current_probability: current.fair_probability,
          movement_pct: movementPct,
          movement_velocity: velocity,
          escalated_at: null,
          active_until: null,
        });
      }
    }

    // Check current active events count
    const { data: activeEvents, error: activeError } = await supabase
      .from('event_watch_state')
      .select('id')
      .eq('watch_state', 'active');

    const currentActiveCount = activeEvents?.length || 0;
    const slotsAvailable = maxActive - currentActiveCount;

    console.log(`[WATCH-MODE-POLL] Active slots: ${currentActiveCount}/${maxActive}, candidates: ${escalationCandidates.length}`);

    // Escalate top candidates up to available slots
    const toEscalate = escalationCandidates
      .sort((a, b) => Math.abs(b.movement_pct) - Math.abs(a.movement_pct))
      .slice(0, slotsAvailable);

    let escalatedCount = 0;
    for (const candidate of toEscalate) {
      const activeUntil = new Date(Date.now() + ACTIVE_WINDOW_MINUTES * 60 * 1000).toISOString();
      
      const { error: upsertError } = await supabase
        .from('event_watch_state')
        .upsert({
          event_key: candidate.event_key,
          event_name: candidate.event_name,
          watch_state: 'active',
          escalated_at: new Date().toISOString(),
          active_until: activeUntil,
          initial_probability: candidate.initial_probability,
          peak_probability: candidate.peak_probability,
          current_probability: candidate.current_probability,
          movement_pct: candidate.movement_pct,
          movement_velocity: candidate.movement_velocity,
          hold_start_at: new Date().toISOString(),
          samples_since_hold: 0,
        }, { onConflict: 'event_key' });

      if (!upsertError) {
        escalatedCount++;
        console.log(`[WATCH-MODE-POLL] Escalated to ACTIVE: ${candidate.event_name}`);
      }
    }

    // Update non-escalated events in watching state
    const nonEscalatedKeys = escalationCandidates
      .filter(c => !toEscalate.includes(c))
      .map(c => c.event_key);

    for (const eventKey of nonEscalatedKeys) {
      const candidate = escalationCandidates.find(c => c.event_key === eventKey)!;
      await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: candidate.event_name,
          watch_state: 'watching',
          initial_probability: candidate.initial_probability,
          current_probability: candidate.current_probability,
          movement_pct: candidate.movement_pct,
          movement_velocity: candidate.movement_velocity,
        }, { onConflict: 'event_key' });
    }

    // Cleanup old snapshots (older than 24h)
    const cleanupTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error: cleanupError } = await supabase
      .from('probability_snapshots')
      .delete()
      .lt('captured_at', cleanupTime);

    if (cleanupError) {
      console.error('[WATCH-MODE-POLL] Cleanup error:', cleanupError);
    }

    const duration = Date.now() - startTime;
    console.log(`[WATCH-MODE-POLL] Complete in ${duration}ms. Snapshots: ${snapshots.length}, Escalated: ${escalatedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        snapshots_stored: snapshots.length,
        events_analyzed: eventKeys.length,
        escalation_candidates: escalationCandidates.length,
        escalated_to_active: escalatedCount,
        api_calls_used: apiCallsUsed,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WATCH-MODE-POLL] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper to create normalized event key
function normalizeEventKey(home: string, away: string, commenceTime: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const date = new Date(commenceTime).toISOString().split('T')[0];
  return `${normalize(home)}_vs_${normalize(away)}_${date}`;
}
