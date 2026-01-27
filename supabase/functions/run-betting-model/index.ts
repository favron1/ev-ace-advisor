import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CALIBRATED SOCCER ENGINE v1.0 =============
// Conservative, calibration-first approach
// Trust sharp books more, reduce edge inflation, lower stakes

// League Tier Classification
const TIER_1_LEAGUES = [
  'epl', 'english premier league', 'premier league',
  'la liga', 'laliga',
  'bundesliga', 'german bundesliga',
  'serie a', 'italian serie a',
  'ligue 1', 'french ligue 1'
];

const TIER_2_LEAGUES = [
  'a-league', 'australia a-league', 'australian a-league',
  'primera division', 'argentina primera', 'argentine primera', 'primera división',
  'belgian pro league', 'belgium first division', 'jupiler',
  'primeira liga', 'portuguese primeira', 'liga portugal',
  'eredivisie', 'dutch eredivisie',
  'scottish premiership',
  'ucl', 'champions league', 'uefa champions league',
  'uel', 'europa league', 'uefa europa league',
  'brazil serie a', 'brasileirao', 'série a', 'brazil série',
  'mls', 'major league soccer'
];

function getLeagueTier(league: string): 1 | 2 | 3 {
  const normalized = league.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
  
  // Check Tier 1 first (more specific matches)
  if (TIER_1_LEAGUES.some(t => normalized.includes(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
    // Exclude "Brazil Série A" from matching "Serie A" (Italian)
    if (normalized.includes('brazil') || normalized.includes('brasil')) {
      // This is Brazilian league, not Italian
    } else {
      return 1;
    }
  }
  
  // Check Tier 2
  if (TIER_2_LEAGUES.some(t => normalized.includes(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) return 2;
  
  // Specific country-based detection for common Tier 2
  if (normalized.includes('argentina') || normalized.includes('argentine')) return 2;
  if (normalized.includes('brazil') || normalized.includes('brasil')) return 2;
  if (normalized.includes('australia')) return 2;
  if (normalized.includes('portugal')) return 2;
  if (normalized.includes('belgium') || normalized.includes('belgian')) return 2;
  if (normalized.includes('netherlands') || normalized.includes('dutch')) return 2;
  if (normalized.includes('scotland') || normalized.includes('scottish')) return 2;
  
  return 3;
}

// Data Quality Classification
interface DataQuality {
  level: 'HQ' | 'MQ' | 'LQ';
  score: number;
  missingFields: string[];
  hasOddsInference: boolean;
}

function classifyDataQuality(stats: any): DataQuality {
  if (!stats) {
    return { level: 'LQ', score: 0, missingFields: ['all'], hasOddsInference: false };
  }

  const missingFields: string[] = [];
  let score = 0;

  // Critical fields (must have for HQ)
  const hasPosition = stats.league_position != null && stats.league_position > 0;
  const hasPPG = stats.points_per_game != null && stats.points_per_game > 0;
  const hasGoals = (stats.goals_scored_last_5 != null || stats.home_goals_for != null);
  const hasForm = stats.recent_form && stats.recent_form.length >= 3;

  if (hasPosition) score += 20; else missingFields.push('league_position');
  if (hasPPG) score += 20; else missingFields.push('ppg');
  if (hasGoals) score += 15; else missingFields.push('goals');
  if (hasForm) score += 10; else missingFields.push('form');

  // Important fields (contribute to quality)
  const hasXG = stats.xg_for_last_5 != null || stats.npxg_for_last_5 != null;
  const hasRating = stats.team_rating != null && stats.team_rating > 1000;
  const hasRest = stats.days_rest != null || stats.matches_last_7_days != null;

  if (hasXG) score += 15; else missingFields.push('xg');
  if (hasRating) score += 10; else missingFields.push('rating');
  if (hasRest) score += 10; else missingFields.push('rest');

  // Check for odds-based inference (low quality flag)
  const hasOddsInference = stats.data_source === 'odds_inferred' || 
                           stats.estimated_from_odds === true ||
                           stats.tier4_estimation === true;

  if (hasOddsInference) {
    score = Math.min(score, 40); // Cap score if odds-inferred
    missingFields.push('odds_inferred');
  }

  // Classify
  let level: 'HQ' | 'MQ' | 'LQ';
  if (score >= 70 && !hasOddsInference) {
    level = 'HQ';
  } else if (score >= 45) {
    level = 'MQ';
  } else {
    level = 'LQ';
  }

  return { level, score, missingFields, hasOddsInference };
}

// ============= CALIBRATED PROBABILITY MODEL v1.0 =============
// Conservative: Trust market more, make modest adjustments

interface CalibratedProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
  rationale: string;
  leagueTier: 1 | 2 | 3;
  dataQualityHome: DataQuality;
  dataQualityAway: DataQuality;
}

function calibrateProbabilitiesV1(
  homeStats: any,
  awayStats: any,
  markets: any[],
  league: string
): CalibratedProbabilities {
  const leagueTier = getLeagueTier(league);
  const dataQualityHome = classifyDataQuality(homeStats);
  const dataQualityAway = classifyDataQuality(awayStats);

  // Sharp book weight based on tier (trust market MORE for worse data/tier)
  const sharpWeight = leagueTier === 1 ? 0.70 : leagueTier === 2 ? 0.80 : 0.90;
  const modelWeight = 1 - sharpWeight;

  // === Extract Sharp Book Implied Probabilities ===
  const getSharpOdds = (selectionKeyword: string): number | null => {
    const market = markets.find((m: any) => 
      m.type === 'moneyline' && 
      (m.is_sharp_book || m.bookmaker?.toLowerCase().includes('pinnacle') || 
       m.bookmaker?.toLowerCase().includes('betfair')) &&
      m.selection?.toLowerCase().includes(selectionKeyword)
    );
    return market ? 1 / market.odds_decimal : null;
  };

  // Try to get sharp odds, fallback to average market odds
  let sharpHome = getSharpOdds('home');
  let sharpAway = getSharpOdds('away');
  let sharpDraw = getSharpOdds('draw');

  // If no sharp books, use average market implied (with vig removal)
  if (!sharpHome || !sharpAway) {
    const homeMarkets = markets.filter((m: any) => m.type === 'moneyline' && m.selection?.toLowerCase().includes('home'));
    const awayMarkets = markets.filter((m: any) => m.type === 'moneyline' && m.selection?.toLowerCase().includes('away'));
    const drawMarkets = markets.filter((m: any) => m.type === 'moneyline' && m.selection?.toLowerCase().includes('draw'));

    const avgImplied = (arr: any[]) => {
      if (arr.length === 0) return null;
      return arr.reduce((s, m) => s + (1 / m.odds_decimal), 0) / arr.length;
    };

    sharpHome = sharpHome || avgImplied(homeMarkets);
    sharpAway = sharpAway || avgImplied(awayMarkets);
    sharpDraw = sharpDraw || avgImplied(drawMarkets);

    // Remove vig by normalizing
    const totalImplied = (sharpHome || 0.4) + (sharpDraw || 0.25) + (sharpAway || 0.35);
    if (totalImplied > 0) {
      sharpHome = (sharpHome || 0.4) / totalImplied;
      sharpDraw = (sharpDraw || 0.25) / totalImplied;
      sharpAway = (sharpAway || 0.35) / totalImplied;
    }
  }

  // === Model-Based Probability Adjustments ===
  // Start from sharp implied and make MODEST adjustments based on data

  const ratingDiff = ((homeStats?.team_rating || 1500) - (awayStats?.team_rating || 1500));
  
  // xG/npxG difference (if available)
  const homeNpxg = homeStats?.npxg_for_last_5 ?? homeStats?.xg_for_last_5 ?? null;
  const awayNpxg = awayStats?.npxg_for_last_5 ?? awayStats?.xg_for_last_5 ?? null;
  const homeNpxgAgainst = homeStats?.npxg_against_last_5 ?? homeStats?.xg_against_last_5 ?? null;
  const awayNpxgAgainst = awayStats?.npxg_against_last_5 ?? awayStats?.xg_against_last_5 ?? null;

  let npxgDiff = 0;
  if (homeNpxg != null && awayNpxg != null && homeNpxgAgainst != null && awayNpxgAgainst != null) {
    npxgDiff = ((homeNpxg - homeNpxgAgainst) - (awayNpxg - awayNpxgAgainst)) / 5; // Normalize per game
  }

  // Home advantage adjustment
  const homeAdvantage = 0.03; // ~3% home boost

  // Calculate model adjustments (conservative: max ±8% from sharp)
  let modelHomeAdj = 0;
  let modelAwayAdj = 0;

  // Rating adjustment: per 100 rating points = ~1.5% shift (conservative)
  modelHomeAdj += (ratingDiff / 100) * 0.015;
  modelAwayAdj -= (ratingDiff / 100) * 0.015;

  // npxG adjustment: per 0.5 npxG/game diff = ~2% shift
  modelHomeAdj += npxgDiff * 0.04;
  modelAwayAdj -= npxgDiff * 0.04;

  // Home advantage
  modelHomeAdj += homeAdvantage;
  modelAwayAdj -= homeAdvantage * 0.5;

  // Fatigue adjustment (conservative)
  const homeFatigue = (homeStats?.matches_last_7_days || 0) > 2;
  const awayFatigue = (awayStats?.matches_last_7_days || 0) > 2;
  if (homeFatigue && !awayFatigue) {
    modelHomeAdj -= 0.02;
    modelAwayAdj += 0.015;
  } else if (awayFatigue && !homeFatigue) {
    modelHomeAdj += 0.015;
    modelAwayAdj -= 0.02;
  }

  // CAP model adjustments: Never more than 8-10% from sharp
  const MAX_DEVIATION = 0.08;
  modelHomeAdj = Math.max(-MAX_DEVIATION, Math.min(MAX_DEVIATION, modelHomeAdj));
  modelAwayAdj = Math.max(-MAX_DEVIATION, Math.min(MAX_DEVIATION, modelAwayAdj));

  // Raw model probabilities
  let rawModelHome = (sharpHome || 0.4) + modelHomeAdj;
  let rawModelAway = (sharpAway || 0.35) + modelAwayAdj;
  
  // Draw: peaks when teams are similar
  const ratingGap = Math.abs(ratingDiff);
  const npxgGap = Math.abs(npxgDiff);
  const drawBase = 0.26;
  const drawDecay = Math.min(0.08, ratingGap * 0.0005 + npxgGap * 0.02);
  let rawModelDraw = Math.max(0.18, Math.min(0.32, drawBase - drawDecay));

  // Blend with sharp (this is the key conservative step)
  let blendedHome = sharpWeight * (sharpHome || 0.4) + modelWeight * rawModelHome;
  let blendedAway = sharpWeight * (sharpAway || 0.35) + modelWeight * rawModelAway;
  let blendedDraw = sharpWeight * (sharpDraw || 0.25) + modelWeight * rawModelDraw;

  // Additional safeguard: If |model - sharp| > 10%, pull halfway back
  const deviationHome = Math.abs(blendedHome - (sharpHome || 0.4));
  const deviationAway = Math.abs(blendedAway - (sharpAway || 0.35));
  if (deviationHome > 0.10) {
    blendedHome = (blendedHome + (sharpHome || 0.4)) / 2;
  }
  if (deviationAway > 0.10) {
    blendedAway = (blendedAway + (sharpAway || 0.35)) / 2;
  }

  // Normalize to sum to 1
  const total = blendedHome + blendedDraw + blendedAway;
  const homeWin = Math.max(0.03, Math.min(0.90, blendedHome / total));
  const draw = Math.max(0.03, Math.min(0.90, blendedDraw / total));
  const awayWin = Math.max(0.03, Math.min(0.90, blendedAway / total));

  // === OVER/UNDER 2.5 (Poisson with heavy regression) ===
  // Regress 50-70% to league prior (more conservative than before)
  const regressionFactor = dataQualityHome.level === 'HQ' && dataQualityAway.level === 'HQ' ? 0.50 : 0.70;
  const leagueAvgGoals = 2.75;

  const homeGoalsFor = homeStats?.goals_scored_last_5 ?? homeStats?.home_goals_for ?? 6;
  const homeGoalsAgainst = homeStats?.goals_conceded_last_5 ?? homeStats?.home_goals_against ?? 5;
  const awayGoalsFor = awayStats?.goals_scored_last_5 ?? awayStats?.away_goals_for ?? 5;
  const awayGoalsAgainst = awayStats?.goals_conceded_last_5 ?? awayStats?.away_goals_against ?? 6;

  // Expected goals per team (per game, regressed)
  const rawHomeExpGoals = (homeGoalsFor / 5 + awayGoalsAgainst / 5) / 2;
  const rawAwayExpGoals = (awayGoalsFor / 5 + homeGoalsAgainst / 5) / 2;

  const regressedHomeGoals = (1 - regressionFactor) * rawHomeExpGoals + regressionFactor * (leagueAvgGoals / 2);
  const regressedAwayGoals = (1 - regressionFactor) * rawAwayExpGoals + regressionFactor * (leagueAvgGoals / 2);
  const totalLambda = regressedHomeGoals + regressedAwayGoals;

  // Poisson P(total <= 2)
  const poissonProb = (lambda: number, k: number): number => {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    return Math.pow(lambda, k) * Math.exp(-lambda) / factorial;
  };
  const pUnder25 = poissonProb(totalLambda, 0) + poissonProb(totalLambda, 1) + poissonProb(totalLambda, 2);

  // Get sharp O/U odds if available
  const overMarket = markets.find((m: any) => m.selection?.toLowerCase().includes('over') && m.selection?.includes('2.5'));
  const underMarket = markets.find((m: any) => m.selection?.toLowerCase().includes('under') && m.selection?.includes('2.5'));
  const sharpOver = overMarket ? 1 / overMarket.odds_decimal : null;
  const sharpUnder = underMarket ? 1 / underMarket.odds_decimal : null;

  let modelUnder25 = pUnder25;
  let modelOver25 = 1 - pUnder25;

  // Blend with sharp O/U odds
  if (sharpOver && sharpUnder) {
    const totalSharp = sharpOver + sharpUnder;
    const normSharpOver = sharpOver / totalSharp;
    const normSharpUnder = sharpUnder / totalSharp;
    modelOver25 = sharpWeight * normSharpOver + modelWeight * modelOver25;
    modelUnder25 = sharpWeight * normSharpUnder + modelWeight * modelUnder25;
  }

  const over25 = Math.max(0.28, Math.min(0.72, modelOver25));
  const under25 = 1 - over25;

  // === BTTS ===
  const pHomeScores = 1 - Math.exp(-regressedHomeGoals);
  const pAwayScores = 1 - Math.exp(-regressedAwayGoals);
  const rawBttsYes = pHomeScores * pAwayScores;

  // Get sharp BTTS if available
  const bttsYesMarket = markets.find((m: any) => m.selection?.toLowerCase().includes('btts') && m.selection?.toLowerCase().includes('yes'));
  const sharpBttsYes = bttsYesMarket ? 1 / bttsYesMarket.odds_decimal : null;

  let bttsYes = rawBttsYes;
  if (sharpBttsYes) {
    bttsYes = sharpWeight * sharpBttsYes + modelWeight * rawBttsYes;
  }
  bttsYes = Math.max(0.32, Math.min(0.72, bttsYes));
  const bttsNo = 1 - bttsYes;

  const rationale = `v1.0 Calibrated: tier=${leagueTier}, sharp_weight=${sharpWeight.toFixed(2)}, ` +
    `rating_diff=${ratingDiff.toFixed(0)}, npxg_diff=${npxgDiff.toFixed(2)}, ` +
    `sharp_H/D/A=${(sharpHome || 0).toFixed(3)}/${(sharpDraw || 0).toFixed(3)}/${(sharpAway || 0).toFixed(3)}, ` +
    `model_adj_H/A=${modelHomeAdj.toFixed(3)}/${modelAwayAdj.toFixed(3)}, ` +
    `final_H/D/A=${homeWin.toFixed(3)}/${draw.toFixed(3)}/${awayWin.toFixed(3)}, ` +
    `data_quality=${dataQualityHome.level}/${dataQualityAway.level}`;

  return { homeWin, draw, awayWin, over25, under25, bttsYes, bttsNo, rationale, leagueTier, dataQualityHome, dataQualityAway };
}

// ============= BET SCORE CALCULATION v1.0 =============
interface BetScoreResult {
  score: number;
  confidence: 'high' | 'medium' | 'low';
  breakdown: string;
}

function calculateBetScoreV1(
  edge: number,
  dataQualityHome: DataQuality,
  dataQualityAway: DataQuality,
  leagueTier: 1 | 2 | 3,
  hasSteamAlignment: boolean,
  homeFatigue: boolean,
  awayFatigue: boolean,
  correlationPenalty: number = 0
): BetScoreResult {
  // Base: 50
  let score = 50;
  const breakdown: string[] = ['base=50'];

  // Edge contribution: edge * 150 (5% edge = +7.5 points)
  const edgeContribution = edge * 150;
  score += edgeContribution;
  breakdown.push(`edge=${edgeContribution.toFixed(1)}`);

  // Data quality bonus
  if (dataQualityHome.level === 'HQ' && dataQualityAway.level === 'HQ') {
    score += 5;
    breakdown.push('HQ+HQ=+5');
  } else if (dataQualityHome.level === 'HQ' || dataQualityAway.level === 'HQ') {
    score += 3;
    breakdown.push('HQ/MQ=+3');
  }

  // Steam alignment bonus
  if (hasSteamAlignment) {
    score += 3;
    breakdown.push('steam=+3');
  }

  // Fatigue penalty
  if (homeFatigue || awayFatigue) {
    score -= 3;
    breakdown.push('fatigue=-3');
  }

  // League tier penalty
  if (leagueTier === 2) {
    score -= 3;
    breakdown.push('tier2=-3');
  } else if (leagueTier === 3) {
    score -= 8;
    breakdown.push('tier3=-8');
  }

  // Correlation penalty
  if (correlationPenalty > 0) {
    score -= correlationPenalty;
    breakdown.push(`corr=-${correlationPenalty}`);
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (edge >= 0.05 && score >= 78) {
    confidence = 'high';
  } else if (edge >= 0.03 && score >= 70) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { score: Math.round(score), confidence, breakdown: breakdown.join(', ') };
}

// ============= KELLY STAKING v1.0 (Conservative 10%) =============
function kellyStakeUnitsV1(
  edge: number,
  oddsDecimal: number,
  leagueTier: 1 | 2 | 3
): number {
  const b = oddsDecimal - 1;
  if (b <= 0 || edge <= 0) return 0;

  // Kelly: f = edge / (odds - 1) = edge / b
  const fullKelly = edge / b;

  // Apply 10% fractional Kelly (very conservative)
  let stake = fullKelly * 0.10;

  // Tier 2: multiply by 0.5
  if (leagueTier === 2) {
    stake *= 0.5;
  }

  // Tier 3: no bet
  if (leagueTier === 3) {
    return 0;
  }

  // Clamp between 0.25 and 1.0 units
  return Math.max(0.25, Math.min(1.0, stake));
}

// ============= INTERFACE DEFINITIONS =============
interface ModelInput {
  sports: string[];
  engine: 'team_sports' | 'horse' | 'greyhound';
  window_hours: number;
  bankroll_units: number;
  max_daily_exposure_pct: number;
  max_per_event_exposure_pct: number;
  max_bets: number;
}

interface RecommendedBet {
  event_id: string;
  market_id: string;
  sport: string;
  league: string;
  event_name: string;
  start_time: string;
  selection: string;
  selection_label: string;
  odds_decimal: number;
  bookmaker: string;
  model_probability: number;
  implied_probability: number;
  edge: number;
  bet_score: number;
  confidence: 'high' | 'medium' | 'low';
  recommended_stake_units: number;
  rationale: string;
  data_quality_tag?: string;
  league_tier?: number;
}

// ============= TENNIS MODEL (unchanged from before) =============
// ... keeping tennis model for when tennis sports are selected

interface TennisPlayerStats {
  player_name: string;
  atp_ranking?: number;
  wta_ranking?: number;
  elo_overall?: number;
  elo_hard?: number;
  elo_clay?: number;
  elo_grass?: number;
  recent_form?: string;
  win_rate_last_10?: number;
  hard_win_rate?: number;
  clay_win_rate?: number;
  grass_win_rate?: number;
  matches_last_14_days?: number;
  days_since_last_match?: number;
  injury_status?: string;
  qualitative_tags?: string[];
  data_quality?: 'high' | 'medium' | 'low';
  quality_score?: number;
}

interface TennisH2H {
  player1_wins: number;
  player2_wins: number;
}

interface TennisMatchEnrichment {
  player1: TennisPlayerStats;
  player2: TennisPlayerStats;
  h2h?: TennisH2H;
  surface: 'hard' | 'clay' | 'grass' | 'unknown';
  tournament_tier: string;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function calibrateTennisProbabilities(
  p1Stats: TennisPlayerStats,
  p2Stats: TennisPlayerStats,
  h2h: TennisH2H | undefined,
  surface: 'hard' | 'clay' | 'grass' | 'unknown',
  oddsFairP1: number,
  oddsFairP2: number
): { p1Prob: number; p2Prob: number; dataQuality: 'high' | 'medium' | 'low' } {
  const getEloForSurface = (stats: TennisPlayerStats, surf: string): number => {
    if (surf === 'clay') return stats.elo_clay || stats.elo_overall || 1500;
    if (surf === 'grass') return stats.elo_grass || stats.elo_overall || 1500;
    return stats.elo_hard || stats.elo_overall || 1500;
  };

  const p1Elo = getEloForSurface(p1Stats, surface);
  const p2Elo = getEloForSurface(p2Stats, surface);
  const eloDiff = p1Elo - p2Elo;
  const eloProb = 1 / (1 + Math.pow(10, -eloDiff / 400));

  const avgQuality = ((p1Stats.quality_score || 0) + (p2Stats.quality_score || 0)) / 2;
  const modelWeight = avgQuality >= 60 ? 0.3 : avgQuality >= 40 ? 0.2 : 0.10;
  const marketWeight = 1 - modelWeight;

  let modelP1 = eloProb;
  modelP1 = clamp(modelP1, 0.05, 0.95);

  const blendedP1 = modelP1 * modelWeight + oddsFairP1 * marketWeight;
  const blendedP2 = 1 - blendedP1;

  const dataQuality: 'high' | 'medium' | 'low' = avgQuality >= 60 ? 'high' : avgQuality >= 40 ? 'medium' : 'low';

  return { p1Prob: blendedP1, p2Prob: blendedP2, dataQuality };
}

function buildTennisBetsEnhanced(
  eventsWithOdds: any[],
  enrichments: Record<string, TennisMatchEnrichment>,
  bankrollUnits: number,
  maxDailyUnits: number,
  maxBets: number
): { bets: RecommendedBet[]; eventsAnalyzed: number; model: string } {
  const tennisEvents = eventsWithOdds.filter((e) => e.sport === 'tennis');
  const candidates: RecommendedBet[] = [];

  for (const event of tennisEvents) {
    const h2h = (event._raw_markets || []).filter((m: any) => m.market_type === 'h2h');
    if (h2h.length < 2) continue;

    const selections: string[] = Array.from(new Set(h2h.map((m: any) => String(m.selection))));
    if (selections.length !== 2) continue;
    const [p1, p2] = selections as [string, string];

    const oddsFor = (name: string): number[] => h2h
      .filter((m: any) => m.selection === name)
      .map((m: any) => Number(m.odds_decimal))
      .filter((o: number) => Number.isFinite(o) && o > 1.001);

    const o1 = oddsFor(p1);
    const o2 = oddsFor(p2);
    if (o1.length === 0 || o2.length === 0) continue;

    const avgImplied1 = o1.reduce((s: number, o: number) => s + 1 / o, 0) / o1.length;
    const avgImplied2 = o2.reduce((s: number, o: number) => s + 1 / o, 0) / o2.length;
    const sum = avgImplied1 + avgImplied2;
    if (sum <= 0) continue;

    const marketFairP1 = avgImplied1 / sum;
    const marketFairP2 = avgImplied2 / sum;

    const enrichment = enrichments[event.event_id];
    let p1Prob = marketFairP1;
    let p2Prob = marketFairP2;
    let dataQuality: 'high' | 'medium' | 'low' = 'low';

    if (enrichment?.player1 && enrichment?.player2) {
      const calibrated = calibrateTennisProbabilities(
        enrichment.player1, enrichment.player2, enrichment.h2h,
        enrichment.surface, marketFairP1, marketFairP2
      );
      p1Prob = calibrated.p1Prob;
      p2Prob = calibrated.p2Prob;
      dataQuality = calibrated.dataQuality;
    }

    const bestMoneylines = (event.markets || []).filter((m: any) => m.type === 'moneyline');
    const bestFor = (name: string) => bestMoneylines.find((m: any) => m.selection === name);
    const best1 = bestFor(p1);
    const best2 = bestFor(p2);
    if (!best1 || !best2) continue;

    for (const c of [{ sel: p1, fairP: p1Prob, best: best1 }, { sel: p2, fairP: p2Prob, best: best2 }]) {
      const offered = Number(c.best.odds_decimal);
      const implied = 1 / offered;
      const edge = c.fairP - implied;
      if (edge < 0.03) continue;

      const betScore = Math.round(clamp(50 + edge * 150, 50, 90));
      const confidence: 'high' | 'medium' | 'low' = edge >= 0.05 && betScore >= 78 ? 'high' : edge >= 0.03 && betScore >= 70 ? 'medium' : 'low';
      const stake = Math.max(0.25, Math.min(1.0, (edge / (offered - 1)) * 0.10));

      if (betScore < 70) continue;

      candidates.push({
        event_id: event.event_id,
        market_id: c.best.market_id,
        sport: 'tennis',
        league: event.league,
        event_name: `${event.home_team} vs ${event.away_team}`,
        start_time: event.start_time_aedt,
        selection: c.sel,
        selection_label: c.sel,
        odds_decimal: offered,
        bookmaker: c.best.bookmaker,
        model_probability: c.fairP,
        implied_probability: implied,
        edge,
        bet_score: betScore,
        confidence,
        recommended_stake_units: stake,
        rationale: `Tennis v1.0: fair_p=${c.fairP.toFixed(3)} vs implied=${implied.toFixed(3)}, edge=${(edge*100).toFixed(1)}%.`,
      });
    }
  }

  candidates.sort((a, b) => b.bet_score - a.bet_score);
  const selected: RecommendedBet[] = [];
  let total = 0;
  for (const b of candidates) {
    if (selected.length >= maxBets) break;
    if (total + b.recommended_stake_units > maxDailyUnits) continue;
    selected.push(b);
    total += b.recommended_stake_units;
  }

  return { bets: selected, eventsAnalyzed: tennisEvents.length, model: 'tennis_v1.0' };
}

// ============= MAIN SOCCER ANALYSIS (Local, No Perplexity) =============
function analyzeSoccerBetsLocal(
  eventsWithOdds: any[],
  maxBets: number,
  maxDailyUnits: number,
  maxPerMatchUnits: number
): { bets: RecommendedBet[]; rejected: any[]; eventsAnalyzed: number } {
  const MIN_EDGE = 0.03;
  const MIN_BET_SCORE = 70;
  const MAX_PER_LEAGUE = 2;

  const candidates: RecommendedBet[] = [];
  const rejected: any[] = [];
  const leagueCounts: Record<string, number> = {};

  for (const event of eventsWithOdds) {
    const calibrated = calibrateProbabilitiesV1(
      event.home_team_stats,
      event.away_team_stats,
      event.markets || [],
      event.league
    );

    // Skip if either team has LQ data OR if Tier 3 league
    if (calibrated.dataQualityHome.level === 'LQ' || calibrated.dataQualityAway.level === 'LQ') {
      rejected.push({
        event: `${event.home_team} vs ${event.away_team}`,
        reason: `LQ data: home=${calibrated.dataQualityHome.level}, away=${calibrated.dataQualityAway.level}, missing=${[...calibrated.dataQualityHome.missingFields, ...calibrated.dataQualityAway.missingFields].join(',')}`
      });
      continue;
    }

    if (calibrated.leagueTier === 3) {
      rejected.push({
        event: `${event.home_team} vs ${event.away_team}`,
        reason: `Tier 3 league: ${event.league} - default NO BET`
      });
      continue;
    }

    // Analyze each market
    const markets = event.markets || [];
    const homeFatigue = (event.home_team_stats?.matches_last_7_days || 0) > 2;
    const awayFatigue = (event.away_team_stats?.matches_last_7_days || 0) > 2;

    const analyzeSelection = (
      selection: string,
      selectionLabel: string,
      modelProb: number,
      marketFilter: (m: any) => boolean
    ) => {
      // Find ALL matching markets and pick the BEST odds (highest value)
      const matchingMarkets = markets.filter(marketFilter);
      if (matchingMarkets.length === 0) return;

      // Sort by odds descending (highest odds = best for bettor)
      matchingMarkets.sort((a: any, b: any) => parseFloat(b.odds_decimal) - parseFloat(a.odds_decimal));
      const market = matchingMarkets[0]; // Best odds available

      const offered = parseFloat(market.odds_decimal);
      if (!offered || offered <= 1) return;

      const implied = 1 / offered;
      const edge = modelProb - implied;

      // For debugging, also check what sharp odds were
      const sharpMarket = matchingMarkets.find((m: any) => 
        m.bookmaker?.toLowerCase().includes('pinnacle') || 
        m.bookmaker?.toLowerCase().includes('betfair')
      );
      const sharpImplied = sharpMarket ? 1 / parseFloat(sharpMarket.odds_decimal) : implied;

      if (edge < MIN_EDGE) {
        rejected.push({
          event: `${event.home_team} vs ${event.away_team}`,
          selection: selectionLabel,
          edge: edge,
          reason: `Edge ${(edge*100).toFixed(1)}% < minimum 3%`
        });
        return;
      }

      const hasSteamAlignment = market.steam_move === true;
      const betScoreResult = calculateBetScoreV1(
        edge,
        calibrated.dataQualityHome,
        calibrated.dataQualityAway,
        calibrated.leagueTier,
        hasSteamAlignment,
        homeFatigue,
        awayFatigue,
        0
      );

      if (betScoreResult.score < MIN_BET_SCORE) {
        rejected.push({
          event: `${event.home_team} vs ${event.away_team}`,
          selection: selectionLabel,
          bet_score: betScoreResult.score,
          edge: edge,
          reason: `Bet Score ${betScoreResult.score} < ${MIN_BET_SCORE}`
        });
        return;
      }

      const stake = kellyStakeUnitsV1(edge, offered, calibrated.leagueTier);
      if (stake <= 0) return;

      candidates.push({
        event_id: event.event_id,
        market_id: market.market_id,
        sport: event.sport,
        league: event.league,
        event_name: `${event.home_team} vs ${event.away_team}`,
        start_time: event.start_time_aedt,
        selection,
        selection_label: selectionLabel,
        odds_decimal: offered,
        bookmaker: market.bookmaker,
        model_probability: modelProb,
        implied_probability: implied,
        edge,
        bet_score: betScoreResult.score,
        confidence: betScoreResult.confidence,
        recommended_stake_units: stake,
        rationale: `${calibrated.rationale}. Score: ${betScoreResult.breakdown}`,
        data_quality_tag: `${calibrated.dataQualityHome.level}/${calibrated.dataQualityAway.level}`,
        league_tier: calibrated.leagueTier
      });
    };

    // 1X2 Markets - match by team name (selections use actual team names, not "home"/"away")
    const homeTeamLower = event.home_team?.toLowerCase() || '';
    const awayTeamLower = event.away_team?.toLowerCase() || '';
    
    analyzeSelection('home', `${event.home_team} to Win`, calibrated.homeWin,
      (m: any) => (m.type === 'moneyline' || m.market_type === 'h2h') && 
        (m.selection?.toLowerCase().includes(homeTeamLower) || 
         (m.selection?.toLowerCase().includes('home') && !m.selection?.toLowerCase().includes('draw'))));
    
    analyzeSelection('away', `${event.away_team} to Win`, calibrated.awayWin,
      (m: any) => (m.type === 'moneyline' || m.market_type === 'h2h') && 
        (m.selection?.toLowerCase().includes(awayTeamLower) || 
         (m.selection?.toLowerCase().includes('away') && !m.selection?.toLowerCase().includes('draw'))));
    
    analyzeSelection('draw', 'Draw', calibrated.draw,
      (m: any) => (m.type === 'moneyline' || m.market_type === 'h2h') && 
        m.selection?.toLowerCase() === 'draw');

    // Over/Under 2.5
    analyzeSelection('over', 'Over 2.5 Goals', calibrated.over25,
      (m: any) => m.market_type === 'totals' && m.selection?.toLowerCase().includes('over'));
    analyzeSelection('under', 'Under 2.5 Goals', calibrated.under25,
      (m: any) => m.market_type === 'totals' && m.selection?.toLowerCase().includes('under'));

    // BTTS (if available in data)
    analyzeSelection('btts_yes', 'BTTS Yes', calibrated.bttsYes,
      (m: any) => m.selection?.toLowerCase().includes('btts') && m.selection?.toLowerCase().includes('yes'));
    analyzeSelection('btts_no', 'BTTS No', calibrated.bttsNo,
      (m: any) => m.selection?.toLowerCase().includes('btts') && m.selection?.toLowerCase().includes('no'));
  }

  // Sort by bet score descending
  candidates.sort((a, b) => b.bet_score - a.bet_score);

  // Apply portfolio constraints
  const selected: RecommendedBet[] = [];
  let totalStake = 0;

  for (const bet of candidates) {
    if (selected.length >= maxBets) break;
    if (totalStake + bet.recommended_stake_units > maxDailyUnits) continue;

    // League cap
    const leagueCount = leagueCounts[bet.league] || 0;
    if (leagueCount >= MAX_PER_LEAGUE) {
      rejected.push({
        event: bet.event_name,
        selection: bet.selection_label,
        bet_score: bet.bet_score,
        reason: `League cap: already have ${MAX_PER_LEAGUE} bets in ${bet.league}`
      });
      continue;
    }

    // Max per match cap
    const matchBets = selected.filter(s => s.event_id === bet.event_id);
    if (matchBets.length >= 1) {
      rejected.push({
        event: bet.event_name,
        selection: bet.selection_label,
        bet_score: bet.bet_score,
        reason: `Match cap: already have 1 bet on this match`
      });
      continue;
    }

    selected.push(bet);
    totalStake += bet.recommended_stake_units;
    leagueCounts[bet.league] = leagueCount + 1;
  }

  return { bets: selected, rejected, eventsAnalyzed: eventsWithOdds.length };
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    const input: ModelInput = await req.json();
    const {
      sports = ['soccer'],
      engine = 'team_sports',
      window_hours = 12,
      bankroll_units = 100,
      max_daily_exposure_pct = 0.10,
      max_per_event_exposure_pct = 0.03,
      max_bets = 10
    } = input;

    console.log('=== BETTING MODEL v1.0 CALIBRATED START ===');
    console.log('Input:', { sports, window_hours, max_bets });

    // Query events from database
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`*, markets (*)`)
      .in('sport', sports)
      .eq('status', 'upcoming')
      .gte('start_time_utc', now.toISOString())
      .lte('start_time_utc', windowEnd.toISOString())
      .order('start_time_utc', { ascending: true })
      .limit(15);

    if (eventsError) {
      throw new Error(`Error fetching events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          recommended_bets: [],
          reason: 'No upcoming events found. Click "Refresh Odds" first to fetch latest odds data.',
          events_analyzed: 0,
          model_version: 'v1.0_calibrated'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events`);

    // TENNIS PATH
    const isTennisOnly = sports.length === 1 && sports[0] === 'tennis';
    if (isTennisOnly) {
      console.log('TENNIS MODE');
      const tennisEventsWithOdds = events.map(event => {
        const bestOdds: Record<string, { odds: number; bookmaker: string; market_id: string }> = {};
        for (const market of event.markets || []) {
          const key = `${market.market_type}_${market.selection}`;
          const odds = parseFloat(market.odds_decimal);
          if (!bestOdds[key] || odds > bestOdds[key].odds) {
            bestOdds[key] = { odds, bookmaker: market.bookmaker, market_id: market.id };
          }
        }
        return {
          event_id: event.id,
          sport: event.sport,
          league: event.league,
          home_team: event.home_team,
          away_team: event.away_team,
          start_time_aedt: event.start_time_aedt,
          _raw_markets: event.markets || [],
          markets: Object.entries(bestOdds).map(([key, data]) => {
            const [marketType, selection] = key.split('_');
            return {
              market_id: data.market_id,
              type: marketType === 'h2h' ? 'moneyline' : marketType,
              selection,
              odds_decimal: data.odds,
              bookmaker: data.bookmaker,
              implied_probability: (1 / data.odds).toFixed(4),
            };
          })
        };
      });

      let enrichments: Record<string, any> = {};
      try {
        const matchesToEnrich = tennisEventsWithOdds.slice(0, 10).map(e => ({
          event_id: e.event_id,
          home_team: e.home_team,
          away_team: e.away_team,
          league: e.league,
        }));
        const enrichResponse = await supabase.functions.invoke('scrape-tennis-data', { body: { matches: matchesToEnrich } });
        if (enrichResponse.data?.enrichments) {
          enrichments = enrichResponse.data.enrichments;
        }
      } catch (err) {
        console.log('Tennis stats fetch failed, using odds-only');
      }

      const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
      const result = buildTennisBetsEnhanced(tennisEventsWithOdds, enrichments, bankroll_units, maxDailyUnits, max_bets);

      return new Response(
        JSON.stringify({
          recommended_bets: result.bets,
          reason: result.bets.length === 0 ? `No tennis value edges found. Analyzed ${result.eventsAnalyzed} events.` : undefined,
          events_analyzed: result.eventsAnalyzed,
          model: result.model,
          model_version: 'v1.0_calibrated',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SOCCER PATH - Fetch enhanced stats
    console.log('Fetching enhanced stats via scrape-match-data...');
    let enhancedEventData: any[] = [];
    try {
      const scrapeResponse = await supabase.functions.invoke('scrape-match-data', {
        body: { sports, window_hours, max_events: 10 }
      });
      if (scrapeResponse.data?.raw_data?.complete) {
        enhancedEventData = scrapeResponse.data.raw_data.complete;
        console.log(`Got enhanced stats for ${enhancedEventData.length} complete events`);
      }
    } catch (scrapeError) {
      console.error('Failed to fetch enhanced stats:', scrapeError);
    }

    // Merge events with stats
    const eventsWithOdds = events.map(event => {
      const enhanced = enhancedEventData.find((e: any) =>
        e.match === `${event.home_team} vs ${event.away_team}`
      );

      const bestOdds: Record<string, { odds: number; bookmaker: string; market_id: string; steam_move?: boolean }> = {};
      for (const market of event.markets || []) {
        const key = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        if (!bestOdds[key] || odds > bestOdds[key].odds) {
          bestOdds[key] = { odds, bookmaker: market.bookmaker, market_id: market.id };
        }
      }

      return {
        event_id: event.id,
        sport: event.sport,
        league: event.league,
        home_team: event.home_team,
        away_team: event.away_team,
        start_time_aedt: event.start_time_aedt,
        home_team_stats: enhanced?.home_team_stats || null,
        away_team_stats: enhanced?.away_team_stats || null,
        markets: Object.entries(bestOdds).map(([key, data]) => {
          const [marketType, selection] = key.split('_');
          return {
            market_id: data.market_id,
            type: marketType === 'h2h' ? 'moneyline' : marketType,
            selection,
            odds_decimal: data.odds,
            bookmaker: data.bookmaker,
            implied_probability: (1 / data.odds).toFixed(4),
            steam_move: data.steam_move || false
          };
        })
      };
    });

    const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
    const maxPerEventUnits = bankroll_units * max_per_event_exposure_pct;

    // Run local analysis (no Perplexity needed - all calculation is done locally)
    console.log('Running local calibrated analysis...');
    const analysisResult = analyzeSoccerBetsLocal(eventsWithOdds, max_bets, maxDailyUnits, maxPerEventUnits);

    console.log(`Analysis complete: ${analysisResult.bets.length} bets selected, ${analysisResult.rejected.length} rejected`);

    // Save to database
    if (userId && analysisResult.bets.length > 0) {
      const betsToInsert = analysisResult.bets.map(bet => ({
        user_id: userId,
        event_id: bet.event_id,
        market_id: bet.market_id,
        sport: bet.sport,
        league: bet.league,
        event_name: bet.event_name,
        selection_label: bet.selection_label,
        odds_taken: bet.odds_decimal,
        bookmaker: bet.bookmaker,
        model_probability: bet.model_probability,
        implied_probability: bet.implied_probability,
        edge: bet.edge,
        bet_score: bet.bet_score,
        recommended_stake_units: bet.recommended_stake_units,
        rationale: bet.rationale,
        engine,
        result: 'pending'
      }));
      await supabase.from('model_bets').insert(betsToInsert);
      console.log(`Saved ${betsToInsert.length} bets to database`);
    }

    console.log('=== BETTING MODEL v1.0 CALIBRATED COMPLETE ===');

    return new Response(
      JSON.stringify({
        recommended_bets: analysisResult.bets,
        rejected_bets: analysisResult.rejected.slice(0, 20), // Limit rejected for response size
        portfolio_summary: {
          total_stake_units: analysisResult.bets.reduce((s, b) => s + b.recommended_stake_units, 0),
          bankroll_units,
          expected_value_units: analysisResult.bets.reduce((s, b) => s + (b.edge * b.recommended_stake_units), 0)
        },
        events_analyzed: analysisResult.eventsAnalyzed,
        events_fetched: events.length,
        min_bet_score: 70,
        min_edge: 0.03,
        kelly_fraction: 0.10,
        max_stake_units: 1.0,
        model_version: 'v1.0_calibrated',
        reason: analysisResult.bets.length === 0
          ? `No bets met criteria. ${analysisResult.rejected.length} rejected. Check rejected_bets for details.`
          : undefined,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in run-betting-model:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
