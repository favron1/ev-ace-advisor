import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL_VERSION = "racing_v1.0_hybrid";

// =====================================================
// RACING MODEL - HYBRID STATISTICAL + AI APPROACH
// Completely isolated from sports betting logic
// =====================================================

interface RacingModelRequest {
  racing_types?: string[]; // ['horse', 'greyhound']
  regions?: string[];
  hours_ahead?: number;
  min_ev_threshold?: number; // Minimum EV% to recommend (default 5%)
  min_confidence?: number; // Minimum confidence score (default 65)
  bankroll_units?: number;
}

interface RunnerWithOdds {
  id: string;
  event_id: string;
  runner_number: number;
  runner_name: string;
  barrier_box: number;
  jockey_name?: string;
  trainer_name?: string;
  recent_form?: string[];
  run_style?: string;
  early_speed_rating?: number;
  track_wins?: number;
  track_starts?: number;
  distance_wins?: number;
  distance_starts?: number;
  best_odds: number;
  best_bookmaker: string;
  all_odds: { bookmaker: string; odds: number }[];
}

interface RaceWithRunners {
  id: string;
  external_id: string;
  sport: 'horse' | 'greyhound';
  track: string;
  track_country: string;
  race_number: number;
  race_name?: string;
  distance_m: number;
  track_condition?: string;
  start_time_utc: string;
  field_size: number;
  runners: RunnerWithOdds[];
}

// =====================================================
// BETTING ANGLES - Core professional racing logic
// =====================================================

interface AngleResult {
  name: string;
  triggered: boolean;
  adjustment: number; // Probability adjustment
  details?: string;
}

function evaluateBarrierBias(
  runner: RunnerWithOdds,
  race: RaceWithRunners,
  trackBias?: any
): AngleResult {
  // Greyhound box bias is more pronounced than horse barrier bias
  const isGreyhound = race.sport === 'greyhound';
  const barrier = runner.barrier_box;
  
  let adjustment = 0;
  let triggered = false;
  let details = '';

  if (isGreyhound) {
    // Greyhound: Boxes 1-3 typically have advantage on inside-biased tracks
    if (barrier <= 2) {
      adjustment = 0.03; // +3% probability boost
      triggered = true;
      details = `Box ${barrier} inside advantage (greyhound)`;
    } else if (barrier >= 7) {
      adjustment = -0.02; // Slight penalty for wide boxes
      details = `Box ${barrier} wide draw disadvantage`;
    }
  } else {
    // Horse racing: Barrier impact varies by track and distance
    if (barrier <= 4) {
      adjustment = 0.02;
      triggered = true;
      details = `Barrier ${barrier} inside draw`;
    } else if (barrier >= 12) {
      adjustment = -0.015;
      details = `Wide barrier ${barrier}`;
    }
  }

  // Apply track-specific bias if available
  if (trackBias) {
    const biasKey = `barrier_${Math.min(barrier, 8)}_win_rate`;
    const biasRate = trackBias[biasKey];
    if (biasRate && biasRate > 0.15) { // Above average 12.5% for 8 runners
      adjustment += 0.02;
      triggered = true;
      details = `${details} + track bias data`;
    }
  }

  return { name: 'barrier_bias', triggered, adjustment, details };
}

function evaluateEarlySpeed(
  runner: RunnerWithOdds,
  race: RaceWithRunners,
  allRunners: RunnerWithOdds[]
): AngleResult {
  const runStyle = runner.run_style;
  let adjustment = 0;
  let triggered = false;
  let details = '';

  // Count leaders in the field
  const leaders = allRunners.filter(r => r.run_style === 'leader').length;
  
  if (runStyle === 'leader') {
    if (leaders === 1) {
      // Lone leader - significant advantage
      adjustment = 0.05;
      triggered = true;
      details = 'Lone leader pace advantage';
    } else if (leaders <= 2) {
      adjustment = 0.02;
      triggered = true;
      details = 'Few leaders, pace advantage likely';
    }
  } else if (runStyle === 'on_pace' && leaders >= 3) {
    // Many leaders = hot pace = on-pace runners benefit
    adjustment = 0.02;
    triggered = true;
    details = 'Hot pace expected, stalking position beneficial';
  }

  return { name: 'early_speed', triggered, adjustment, details };
}

function evaluateClassDrop(runner: RunnerWithOdds): AngleResult {
  // This would need form data analysis
  // For now, check recent form for indicators
  const form = runner.recent_form || [];
  let adjustment = 0;
  let triggered = false;
  let details = '';

  // Simple heuristic: if recent finishes are mid-field (3-5) in higher class,
  // dropping may yield improvement
  const recentFinishes = form.slice(0, 3).map(f => parseInt(f) || 99);
  const avgFinish = recentFinishes.reduce((a, b) => a + b, 0) / recentFinishes.length;

  if (avgFinish <= 4 && avgFinish > 0) {
    adjustment = 0.02;
    triggered = true;
    details = `Consistent form (avg finish: ${avgFinish.toFixed(1)})`;
  }

  return { name: 'class_form', triggered, adjustment, details };
}

function evaluateTrackDistanceRecord(runner: RunnerWithOdds): AngleResult {
  const trackWins = runner.track_wins || 0;
  const trackStarts = runner.track_starts || 0;
  const distWins = runner.distance_wins || 0;
  const distStarts = runner.distance_starts || 0;

  let adjustment = 0;
  let triggered = false;
  let details = '';

  // Track record
  if (trackStarts >= 3 && trackWins / trackStarts >= 0.25) {
    adjustment += 0.025;
    triggered = true;
    details = `Track record: ${trackWins}/${trackStarts}`;
  }

  // Distance record
  if (distStarts >= 3 && distWins / distStarts >= 0.25) {
    adjustment += 0.02;
    triggered = true;
    details = details ? `${details}, Dist: ${distWins}/${distStarts}` : `Dist record: ${distWins}/${distStarts}`;
  }

  return { name: 'track_distance', triggered, adjustment, details };
}

// =====================================================
// PROBABILITY CALCULATION
// =====================================================

function calculateBaseProb(runner: RunnerWithOdds, fieldSize: number): number {
  // Start from market-implied probability
  const impliedProb = 1 / runner.best_odds;
  
  // For racing, market is generally efficient but has overround
  // Normalize assuming ~115-120% total market
  // We'll use the implied prob as base, adjusted for overround
  const normalizedProb = impliedProb * 0.85; // Rough overround adjustment
  
  return Math.max(0.01, Math.min(0.90, normalizedProb));
}

function calculateModelProb(
  runner: RunnerWithOdds,
  race: RaceWithRunners,
  allRunners: RunnerWithOdds[],
  trackBias?: any
): { probability: number; angles: AngleResult[]; confidence: number } {
  
  const baseProb = calculateBaseProb(runner, race.field_size);
  
  // Evaluate all angles
  const angles: AngleResult[] = [
    evaluateBarrierBias(runner, race, trackBias),
    evaluateEarlySpeed(runner, race, allRunners),
    evaluateClassDrop(runner),
    evaluateTrackDistanceRecord(runner),
  ];

  // Apply angle adjustments
  let adjustedProb = baseProb;
  for (const angle of angles) {
    if (angle.triggered) {
      adjustedProb += angle.adjustment;
    }
  }

  // Clamp probability
  adjustedProb = Math.max(0.02, Math.min(0.85, adjustedProb));

  // Calculate confidence based on:
  // 1. Number of positive angles triggered
  // 2. Field size (smaller = more predictable)
  // 3. Data quality
  const positiveAngles = angles.filter(a => a.triggered && a.adjustment > 0).length;
  const dataQuality = (runner.recent_form?.length || 0) > 0 ? 20 : 0;
  const fieldBonus = race.field_size <= 8 ? 10 : 0;
  
  const confidence = 50 + (positiveAngles * 10) + dataQuality + fieldBonus;

  return {
    probability: adjustedProb,
    angles,
    confidence: Math.min(95, confidence),
  };
}

// =====================================================
// STAKING - Kelly Criterion (fractional)
// =====================================================

function calculateStake(
  modelProb: number,
  odds: number,
  confidence: number,
  bankrollUnits: number
): number {
  const edge = modelProb - (1 / odds);
  if (edge <= 0) return 0;

  // Kelly fraction: f = (bp - q) / b where b = odds-1, p = prob, q = 1-p
  const b = odds - 1;
  const q = 1 - modelProb;
  const kellyFraction = (b * modelProb - q) / b;

  // Apply 10% Kelly for conservative staking
  let stake = kellyFraction * 0.10 * bankrollUnits;

  // Confidence adjustment
  stake *= (confidence / 100);

  // Clamp to 0.25 - 1.5 units for racing (slightly higher than sports due to variance)
  return Math.max(0.25, Math.min(1.5, stake));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: RacingModelRequest = await req.json().catch(() => ({}));
    const racingTypes = body.racing_types || ["horse", "greyhound"];
    const regions = body.regions || ["aus", "uk"];
    const hoursAhead = body.hours_ahead || 24;
    const minEvThreshold = body.min_ev_threshold || 0.05; // 5% minimum EV
    const minConfidence = body.min_confidence || 65;
    const bankrollUnits = body.bankroll_units || 100;

    console.log(`[Racing Model] Starting analysis for ${racingTypes.join(", ")}`);

    // Fetch upcoming races with runners and odds
    const cutoffTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: races, error: racesError } = await supabase
      .from("racing_events")
      .select(`
        *,
        racing_runners (
          *,
          racing_markets (
            bookmaker,
            market_type,
            odds_decimal,
            captured_at
          )
        )
      `)
      .in("sport", racingTypes)
      .eq("status", "upcoming")
      .gte("start_time_utc", now)
      .lte("start_time_utc", cutoffTime)
      .order("start_time_utc", { ascending: true });

    if (racesError) throw racesError;

    console.log(`[Racing Model] Found ${races?.length || 0} upcoming races`);

    const recommendations: any[] = [];

    for (const race of races || []) {
      // Process runners with their best odds
      const runnersWithOdds: RunnerWithOdds[] = (race.racing_runners || [])
        .filter((r: any) => !r.scratched)
        .map((runner: any) => {
          const markets = runner.racing_markets || [];
          
          // Get latest odds per bookmaker
          const latestOdds = new Map<string, { bookmaker: string; odds: number }>();
          for (const m of markets) {
            if (m.market_type === 'win') {
              const existing = latestOdds.get(m.bookmaker);
              if (!existing || new Date(m.captured_at) > new Date(existing.odds)) {
                latestOdds.set(m.bookmaker, { bookmaker: m.bookmaker, odds: m.odds_decimal });
              }
            }
          }

          const allOdds = [...latestOdds.values()];
          const bestOdds = allOdds.reduce((best, curr) => 
            curr.odds > best.odds ? curr : best, 
            { bookmaker: '', odds: 0 }
          );

          return {
            id: runner.id,
            event_id: runner.event_id,
            runner_number: runner.runner_number,
            runner_name: runner.runner_name,
            barrier_box: runner.barrier_box,
            jockey_name: runner.jockey_name,
            trainer_name: runner.trainer_name,
            recent_form: runner.recent_form,
            run_style: runner.run_style,
            early_speed_rating: runner.early_speed_rating,
            track_wins: runner.track_wins,
            track_starts: runner.track_starts,
            distance_wins: runner.distance_wins,
            distance_starts: runner.distance_starts,
            best_odds: bestOdds.odds,
            best_bookmaker: bestOdds.bookmaker,
            all_odds: allOdds,
          };
        })
        .filter((r: RunnerWithOdds) => r.best_odds > 1);

      if (runnersWithOdds.length < 2) continue;

      // Fetch track bias if available
      const { data: trackBias } = await supabase
        .from("racing_track_bias")
        .select("*")
        .eq("track", race.track)
        .eq("sport", race.sport)
        .maybeSingle();

      // Analyze each runner
      for (const runner of runnersWithOdds) {
        const { probability, angles, confidence } = calculateModelProb(
          runner,
          race as RaceWithRunners,
          runnersWithOdds,
          trackBias
        );

        const impliedProb = 1 / runner.best_odds;
        const edge = probability - impliedProb;
        const ev = edge * runner.best_odds;

        // Apply filters
        if (edge < minEvThreshold) continue;
        if (confidence < minConfidence) continue;

        const stakeUnits = calculateStake(probability, runner.best_odds, confidence, bankrollUnits);
        const triggeredAngles = angles.filter(a => a.triggered && a.adjustment > 0);

        // Generate reasoning
        const anglesList = triggeredAngles.map(a => a.details || a.name).join("; ");
        const reasoning = `${race.sport === 'horse' ? '🐎' : '🐕'} ${runner.runner_name} (#${runner.runner_number}) from barrier ${runner.barrier_box}. ${anglesList || 'Market value detected'}. Model: ${(probability * 100).toFixed(1)}% vs Market: ${(impliedProb * 100).toFixed(1)}%.`;

        // Store prediction
        const { error: predError } = await supabase
          .from("racing_model_predictions")
          .upsert({
            event_id: race.id,
            runner_id: runner.id,
            model_version: MODEL_VERSION,
            model_probability: probability,
            confidence_score: confidence,
            angles_triggered: triggeredAngles.map(a => a.name),
            angle_details: { angles: triggeredAngles },
            best_odds_at_prediction: runner.best_odds,
            implied_prob_market: impliedProb,
            expected_value: ev,
            edge_pct: edge * 100,
            is_recommended: true,
            recommended_stake_pct: stakeUnits,
            reasoning,
          }, { onConflict: "event_id,runner_id,model_version" });

        if (predError) {
          console.error(`[Racing Model] Error storing prediction:`, predError);
        }

        recommendations.push({
          race_id: race.id,
          race_name: race.race_name,
          track: race.track,
          race_number: race.race_number,
          sport: race.sport,
          start_time: race.start_time_utc,
          runner_id: runner.id,
          runner_name: runner.runner_name,
          runner_number: runner.runner_number,
          barrier_box: runner.barrier_box,
          jockey: runner.jockey_name,
          trainer: runner.trainer_name,
          market_type: "win",
          odds: runner.best_odds,
          bookmaker: runner.best_bookmaker,
          model_probability: probability,
          implied_probability: impliedProb,
          edge: edge,
          ev: ev,
          confidence,
          stake_units: stakeUnits,
          angles: triggeredAngles.map(a => a.name),
          reasoning,
        });
      }
    }

    // Sort by EV descending
    recommendations.sort((a, b) => b.ev - a.ev);

    // Calculate bet scores for ranking
    const scoredBets = recommendations.map((bet, i) => ({
      ...bet,
      bet_score: Math.round(
        50 +
        (bet.edge * 150) +
        (bet.confidence - 60) * 0.5 +
        (bet.angles.length * 5)
      ),
      rank: i + 1,
    }));

    console.log(`[Racing Model] Found ${scoredBets.length} value bets`);

    return new Response(
      JSON.stringify({
        success: true,
        model_version: MODEL_VERSION,
        races_analyzed: races?.length || 0,
        recommended_bets: scoredBets.slice(0, 20), // Top 20
        total_value_bets: scoredBets.length,
        filters_applied: {
          min_ev: minEvThreshold,
          min_confidence: minConfidence,
          hours_ahead: hoursAhead,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Racing Model] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
