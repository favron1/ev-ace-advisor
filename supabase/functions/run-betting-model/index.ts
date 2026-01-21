import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CALIBRATION CONSTANTS (v4.0) =============
// Enhanced with proper 3-way logistic draw model and xG-driven O/U
// References: Poisson goal models (Dixon-Coles 1997), logistic regression calibration

const SOCCER_CALIBRATION = {
  // === 3-WAY LOGISTIC COEFFICIENTS ===
  // Multinomial logistic regression for H/D/A with draw as pivot
  
  // Home win logit: β0 + β1*rating_diff + β2*npxg_diff + β3*home_adv
  HOME_INTERCEPT: -0.15, // Slight underdog bias (calibrated to ~45% baseline)
  HOME_RATING_COEF: 0.025, // Per 100 rating points → ~2.5% logit shift
  HOME_NPXG_COEF: 0.08, // Per 0.5 npxG diff → ~4% logit shift
  HOME_ADVANTAGE: 0.12, // Logit home boost (~3% probability)
  
  // Away win logit: β0 + β1*rating_diff + β2*npxg_diff
  AWAY_INTERCEPT: -0.25, // Lower baseline (away disadvantage)
  AWAY_RATING_COEF: -0.025, // Inverse of home (rating helps away when positive)
  AWAY_NPXG_COEF: -0.08, // Inverse (better away npxg → higher away prob)
  
  // Draw probability parameters (Ordered logistic style)
  // Draws peak when teams are evenly matched; decay with mismatch
  DRAW_BASE: 0.26, // Base draw probability for evenly matched teams
  DRAW_DECAY: 0.0008, // Decay per unit of |rating_diff| (mismatches have fewer draws)
  DRAW_NPXG_DECAY: 0.03, // Decay per unit of |npxg_diff|
  DRAW_MIN: 0.18, // Floor (even huge mismatches have some draw chance)
  DRAW_MAX: 0.32, // Ceiling (draws rarely exceed 32%)
  
  // Probability bounds
  MAX_PROB: 0.68,
  MIN_PROB: 0.18,
  
  // Sharp book blending
  SHARP_WEIGHT: 0.35, // 35% weight to sharp book implied prob
  
  // === xG-DRIVEN OVER/UNDER MODEL ===
  // Poisson with attack/defense xG decomposition
  XG_HOME_ATTACK_WEIGHT: 0.55, // Weight home attacking xG
  XG_HOME_DEFEND_WEIGHT: 0.45, // Weight home defensive xG
  XG_AWAY_ATTACK_WEIGHT: 0.50, // Weight away attacking xG (road penalty)
  XG_AWAY_DEFEND_WEIGHT: 0.50, // Weight away defensive xG
  XG_REGRESSION: 0.25, // Regress xG to league mean (reduce variance)
  LEAGUE_AVG_GOALS: 2.75, // Average total goals per match (Tier 1 leagues)
  
  // Adjustment caps per factor
  FATIGUE_MAX: 0.025,
  INJURY_MAX: 0.04,
  FORM_MAX: 0.03,
};

// ============= BASKETBALL CALIBRATION CONSTANTS =============
// Basketball-specific model: no draws, higher scoring, rest impact more significant
const BASKETBALL_CALIBRATION = {
  INTERCEPT: 0.0,
  
  // Rating differential coefficient (per 100 points = ~5% shift in basketball)
  RATING_COEF: 0.05,
  
  // Net rating coefficient (per 5 points of net rating = ~4% shift)
  NET_RATING_COEF: 0.008,
  
  // Home court advantage (empirical: ~2-4% in NBA, varies by league)
  HOME_ADVANTAGE: 0.03,
  
  // Maximum probability cap (basketball can have higher favorites)
  MAX_PROB: 0.78,
  MIN_PROB: 0.22,
  
  // Sharp book weight
  SHARP_WEIGHT: 0.45,
  
  // REST IMPACT (critical in basketball)
  REST_0_DAYS_PENALTY: 0.06, // Back-to-back = significant disadvantage
  REST_1_DAY_PENALTY: 0.02,
  REST_3_PLUS_BONUS: 0.02,
  
  // Fatigue from travel/schedule
  FATIGUE_MAX: 0.04,
  
  // Star player injury impact (much bigger in basketball)
  STAR_MISSING_PENALTY: 0.08, // Per star player missing
};

const CALIBRATION_CONFIG = SOCCER_CALIBRATION; // Default for backward compatibility

interface ModelInput {
  sports: string[];
  engine: 'team_sports' | 'horse' | 'greyhound';
  window_hours: number;
  bankroll_units: number;
  max_daily_exposure_pct: number;
  max_per_event_exposure_pct: number;
  max_bets: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function kellyStakeUnits(
  bankrollUnits: number,
  p: number,
  oddsDecimal: number,
  maxPerBetUnits: number,
  kellyFraction: number = 0.25,
) {
  // Kelly for decimal odds: f* = (bp - q)/b, b = odds-1
  const b = oddsDecimal - 1;
  if (b <= 0) return 0;
  const q = 1 - p;
  const fStar = (b * p - q) / b;
  const f = clamp(fStar, 0, 1) * kellyFraction;
  const stake = bankrollUnits * f;
  return clamp(stake, 0, maxPerBetUnits);
}

// ============= TENNIS PLAYER STATS INTERFACE =============
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
  hard_player1_wins?: number;
  hard_player2_wins?: number;
  clay_player1_wins?: number;
  clay_player2_wins?: number;
  grass_player1_wins?: number;
  grass_player2_wins?: number;
}

interface TennisMatchEnrichment {
  player1: TennisPlayerStats;
  player2: TennisPlayerStats;
  h2h?: TennisH2H;
  surface: 'hard' | 'clay' | 'grass' | 'unknown';
  tournament_tier: 'grand_slam' | 'masters' | 'atp500' | 'atp250' | 'challenger' | 'unknown';
}

// ============= TENNIS PROBABILITY CALIBRATION =============
function calibrateTennisProbabilities(
  p1Stats: TennisPlayerStats,
  p2Stats: TennisPlayerStats,
  h2h: TennisH2H | undefined,
  surface: 'hard' | 'clay' | 'grass' | 'unknown',
  oddsFairP1: number, // Market consensus probability for player 1
  oddsFairP2: number,
): { p1Prob: number; p2Prob: number; dataQuality: 'high' | 'medium' | 'low' } {
  
  // Get surface-specific Elo
  const getEloForSurface = (stats: TennisPlayerStats, surf: string): number => {
    if (surf === 'clay') return stats.elo_clay || stats.elo_overall || 1500;
    if (surf === 'grass') return stats.elo_grass || stats.elo_overall || 1500;
    return stats.elo_hard || stats.elo_overall || 1500;
  };
  
  const p1Elo = getEloForSurface(p1Stats, surface);
  const p2Elo = getEloForSurface(p2Stats, surface);
  
  // Calculate Elo-based probability
  const eloDiff = p1Elo - p2Elo;
  const eloProb = 1 / (1 + Math.pow(10, -eloDiff / 400));
  
  // Get surface-specific win rates
  const getSurfaceWinRate = (stats: TennisPlayerStats, surf: string): number | undefined => {
    if (surf === 'clay') return stats.clay_win_rate;
    if (surf === 'grass') return stats.grass_win_rate;
    return stats.hard_win_rate;
  };
  
  const p1SurfaceWR = getSurfaceWinRate(p1Stats, surface);
  const p2SurfaceWR = getSurfaceWinRate(p2Stats, surface);
  
  // Surface win rate adjustment
  let surfaceAdj = 0;
  if (p1SurfaceWR !== undefined && p2SurfaceWR !== undefined) {
    surfaceAdj = (p1SurfaceWR - p2SurfaceWR) * 0.15;
  }
  
  // H2H adjustment
  let h2hAdj = 0;
  if (h2h && (h2h.player1_wins + h2h.player2_wins >= 2)) {
    const totalMeetings = h2h.player1_wins + h2h.player2_wins;
    const p1H2HRate = h2h.player1_wins / totalMeetings;
    // Weight H2H more heavily with more matches
    const h2hWeight = Math.min(0.10, totalMeetings * 0.02);
    h2hAdj = (p1H2HRate - 0.5) * h2hWeight;
  }
  
  // Form adjustment from recent results
  let formAdj = 0;
  if (p1Stats.recent_form && p2Stats.recent_form) {
    const countWins = (form: string) => (form.match(/W/g) || []).length / form.length;
    const p1Form = countWins(p1Stats.recent_form);
    const p2Form = countWins(p2Stats.recent_form);
    formAdj = (p1Form - p2Form) * 0.08;
  }
  
  // Fatigue adjustment
  let fatigueAdj = 0;
  const p1Matches = p1Stats.matches_last_14_days || 0;
  const p2Matches = p2Stats.matches_last_14_days || 0;
  if (p1Matches > 6 && p2Matches < 4) fatigueAdj = -0.03;
  else if (p2Matches > 6 && p1Matches < 4) fatigueAdj = 0.03;
  
  // Injury adjustment
  if (p1Stats.injury_status === 'doubtful') fatigueAdj -= 0.05;
  if (p2Stats.injury_status === 'doubtful') fatigueAdj += 0.05;
  
  // Blend model probability with market probability
  // Weight based on data quality
  const avgQuality = ((p1Stats.quality_score || 0) + (p2Stats.quality_score || 0)) / 2;
  const modelWeight = avgQuality >= 60 ? 0.4 : avgQuality >= 40 ? 0.25 : 0.10;
  const marketWeight = 1 - modelWeight;
  
  let modelP1 = eloProb + surfaceAdj + h2hAdj + formAdj + fatigueAdj;
  modelP1 = clamp(modelP1, 0.05, 0.95);
  
  // Blend with market
  const blendedP1 = modelP1 * modelWeight + oddsFairP1 * marketWeight;
  const blendedP2 = 1 - blendedP1;
  
  // Determine data quality
  const dataQuality: 'high' | 'medium' | 'low' = 
    avgQuality >= 60 ? 'high' : avgQuality >= 40 ? 'medium' : 'low';
  
  console.log(`[Tennis Prob] ${p1Stats.player_name}: Elo=${p1Elo}, model=${modelP1.toFixed(3)}, market=${oddsFairP1.toFixed(3)}, blended=${blendedP1.toFixed(3)}, quality=${dataQuality}`);
  
  return { p1Prob: blendedP1, p2Prob: blendedP2, dataQuality };
}

// ============= ENHANCED TENNIS MODEL (with stats) =============
function buildTennisBetsEnhanced(
  eventsWithOdds: any[],
  enrichments: Record<string, TennisMatchEnrichment>,
  bankrollUnits: number,
  maxDailyUnits: number,
  maxBets: number,
): { bets: RecommendedBet[]; eventsAnalyzed: number; model: string } {
  const tennisEvents = eventsWithOdds.filter((e) => e.sport === 'tennis');
  const candidates: RecommendedBet[] = [];
  let statsBasedCount = 0;

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

    // Calculate market fair probabilities
    const avgImplied1 = o1.reduce((s: number, o: number) => s + 1 / o, 0) / o1.length;
    const avgImplied2 = o2.reduce((s: number, o: number) => s + 1 / o, 0) / o2.length;
    const sum = avgImplied1 + avgImplied2;
    if (sum <= 0) continue;

    const marketFairP1 = avgImplied1 / sum;
    const marketFairP2 = avgImplied2 / sum;

    // Get enrichment data
    const enrichment = enrichments[event.event_id];
    
    let p1Prob: number;
    let p2Prob: number;
    let dataQuality: 'high' | 'medium' | 'low' = 'low';
    let model = 'odds_only';
    
    if (enrichment && enrichment.player1 && enrichment.player2) {
      // Use calibrated model
      const calibrated = calibrateTennisProbabilities(
        enrichment.player1,
        enrichment.player2,
        enrichment.h2h,
        enrichment.surface,
        marketFairP1,
        marketFairP2
      );
      p1Prob = calibrated.p1Prob;
      p2Prob = calibrated.p2Prob;
      dataQuality = calibrated.dataQuality;
      model = dataQuality === 'low' ? 'odds_only' : 'stats_based';
      if (model === 'stats_based') statsBasedCount++;
    } else {
      // Fallback to market consensus
      p1Prob = marketFairP1;
      p2Prob = marketFairP2;
    }

    const bestMoneylines = (event.markets || []).filter((m: any) => m.type === 'moneyline');
    const bestFor = (name: string) => bestMoneylines.find((m: any) => m.selection === name);
    const best1 = bestFor(p1);
    const best2 = bestFor(p2);
    if (!best1 || !best2) continue;

    const consider = [
      { sel: p1, fairP: p1Prob, best: best1 },
      { sel: p2, fairP: p2Prob, best: best2 },
    ];

    for (const c of consider) {
      const offered = Number(c.best.odds_decimal);
      const implied = 1 / offered;
      const edge = c.fairP - implied;
      if (edge < 0.02) continue;

      // Higher bet scores for stats-based bets
      const baseScore = model === 'stats_based' ? 72 : 70;
      const betScore = Math.round(clamp(baseScore + edge * 800, baseScore, 92));
      const confidence: 'high' | 'medium' | 'low' = edge >= 0.05 ? 'high' : edge >= 0.03 ? 'medium' : 'low';
      
      // Reduce stake for low quality data
      const qualityMultiplier = dataQuality === 'high' ? 1.0 : dataQuality === 'medium' ? 0.75 : 0.5;
      const stake = kellyStakeUnits(bankrollUnits, c.fairP, offered, bankrollUnits * 0.015) * qualityMultiplier;

      // Build rationale
      let rationale = `Tennis (${model}): fair_p=${c.fairP.toFixed(3)} vs implied=${implied.toFixed(3)}.`;
      if (enrichment && model === 'stats_based') {
        const playerStats = c.sel === p1 ? enrichment.player1 : enrichment.player2;
        const ranking = playerStats.atp_ranking || playerStats.wta_ranking;
        if (ranking) rationale += ` Ranking: #${ranking}.`;
        if (enrichment.h2h && (enrichment.h2h.player1_wins + enrichment.h2h.player2_wins > 0)) {
          rationale += ` H2H: ${enrichment.h2h.player1_wins}-${enrichment.h2h.player2_wins}.`;
        }
        if (playerStats.recent_form) rationale += ` Form: ${playerStats.recent_form.slice(0, 5)}.`;
      }

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
        rationale,
      });
    }
  }

  candidates.sort((a, b) => b.edge - a.edge);
  const selected: RecommendedBet[] = [];
  let total = 0;
  for (const b of candidates) {
    if (selected.length >= maxBets) break;
    if (total + b.recommended_stake_units > maxDailyUnits) continue;
    selected.push(b);
    total += b.recommended_stake_units;
  }
  
  const modelType = statsBasedCount > tennisEvents.length / 2 ? 'tennis_stats_v1' : 'tennis_hybrid_v1';
  return { bets: selected, eventsAnalyzed: tennisEvents.length, model: modelType };
}

// ============= LEGACY ODDS-ONLY MODEL (fallback) =============
function buildTennisBetsFromOdds(
  eventsWithOdds: any[],
  bankrollUnits: number,
  maxDailyUnits: number,
  maxBets: number,
) {
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

    const fairP1 = avgImplied1 / sum;
    const fairP2 = avgImplied2 / sum;

    const bestMoneylines = (event.markets || []).filter((m: any) => m.type === 'moneyline');
    const bestFor = (name: string) => bestMoneylines.find((m: any) => m.selection === name);
    const best1 = bestFor(p1);
    const best2 = bestFor(p2);
    if (!best1 || !best2) continue;

    const consider: { sel: string; fairP: number; best: any }[] = [
      { sel: p1, fairP: fairP1, best: best1 },
      { sel: p2, fairP: fairP2, best: best2 },
    ];

    for (const c of consider) {
      const offered = Number(c.best.odds_decimal);
      const implied = 1 / offered;
      const edge = c.fairP - implied;
      if (edge < 0.02) continue;

      const betScore = Math.round(clamp(70 + edge * 800, 70, 90));
      const confidence: 'high' | 'medium' | 'low' = edge >= 0.05 ? 'high' : edge >= 0.03 ? 'medium' : 'low';
      const stake = kellyStakeUnits(bankrollUnits, c.fairP, offered, bankrollUnits * 0.015);

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
        rationale: `Tennis (odds-only): consensus fair_p=${c.fairP.toFixed(3)} vs implied=${implied.toFixed(3)} from best price.`,
      });
    }
  }

  candidates.sort((a, b) => b.edge - a.edge);
  const selected: RecommendedBet[] = [];
  let total = 0;
  for (const b of candidates) {
    if (selected.length >= maxBets) break;
    if (total + b.recommended_stake_units > maxDailyUnits) continue;
    selected.push(b);
    total += b.recommended_stake_units;
  }
  return { bets: selected, eventsAnalyzed: tennisEvents.length };
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
  // NEW: CLV and correlation tracking
  steam_move?: boolean;
  correlation_penalty?: number;
  // NEW: Calibration metadata
  calibrated_prob?: number;
  sharp_implied_prob?: number;
}

interface TeamStats {
  team: string;
  team_id?: number;
  league_position?: number;
  points_per_game?: number;
  recent_form?: string;
  goals_scored_last_5?: number;
  goals_conceded_last_5?: number;
  xg_for_last_5?: number;
  xg_against_last_5?: number;
  xg_difference?: number;
  home_xg_for?: number;
  home_xg_against?: number;
  away_xg_for?: number;
  away_xg_against?: number;
  matches_last_7_days?: number;
  matches_last_14_days?: number;
  team_rating?: number;
  home_record?: string;
  away_record?: string;
  home_goals_for?: number;
  home_goals_against?: number;
  away_goals_for?: number;
  away_goals_against?: number;
  days_rest?: number;
  injuries?: string[];
  qualitative_tags?: string[];
  stats_complete: boolean;
}

// Get current time in AEDT ISO format
function getNowAEDT(): string {
  const now = new Date();
  return now.toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' }).replace(' ', 'T') + '+11:00';
}

// Scrape sports data using Firecrawl search - enhanced for structured stats
async function scrapeMatchData(
  teams: { home: string; away: string; league: string; sport: string }[],
  firecrawlApiKey: string
): Promise<Record<string, any>> {
  const scrapedData: Record<string, any> = {};
  
  async function firecrawlSearch(query: string, limit: number = 3): Promise<any[]> {
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          tbs: 'qdr:w',
          scrapeOptions: { formats: ['markdown'] }
        }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data?.map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.markdown?.substring(0, 1500) || r.description || ''
      })) || [];
    } catch {
      return [];
    }
  }

  const matchPromises = teams.slice(0, 8).map(async (match) => {
    const matchKey = `${match.home} vs ${match.away}`;
    console.log(`Scraping enriched data: ${matchKey}`);
    
    try {
      const [
        homeFormResults,
        awayFormResults,
        statsResults,
        injuryResults,
        newsResults
      ] = await Promise.all([
        firecrawlSearch(`"${match.home}" ${match.league} last 5 matches results form 2024-25`, 2),
        firecrawlSearch(`"${match.away}" ${match.league} last 5 matches results form 2024-25`, 2),
        firecrawlSearch(`"${match.home}" OR "${match.away}" xG goals scored conceded statistics ${match.league}`, 2),
        firecrawlSearch(`"${match.home}" OR "${match.away}" injuries suspensions team news lineup`, 3),
        firecrawlSearch(`"${match.home}" OR "${match.away}" transfer starting eleven squad news`, 2)
      ]);

      const enrichedData = {
        home_team_form: homeFormResults,
        away_team_form: awayFormResults,
        team_stats: statsResults,
        injuries_suspensions: injuryResults,
        transfers_news: newsResults,
        summary: `
=== ${match.home} FORM & STATS ===
${homeFormResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No form data'}

=== ${match.away} FORM & STATS ===
${awayFormResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No form data'}

=== TEAM STATISTICS (xG, Goals) ===
${statsResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No stats data'}

=== INJURIES & SUSPENSIONS ===
${injuryResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No injury data'}

=== TRANSFERS & NEWS ===
${newsResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No news data'}
`
      };

      return { matchKey, data: enrichedData };
    } catch (error) {
      console.error(`Error scraping ${matchKey}:`, error);
      return { matchKey, data: null };
    }
  });

  const results = await Promise.all(matchPromises);
  
  for (const result of results) {
    if (result.data) {
      scrapedData[result.matchKey] = result.data;
    }
  }

  return scrapedData;
}

// ============= CALIBRATED PROBABILITY MODEL (v3.0) =============
// Uses logistic regression-style coefficients to prevent overconfident predictions

interface CalibratedProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
  rationale: string;
}

function calibrateProbabilities(
  homeStats: any,
  awayStats: any,
  markets: any[]
): CalibratedProbabilities {
  const cfg = CALIBRATION_CONFIG;
  
  // === Extract key metrics ===
  const ratingDiff = (homeStats?.team_rating || 1500) - (awayStats?.team_rating || 1500);
  
  // xG metrics with fallbacks
  const homeXgFor = homeStats?.xg_for_last_5 ?? homeStats?.home_xg_for ?? 1.3;
  const homeXgAgainst = homeStats?.xg_against_last_5 ?? homeStats?.home_xg_against ?? 1.1;
  const awayXgFor = awayStats?.xg_for_last_5 ?? awayStats?.away_xg_for ?? 1.1;
  const awayXgAgainst = awayStats?.xg_against_last_5 ?? awayStats?.away_xg_against ?? 1.2;
  
  // npxG differential (non-penalty xG preferred)
  const homeNpxg = homeStats?.npxg_for_last_5 ?? homeXgFor;
  const awayNpxg = awayStats?.npxg_for_last_5 ?? awayXgFor;
  const npxgDiff = (homeNpxg - (homeStats?.npxg_against_last_5 ?? homeXgAgainst)) - 
                   (awayNpxg - (awayStats?.npxg_against_last_5 ?? awayXgAgainst));
  
  // Get sharp book implied probabilities if available
  const sharpH2H = markets.find((m: any) => 
    m.type === 'moneyline' && m.is_sharp_book && m.selection?.toLowerCase().includes('home')
  );
  const sharpImpliedHome = sharpH2H ? 1 / sharpH2H.odds_decimal : null;
  
  // ============= 3-WAY LOGISTIC MODEL (v4.0) =============
  // Multinomial logistic regression: P(outcome) = exp(logit) / sum(exp(logits))
  
  // Home win logit
  const homeLogit = cfg.HOME_INTERCEPT + 
                    (ratingDiff / 100) * cfg.HOME_RATING_COEF + 
                    npxgDiff * cfg.HOME_NPXG_COEF + 
                    cfg.HOME_ADVANTAGE;
  
  // Away win logit
  const awayLogit = cfg.AWAY_INTERCEPT + 
                    (ratingDiff / 100) * cfg.AWAY_RATING_COEF + 
                    npxgDiff * cfg.AWAY_NPXG_COEF;
  
  // Draw logit (reference category = 0, but we model draw explicitly)
  // Draw probability peaks when teams are similar, decays with mismatch
  const ratingGap = Math.abs(ratingDiff);
  const npxgGap = Math.abs(npxgDiff);
  const drawProb = Math.max(cfg.DRAW_MIN, Math.min(cfg.DRAW_MAX,
    cfg.DRAW_BASE - (ratingGap * cfg.DRAW_DECAY) - (npxgGap * cfg.DRAW_NPXG_DECAY)
  ));
  
  // Softmax for home/away (draw handled separately)
  const expHome = Math.exp(homeLogit);
  const expAway = Math.exp(awayLogit);
  const expSum = expHome + expAway;
  
  // Allocate remaining probability after draw
  const remainingProb = 1 - drawProb;
  let rawHomeProb = (expHome / expSum) * remainingProb;
  let rawAwayProb = (expAway / expSum) * remainingProb;
  
  // Apply fatigue adjustments (capped)
  const homeFatigue = (homeStats?.matches_last_7_days || 0) > 2;
  const awayFatigue = (awayStats?.matches_last_7_days || 0) > 2;
  if (homeFatigue && !awayFatigue) {
    rawHomeProb -= cfg.FATIGUE_MAX;
    rawAwayProb += cfg.FATIGUE_MAX * 0.7; // Some goes to draw
  }
  if (awayFatigue && !homeFatigue) {
    rawAwayProb -= cfg.FATIGUE_MAX;
    rawHomeProb += cfg.FATIGUE_MAX * 0.7;
  }
  
  // Apply injury adjustments (capped)
  const homeMissing = (homeStats?.missing_by_position?.DEF || 0) + 
                      (homeStats?.missing_by_position?.MID || 0) + 
                      (homeStats?.missing_by_position?.FWD || 0);
  const awayMissing = (awayStats?.missing_by_position?.DEF || 0) + 
                      (awayStats?.missing_by_position?.MID || 0) + 
                      (awayStats?.missing_by_position?.FWD || 0);
  const injuryImpact = Math.min(cfg.INJURY_MAX, (awayMissing - homeMissing) * 0.012);
  rawHomeProb += injuryImpact;
  rawAwayProb -= injuryImpact * 0.7;
  
  // Blend with sharp book implied probability (trust the market)
  let calibratedHomeProb = rawHomeProb;
  if (sharpImpliedHome) {
    calibratedHomeProb = (1 - cfg.SHARP_WEIGHT) * rawHomeProb + cfg.SHARP_WEIGHT * sharpImpliedHome;
  }
  
  // Clamp to realistic bounds
  calibratedHomeProb = Math.max(cfg.MIN_PROB, Math.min(cfg.MAX_PROB, calibratedHomeProb));
  let calibratedAwayProb = Math.max(cfg.MIN_PROB, Math.min(cfg.MAX_PROB, rawAwayProb));
  let calibratedDrawProb = drawProb;
  
  // Normalize to sum to 1
  const total = calibratedHomeProb + calibratedDrawProb + calibratedAwayProb;
  const homeWin = calibratedHomeProb / total;
  const draw = calibratedDrawProb / total;
  const awayWin = calibratedAwayProb / total;
  
  // ============= xG-DRIVEN OVER/UNDER MODEL (Poisson) =============
  // Team-specific attack/defense xG with regression to mean
  
  // Home team expected goals: blend of home attack xG and away concede xG
  const homeExpGoals = (
    cfg.XG_HOME_ATTACK_WEIGHT * (homeXgFor / 5) + 
    cfg.XG_HOME_DEFEND_WEIGHT * (awayXgAgainst / 5)
  );
  
  // Away team expected goals: blend of away attack xG and home concede xG
  const awayExpGoals = (
    cfg.XG_AWAY_ATTACK_WEIGHT * (awayXgFor / 5) + 
    cfg.XG_AWAY_DEFEND_WEIGHT * (homeXgAgainst / 5)
  );
  
  // Regress to league average to reduce variance
  const regressedHomeGoals = (1 - cfg.XG_REGRESSION) * homeExpGoals + cfg.XG_REGRESSION * (cfg.LEAGUE_AVG_GOALS / 2);
  const regressedAwayGoals = (1 - cfg.XG_REGRESSION) * awayExpGoals + cfg.XG_REGRESSION * (cfg.LEAGUE_AVG_GOALS / 2);
  
  // Total expected goals (lambda for Poisson)
  const totalLambda = regressedHomeGoals + regressedAwayGoals;
  
  // Poisson calculation: P(X=k) = (λ^k * e^-λ) / k!
  const poissonProb = (lambda: number, k: number): number => {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    return Math.pow(lambda, k) * Math.exp(-lambda) / factorial;
  };
  
  // P(total > 2.5) = 1 - P(0) - P(1) - P(2)
  const pUnder25 = poissonProb(totalLambda, 0) + poissonProb(totalLambda, 1) + poissonProb(totalLambda, 2);
  const over25 = Math.max(0.28, Math.min(0.72, 1 - pUnder25));
  const under25 = 1 - over25;
  
  // ============= BTTS MODEL (Independent Poisson) =============
  // P(BTTS Yes) = P(Home scores ≥1) × P(Away scores ≥1)
  const pHomeScores = 1 - Math.exp(-regressedHomeGoals); // 1 - P(home=0)
  const pAwayScores = 1 - Math.exp(-regressedAwayGoals); // 1 - P(away=0)
  const bttsYes = Math.max(0.32, Math.min(0.72, pHomeScores * pAwayScores));
  const bttsNo = 1 - bttsYes;
  
  const rationale = `v4.0 3-way logistic: rating_diff=${ratingDiff.toFixed(0)}, npxg_diff=${npxgDiff.toFixed(2)}, ` +
    `draw_model=${draw.toFixed(3)}, xG_total=${totalLambda.toFixed(2)}, ` +
    `sharp_implied=${sharpImpliedHome?.toFixed(3) || 'N/A'}, H/D/A=${homeWin.toFixed(3)}/${draw.toFixed(3)}/${awayWin.toFixed(3)}`;
  
  return { homeWin, draw, awayWin, over25, under25, bttsYes, bttsNo, rationale };
}

// ============= BASKETBALL CALIBRATED PROBABILITY MODEL =============
// No draws, different factors, higher scoring

interface BasketballCalibratedProbabilities {
  homeWin: number;
  awayWin: number;
  overTotal: number;
  underTotal: number;
  homeSpread: number;
  awaySpread: number;
  rationale: string;
}

function calibrateBasketballProbabilities(
  homeStats: any,
  awayStats: any,
  markets: any[]
): BasketballCalibratedProbabilities {
  const cfg = BASKETBALL_CALIBRATION;
  
  // Extract key metrics
  const ratingDiff = (homeStats?.team_rating || 1500) - (awayStats?.team_rating || 1500);
  const homeNetRating = homeStats?.net_rating || 0;
  const awayNetRating = awayStats?.net_rating || 0;
  const netRatingDiff = homeNetRating - awayNetRating;
  
  // Get sharp book implied probabilities if available
  const sharpH2H = markets.find((m: any) => 
    m.type === 'moneyline' && m.selection?.toLowerCase().includes('home')
  );
  const sharpImpliedHome = sharpH2H ? 1 / sharpH2H.odds_decimal : null;
  
  // Base calculation using logistic-style model
  let logit = cfg.INTERCEPT + 
              (ratingDiff / 100) * cfg.RATING_COEF + 
              netRatingDiff * cfg.NET_RATING_COEF + 
              cfg.HOME_ADVANTAGE;
  
  // REST IMPACT (critical in basketball)
  const homeDaysRest = homeStats?.days_rest ?? 2;
  const awayDaysRest = awayStats?.days_rest ?? 2;
  
  // Home team rest adjustments
  if (homeDaysRest === 0) logit -= cfg.REST_0_DAYS_PENALTY;
  else if (homeDaysRest === 1) logit -= cfg.REST_1_DAY_PENALTY;
  else if (homeDaysRest >= 3) logit += cfg.REST_3_PLUS_BONUS;
  
  // Away team rest adjustments (inverse effect)
  if (awayDaysRest === 0) logit += cfg.REST_0_DAYS_PENALTY;
  else if (awayDaysRest === 1) logit += cfg.REST_1_DAY_PENALTY;
  else if (awayDaysRest >= 3) logit -= cfg.REST_3_PLUS_BONUS;
  
  // Win percentage factor
  const homeWinPct = homeStats?.win_percentage ?? 0.5;
  const awayWinPct = awayStats?.win_percentage ?? 0.5;
  logit += (homeWinPct - awayWinPct) * 0.15;
  
  // Sigmoid function for probability
  let rawHomeProb = 1 / (1 + Math.exp(-logit * 3));
  
  // Blend with sharp book implied probability
  let calibratedHomeProb = rawHomeProb;
  if (sharpImpliedHome) {
    calibratedHomeProb = (1 - cfg.SHARP_WEIGHT) * rawHomeProb + cfg.SHARP_WEIGHT * sharpImpliedHome;
  }
  
  // Clamp to realistic bounds
  calibratedHomeProb = Math.max(cfg.MIN_PROB, Math.min(cfg.MAX_PROB, calibratedHomeProb));
  const awayWin = 1 - calibratedHomeProb;
  
  // Over/Under based on combined PPG and pace
  const homePPG = homeStats?.points_per_game || 110;
  const awayPPG = awayStats?.points_per_game || 108;
  const homePAG = homeStats?.points_allowed_per_game || 108;
  const awayPAG = awayStats?.points_allowed_per_game || 110;
  
  const expectedHomePoints = (homePPG + awayPAG) / 2;
  const expectedAwayPoints = (awayPPG + homePAG) / 2;
  const expectedTotal = expectedHomePoints + expectedAwayPoints;
  
  // Find the total line from markets
  const totalMarket = markets.find((m: any) => m.type === 'totals' || m.selection?.includes('Over'));
  const totalLine = totalMarket?.line || 220;
  
  // Simple probability based on expected total vs line
  const totalDiff = expectedTotal - totalLine;
  let overProb = 0.5 + (totalDiff / 20) * 0.15; // 5 point diff = ~3.75% edge
  overProb = Math.max(0.35, Math.min(0.65, overProb));
  
  // Spread calculation
  const expectedMargin = expectedHomePoints - expectedAwayPoints;
  const spreadMarket = markets.find((m: any) => m.type === 'spreads');
  const spreadLine = spreadMarket?.line || 0;
  
  const spreadDiff = expectedMargin - spreadLine;
  let homeSpreadProb = 0.5 + (spreadDiff / 10) * 0.10; // 5 point diff = ~5% edge
  homeSpreadProb = Math.max(0.40, Math.min(0.60, homeSpreadProb));
  
  const rationale = `Basketball: rating_diff=${ratingDiff.toFixed(0)}, net_rating_diff=${netRatingDiff.toFixed(1)}, ` +
    `rest=${homeDaysRest}v${awayDaysRest}, sharp_implied=${sharpImpliedHome?.toFixed(3) || 'N/A'}, ` +
    `model_home=${calibratedHomeProb.toFixed(3)}, expected_total=${expectedTotal.toFixed(1)}`;
  
  return {
    homeWin: calibratedHomeProb,
    awayWin,
    overTotal: overProb,
    underTotal: 1 - overProb,
    homeSpread: homeSpreadProb,
    awaySpread: 1 - homeSpreadProb,
    rationale,
  };
}

// Calculate correlation penalty for portfolio concentration
function calculateCorrelationPenalty(
  bet: any,
  existingBets: any[],
  maxPerLeague: number = 2,
  maxPerTimeCluster: number = 3
): number {
  let penalty = 0;
  
  // Count bets in same league
  const sameLeagueBets = existingBets.filter(b => b.league === bet.league);
  if (sameLeagueBets.length >= maxPerLeague) {
    penalty += 5 * (sameLeagueBets.length - maxPerLeague + 1);
  }
  
  // Count bets in same 2-hour time cluster
  const betTime = new Date(bet.start_time).getTime();
  const sameTimeBets = existingBets.filter(b => {
    const existingTime = new Date(b.start_time).getTime();
    return Math.abs(betTime - existingTime) < 2 * 60 * 60 * 1000; // 2 hours
  });
  if (sameTimeBets.length >= maxPerTimeCluster) {
    penalty += 3 * (sameTimeBets.length - maxPerTimeCluster + 1);
  }
  
  return penalty;
}

// Send enhanced data to Perplexity for betting decisions
async function analyzeWithPerplexity(
  eventsWithOdds: any[],
  scrapedData: Record<string, any>,
  context: any,
  perplexityApiKey: string
): Promise<any> {
  
  // Pre-calculate calibrated probabilities for each event
  const eventsPayload = eventsWithOdds.map(event => {
    const matchKey = `${event.home_team} vs ${event.away_team}`;
    const scraped = scrapedData[matchKey] || {};
    
    // Calculate calibrated probabilities using our logistic model
    const calibrated = calibrateProbabilities(
      event.home_team_stats,
      event.away_team_stats,
      event.markets
    );
    
    return {
      event_id: event.event_id,
      sport: event.sport,
      league: event.league,
      home_team: event.home_team,
      away_team: event.away_team,
      start_time_aedt: event.start_time_aedt,
      // Enhanced structured stats
      home_team_stats: event.home_team_stats,
      away_team_stats: event.away_team_stats,
      rating_differential: (event.home_team_stats?.team_rating || 1500) - (event.away_team_stats?.team_rating || 1500),
      // PRE-CALIBRATED PROBABILITIES (MUST USE THESE)
      calibrated_probabilities: {
        home_win: calibrated.homeWin,
        draw: calibrated.draw,
        away_win: calibrated.awayWin,
        over_2_5: calibrated.over25,
        under_2_5: calibrated.under25,
        btts_yes: calibrated.bttsYes,
        btts_no: calibrated.bttsNo,
        calibration_rationale: calibrated.rationale
      },
      // Scraped qualitative data
      scraped_data: scraped.summary || 'No scraped data available',
      // Market odds with movement
      markets: event.markets
    };
  });

  // Updated prompt with MANDATORY calibrated probabilities
  const systemPrompt = `You are an institutional-grade sports betting analyst and quantitative decision engine (v3.0 CALIBRATED).

CRITICAL CONSTRAINT: You MUST USE the pre-calculated "calibrated_probabilities" provided for each event.
These probabilities have been computed using a logistic regression model blended with sharp book implied probabilities.
DO NOT invent your own probabilities - use the calibrated values EXACTLY.

DATA PROVIDED PER EVENT:
- calibrated_probabilities.home_win: USE THIS as model probability for home win bets
- calibrated_probabilities.away_win: USE THIS as model probability for away win bets
- calibrated_probabilities.over_2_5: USE THIS for Over 2.5 bets
- calibrated_probabilities.under_2_5: USE THIS for Under 2.5 bets
- calibrated_probabilities.btts_yes: USE THIS for BTTS Yes bets
- calibrated_probabilities.btts_no: USE THIS for BTTS No bets
- calibration_rationale: Explains how the probability was derived

STEP 1: EDGE CALCULATION
For each market, calculate:
edge = calibrated_probability - (1 / odds_decimal)

IMPORTANT THRESHOLDS:
- Minimum edge for "high" confidence: +5%
- Minimum edge for "medium" confidence: +3%
- Do NOT recommend bets with edge < 3%

STEP 2: BET SCORE FORMULA
bet_score = 50 + (edge * 150) + data_quality_bonus + steam_alignment_bonus - fatigue_penalty - correlation_penalty

Where:
- edge * 150: A 5% edge = +7.5 points (NOT +10)
- data_quality_bonus: +5 if stats_complete, +3 if form available
- steam_alignment_bonus: +3 if bet aligns with steam_move direction
- fatigue_penalty: -3 if matches_last_7_days > 2
- correlation_penalty: -5 per excess bet in same league (max 2)

REALISTIC SCORE RANGES:
- 70-75: Marginal edge (3-4%), proceed with caution
- 75-80: Good edge (4-6%), solid bet
- 80-85: Strong edge (6-8%), high confidence
- 85+: Exceptional (rare, requires 8%+ edge)

CONFIDENCE MAPPING:
- "high": edge >= 5% AND bet_score >= 78
- "medium": edge 3-5% AND bet_score 70-77

STAKE SIZING (Fractional Kelly 25%):
stake_units = 0.25 * edge / (odds_decimal - 1)
Clamp to: min 0.25u, max 1.5u

PORTFOLIO CONSTRAINTS:
- Maximum 2 bets per league
- Maximum 3 bets in same 2-hour window
- Only return bets with bet_score >= 70

Return VALID JSON ONLY.`;

  const userPrompt = `CONTEXT:
{
  "timezone": "Australia/Sydney",
  "now_aedt": "${context.now_aedt}",
  "bankroll_units": ${context.bankroll_units},
  "max_daily_exposure_pct": ${context.max_daily_exposure_pct},
  "max_per_event_exposure_pct": ${context.max_per_event_exposure_pct},
  "max_bets": ${context.max_bets},
  "engine": "${context.engine}",
  "min_bet_score": 70,
  "max_per_league": 2,
  "calibration_version": "v3.0_logistic"
}

EVENTS WITH PRE-CALIBRATED PROBABILITIES:
${JSON.stringify(eventsPayload, null, 2)}

INSTRUCTIONS:
1. For each event, compare calibrated_probabilities against market implied probabilities
2. Calculate edge using the CALIBRATED probability (not your own estimate)
3. Only recommend bets where edge >= 3%
4. Apply bet score formula strictly
5. Respect portfolio constraints (2 per league max)
6. Return 0-5 bets (empty array is acceptable if no value found)

Return JSON:
{
  "recommended_bets": [
    {
      "event_id": "string",
      "market_id": "string (from markets array)",
      "sport": "string",
      "league": "string",
      "selection": "home|away|draw|over|under|btts_yes|btts_no",
      "selection_label": "Team Name to Win | Over 2.5 Goals | etc",
      "odds_decimal": number,
      "bookmaker": "string",
      "model_probability": number (FROM calibrated_probabilities),
      "implied_probability": number (1/odds),
      "edge": number (model - implied),
      "bet_score": number (calculated per formula),
      "confidence": "high" | "medium",
      "recommended_stake_units": number,
      "steam_move": boolean,
      "correlation_penalty": number,
      "rationale": "Cite specific calibrated probability, rating diff, xG data"
    }
  ],
  "portfolio_summary": {
    "total_stake_units": number,
    "expected_ev_units": number,
    "league_distribution": {}
  }
}`;

  console.log('Sending calibrated data to Perplexity (v3.0)...');
  console.log('Perplexity key present:', !!perplexityApiKey, 'length:', (perplexityApiKey || '').length);

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityApiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // Some API gateways are stricter without a UA and may respond with HTML.
      'User-Agent': 'LovableCloud/1.0 (run-betting-model)',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 4000
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Perplexity API error:', errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const citations = data.citations || [];

  console.log(`Perplexity responded with ${citations.length} citations`);

  if (!content) {
    throw new Error('No content in Perplexity response');
  }

  console.log('Perplexity raw content preview:', content.substring(0, 600));

  let jsonContent = content.trim();

  // Extract JSON from markdown code blocks
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  }

  // Find the JSON object boundaries
  const jsonStart = jsonContent.indexOf('{');
  const jsonEnd = jsonContent.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
  }

  // Clean up common JSON issues from LLM responses
  // Remove trailing commas before ] or }
  jsonContent = jsonContent.replace(/,(\s*[\]\}])/g, '$1');
  // Remove any control characters
  jsonContent = jsonContent.replace(/[\x00-\x1F\x7F]/g, ' ');
  
  try {
    const parsed = JSON.parse(jsonContent.trim());
    console.log('Perplexity parsed keys:', Object.keys(parsed || {}));
    console.log('Perplexity recommended_bets count:', Array.isArray(parsed?.recommended_bets) ? parsed.recommended_bets.length : 'n/a');
    return parsed;
  } catch (parseError) {
    console.error('JSON parse failed, attempting recovery...');
    console.error('Raw content causing error:', jsonContent.substring(0, 1000));
    
    // Try to extract just the recommended_bets array
    const betsMatch = jsonContent.match(/"recommended_bets"\s*:\s*(\[[\s\S]*?\])/);
    if (betsMatch) {
      try {
        const betsArray = JSON.parse(betsMatch[1].replace(/,(\s*[\]\}])/g, '$1'));
        console.log('Recovered recommended_bets array with', betsArray.length, 'bets');
        return {
          recommended_bets: betsArray,
          portfolio_summary: { total_stake_units: 0, expected_ev_units: 0, league_distribution: {} }
        };
      } catch (e) {
        console.error('Recovery failed:', e);
      }
    }
    throw parseError;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

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

    console.log('=== BETTING MODEL v2.0 START ===');
    console.log('Input:', { sports, window_hours, max_bets });

    // STEP 1: Query events and odds from database
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
          events_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`STEP 1: Found ${events.length} events`);

    // TENNIS PATH: Use enhanced stats-based model
    const isTennisOnly = sports.length === 1 && sports[0] === 'tennis';
    if (isTennisOnly) {
      console.log('TENNIS MODE: Fetching player stats via scrape-tennis-data...');
      
      // Build eventsWithOdds for tennis
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

      // Try to get enriched stats
      let enrichments: Record<string, any> = {};
      try {
        const matchesToEnrich = tennisEventsWithOdds.slice(0, 10).map(e => ({
          event_id: e.event_id,
          home_team: e.home_team,
          away_team: e.away_team,
          league: e.league,
        }));
        
        const enrichResponse = await supabase.functions.invoke('scrape-tennis-data', {
          body: { matches: matchesToEnrich }
        });
        
        if (enrichResponse.data?.enrichments) {
          enrichments = enrichResponse.data.enrichments;
          console.log(`TENNIS: Got stats for ${Object.keys(enrichments).length} matches`);
        }
      } catch (err) {
        console.log('TENNIS: Stats fetch failed, using odds-only fallback', err);
      }

      const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
      
      // Use enhanced model if we have enrichments, otherwise fallback
      const hasEnrichments = Object.keys(enrichments).length > 0;
      const result = hasEnrichments
        ? buildTennisBetsEnhanced(tennisEventsWithOdds, enrichments, bankroll_units, maxDailyUnits, max_bets)
        : { ...buildTennisBetsFromOdds(tennisEventsWithOdds, bankroll_units, maxDailyUnits, max_bets), model: 'tennis_odds_only_v1' };
      
      console.log(`TENNIS: Analyzed ${result.eventsAnalyzed} events, found ${result.bets.length} value bets (model: ${result.model})`);
      
      return new Response(
        JSON.stringify({
          recommended_bets: result.bets,
          reason: result.bets.length === 0 
            ? `No tennis value edges found. Analyzed ${result.eventsAnalyzed} events but none had sufficient edge (>=2%).` 
            : undefined,
          events_analyzed: result.eventsAnalyzed,
          events_fetched: tennisEventsWithOdds.length,
          model: result.model,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // TEAM SPORTS PATH: Need stats scraping
    // STEP 2: Call scrape-match-data to get enhanced stats
    console.log('STEP 2: Fetching enhanced stats via scrape-match-data...');
    
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

    // STEP 3: Also scrape with Firecrawl for qualitative data
    console.log('STEP 3: Scraping qualitative data with Firecrawl...');
    
    const teamsToScrape = events.map(e => ({
      home: e.home_team,
      away: e.away_team,
      league: e.league,
      sport: e.sport
    }));

    const scrapedData = await scrapeMatchData(teamsToScrape, firecrawlApiKey);
    console.log(`Scraped qualitative data for ${Object.keys(scrapedData).length} matches`);

    // STEP 4: Merge events with enhanced stats
    const eventsWithOdds = events.map(event => {
      // Find enhanced stats from scrape-match-data
      const enhanced = enhancedEventData.find((e: any) => 
        e.match === `${event.home_team} vs ${event.away_team}`
      );
      
      // Get best odds for each selection
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
        // keep raw markets for odds-only models (e.g., tennis)
        _raw_markets: event.markets || [],
        // Enhanced team stats
        home_team_stats: enhanced?.home_team_stats || null,
        away_team_stats: enhanced?.away_team_stats || null,
        // Markets with best odds
        markets: Object.entries(bestOdds).map(([key, data]) => {
          const [marketType, selection] = key.split('_');
          const enhancedOdds = enhanced?.odds?.find((o: any) => o.selection === selection);
          return {
            market_id: data.market_id,
            type: marketType === 'h2h' ? 'moneyline' : marketType,
            selection,
            odds_decimal: data.odds,
            bookmaker: data.bookmaker,
            implied_probability: (1 / data.odds).toFixed(4),
            steam_move: enhancedOdds?.steam_move || false,
            odds_movement: enhancedOdds?.odds_movement
          };
        })
      };
    });

    // Filter to only events with complete stats - STRICT DATA GOVERNANCE
    const eventsWithCompleteStats = eventsWithOdds.filter(e => 
      e.home_team_stats?.stats_complete && e.away_team_stats?.stats_complete
    );

    console.log(`STEP 4: ${eventsWithCompleteStats.length}/${eventsWithOdds.length} events have complete stats`);

    const maxDailyUnits = bankroll_units * max_daily_exposure_pct;

    // Note: Tennis is handled earlier in the "TENNIS FAST PATH" section

    // STRICT ENFORCEMENT for team sports: Do NOT fall back to incomplete data
    // This ensures Find Bets only analyzes the same events that Scrape Data Only returns
    if (eventsWithCompleteStats.length === 0) {
      console.log('NO events with complete stats - cannot proceed with betting analysis');
      return new Response(
        JSON.stringify({
          recommended_bets: [],
          reason: `No events passed data quality filter. ${eventsWithOdds.length} events found but 0 have complete stats (league position, form, goals data from API-Football). Run "Scrape Data Only" first to see which matches have sufficient data.`,
          events_analyzed: 0,
          events_fetched: eventsWithOdds.length,
          data_quality_issue: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventsForAnalysis = eventsWithCompleteStats;

    // STEP 5: Send to Perplexity for analysis
    console.log('STEP 5: Sending to Perplexity for quantitative analysis...');
    
    const nowAEDT = getNowAEDT();
    
    const modelResponse = await analyzeWithPerplexity(
      eventsForAnalysis,
      scrapedData,
      {
        now_aedt: nowAEDT,
        bankroll_units,
        max_daily_exposure_pct,
        max_per_event_exposure_pct,
        max_bets,
        engine
      },
      perplexityApiKey
    );

    console.log('STEP 5: Perplexity analysis complete');

    // STEP 6: Validate, apply correlation penalties, enforce limits
    const MIN_BET_SCORE = 70;
    const MAX_PER_LEAGUE = 2;
    const maxPerEventUnits = bankroll_units * max_per_event_exposure_pct;
    
    let totalStake = 0;
    const validatedBets: RecommendedBet[] = [];
    const rejectedBets: { selection: string; bet_score: number; reason: string }[] = [];
    const leagueCounts: Record<string, number> = {};

    for (const bet of modelResponse.recommended_bets || []) {
      // STRICT FILTER 1: Bet Score >= 70
      if ((bet.bet_score || 0) < MIN_BET_SCORE) {
        rejectedBets.push({ 
          selection: bet.selection_label || bet.selection, 
          bet_score: bet.bet_score || 0, 
          reason: `Bet Score ${bet.bet_score} < ${MIN_BET_SCORE}` 
        });
        continue;
      }
      
      // STRICT FILTER 2: Max per league
      const leagueCount = leagueCounts[bet.league] || 0;
      if (leagueCount >= MAX_PER_LEAGUE) {
        rejectedBets.push({ 
          selection: bet.selection_label || bet.selection, 
          bet_score: bet.bet_score || 0, 
          reason: `League cap: already have ${MAX_PER_LEAGUE} bets in ${bet.league}` 
        });
        continue;
      }
      
      // Apply correlation penalty if applicable
      const correlationPenalty = calculateCorrelationPenalty(bet, validatedBets);
      const adjustedBetScore = (bet.bet_score || 0) - correlationPenalty;
      
      if (adjustedBetScore < MIN_BET_SCORE) {
        rejectedBets.push({ 
          selection: bet.selection_label || bet.selection, 
          bet_score: adjustedBetScore, 
          reason: `Correlation penalty dropped score from ${bet.bet_score} to ${adjustedBetScore}` 
        });
        continue;
      }
      
      const cappedStake = Math.min(bet.recommended_stake_units || 0.5, maxPerEventUnits);
      if (totalStake + cappedStake > maxDailyUnits) continue;
      if (validatedBets.length >= max_bets) break;
      
      const event = events.find(e => e.id === bet.event_id);
      
      totalStake += cappedStake;
      leagueCounts[bet.league] = (leagueCounts[bet.league] || 0) + 1;
      
      validatedBets.push({ 
        ...bet, 
        event_name: event ? `${event.home_team} vs ${event.away_team}` : bet.selection_label,
        start_time: event?.start_time_aedt || '',
        recommended_stake_units: cappedStake,
        confidence: bet.confidence || (bet.bet_score >= 80 ? 'high' : 'medium'),
        correlation_penalty: correlationPenalty > 0 ? -correlationPenalty : 0
      });
    }

    console.log(`STEP 6: ${rejectedBets.length} bets rejected, ${validatedBets.length} passed`);
    console.log('League distribution:', leagueCounts);

    // STEP 7: Save to database
    if (userId && validatedBets.length > 0) {
      const betsToInsert = validatedBets.map(bet => {
        const event = events.find(e => e.id === bet.event_id);
        return {
          user_id: userId,
          event_id: bet.event_id,
          market_id: bet.market_id,
          sport: bet.sport,
          league: bet.league,
          event_name: event ? `${event.home_team} vs ${event.away_team}` : bet.selection_label,
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
        };
      });

      await supabase.from('model_bets').insert(betsToInsert);
      console.log(`Saved ${betsToInsert.length} bets to database`);
    }

    console.log('=== BETTING MODEL v2.0 COMPLETE ===');

    return new Response(
      JSON.stringify({
        recommended_bets: validatedBets,
        rejected_bets: rejectedBets,
        portfolio_summary: {
          total_stake_units: totalStake,
          bankroll_units,
          expected_value_units: validatedBets.reduce((sum, bet) => 
            sum + ((bet.edge || 0) * (bet.recommended_stake_units || 0)), 0),
          league_distribution: leagueCounts
        },
        events_analyzed: events.length,
        events_with_complete_stats: eventsWithCompleteStats.length,
        matches_scraped: Object.keys(scrapedData).length,
        min_bet_score: MIN_BET_SCORE,
        max_per_league: MAX_PER_LEAGUE,
        reason: validatedBets.length === 0 
          ? `No bets met criteria. ${rejectedBets.length} rejected (score < ${MIN_BET_SCORE} or league cap).` 
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
