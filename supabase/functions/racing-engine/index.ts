import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =====================================================
// RACING ENGINE v2.0 - PROFESSIONAL GRADE
// Complete isolation from sports betting
// Betfair-ready architecture (pluggable integration)
// =====================================================

const ENGINE_VERSION = "racing_v2.0_professional";
const MODEL_VERSION = "hybrid_ml_v1";

// =====================================================
// CONFIGURATION - Thresholds & Parameters
// =====================================================

interface EngineConfig {
  minEvThreshold: number;      // Minimum EV% to recommend (default 5%)
  minConfidence: number;       // Minimum confidence score (default 65)
  kellyFraction: number;       // Kelly staking fraction (default 0.10 = 10%)
  maxStakeUnits: number;       // Maximum stake per bet in units
  maxExposurePercent: number;  // Max exposure per race
  earlyMarketBonus: number;    // Bonus for early market timing
  lateMarketPenalty: number;   // Penalty for late/sharp markets
}

const DEFAULT_CONFIG: EngineConfig = {
  minEvThreshold: 0.05,       // 5% minimum EV
  minConfidence: 65,          // 65% minimum confidence
  kellyFraction: 0.10,        // 10% Kelly (conservative)
  maxStakeUnits: 1.0,         // Max 1 unit per bet
  maxExposurePercent: 0.03,   // 3% max exposure per race
  earlyMarketBonus: 0.02,     // 2% bonus for early value
  lateMarketPenalty: -0.01,   // 1% penalty for late betting
};

// =====================================================
// DATA PROVIDER INTERFACE (Betfair-Ready)
// =====================================================

interface DataProvider {
  name: string;
  type: 'official_data' | 'bookmaker_odds' | 'exchange' | 'form_analytics';
  isEnabled: boolean;
  priority: number; // Higher = preferred
}

// Current providers (Phase 1 - No Betfair)
const DATA_PROVIDERS: DataProvider[] = [
  { name: 'racing_com_au', type: 'official_data', isEnabled: true, priority: 1 },
  { name: 'grv_greyhounds', type: 'official_data', isEnabled: true, priority: 1 },
  { name: 'tab_bookmaker', type: 'bookmaker_odds', isEnabled: true, priority: 1 },
  { name: 'sportsbet', type: 'bookmaker_odds', isEnabled: true, priority: 2 },
  // FUTURE: Betfair integration slot
  { name: 'betfair_exchange', type: 'exchange', isEnabled: false, priority: 0 },
];

// =====================================================
// MARKET INTELLIGENCE LAYER (Betfair-Ready Interface)
// =====================================================

interface MarketIntelligence {
  // Current (bookmaker-only) metrics
  consensusPrice: number;           // Average across bookmakers
  bestOdds: number;                 // Best available odds
  oddsMovement: 'drifting' | 'shortening' | 'stable';
  bookmakerCount: number;           // Number of books pricing
  marketMaturity: 'early' | 'mid' | 'late';
  
  // FUTURE: Betfair metrics (null until enabled)
  betfairBackPrice?: number;        // Best back price
  betfairLayPrice?: number;         // Best lay price
  betfairVolume?: number;           // Total matched volume
  betfairVolumeChange?: number;     // Volume in last 5 mins
  smartMoneySignal?: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  clvProjection?: number;           // Projected Closing Line Value
}

interface BetfairConfig {
  isEnabled: boolean;
  appKey?: string;
  sessionToken?: string;
  useAsConfirmation: boolean;       // Only confirm bets, don't replace model
  volumeThreshold: number;          // Minimum volume for signal
  lateBettingCutoff: number;        // Minutes before race to stop
}

// Betfair config placeholder (disabled until credentials provided)
const BETFAIR_CONFIG: BetfairConfig = {
  isEnabled: false,
  useAsConfirmation: true,          // When enabled, only confirms - doesn't override
  volumeThreshold: 10000,           // £10k minimum matched for signal
  lateBettingCutoff: 2,             // Stop 2 mins before race
};

// =====================================================
// RUNNER ANALYSIS TYPES
// =====================================================

interface RunnerFeatures {
  // Core identifiers
  id: string;
  eventId: string;
  runnerNumber: number;
  runnerName: string;
  
  // Greyhound features
  boxDraw: number;
  earlySpeed: 'high' | 'medium' | 'low' | null;
  boxBiasAdjustment: number;
  
  // Horse features
  barrierDraw: number;
  weight: number | null;
  jockeyWinRate: number | null;
  trainerWinRate: number | null;
  
  // Common features
  recentForm: string[];
  trackWinRate: number | null;
  distanceWinRate: number | null;
  classMovement: 'up' | 'same' | 'down' | null;
  daysSinceLastRun: number | null;
  runStyle: 'leader' | 'on_pace' | 'midfield' | 'closer' | null;
  
  // Odds & probabilities
  currentBestOdds: number;
  bestBookmaker: string;
  allBookmakerOdds: { bookmaker: string; odds: number; timestamp: Date }[];
  impliedProbability: number;
}

interface BettingAngle {
  name: string;
  type: 'greyhound' | 'horse' | 'both';
  triggered: boolean;
  adjustment: number;        // Probability adjustment (-0.1 to +0.1)
  confidence: number;        // How confident in this angle (0-100)
  details: string;
}

interface ModelPrediction {
  runnerId: string;
  eventId: string;
  
  // Probability outputs
  baseImpliedProbability: number;
  modelProbability: number;
  
  // Value metrics
  expectedValue: number;           // EV = (prob * odds) - 1
  edge: number;                    // Edge = model_prob - implied_prob
  edgePercent: number;             // Edge as percentage
  
  // Confidence & angles
  confidenceScore: number;
  anglesTriggered: BettingAngle[];
  
  // Staking
  recommendedStakeUnits: number;
  kellyOptimal: number;
  
  // Market intelligence
  marketIntel: MarketIntelligence;
  
  // Timing
  timingScore: 'optimal' | 'acceptable' | 'suboptimal';
  hoursToRace: number;
  
  // Betfair confirmation (when available)
  betfairConfirmed?: boolean;
  betfairSignal?: string;
  
  // Final decision
  isRecommended: boolean;
  reasoning: string;
}

// =====================================================
// BETTING ANGLES - Professional Racing Logic
// =====================================================

function evaluateGreyhoundBoxBias(
  features: RunnerFeatures,
  trackBias: any | null
): BettingAngle {
  const box = features.boxDraw;
  let adjustment = 0;
  let confidence = 50;
  let details = '';
  
  // Default box bias (AU tracks typically favor inside boxes)
  const defaultBias: Record<number, number> = {
    1: 0.04, 2: 0.03, 3: 0.02, 4: 0.01,
    5: -0.01, 6: -0.02, 7: -0.02, 8: -0.03
  };
  
  adjustment = defaultBias[box] || 0;
  details = `Box ${box} ${adjustment > 0 ? 'advantage' : 'disadvantage'}`;
  
  // Override with track-specific data if available
  if (trackBias) {
    const biasKey = `barrier_${box}_win_rate`;
    const trackWinRate = trackBias[biasKey];
    const avgWinRate = 1 / 8; // 12.5% baseline
    
    if (trackWinRate && trackBias.sample_size >= 50) {
      adjustment = (trackWinRate - avgWinRate) / 2; // Halve to be conservative
      confidence = Math.min(85, 60 + trackBias.sample_size / 10);
      details = `Box ${box} wins ${(trackWinRate * 100).toFixed(1)}% at this track (n=${trackBias.sample_size})`;
    }
  }
  
  return {
    name: 'box_bias',
    type: 'greyhound',
    triggered: Math.abs(adjustment) > 0.01,
    adjustment,
    confidence,
    details
  };
}

function evaluateHorseBarrierBias(
  features: RunnerFeatures,
  raceDistance: number,
  trackBias: any | null
): BettingAngle {
  const barrier = features.barrierDraw;
  let adjustment = 0;
  let confidence = 50;
  let details = '';
  
  // Barrier impact varies by distance
  // Sprints (≤1200m): Inside barriers major advantage
  // Middle (1400-1800m): Inside still favored but less so
  // Staying (2000m+): Less barrier impact
  
  if (raceDistance <= 1200) {
    // Sprints - inside critical
    if (barrier <= 4) {
      adjustment = 0.04 - (barrier * 0.008);
      details = `Barrier ${barrier} inside draw advantage (sprint)`;
    } else if (barrier >= 10) {
      adjustment = -0.03;
      details = `Wide barrier ${barrier} disadvantage (sprint)`;
    }
    confidence = 70;
  } else if (raceDistance <= 1800) {
    // Middle distances
    if (barrier <= 5) {
      adjustment = 0.025 - (barrier * 0.004);
      details = `Barrier ${barrier} favorable (middle distance)`;
    } else if (barrier >= 12) {
      adjustment = -0.02;
      details = `Wide barrier ${barrier} (middle distance)`;
    }
    confidence = 60;
  } else {
    // Staying races - barrier less impactful
    if (barrier <= 4) {
      adjustment = 0.015;
      details = `Inside barrier ${barrier} (staying race)`;
    }
    confidence = 50;
  }
  
  // Track-specific bias overlay
  if (trackBias && trackBias.sample_size >= 100) {
    const biasKey = barrier <= 8 ? `barrier_${barrier}_win_rate` : 'barrier_wide_win_rate';
    const trackWinRate = trackBias[biasKey];
    if (trackWinRate) {
      const avgRate = 1 / 12; // ~8.3% baseline for 12-runner field
      adjustment += (trackWinRate - avgRate) / 3;
      confidence = Math.min(80, confidence + 15);
    }
  }
  
  return {
    name: 'barrier_bias',
    type: 'horse',
    triggered: Math.abs(adjustment) > 0.01,
    adjustment,
    confidence,
    details
  };
}

function evaluateEarlySpeedPace(
  features: RunnerFeatures,
  allRunners: RunnerFeatures[],
  sport: 'horse' | 'greyhound'
): BettingAngle {
  const runStyle = features.runStyle;
  let adjustment = 0;
  let confidence = 55;
  let details = '';
  
  // Count runners by style
  const leaders = allRunners.filter(r => r.runStyle === 'leader').length;
  const onPace = allRunners.filter(r => r.runStyle === 'on_pace').length;
  const closers = allRunners.filter(r => r.runStyle === 'closer').length;
  
  const totalRunners = allRunners.length;
  const paceRatio = leaders / Math.max(1, totalRunners);
  
  if (runStyle === 'leader') {
    if (leaders === 1) {
      // Lone leader - major advantage
      adjustment = 0.06;
      confidence = 80;
      details = 'Lone leader - uncontested front-running expected';
    } else if (leaders === 2 && features.earlySpeed === 'high') {
      adjustment = 0.03;
      confidence = 65;
      details = 'Two leaders, but has superior early speed';
    } else if (leaders >= 3) {
      adjustment = -0.02;
      confidence = 60;
      details = 'Contested lead likely - pace pressure';
    }
  } else if (runStyle === 'on_pace') {
    if (leaders >= 3) {
      // Hot pace benefits stalkers
      adjustment = 0.04;
      confidence = 70;
      details = 'Hot pace expected - ideal for stalking position';
    } else if (leaders <= 1) {
      adjustment = 0.01;
      details = 'Should get good tracking position';
    }
  } else if (runStyle === 'closer') {
    if (leaders >= 4) {
      // Very hot pace - closers thrive
      adjustment = 0.05;
      confidence = 75;
      details = 'Suicidal pace likely - closers to benefit';
    } else if (leaders <= 1) {
      adjustment = -0.03;
      confidence = 65;
      details = 'Slow pace expected - hard to close';
    }
  }
  
  return {
    name: 'pace_analysis',
    type: 'both',
    triggered: Math.abs(adjustment) > 0.01,
    adjustment,
    confidence,
    details
  };
}

function evaluateClassForm(
  features: RunnerFeatures
): BettingAngle {
  const form = features.recentForm || [];
  let adjustment = 0;
  let confidence = 50;
  let details = '';
  
  // Parse form figures (e.g., ['1', '2', '4', '1', '3'])
  const finishes = form.slice(0, 5).map(f => {
    const num = parseInt(f.toString());
    return isNaN(num) ? 99 : num;
  }).filter(f => f < 99);
  
  if (finishes.length < 3) {
    return {
      name: 'class_form',
      type: 'both',
      triggered: false,
      adjustment: 0,
      confidence: 30,
      details: 'Insufficient form data'
    };
  }
  
  const avgFinish = finishes.reduce((a, b) => a + b, 0) / finishes.length;
  const wins = finishes.filter(f => f === 1).length;
  const places = finishes.filter(f => f <= 3).length;
  
  // Strong recent form
  if (wins >= 2) {
    adjustment = 0.04;
    confidence = 75;
    details = `Winning form: ${wins} wins from last ${finishes.length}`;
  } else if (places >= 3 && avgFinish <= 3) {
    adjustment = 0.03;
    confidence = 70;
    details = `Consistent placer: avg position ${avgFinish.toFixed(1)}`;
  } else if (avgFinish <= 4) {
    adjustment = 0.02;
    confidence = 60;
    details = `Solid form: avg finish ${avgFinish.toFixed(1)}`;
  } else if (avgFinish >= 7) {
    adjustment = -0.02;
    confidence = 55;
    details = `Poor recent form: avg ${avgFinish.toFixed(1)}`;
  }
  
  // Class movement adjustment
  if (features.classMovement === 'down') {
    adjustment += 0.02;
    confidence += 5;
    details = (details ? details + '; ' : '') + 'dropping in class';
  } else if (features.classMovement === 'up') {
    adjustment -= 0.01;
    details = (details ? details + '; ' : '') + 'rising in class';
  }
  
  return {
    name: 'class_form',
    type: 'both',
    triggered: Math.abs(adjustment) > 0.01,
    adjustment,
    confidence,
    details
  };
}

function evaluateTrackDistance(
  features: RunnerFeatures
): BettingAngle {
  const trackRate = features.trackWinRate;
  const distRate = features.distanceWinRate;
  let adjustment = 0;
  let confidence = 45;
  let details = '';
  
  // Track specialist
  if (trackRate !== null && trackRate > 0.25) {
    adjustment += 0.03;
    confidence += 15;
    details = `Track specialist (${(trackRate * 100).toFixed(0)}% W/R)`;
  } else if (trackRate !== null && trackRate < 0.08) {
    adjustment -= 0.015;
    details = `Poor track record (${(trackRate * 100).toFixed(0)}% W/R)`;
  }
  
  // Distance specialist
  if (distRate !== null && distRate > 0.25) {
    adjustment += 0.02;
    confidence += 10;
    details = details 
      ? `${details}; distance suited (${(distRate * 100).toFixed(0)}% W/R)`
      : `Distance suited (${(distRate * 100).toFixed(0)}% W/R)`;
  } else if (distRate !== null && distRate < 0.08) {
    adjustment -= 0.01;
    details = details
      ? `${details}; untested at trip`
      : 'Untested at this distance';
  }
  
  return {
    name: 'track_distance',
    type: 'both',
    triggered: Math.abs(adjustment) > 0.01,
    adjustment,
    confidence: Math.min(80, confidence),
    details: details || 'No significant track/distance data'
  };
}

function evaluateFreshness(
  features: RunnerFeatures,
  sport: 'horse' | 'greyhound'
): BettingAngle {
  const days = features.daysSinceLastRun;
  if (days === null) {
    return {
      name: 'freshness',
      type: 'both',
      triggered: false,
      adjustment: 0,
      confidence: 30,
      details: 'Unknown spell length'
    };
  }
  
  let adjustment = 0;
  let confidence = 50;
  let details = '';
  
  if (sport === 'greyhound') {
    // Greyhounds: 7-14 days ideal
    if (days >= 7 && days <= 14) {
      adjustment = 0.02;
      confidence = 65;
      details = `Fresh (${days} days since last run)`;
    } else if (days > 28) {
      adjustment = -0.02;
      confidence = 55;
      details = `Long spell (${days} days) - fitness query`;
    } else if (days < 5) {
      adjustment = -0.01;
      details = `Quick backup (${days} days)`;
    }
  } else {
    // Horses: 14-28 days generally good
    if (days >= 14 && days <= 28) {
      adjustment = 0.015;
      confidence = 60;
      details = `Good spacing (${days} days)`;
    } else if (days > 60) {
      adjustment = -0.02;
      confidence = 55;
      details = `Long spell (${days} days) - first-up query`;
    }
  }
  
  return {
    name: 'freshness',
    type: 'both',
    triggered: Math.abs(adjustment) > 0.01,
    adjustment,
    confidence,
    details
  };
}

// =====================================================
// PROBABILITY MODEL
// =====================================================

function calculateModelProbability(
  features: RunnerFeatures,
  allRunners: RunnerFeatures[],
  raceDistance: number,
  sport: 'horse' | 'greyhound',
  trackBias: any | null
): { probability: number; angles: BettingAngle[]; rawConfidence: number } {
  
  // Base probability from market
  const impliedProb = features.impliedProbability;
  
  // Adjust for typical overround (~115-120%)
  const totalMarketProb = allRunners.reduce((sum, r) => sum + r.impliedProbability, 0);
  const overround = totalMarketProb;
  const normalizedBase = impliedProb / overround;
  
  // Evaluate all relevant angles
  const angles: BettingAngle[] = [];
  
  // Sport-specific angles
  if (sport === 'greyhound') {
    angles.push(evaluateGreyhoundBoxBias(features, trackBias));
  } else {
    angles.push(evaluateHorseBarrierBias(features, raceDistance, trackBias));
  }
  
  // Common angles
  angles.push(evaluateEarlySpeedPace(features, allRunners, sport));
  angles.push(evaluateClassForm(features));
  angles.push(evaluateTrackDistance(features));
  angles.push(evaluateFreshness(features, sport));
  
  // Apply adjustments
  let adjustedProb = normalizedBase;
  let totalConfidenceWeight = 0;
  let weightedConfidence = 0;
  
  for (const angle of angles) {
    if (angle.triggered) {
      adjustedProb += angle.adjustment;
      totalConfidenceWeight += 1;
      weightedConfidence += angle.confidence;
    }
  }
  
  // Clamp probability to reasonable bounds
  adjustedProb = Math.max(0.02, Math.min(0.85, adjustedProb));
  
  // Calculate raw confidence
  const activeAngles = angles.filter(a => a.triggered && a.adjustment > 0);
  const avgConfidence = totalConfidenceWeight > 0 
    ? weightedConfidence / totalConfidenceWeight 
    : 50;
  const angleBonus = activeAngles.length * 5;
  const dataBonus = features.recentForm.length >= 3 ? 10 : 0;
  
  const rawConfidence = Math.min(95, avgConfidence + angleBonus + dataBonus);
  
  return {
    probability: adjustedProb,
    angles,
    rawConfidence
  };
}

// =====================================================
// MARKET INTELLIGENCE (Betfair-Ready)
// =====================================================

function analyzeMarketIntelligence(
  features: RunnerFeatures,
  hoursToRace: number,
  _betfairData?: any  // Placeholder for future Betfair integration
): MarketIntelligence {
  const allOdds = features.allBookmakerOdds;
  
  // Calculate consensus price
  const validOdds = allOdds.filter(o => o.odds > 1);
  const consensusPrice = validOdds.length > 0
    ? validOdds.reduce((sum, o) => sum + o.odds, 0) / validOdds.length
    : features.currentBestOdds;
  
  // Detect odds movement (would need historical data)
  // For now, compare best to consensus
  const oddsRatio = features.currentBestOdds / consensusPrice;
  let oddsMovement: 'drifting' | 'shortening' | 'stable' = 'stable';
  if (oddsRatio > 1.05) oddsMovement = 'drifting';
  if (oddsRatio < 0.95) oddsMovement = 'shortening';
  
  // Market maturity based on time to race
  let marketMaturity: 'early' | 'mid' | 'late' = 'mid';
  if (hoursToRace > 4) marketMaturity = 'early';
  if (hoursToRace < 1) marketMaturity = 'late';
  
  const intel: MarketIntelligence = {
    consensusPrice,
    bestOdds: features.currentBestOdds,
    oddsMovement,
    bookmakerCount: validOdds.length,
    marketMaturity,
    
    // Betfair fields (null until integration enabled)
    betfairBackPrice: undefined,
    betfairLayPrice: undefined,
    betfairVolume: undefined,
    betfairVolumeChange: undefined,
    smartMoneySignal: undefined,
    clvProjection: undefined,
  };
  
  // FUTURE: When Betfair is enabled, populate exchange metrics
  if (BETFAIR_CONFIG.isEnabled && _betfairData) {
    // intel.betfairBackPrice = betfairData.back[0].price;
    // intel.betfairLayPrice = betfairData.lay[0].price;
    // intel.betfairVolume = betfairData.totalMatched;
    // intel.smartMoneySignal = calculateSmartMoneySignal(betfairData);
  }
  
  return intel;
}

// =====================================================
// STAKING - Kelly Criterion (Fractional)
// =====================================================

function calculateKellyStake(
  modelProb: number,
  odds: number,
  confidence: number,
  config: EngineConfig
): { stakeUnits: number; kellyOptimal: number } {
  const edge = modelProb - (1 / odds);
  
  if (edge <= 0) {
    return { stakeUnits: 0, kellyOptimal: 0 };
  }
  
  // Kelly formula: f* = (bp - q) / b
  // where b = odds - 1, p = probability, q = 1 - p
  const b = odds - 1;
  const q = 1 - modelProb;
  const kellyOptimal = (b * modelProb - q) / b;
  
  // Apply fractional Kelly (default 10%)
  let stake = kellyOptimal * config.kellyFraction;
  
  // Confidence scaling (reduce stake if confidence < 75%)
  if (confidence < 75) {
    stake *= (confidence / 75);
  }
  
  // Clamp to limits
  stake = Math.max(0.25, Math.min(config.maxStakeUnits, stake));
  
  return {
    stakeUnits: Math.round(stake * 100) / 100,
    kellyOptimal: Math.round(kellyOptimal * 1000) / 1000
  };
}

// =====================================================
// TIMING LOGIC
// =====================================================

function evaluateBetTiming(
  hoursToRace: number,
  marketIntel: MarketIntelligence,
  config: EngineConfig
): { score: 'optimal' | 'acceptable' | 'suboptimal'; adjustment: number } {
  
  // Early market (>4 hours): best for finding value
  if (hoursToRace > 4) {
    return {
      score: 'optimal',
      adjustment: config.earlyMarketBonus
    };
  }
  
  // Mid market (1-4 hours): acceptable
  if (hoursToRace >= 1) {
    return {
      score: 'acceptable',
      adjustment: 0
    };
  }
  
  // Late market (<1 hour): markets are sharper
  if (hoursToRace >= 0.1) { // 6 minutes
    return {
      score: 'suboptimal',
      adjustment: config.lateMarketPenalty
    };
  }
  
  // Too late - skip
  return {
    score: 'suboptimal',
    adjustment: -0.05 // Heavy penalty
  };
}

// =====================================================
// MAIN ENGINE
// =====================================================

interface RacingEngineRequest {
  racing_types?: string[];
  regions?: string[];
  hours_ahead?: number;
  config?: Partial<EngineConfig>;
  include_demo_data?: boolean;
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

    const body: RacingEngineRequest = await req.json().catch(() => ({}));
    const racingTypes = body.racing_types || ["horse", "greyhound"];
    const regions = body.regions || ["aus"];
    const hoursAhead = body.hours_ahead || 12;
    const includeDemoData = body.include_demo_data ?? true;
    
    // Merge config
    const config: EngineConfig = { ...DEFAULT_CONFIG, ...body.config };

    console.log(`[Racing Engine v2] Starting analysis`);
    console.log(`  Types: ${racingTypes.join(", ")}`);
    console.log(`  Regions: ${regions.join(", ")}`);
    console.log(`  Min EV: ${config.minEvThreshold * 100}%`);
    console.log(`  Min Confidence: ${config.minConfidence}`);

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

    console.log(`[Racing Engine v2] Found ${races?.length || 0} upcoming races in DB`);

    // If no races and demo data requested, generate demo
    let racesToAnalyze = races || [];
    let isUsingDemoData = false;

    if (racesToAnalyze.length === 0 && includeDemoData) {
      console.log(`[Racing Engine v2] No real data, generating demo data...`);
      const demoData = generateDemoRacingData(racingTypes, 8);
      
      // Store demo data temporarily for analysis
      for (const race of demoData.races) {
        race.racing_runners = demoData.runners.filter(r => r.event_id === race.id);
      }
      racesToAnalyze = demoData.races;
      isUsingDemoData = true;
    }

    const predictions: ModelPrediction[] = [];
    const recommendations: any[] = [];

    for (const race of racesToAnalyze) {
      const sport = race.sport as 'horse' | 'greyhound';
      const raceStart = new Date(race.start_time_utc);
      const hoursToRace = (raceStart.getTime() - Date.now()) / (1000 * 60 * 60);
      
      // Skip if race too soon or passed
      if (hoursToRace < 0.05) continue; // 3 minutes minimum

      // Process runners
      const runnerFeatures: RunnerFeatures[] = (race.racing_runners || [])
        .filter((r: any) => !r.scratched)
        .map((runner: any) => {
          const markets = runner.racing_markets || [];
          
          // Get best odds
          const winOdds = markets
            .filter((m: any) => m.market_type === 'win')
            .map((m: any) => ({
              bookmaker: m.bookmaker,
              odds: m.odds_decimal,
              timestamp: new Date(m.captured_at)
            }));
          
          const bestOdds = winOdds.reduce(
            (best: any, curr: any) => curr.odds > (best?.odds || 0) ? curr : best,
            null
          );

          return {
            id: runner.id,
            eventId: runner.event_id,
            runnerNumber: runner.runner_number,
            runnerName: runner.runner_name,
            boxDraw: runner.barrier_box,
            barrierDraw: runner.barrier_box,
            weight: runner.weight_kg,
            earlySpeed: runner.early_speed_rating > 70 ? 'high' : 
                        runner.early_speed_rating > 40 ? 'medium' : 'low',
            boxBiasAdjustment: 0,
            jockeyWinRate: null,
            trainerWinRate: null,
            recentForm: runner.recent_form || [],
            trackWinRate: runner.track_wins && runner.track_starts 
              ? runner.track_wins / runner.track_starts 
              : null,
            distanceWinRate: runner.distance_wins && runner.distance_starts
              ? runner.distance_wins / runner.distance_starts
              : null,
            classMovement: null,
            daysSinceLastRun: runner.last_starts_days,
            runStyle: runner.run_style as any,
            currentBestOdds: bestOdds?.odds || 0,
            bestBookmaker: bestOdds?.bookmaker || '',
            allBookmakerOdds: winOdds,
            impliedProbability: bestOdds?.odds > 1 ? 1 / bestOdds.odds : 0,
          } as RunnerFeatures;
        })
        .filter((r: RunnerFeatures) => r.currentBestOdds > 1);

      if (runnerFeatures.length < 2) continue;

      // Fetch track bias
      const { data: trackBias } = await supabase
        .from("racing_track_bias")
        .select("*")
        .eq("track", race.track)
        .eq("sport", sport)
        .maybeSingle();

      // Analyze each runner
      for (const features of runnerFeatures) {
        const { probability, angles, rawConfidence } = calculateModelProbability(
          features,
          runnerFeatures,
          race.distance_m,
          sport,
          trackBias
        );

        const marketIntel = analyzeMarketIntelligence(features, hoursToRace);
        const timing = evaluateBetTiming(hoursToRace, marketIntel, config);
        
        // Apply timing adjustment to probability
        const finalProb = Math.min(0.85, probability + timing.adjustment);
        
        // Calculate EV and edge
        const impliedProb = features.impliedProbability;
        const edge = finalProb - impliedProb;
        const edgePercent = (edge / impliedProb) * 100;
        const ev = (finalProb * features.currentBestOdds) - 1;
        
        // Adjust confidence based on timing
        let confidence = rawConfidence;
        if (timing.score === 'suboptimal') confidence -= 10;
        confidence = Math.max(20, Math.min(95, confidence));
        
        // Calculate stake
        const { stakeUnits, kellyOptimal } = calculateKellyStake(
          finalProb,
          features.currentBestOdds,
          confidence,
          config
        );

        // Generate reasoning
        const triggeredAngles = angles.filter(a => a.triggered && a.adjustment > 0);
        const anglesSummary = triggeredAngles.map(a => a.details).join('; ');
        const reasoning = `${sport === 'horse' ? '🐎' : '🐕'} ${features.runnerName} (#${features.runnerNumber}) from ${sport === 'horse' ? 'barrier' : 'box'} ${features.barrierDraw}. ${anglesSummary || 'Market value detected'}. Model: ${(finalProb * 100).toFixed(1)}% vs Market: ${(impliedProb * 100).toFixed(1)}% (${timing.score} timing).`;

        const isRecommended = ev >= config.minEvThreshold && 
                             confidence >= config.minConfidence &&
                             timing.score !== 'suboptimal';

        const prediction: ModelPrediction = {
          runnerId: features.id,
          eventId: features.eventId,
          baseImpliedProbability: impliedProb,
          modelProbability: finalProb,
          expectedValue: ev,
          edge,
          edgePercent,
          confidenceScore: confidence,
          anglesTriggered: triggeredAngles,
          recommendedStakeUnits: stakeUnits,
          kellyOptimal,
          marketIntel,
          timingScore: timing.score,
          hoursToRace,
          isRecommended,
          reasoning
        };

        predictions.push(prediction);

        // Only output recommendations
        if (isRecommended) {
          // Store prediction in DB (if not demo)
          if (!isUsingDemoData) {
            await supabase
              .from("racing_model_predictions")
              .upsert({
                event_id: race.id,
                runner_id: features.id,
                model_version: MODEL_VERSION,
                model_probability: finalProb,
                confidence_score: confidence,
                angles_triggered: triggeredAngles.map(a => a.name),
                angle_details: { angles: triggeredAngles },
                best_odds_at_prediction: features.currentBestOdds,
                implied_prob_market: impliedProb,
                expected_value: ev,
                edge_pct: edgePercent,
                is_recommended: true,
                recommended_stake_pct: stakeUnits,
                reasoning,
              }, { onConflict: "event_id,runner_id" });
          }

          recommendations.push({
            // Race info
            raceId: race.id,
            track: race.track,
            trackCountry: race.track_country,
            raceNumber: race.race_number,
            raceName: race.race_name,
            sport,
            startTime: race.start_time_utc,
            hoursToRace: Math.round(hoursToRace * 10) / 10,
            distance: race.distance_m,
            trackCondition: race.track_condition,
            
            // Runner info
            runnerId: features.id,
            runnerName: features.runnerName,
            runnerNumber: features.runnerNumber,
            barrier: features.barrierDraw,
            recentForm: features.recentForm,
            runStyle: features.runStyle,
            
            // Odds & value
            bestOdds: features.currentBestOdds,
            bestBookmaker: features.bestBookmaker,
            consensusOdds: marketIntel.consensusPrice,
            fairOdds: Math.round((1 / finalProb) * 100) / 100,
            
            // Model outputs
            modelProbability: finalProb,
            impliedProbability: impliedProb,
            ev: Math.round(ev * 1000) / 1000,
            evPercent: Math.round(ev * 1000) / 10,
            edge: Math.round(edge * 1000) / 1000,
            edgePercent: Math.round(edgePercent * 10) / 10,
            confidence,
            
            // Staking
            stakeUnits,
            kellyOptimal,
            
            // Angles & reasoning
            angles: triggeredAngles.map(a => a.name),
            angleDetails: triggeredAngles.map(a => a.details),
            timing: timing.score,
            reasoning,
            
            // Market intel
            oddsMovement: marketIntel.oddsMovement,
            marketMaturity: marketIntel.marketMaturity,
            
            // Betfair fields (future)
            betfairConfirmed: BETFAIR_CONFIG.isEnabled ? prediction.betfairConfirmed : null,
            betfairSignal: BETFAIR_CONFIG.isEnabled ? prediction.betfairSignal : null,
            
            // Demo flag
            isDemo: isUsingDemoData,
          });
        }
      }
    }

    // Sort by EV descending
    recommendations.sort((a, b) => b.ev - a.ev);

    // Add bet scores for ranking
    const scoredRecommendations = recommendations.map((bet, i) => ({
      ...bet,
      betScore: Math.round(
        50 +
        (bet.ev * 150) +
        (bet.confidence - 60) * 0.5 +
        (bet.angles.length * 5) +
        (bet.timing === 'optimal' ? 10 : 0)
      ),
      rank: i + 1,
    }));

    console.log(`[Racing Engine v2] Generated ${scoredRecommendations.length} recommendations`);

    return new Response(
      JSON.stringify({
        success: true,
        engine_version: ENGINE_VERSION,
        model_version: MODEL_VERSION,
        races_analyzed: racesToAnalyze.length,
        total_runners_analyzed: predictions.length,
        recommendations: scoredRecommendations,
        config: {
          minEvThreshold: config.minEvThreshold,
          minConfidence: config.minConfidence,
          kellyFraction: config.kellyFraction,
        },
        betfair_status: BETFAIR_CONFIG.isEnabled ? 'enabled' : 'ready_to_integrate',
        data_source: isUsingDemoData ? 'demo' : 'live',
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Racing Engine v2] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        engine_version: ENGINE_VERSION
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =====================================================
// DEMO DATA GENERATOR
// =====================================================

function generateDemoRacingData(types: string[], racesPerType: number) {
  const tracks = {
    horse: [
      { name: 'Flemington', country: 'AU', state: 'VIC' },
      { name: 'Randwick', country: 'AU', state: 'NSW' },
      { name: 'Eagle Farm', country: 'AU', state: 'QLD' },
      { name: 'Ascot', country: 'UK', state: null },
    ],
    greyhound: [
      { name: 'Sandown Park', country: 'AU', state: 'VIC' },
      { name: 'The Meadows', country: 'AU', state: 'VIC' },
      { name: 'Wentworth Park', country: 'AU', state: 'NSW' },
    ]
  };

  const horseNames = [
    'Thunder Strike', 'Golden Arrow', 'Midnight Star', 'Silver Blaze',
    'Storm Chaser', 'Phoenix Rising', 'Night Rider', 'Speed Demon',
    'Wind Runner', 'Fire Dancer', 'Royal Command', 'Fast Lane',
    'Victory Lap', 'Track Master', 'Noble Quest', 'Swift Justice'
  ];

  const dogNames = [
    'Swift Shadow', 'Lightning Bolt', 'Rapid Fire', 'Quick Silver',
    'Fast Track', 'Speed King', 'Thunder Paws', 'Rocket Dog',
    'Flash Gordon', 'Zoom Zoom', 'Turbo', 'Blaze Runner',
    'Storm Runner', 'Jet Stream', 'Wind Catcher', 'Pace Setter'
  ];

  const jockeys = ['J. McDonald', 'H. Bowman', 'D. Oliver', 'C. Williams', 'K. McEvoy'];
  const trainers = ['C. Waller', 'G. Waterhouse', 'C. Maher', 'P. Moody', 'J. Cummings'];

  const races: any[] = [];
  const runners: any[] = [];

  const now = new Date();
  let raceIndex = 0;

  for (const type of types) {
    const sportTracks = type === 'horse' ? tracks.horse : tracks.greyhound;
    const names = type === 'horse' ? horseNames : dogNames;
    
    for (let i = 0; i < racesPerType; i++) {
      const track = sportTracks[i % sportTracks.length];
      const raceTime = new Date(now.getTime() + (1 + i * 0.75) * 60 * 60 * 1000);
      const raceId = `demo-${type}-${raceIndex}`;
      const runnerCount = type === 'horse' ? 8 + Math.floor(Math.random() * 8) : 8;
      const distance = type === 'horse' 
        ? [1000, 1200, 1400, 1600, 2000, 2400][Math.floor(Math.random() * 6)]
        : [300, 400, 500, 520, 600][Math.floor(Math.random() * 5)];

      races.push({
        id: raceId,
        external_id: raceId,
        sport: type,
        track: track.name,
        track_country: track.country,
        track_state: track.state,
        race_number: (i % 8) + 1,
        race_name: `${track.name} R${(i % 8) + 1}`,
        distance_m: distance,
        track_condition: ['Good', 'Good to Soft', 'Soft'][Math.floor(Math.random() * 3)],
        weather: ['Fine', 'Overcast', 'Showers'][Math.floor(Math.random() * 3)],
        start_time_utc: raceTime.toISOString(),
        start_time_local: raceTime.toISOString(),
        status: 'upcoming',
        field_size: runnerCount,
        racing_runners: [],
      });

      // Generate runners with realistic odds
      const baseOdds = generateRealisticOddsSet(runnerCount);
      
      for (let j = 0; j < runnerCount; j++) {
        const runnerId = `${raceId}-runner-${j + 1}`;
        const odds = baseOdds[j];
        
        runners.push({
          id: runnerId,
          event_id: raceId,
          runner_number: j + 1,
          runner_name: names[j % names.length] + (j >= names.length ? ` ${Math.floor(j / names.length) + 1}` : ''),
          barrier_box: j + 1,
          weight_kg: type === 'horse' ? 54 + Math.random() * 6 : null,
          jockey_name: type === 'horse' ? jockeys[j % jockeys.length] : null,
          trainer_name: trainers[j % trainers.length],
          recent_form: generateRecentForm(),
          run_style: ['leader', 'on_pace', 'midfield', 'closer'][Math.floor(Math.random() * 4)],
          early_speed_rating: Math.floor(Math.random() * 100),
          track_wins: Math.floor(Math.random() * 3),
          track_starts: 2 + Math.floor(Math.random() * 10),
          distance_wins: Math.floor(Math.random() * 4),
          distance_starts: 3 + Math.floor(Math.random() * 12),
          last_starts_days: 7 + Math.floor(Math.random() * 28),
          scratched: false,
          racing_markets: [
            { bookmaker: 'tab', market_type: 'win', odds_decimal: odds, captured_at: now.toISOString() },
            { bookmaker: 'sportsbet', market_type: 'win', odds_decimal: odds * (0.95 + Math.random() * 0.1), captured_at: now.toISOString() },
          ]
        });
      }

      raceIndex++;
    }
  }

  return { races, runners };
}

function generateRealisticOddsSet(runnerCount: number): number[] {
  // Generate realistic odds distribution
  // Favorite: 2-4, then gradual increase
  const odds: number[] = [];
  const favorite = 2 + Math.random() * 2;
  odds.push(favorite);
  
  for (let i = 1; i < runnerCount; i++) {
    const prev = odds[i - 1];
    const increment = 0.5 + Math.random() * (i < 3 ? 1 : 2);
    odds.push(Math.min(50, prev + increment));
  }
  
  // Shuffle to not always have favorite at position 1
  for (let i = odds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [odds[i], odds[j]] = [odds[j], odds[i]];
  }
  
  return odds.map(o => Math.round(o * 100) / 100);
}

function generateRecentForm(): string[] {
  const positions = ['1', '2', '3', '4', '5', '6', '7', '8', 'x'];
  return Array.from({ length: 5 }, () => 
    positions[Math.floor(Math.random() * positions.length)]
  );
}
