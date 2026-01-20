import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= ENHANCED INTERFACES (v3.0) =============

interface InjuryInfo {
  player: string;
  type: string; // 'Missing Fixture', 'Doubtful', 'Injured'
  tier: 'starter' | 'rotation' | 'fringe'; // Importance level
  position: 'GK' | 'DEF' | 'MID' | 'FWD' | 'unknown';
}

interface SetPieceStats {
  goals_from_set_pieces?: number;
  xg_from_set_pieces?: number;
  goals_from_open_play?: number;
  xg_from_open_play?: number;
}

interface GameStateRecord {
  when_leading: { wins: number; draws: number; losses: number; ppg: number };
  when_drawing: { wins: number; draws: number; losses: number; ppg: number };
  when_trailing: { wins: number; draws: number; losses: number; ppg: number };
}

interface TeamStats {
  team: string;
  team_id?: number;
  league_id?: number;
  season?: number;
  league_position?: number;
  points_per_game?: number;
  recent_form?: string; // W/D/L sequence
  goals_scored_last_5?: number;
  goals_conceded_last_5?: number;
  // xG metrics
  xg_for_last_5?: number;
  xg_against_last_5?: number;
  xg_difference?: number;
  home_xg_for?: number;
  home_xg_against?: number;
  away_xg_for?: number;
  away_xg_against?: number;
  // NEW v3.0: Non-penalty xG (attack/defence split)
  npxg_for_season?: number;
  npxg_against_season?: number;
  npxg_for_last_5?: number;
  npxg_against_last_5?: number;
  // NEW v3.0: Shot metrics
  shots_per_game?: number;
  shots_on_target_per_game?: number;
  shots_conceded_per_game?: number;
  big_chances_created_per_game?: number;
  big_chances_conceded_per_game?: number;
  // NEW v3.0: Style tags
  style_tags?: string[]; // e.g., 'high_press', 'low_block', 'possession', 'direct'
  // Schedule congestion
  matches_last_7_days?: number;
  matches_last_14_days?: number;
  // Team rating (Elo-style)
  team_rating?: number;
  // Home/Away records
  home_record?: string; // W-D-L
  away_record?: string;
  home_goals_for?: number;
  home_goals_against?: number;
  away_goals_for?: number;
  away_goals_against?: number;
  days_rest?: number;
  // NEW v3.0: Enhanced injury info with tiering
  injuries?: InjuryInfo[];
  injuries_summary?: string; // Legacy flat string for output
  missing_by_position?: { DEF: number; MID: number; FWD: number };
  // NEW v3.0: Set piece stats
  set_piece_stats?: SetPieceStats;
  // NEW v3.0: Game state record
  game_state_record?: GameStateRecord;
  // Qualitative tags (now includes contextual tags)
  qualitative_tags?: string[];
  // NEW v3.0: Match-specific contextual tags
  contextual_tags?: string[];
  stats_complete: boolean;
  missing_fields?: string[];
}

interface MarketOdds {
  market: string;
  selection: string;
  odds: number;
  opening_odds?: number;
  odds_movement?: number; // percentage change
  steam_move?: boolean;
  implied_probability: string;
  bookmaker: string;
  // NEW v3.0: Book classification
  is_sharp_book?: boolean;
}

interface MarketStructure {
  market_type: string;
  overround: number;
  sharp_consensus?: number; // avg odds from sharp books
  soft_consensus?: number; // avg odds from soft books
  sharp_soft_diff?: number; // % difference
}

interface MatchData {
  match: string;
  sport: string;
  league: string;
  league_id?: number;
  start_time: string;
  home_team_stats: TeamStats;
  away_team_stats: TeamStats;
  stats_incomplete: boolean;
  incomplete_reason?: string;
  odds: MarketOdds[];
  // NEW v3.0: Market structure analysis
  market_structures?: MarketStructure[];
  // NEW v3.0: Match-level contextual tags
  match_contextual_tags?: string[];
}

// ============= CONSTANTS =============

// Sharp vs Soft book classification
const SHARP_BOOKS = new Set(['pinnacle', 'betfair', 'betfair_ex_au', 'matchbook', 'sbo']);
const SOFT_BOOKS = new Set(['bet365', 'ladbrokes', 'sportsbet', 'neds', 'pointsbet', 'unibet']);

// API-Football league ID mapping
const TIER_1_LEAGUES: Record<string, number> = {
  'English Premier League': 39, 'EPL': 39, 'Premier League': 39,
  'La Liga': 140, 'La Liga - Spain': 140, 'Spain La Liga': 140,
  'Bundesliga': 78, 'German Bundesliga': 78,
  'Serie A': 135, 'Italy Serie A': 135,
  'Ligue 1': 61, 'France Ligue 1': 61,
};

const TIER_2_LEAGUES: Record<string, number> = {
  'Champions League': 2, 'UEFA Champions League': 2,
  'Europa League': 3, 'UEFA Europa League': 3,
  'Copa Libertadores': 13, 'Copa Sudamericana': 14,
  'Argentina Primera División': 128, 'Liga Profesional Argentina': 128, 'Primera División - Argentina': 128,
  'A-League': 188, 'Australia A-League': 188, 'A-League Men': 188,
  'Brazil Série A': 71, 'Brasileirão': 71,
  'Austrian Football Bundesliga': 218, 'Belgium First Div': 144, 'Primera División - Chile': 265,
};

const LEAGUE_IDS: Record<string, number> = {
  ...TIER_1_LEAGUES, ...TIER_2_LEAGUES,
  'MLS': 253, 'Eredivisie': 88, 'Primeira Liga': 94,
};

const MAJOR_LEAGUES = new Set([39, 2, 3, 140, 78, 135, 61]); // Extended to all Tier 1

// ============= HELPER FUNCTIONS =============

function getSeasonForLeague(leagueId: number): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const calendarYearLeagues = new Set([128, 71, 265, 253]); // Argentina, Brazil, Chile, MLS
  if (calendarYearLeagues.has(leagueId)) return year;
  return month < 7 ? year - 1 : year;
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|club)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLeagueTeams(
  leagueId: number,
  season: number,
  apiKey: string
): Promise<Map<string, number>> {
  const res = await fetch(
    `https://v3.football.api-sports.io/teams?league=${leagueId}&season=${season}`,
    { headers: { 'x-apisports-key': apiKey } }
  );

  if (!res.ok) {
    console.error(`teams endpoint failed league=${leagueId} season=${season} status=${res.status}`);
    return new Map();
  }

  const data = await res.json();
  const map = new Map<string, number>();

  for (const item of data.response || []) {
    const team = item.team;
    if (team?.id && team?.name) {
      map.set(normalizeTeamName(team.name), team.id);
    }
  }

  return map;
}

// Calculate Elo-style team rating with enhanced metrics
function calculateTeamRating(stats: TeamStats): number {
  const baseRating = 1500;
  
  const positionBonus = stats.league_position ? Math.max(0, (20 - stats.league_position) * 10) : 0;
  const ppgBonus = (stats.points_per_game || 1.0) * 50;
  const goalDiff = (stats.goals_scored_last_5 || 0) - (stats.goals_conceded_last_5 || 0);
  const goalDiffBonus = goalDiff * 15;
  const xgDiff = stats.xg_difference || 0;
  const xgDiffBonus = xgDiff * 25;
  
  // NEW: npxG bonus (more reliable than raw xG)
  const npxgDiff = (stats.npxg_for_last_5 || 0) - (stats.npxg_against_last_5 || 0);
  const npxgBonus = npxgDiff * 20;
  
  // NEW: Big chances differential
  const bigChanceDiff = (stats.big_chances_created_per_game || 0) - (stats.big_chances_conceded_per_game || 0);
  const bigChanceBonus = bigChanceDiff * 30;
  
  let formBonus = 0;
  if (stats.recent_form) {
    for (const r of stats.recent_form) {
      if (r === 'W') formBonus += 10;
      else if (r === 'L') formBonus -= 10;
    }
  }
  
  const fatiguePenalty = (stats.matches_last_7_days || 0) > 2 ? -30 : 0;
  
  // NEW: Injury impact penalty
  const keyMissingCount = stats.missing_by_position 
    ? (stats.missing_by_position.DEF + stats.missing_by_position.MID + stats.missing_by_position.FWD) 
    : 0;
  const injuryPenalty = keyMissingCount * -15;
  
  return Math.round(baseRating + positionBonus + ppgBonus + goalDiffBonus + xgDiffBonus + npxgBonus + bigChanceBonus + formBonus + fatiguePenalty + injuryPenalty);
}

function validateTeamStats(stats: TeamStats): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (stats.league_position === undefined) missing.push('league_position');
  if (stats.points_per_game === undefined) missing.push('points_per_game');
  if (!stats.recent_form || stats.recent_form.length < 3) missing.push('recent_form');
  if (stats.goals_scored_last_5 === undefined) missing.push('goals_scored_last_5');
  if (stats.goals_conceded_last_5 === undefined) missing.push('goals_conceded_last_5');
  if (!stats.home_record || stats.home_record === '0-0-0') missing.push('home_record');
  if (!stats.away_record || stats.away_record === '0-0-0') missing.push('away_record');
  if (stats.days_rest === undefined) missing.push('days_rest');
  
  return { valid: missing.length === 0, missing };
}

// NEW: Infer player position from name/context
function inferPosition(playerName: string, playerRole?: string): 'GK' | 'DEF' | 'MID' | 'FWD' | 'unknown' {
  const name = (playerName + ' ' + (playerRole || '')).toLowerCase();
  if (name.includes('goalkeeper') || name.includes('gk')) return 'GK';
  if (name.includes('defender') || name.includes('back') || name.includes('cb') || name.includes('lb') || name.includes('rb')) return 'DEF';
  if (name.includes('midfielder') || name.includes('mid') || name.includes('dm') || name.includes('cm') || name.includes('am')) return 'MID';
  if (name.includes('forward') || name.includes('striker') || name.includes('winger') || name.includes('fw') || name.includes('cf')) return 'FWD';
  return 'unknown';
}

// NEW: Infer player tier from minutes/appearances
function inferPlayerTier(gamesPlayed: number, totalGames: number): 'starter' | 'rotation' | 'fringe' {
  const ratio = gamesPlayed / Math.max(totalGames, 1);
  if (ratio >= 0.7) return 'starter';
  if (ratio >= 0.3) return 'rotation';
  return 'fringe';
}

// NEW: Generate contextual tags for a match
function generateContextualTags(
  homeTeam: string, 
  awayTeam: string, 
  league: string,
  homeStats: TeamStats,
  awayStats: TeamStats
): string[] {
  const tags: string[] = [];
  
  // Derby detection (simple heuristics)
  const derbyPairs = [
    ['manchester united', 'manchester city'],
    ['liverpool', 'everton'],
    ['arsenal', 'tottenham'],
    ['real madrid', 'barcelona'],
    ['barcelona', 'atletico madrid'],
    ['inter', 'milan'],
    ['juventus', 'inter'],
    ['bayern', 'dortmund'],
    ['psg', 'marseille'],
    ['river plate', 'boca juniors'],
    ['sydney fc', 'western sydney'],
  ];
  
  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();
  
  for (const [t1, t2] of derbyPairs) {
    if ((homeLower.includes(t1) && awayLower.includes(t2)) || 
        (homeLower.includes(t2) && awayLower.includes(t1))) {
      tags.push('derby');
      break;
    }
  }
  
  // Title race / relegation battle
  if (homeStats.league_position && awayStats.league_position) {
    if (homeStats.league_position <= 4 && awayStats.league_position <= 4) {
      tags.push('title_clash');
    }
    if (homeStats.league_position >= 17 || awayStats.league_position >= 17) {
      tags.push('relegation_6pointer');
    }
  }
  
  // Must-win scenarios
  if (homeStats.qualitative_tags?.includes('poor_form') || awayStats.qualitative_tags?.includes('poor_form')) {
    tags.push('must_win');
  }
  
  // Long travel (A-League, Copa Libertadores)
  if (league.includes('A-League') || league.includes('Libertadores')) {
    tags.push('travel_factor');
  }
  
  // Fatigue mismatch
  const homeFatigue = (homeStats.matches_last_7_days || 0) >= 3;
  const awayFatigue = (awayStats.matches_last_7_days || 0) >= 3;
  if (homeFatigue !== awayFatigue) {
    tags.push('fatigue_mismatch');
  }
  
  // Injury crisis flag
  if (homeStats.qualitative_tags?.includes('injury_crisis') || awayStats.qualitative_tags?.includes('injury_crisis')) {
    tags.push('injury_crisis_involved');
  }
  
  return tags;
}

// NEW: Calculate market overround and structure
function analyzeMarketStructure(odds: MarketOdds[]): MarketStructure[] {
  const marketGroups = new Map<string, MarketOdds[]>();
  
  for (const o of odds) {
    const key = o.market;
    if (!marketGroups.has(key)) marketGroups.set(key, []);
    marketGroups.get(key)!.push(o);
  }
  
  const structures: MarketStructure[] = [];
  
  for (const [marketType, marketOdds] of marketGroups) {
    // Calculate overround from best odds per selection
    const selectionBestOdds = new Map<string, number>();
    const sharpOdds: number[] = [];
    const softOdds: number[] = [];
    
    for (const o of marketOdds) {
      const current = selectionBestOdds.get(o.selection) || 0;
      if (o.odds > current) selectionBestOdds.set(o.selection, o.odds);
      
      if (o.is_sharp_book) sharpOdds.push(o.odds);
      else softOdds.push(o.odds);
    }
    
    const impliedProbs = Array.from(selectionBestOdds.values()).map(o => 1 / o);
    const overround = (impliedProbs.reduce((a, b) => a + b, 0) - 1) * 100;
    
    const sharpConsensus = sharpOdds.length > 0 ? sharpOdds.reduce((a, b) => a + b, 0) / sharpOdds.length : undefined;
    const softConsensus = softOdds.length > 0 ? softOdds.reduce((a, b) => a + b, 0) / softOdds.length : undefined;
    
    let sharpSoftDiff: number | undefined;
    if (sharpConsensus && softConsensus) {
      sharpSoftDiff = ((softConsensus - sharpConsensus) / sharpConsensus) * 100;
    }
    
    structures.push({
      market_type: marketType,
      overround: Number(overround.toFixed(2)),
      sharp_consensus: sharpConsensus ? Number(sharpConsensus.toFixed(2)) : undefined,
      soft_consensus: softConsensus ? Number(softConsensus.toFixed(2)) : undefined,
      sharp_soft_diff: sharpSoftDiff ? Number(sharpSoftDiff.toFixed(2)) : undefined,
    });
  }
  
  return structures;
}

// ============= MAIN FETCH FUNCTION =============

async function fetchTeamStats(
  teamName: string,
  leagueName: string,
  apiKey: string,
  leagueTeamsCache: Map<string, Promise<Map<string, number>>>
): Promise<TeamStats> {
  const leagueId = LEAGUE_IDS[leagueName] || null;
  const season = leagueId ? getSeasonForLeague(leagueId) : new Date().getFullYear();
  
  const stats: TeamStats = {
    team: teamName,
    league_id: leagueId || undefined,
    season,
    stats_complete: false,
    missing_fields: [],
    injuries: [],
    style_tags: [],
    qualitative_tags: [],
    contextual_tags: [],
  };

  if (!leagueId) {
    console.log(`Unknown league: ${leagueName} - cannot fetch stats`);
    stats.missing_fields = ['league_id_unknown'];
    return stats;
  }

  try {
    // Prefer league+season team list for accurate IDs
    const cacheKey = `${leagueId}:${season}`;
    if (!leagueTeamsCache.has(cacheKey)) {
      leagueTeamsCache.set(cacheKey, fetchLeagueTeams(leagueId, season, apiKey));
    }

    const leagueTeams = await leagueTeamsCache.get(cacheKey)!;
    const normalized = normalizeTeamName(teamName);
    let teamId = leagueTeams.get(normalized);

    // Fallback: try loose contains match
    if (!teamId) {
      for (const [k, v] of leagueTeams.entries()) {
        if (k.includes(normalized) || normalized.includes(k)) {
          teamId = v;
          break;
        }
      }
    }

    // Final fallback: global search
    if (!teamId) {
      const searchRes = await fetch(
        `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(teamName)}`,
        { headers: { 'x-apisports-key': apiKey } }
      );
      const searchData = await searchRes.json();
      const candidates = (searchData.response || []).map((r: any) => r.team).filter(Boolean);
      const best = candidates.find((t: any) => normalizeTeamName(t.name) === normalized) || candidates[0];
      teamId = best?.id;
    }

    if (!teamId) {
      console.log(`Team not found: ${teamName} in ${leagueName} season ${season}`);
      stats.missing_fields = ['team_not_found'];
      return stats;
    }

    stats.team_id = teamId;
    console.log(`Resolved team: ${teamName} -> ID ${teamId} | league ${leagueName} (${leagueId}) season ${season}`);

    // Fetch standings
    const seasonCandidates = Array.from(new Set([season, season - 1].filter((y) => y > 2000)));

    let teamStanding: any = null;
    let usedStandingsSeason: number | null = null;
    let totalLeagueGames = 0;

    for (const sYear of seasonCandidates) {
      const standingsRes = await fetch(
        `https://v3.football.api-sports.io/standings?league=${leagueId}&season=${sYear}`,
        { headers: { 'x-apisports-key': apiKey } }
      );
      const standingsData = await standingsRes.json();
      const standings = standingsData.response?.[0]?.league?.standings;
      const allStandings = Array.isArray(standings?.[0]) ? standings.flat() : standings || [];

      const found = allStandings.find((st: any) => st.team?.id === teamId);
      if (found) {
        teamStanding = found;
        usedStandingsSeason = sYear;
        totalLeagueGames = found.all?.played || 0;
        break;
      }
    }

    if (usedStandingsSeason !== null) {
      stats.season = usedStandingsSeason;
    }

    if (teamStanding) {
      stats.league_position = teamStanding.rank;
      const played = teamStanding.all?.played || 1;
      stats.points_per_game = Number((teamStanding.points / played).toFixed(2));
      stats.recent_form = teamStanding.form?.slice(-5) || '';

      const home = teamStanding.home || {};
      stats.home_record = `${home.win || 0}-${home.draw || 0}-${home.lose || 0}`;
      stats.home_goals_for = home.goals?.for || 0;
      stats.home_goals_against = home.goals?.against || 0;

      const away = teamStanding.away || {};
      stats.away_record = `${away.win || 0}-${away.draw || 0}-${away.lose || 0}`;
      stats.away_goals_for = away.goals?.for || 0;
      stats.away_goals_against = away.goals?.against || 0;
    }

    // Fetch last 10 fixtures for enhanced metrics
    const fixturesRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=10`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.response || [];

    if (fixtures.length > 0) {
      let goalsFor = 0, goalsAgainst = 0;
      let xgFor = 0, xgAgainst = 0;
      let lastMatchDate: Date | null = null;
      const formResults: string[] = [];
      
      const now = Date.now();
      let matchesLast7Days = 0, matchesLast14Days = 0;
      
      // NEW: Track game state records
      let leadingWins = 0, leadingDraws = 0, leadingLosses = 0;
      let drawingWins = 0, drawingDraws = 0, drawingLosses = 0;
      let trailingWins = 0, trailingDraws = 0, trailingLosses = 0;
      
      for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];
        const fixtureDate = new Date(fixture.fixture?.date);
        const daysSince = Math.floor((now - fixtureDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSince <= 7) matchesLast7Days++;
        if (daysSince <= 14) matchesLast14Days++;
        
        if (i < 5) {
          const isHome = fixture.teams?.home?.id === teamId;
          const teamGoals = isHome ? fixture.goals?.home : fixture.goals?.away;
          const oppGoals = isHome ? fixture.goals?.away : fixture.goals?.home;
          const halfTimeTeam = isHome ? fixture.score?.halftime?.home : fixture.score?.halftime?.away;
          const halfTimeOpp = isHome ? fixture.score?.halftime?.away : fixture.score?.halftime?.home;
          
          goalsFor += teamGoals || 0;
          goalsAgainst += oppGoals || 0;
          
          // Track game state at halftime
          if (halfTimeTeam !== null && halfTimeOpp !== null) {
            if (halfTimeTeam > halfTimeOpp) {
              // Leading at HT
              if (teamGoals > oppGoals) leadingWins++;
              else if (teamGoals === oppGoals) leadingDraws++;
              else leadingLosses++;
            } else if (halfTimeTeam === halfTimeOpp) {
              // Drawing at HT
              if (teamGoals > oppGoals) drawingWins++;
              else if (teamGoals === oppGoals) drawingDraws++;
              else drawingLosses++;
            } else {
              // Trailing at HT
              if (teamGoals > oppGoals) trailingWins++;
              else if (teamGoals === oppGoals) trailingDraws++;
              else trailingLosses++;
            }
          }
          
          if (teamGoals > oppGoals) formResults.push('W');
          else if (teamGoals < oppGoals) formResults.push('L');
          else formResults.push('D');
          
          if (!lastMatchDate || fixtureDate > lastMatchDate) {
            lastMatchDate = fixtureDate;
          }
        }
      }

      stats.goals_scored_last_5 = goalsFor;
      stats.goals_conceded_last_5 = goalsAgainst;
      stats.matches_last_7_days = matchesLast7Days;
      stats.matches_last_14_days = matchesLast14Days;
      
      // Estimate xG (API-Football doesn't always provide xG directly in fixtures)
      const avgXgPerGoal = 0.85;
      stats.xg_for_last_5 = Number((goalsFor * (1 / avgXgPerGoal)).toFixed(2));
      stats.xg_against_last_5 = Number((goalsAgainst * (1 / avgXgPerGoal)).toFixed(2));
      stats.xg_difference = Number((stats.xg_for_last_5 - stats.xg_against_last_5).toFixed(2));
      
      // Estimate npxG (approx 10% of goals are penalties)
      stats.npxg_for_last_5 = Number((stats.xg_for_last_5 * 0.9).toFixed(2));
      stats.npxg_against_last_5 = Number((stats.xg_against_last_5 * 0.9).toFixed(2));
      
      // Home/away xG splits
      stats.home_xg_for = Number(((stats.home_goals_for || 0) * (1 / avgXgPerGoal)).toFixed(2));
      stats.home_xg_against = Number(((stats.home_goals_against || 0) * (1 / avgXgPerGoal)).toFixed(2));
      stats.away_xg_for = Number(((stats.away_goals_for || 0) * (1 / avgXgPerGoal)).toFixed(2));
      stats.away_xg_against = Number(((stats.away_goals_against || 0) * (1 / avgXgPerGoal)).toFixed(2));
      
      if (!stats.recent_form || stats.recent_form.length < 3) {
        stats.recent_form = formResults.reverse().join('');
      }

      if (lastMatchDate) {
        const daysSince = Math.floor((Date.now() - lastMatchDate.getTime()) / (1000 * 60 * 60 * 24));
        stats.days_rest = daysSince;
      }
      
      // NEW: Game state record
      const calcPPG = (w: number, d: number, l: number) => {
        const games = w + d + l;
        return games > 0 ? Number(((w * 3 + d) / games).toFixed(2)) : 0;
      };
      
      stats.game_state_record = {
        when_leading: { wins: leadingWins, draws: leadingDraws, losses: leadingLosses, ppg: calcPPG(leadingWins, leadingDraws, leadingLosses) },
        when_drawing: { wins: drawingWins, draws: drawingDraws, losses: drawingLosses, ppg: calcPPG(drawingWins, drawingDraws, drawingLosses) },
        when_trailing: { wins: trailingWins, draws: trailingDraws, losses: trailingLosses, ppg: calcPPG(trailingWins, trailingDraws, trailingLosses) },
      };
    }

    // Fetch team statistics for shots/big chances
    const teamStatsRes = await fetch(
      `https://v3.football.api-sports.io/teams/statistics?team=${teamId}&league=${leagueId}&season=${stats.season || season}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const teamStatsData = await teamStatsRes.json();
    const teamStatistics = teamStatsData.response;

    if (teamStatistics) {
      const gamesPlayed = teamStatistics.fixtures?.played?.total || 1;
      
      // Shot metrics
      const shotsFor = teamStatistics.shots?.for?.total?.total || 0;
      const shotsOnFor = teamStatistics.shots?.for?.on?.total || 0;
      const shotsAgainst = teamStatistics.shots?.against?.total?.total || 0;
      
      stats.shots_per_game = Number((shotsFor / gamesPlayed).toFixed(1));
      stats.shots_on_target_per_game = Number((shotsOnFor / gamesPlayed).toFixed(1));
      stats.shots_conceded_per_game = Number((shotsAgainst / gamesPlayed).toFixed(1));
      
      // Big chances (estimate from shot conversion if not available)
      const goalsFor = teamStatistics.goals?.for?.total?.total || 0;
      const conversionRate = goalsFor / Math.max(shotsFor, 1);
      stats.big_chances_created_per_game = Number((conversionRate * shotsFor / gamesPlayed * 2).toFixed(1));
      stats.big_chances_conceded_per_game = Number((stats.shots_conceded_per_game * 0.15).toFixed(1));
      
      // Style inference based on possession and pass accuracy
      const possession = teamStatistics.possession?.total;
      const passAccuracy = teamStatistics.passes?.accuracy?.total;
      
      if (possession) {
        const avgPoss = parseInt(possession.replace('%', '')) / gamesPlayed;
        if (avgPoss >= 55) stats.style_tags?.push('possession');
        else if (avgPoss <= 45) stats.style_tags?.push('direct');
      }
      
      // High press indicator (high shots conceded but good defensive record)
      if (stats.shots_conceded_per_game && stats.shots_conceded_per_game > 12) {
        stats.style_tags?.push('high_press');
      } else if (stats.shots_conceded_per_game && stats.shots_conceded_per_game < 9) {
        stats.style_tags?.push('low_block');
      }
      
      // Set piece estimation (approx 30% of goals from set pieces)
      const totalGoals = goalsFor;
      stats.set_piece_stats = {
        goals_from_set_pieces: Math.round(totalGoals * 0.3),
        xg_from_set_pieces: Number((totalGoals * 0.3 * (1 / 0.85)).toFixed(1)),
        goals_from_open_play: Math.round(totalGoals * 0.7),
        xg_from_open_play: Number((totalGoals * 0.7 * (1 / 0.85)).toFixed(1)),
      };
    }

    // Fetch injuries with enhanced info
    const injuriesRes = await fetch(
      `https://v3.football.api-sports.io/injuries?team=${teamId}&season=${stats.season || season}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const injuriesData = await injuriesRes.json();
    const injuries = injuriesData.response || [];
    
    const missingByPosition = { DEF: 0, MID: 0, FWD: 0 };
    
    stats.injuries = injuries.slice(0, 8).map((inj: any) => {
      const position = inferPosition(inj.player?.name || '', inj.player?.type);
      const tier = inferPlayerTier(inj.player?.games || 0, totalLeagueGames);
      
      if (position !== 'GK' && position !== 'unknown') {
        missingByPosition[position]++;
      }
      
      return {
        player: inj.player?.name || 'Unknown',
        type: inj.player?.type || 'injured',
        tier,
        position,
      };
    });
    
    stats.missing_by_position = missingByPosition;
    stats.injuries_summary = stats.injuries?.map(i => `${i.player} (${i.type})`).join(', ') || 'None';

    // Generate qualitative tags
    if (MAJOR_LEAGUES.has(leagueId)) {
      const tags: string[] = [];
      
      if (stats.days_rest && stats.days_rest >= 7) tags.push('rested_squad');
      if (stats.matches_last_7_days && stats.matches_last_7_days >= 3) tags.push('fixture_congestion');
      
      if (stats.recent_form) {
        if (stats.recent_form.startsWith('WWW')) tags.push('hot_streak');
        if (stats.recent_form.startsWith('LLL')) tags.push('poor_form');
      }
      
      const startersMissing = stats.injuries?.filter(i => i.tier === 'starter').length || 0;
      if (startersMissing >= 3) tags.push('injury_crisis');
      else if (startersMissing >= 2) tags.push('key_absences');
      
      if (stats.league_position && stats.league_position <= 4) tags.push('title_contender');
      if (stats.league_position && stats.league_position >= 17) tags.push('relegation_battle');
      
      // Style-based tags
      if (stats.style_tags?.includes('high_press')) tags.push('aggressive_style');
      if (stats.style_tags?.includes('low_block')) tags.push('defensive_style');
      
      stats.qualitative_tags = tags;
    }

    stats.team_rating = calculateTeamRating(stats);

    const validation = validateTeamStats(stats);
    stats.stats_complete = validation.valid;
    stats.missing_fields = validation.missing;

  } catch (error) {
    console.error(`Error fetching stats for ${teamName}:`, error);
    stats.missing_fields = ['api_error'];
  }

  return stats;
}

// ============= MAIN SERVER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiFootballKey = Deno.env.get('API_FOOTBALL_KEY');

    if (!apiFootballKey) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { sports = ['soccer'], window_hours = 72, max_events = 15 } = await req.json();

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
      .limit(Math.max(1, Math.min(max_events, 15)));

    if (eventsError) throw new Error(eventsError.message);
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No upcoming events found. Click "Refresh Odds" first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching API-Football stats for ${events.length} events`);

    // Fetch opening odds from snapshots for CLV calculation
    const eventIds = events.map(e => e.id);
    const { data: snapshots } = await supabase
      .from('odds_snapshots')
      .select('event_id, market_type, selection, odds_decimal, bookmaker, snapshot_time')
      .in('event_id', eventIds)
      .order('snapshot_time', { ascending: true });
    
    // Build opening odds map
    const openingOddsMap = new Map<string, { odds: number; bookmaker: string }>();
    for (const snap of snapshots || []) {
      const key = `${snap.event_id}_${snap.market_type}_${snap.selection}`;
      if (!openingOddsMap.has(key)) {
        openingOddsMap.set(key, { odds: snap.odds_decimal, bookmaker: snap.bookmaker });
      }
    }

    const leagueTeamsCache = new Map<string, Promise<Map<string, number>>>();

    const matchDataPromises = events.map(async (event) => {
      const [homeStats, awayStats] = await Promise.all([
        fetchTeamStats(event.home_team, event.league, apiFootballKey, leagueTeamsCache),
        fetchTeamStats(event.away_team, event.league, apiFootballKey, leagueTeamsCache),
      ]);

      const oddsArray: MarketOdds[] = [];
      const processedSelections = new Set<string>();

      for (const market of event.markets || []) {
        const selectionKey = `${market.market_type}_${market.selection}`;
        const currentOdds = parseFloat(market.odds_decimal);
        const bookmakerLower = (market.bookmaker || '').toLowerCase();
        const isSharp = SHARP_BOOKS.has(bookmakerLower);
        
        if (!processedSelections.has(selectionKey)) {
          processedSelections.add(selectionKey);
          
          // Get opening odds from snapshots
          const openingKey = `${event.id}_${market.market_type}_${market.selection}`;
          const opening = openingOddsMap.get(openingKey);
          const openingOdds = opening?.odds;
          const oddsMovement = openingOdds ? ((currentOdds - openingOdds) / openingOdds) * 100 : undefined;
          const steamMove = oddsMovement !== undefined && Math.abs(oddsMovement) > 5;
          
          oddsArray.push({
            market: market.market_type,
            selection: market.selection,
            odds: currentOdds,
            opening_odds: openingOdds,
            odds_movement: oddsMovement ? Number(oddsMovement.toFixed(1)) : undefined,
            steam_move: steamMove,
            implied_probability: (1 / currentOdds * 100).toFixed(1) + '%',
            bookmaker: market.bookmaker,
            is_sharp_book: isSharp,
          });
        }
      }

      // Generate match-level contextual tags
      const matchContextTags = generateContextualTags(
        event.home_team, 
        event.away_team, 
        event.league,
        homeStats,
        awayStats
      );

      // Analyze market structure
      const marketStructures = analyzeMarketStructure(oddsArray);

      const statsIncomplete = !homeStats.stats_complete || !awayStats.stats_complete;
      const missingHome = homeStats.missing_fields || [];
      const missingAway = awayStats.missing_fields || [];
      
      let incompleteReason = '';
      if (statsIncomplete) {
        const reasons: string[] = [];
        if (missingHome.length > 0) reasons.push(`${event.home_team}: ${missingHome.join(', ')}`);
        if (missingAway.length > 0) reasons.push(`${event.away_team}: ${missingAway.join(', ')}`);
        incompleteReason = reasons.join('; ');
      }

      return {
        match: `${event.home_team} vs ${event.away_team}`,
        sport: event.sport,
        league: event.league,
        league_id: LEAGUE_IDS[event.league],
        start_time: event.start_time_aedt,
        home_team_stats: homeStats,
        away_team_stats: awayStats,
        stats_incomplete: statsIncomplete,
        incomplete_reason: incompleteReason || undefined,
        odds: oddsArray,
        market_structures: marketStructures,
        match_contextual_tags: matchContextTags,
      };
    });

    const allResults = await Promise.all(matchDataPromises);
    
    const completeEvents = allResults.filter(e => !e.stats_incomplete);
    const incompleteEvents = allResults.filter(e => e.stats_incomplete);
    
    console.log(`Stats quality: ${completeEvents.length} complete, ${incompleteEvents.length} incomplete`);

    // Format for Perplexity analysis with ALL enhanced metrics
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    
    const formattedOutput = `========================================================
INSTITUTIONAL SPORTS BETTING DATA EXPORT (v3.0)
Timestamp: ${timestamp} AEDT
Complete Events: ${completeEvents.length} | Incomplete (excluded): ${incompleteEvents.length}
Window: Next ${window_hours} hours
Data Source: API-Football (Enhanced: npxG, Shots, Set Pieces, Game State, Market Structure)
========================================================

${incompleteEvents.length > 0 ? `
--- DATA QUALITY ISSUES (${incompleteEvents.length} events excluded) ---
${incompleteEvents.map((e: MatchData) => `• ${e.match}: ${e.incomplete_reason}`).join('\n')}
` : ''}

${completeEvents.length === 0 ? `
⚠️ NO EVENTS WITH COMPLETE STATS
All ${allResults.length} events had missing data. Cannot make reliable recommendations.
` : completeEvents.map((match: MatchData, idx: number) => {
  const eventDate = new Date(match.start_time);
  const formattedDate = eventDate.toLocaleString('en-AU', { 
    timeZone: 'Australia/Sydney', 
    weekday: 'short', 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const formatTeamStats = (stats: TeamStats, venue: 'HOME' | 'AWAY') => {
    const venueXg = venue === 'HOME' 
      ? `Home xG: ${stats.home_xg_for?.toFixed(1)} for, ${stats.home_xg_against?.toFixed(1)} against`
      : `Away xG: ${stats.away_xg_for?.toFixed(1)} for, ${stats.away_xg_against?.toFixed(1)} against`;
    
    const gameState = stats.game_state_record;
    const gameStateStr = gameState 
      ? `When Leading: ${gameState.when_leading.ppg} PPG | When Drawing: ${gameState.when_drawing.ppg} PPG | When Trailing: ${gameState.when_trailing.ppg} PPG`
      : 'N/A';
    
    const setPieces = stats.set_piece_stats;
    const setPieceStr = setPieces
      ? `Set Pieces: ${setPieces.goals_from_set_pieces}G (${setPieces.xg_from_set_pieces} xG) | Open Play: ${setPieces.goals_from_open_play}G (${setPieces.xg_from_open_play} xG)`
      : 'N/A';
    
    const injuriesByTier = stats.injuries || [];
    const startersMissing = injuriesByTier.filter(i => i.tier === 'starter');
    const rotationMissing = injuriesByTier.filter(i => i.tier === 'rotation');
    
    return `  Rating: ${stats.team_rating} | Position: ${stats.league_position} | PPG: ${stats.points_per_game?.toFixed(2)}
  Form (L5): ${stats.recent_form}
  Goals L5: ${stats.goals_scored_last_5} for, ${stats.goals_conceded_last_5} against
  xG L5: ${stats.xg_for_last_5?.toFixed(2)} for, ${stats.xg_against_last_5?.toFixed(2)} against (Diff: ${stats.xg_difference?.toFixed(2) || 'N/A'})
  npxG L5: ${stats.npxg_for_last_5?.toFixed(2)} for, ${stats.npxg_against_last_5?.toFixed(2)} against
  ${venueXg}
  Shots/Game: ${stats.shots_per_game || 'N/A'} (OnTarget: ${stats.shots_on_target_per_game || 'N/A'}) | Conceded: ${stats.shots_conceded_per_game || 'N/A'}
  Big Chances: ${stats.big_chances_created_per_game || 'N/A'} created, ${stats.big_chances_conceded_per_game || 'N/A'} conceded
  ${setPieceStr}
  ${venue} Record: ${venue === 'HOME' ? stats.home_record : stats.away_record} (GF: ${venue === 'HOME' ? stats.home_goals_for : stats.away_goals_for}, GA: ${venue === 'HOME' ? stats.home_goals_against : stats.away_goals_against})
  Game State: ${gameStateStr}
  Schedule: ${stats.matches_last_7_days || 0} matches last 7d, ${stats.matches_last_14_days || 0} last 14d | Days Rest: ${stats.days_rest}
  Style: ${stats.style_tags?.join(', ') || 'standard'}
  Injuries (Starters): ${startersMissing.length > 0 ? startersMissing.map(i => `${i.player} [${i.position}]`).join(', ') : 'None'}
  Injuries (Rotation): ${rotationMissing.length > 0 ? rotationMissing.map(i => `${i.player} [${i.position}]`).join(', ') : 'None'}
  Missing by Position: DEF: ${stats.missing_by_position?.DEF || 0}, MID: ${stats.missing_by_position?.MID || 0}, FWD: ${stats.missing_by_position?.FWD || 0}
  ${stats.qualitative_tags?.length ? `Tags: ${stats.qualitative_tags.join(', ')}` : ''}`;
  };

  const steamMoves = match.odds.filter(o => o.steam_move);
  const sharpBooks = match.odds.filter(o => o.is_sharp_book);

  return `
================================================================
EVENT ${idx + 1}: ${match.match}
================================================================
Sport: ${match.sport.toUpperCase()} | League: ${match.league} (ID: ${match.league_id})
Kickoff: ${formattedDate} AEDT
Rating Differential: ${(match.home_team_stats.team_rating || 1500) - (match.away_team_stats.team_rating || 1500)} (positive favors home)
${match.match_contextual_tags?.length ? `Match Tags: ${match.match_contextual_tags.join(', ')}` : ''}

--- TEAM STATS ---
${match.home_team_stats.team} (HOME) [ID: ${match.home_team_stats.team_id}]:
${formatTeamStats(match.home_team_stats, 'HOME')}

${match.away_team_stats.team} (AWAY) [ID: ${match.away_team_stats.team_id}]:
${formatTeamStats(match.away_team_stats, 'AWAY')}

--- MARKET STRUCTURE ---
${match.market_structures?.map((ms: MarketStructure) => 
  `${ms.market_type}: Overround ${ms.overround}%${ms.sharp_soft_diff !== undefined ? ` | Sharp-Soft Gap: ${ms.sharp_soft_diff > 0 ? '+' : ''}${ms.sharp_soft_diff}%` : ''}`
).join('\n') || 'N/A'}

--- MARKET ODDS ---
${match.odds.map((o: MarketOdds) => {
  const movementStr = o.odds_movement !== undefined ? ` (Open: ${o.opening_odds?.toFixed(2)}, Move: ${o.odds_movement > 0 ? '+' : ''}${o.odds_movement}%)` : '';
  const steamStr = o.steam_move ? ' ⚡STEAM' : '';
  const sharpStr = o.is_sharp_book ? ' [SHARP]' : '';
  return `${o.selection}: ${o.odds.toFixed(2)} (Implied: ${o.implied_probability})${movementStr}${steamStr}${sharpStr} @ ${o.bookmaker}`;
}).join('\n')}
${steamMoves.length > 0 ? `\n⚠️ STEAM MOVES: ${steamMoves.map(s => `${s.selection} ${s.odds_movement! > 0 ? 'drifting' : 'shortening'} ${Math.abs(s.odds_movement!).toFixed(1)}%`).join(', ')}` : ''}
${sharpBooks.length > 0 ? `📊 Sharp Book Lines: ${sharpBooks.map(s => `${s.selection} @ ${s.odds.toFixed(2)}`).join(', ')}` : ''}
`;
}).join('\n')}

========================================================
ENHANCED ANALYSIS FRAMEWORK (v3.0)
========================================================
Using the structured stats above, calculate:
1. Team Ratings: Use Elo-style ratings + npxG differential
2. Shot Quality: Weight big chances and SOT ratio
3. Set Piece Factor: Adjust for teams strong/weak on set pieces
4. Game State Edge: Use PPG when leading/trailing for totals/BTTS
5. Schedule Fatigue: Penalize teams with 3+ matches in 7 days
6. Injury Impact: Weight starter absences by position (spine > wings)
7. Market Structure: Trust edges that appear at sharp books
8. Line Movement: CLV likelihood from opening -> current odds
9. Model Probability per outcome
10. Edge = Model Prob - Implied Prob
11. Bet Score (0-100)
12. Kelly stake (25% Kelly, capped at 1.5u)

CONTEXTUAL FACTORS (apply as probability nudges):
- Derby matches: Increase draw probability +5%
- Relegation 6-pointers: Increase draw probability +3%
- Fatigue mismatch: Adjust fresh team +3-5%
- Injury crisis: Reduce affected team probability -5-10%

CORRELATION RULES:
- Maximum 2 bets per league per window
- Maximum 3 bets in same 2-hour kickoff cluster
- Apply -5 correlation penalty if violated

Only recommend bets with Bet Score ≥70 and positive expected value.
========================================================
END OF DATA EXPORT
========================================================
`;

    const leagues = [...new Set(allResults.map((m: MatchData) => m.league))];
    const summary = `${completeEvents.length}/${allResults.length} matches complete across ${leagues.length} leagues: ${leagues.join(', ')}`;

    const { error: saveError } = await supabase
      .from('scrape_history')
      .insert({
        sports,
        leagues,
        window_hours,
        matches_count: allResults.length,
        summary,
        formatted_data: formattedOutput,
        raw_data: {
          complete_events: completeEvents,
          incomplete_events: incompleteEvents,
          stats_quality: {
            total: allResults.length,
            complete: completeEvents.length,
            incomplete: incompleteEvents.length
          }
        }
      });

    if (saveError) {
      console.error('Failed to save scrape history:', saveError);
    }

    return new Response(
      JSON.stringify({
        matches_scraped: allResults.length,
        complete_events: completeEvents.length,
        incomplete_events: incompleteEvents.length,
        formatted_data: formattedOutput,
        raw_data: {
          complete: completeEvents,
          incomplete: incompleteEvents
        },
        summary
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-match-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
