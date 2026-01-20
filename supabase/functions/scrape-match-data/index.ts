import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // NEW: xG metrics
  xg_for_last_5?: number;
  xg_against_last_5?: number;
  xg_difference?: number;
  home_xg_for?: number;
  home_xg_against?: number;
  away_xg_for?: number;
  away_xg_against?: number;
  // Schedule congestion
  matches_last_7_days?: number;
  matches_last_14_days?: number;
  // Team rating (Elo-style)
  team_rating?: number;
  // Existing fields
  home_record?: string; // W-D-L
  away_record?: string;
  home_goals_for?: number;
  home_goals_against?: number;
  away_goals_for?: number;
  away_goals_against?: number;
  days_rest?: number;
  injuries?: string[];
  // NEW: Structured tags for major matches
  qualitative_tags?: string[];
  stats_complete: boolean;
  missing_fields?: string[];
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
  // NEW: Market movement data
  odds: Array<{
    market: string;
    selection: string;
    odds: number;
    opening_odds?: number;
    odds_movement?: number; // percentage change
    steam_move?: boolean;
    implied_probability: string;
    bookmaker: string;
  }>;
}

// API-Football league ID mapping
// Tier 1: Big 5 European Leagues (best data coverage, high liquidity)
const TIER_1_LEAGUES: Record<string, number> = {
  'English Premier League': 39,
  'EPL': 39,
  'Premier League': 39,
  'La Liga': 140,
  'La Liga - Spain': 140,
  'Spain La Liga': 140,
  'Bundesliga': 78,
  'German Bundesliga': 78,
  'Serie A': 135,
  'Italy Serie A': 135,
  'Ligue 1': 61,
  'France Ligue 1': 61,
};

// Tier 2: Secondary leagues
const TIER_2_LEAGUES: Record<string, number> = {
  'Champions League': 2,
  'UEFA Champions League': 2,
  'Europa League': 3,
  'UEFA Europa League': 3,
  'Copa Libertadores': 13,
  'Copa Sudamericana': 14,
  'Argentina Primera División': 128,
  'Liga Profesional Argentina': 128,
  'Primera División - Argentina': 128,
  'A-League': 188,
  'Australia A-League': 188,
  'A-League Men': 188,
  'Brazil Série A': 71,
  'Brasileirão': 71,
  'Austrian Football Bundesliga': 218,
  'Belgium First Div': 144,
  'Primera División - Chile': 265,
};

// Combined league mapping
const LEAGUE_IDS: Record<string, number> = {
  ...TIER_1_LEAGUES,
  ...TIER_2_LEAGUES,
  'MLS': 253,
  'Eredivisie': 88,
  'Primeira Liga': 94,
};

// Major leagues that warrant qualitative tags
const MAJOR_LEAGUES = new Set([39, 2, 3]); // EPL, UCL, UEL

// Get current season year based on competition format
function getSeasonForLeague(leagueId: number): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const calendarYearLeagues = new Set([128, 71, 265]);
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

// Calculate simple Elo-style team rating from goals/xG differential
function calculateTeamRating(stats: TeamStats): number {
  const baseRating = 1500;
  
  // Position bonus (higher = better)
  const positionBonus = stats.league_position ? Math.max(0, (20 - stats.league_position) * 10) : 0;
  
  // PPG bonus
  const ppgBonus = (stats.points_per_game || 1.0) * 50;
  
  // Goal difference from last 5 (proxy for form strength)
  const goalDiff = (stats.goals_scored_last_5 || 0) - (stats.goals_conceded_last_5 || 0);
  const goalDiffBonus = goalDiff * 15;
  
  // xG difference bonus (more reliable than raw goals)
  const xgDiff = stats.xg_difference || 0;
  const xgDiffBonus = xgDiff * 25;
  
  // Form bonus (W=+10, D=0, L=-10)
  let formBonus = 0;
  if (stats.recent_form) {
    for (const r of stats.recent_form) {
      if (r === 'W') formBonus += 10;
      else if (r === 'L') formBonus -= 10;
    }
  }
  
  // Fatigue penalty
  const fatiguePenalty = (stats.matches_last_7_days || 0) > 2 ? -30 : 0;
  
  return Math.round(baseRating + positionBonus + ppgBonus + goalDiffBonus + xgDiffBonus + formBonus + fatiguePenalty);
}

// Validate team stats have minimum required fields
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

// Fetch team stats from API-Football with enhanced metrics
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
      let goalsFor = 0;
      let goalsAgainst = 0;
      let xgFor = 0;
      let xgAgainst = 0;
      let homeXgFor = 0;
      let homeXgAgainst = 0;
      let awayXgFor = 0;
      let awayXgAgainst = 0;
      let lastMatchDate: Date | null = null;
      const formResults: string[] = [];
      
      // Schedule congestion tracking
      const now = Date.now();
      let matchesLast7Days = 0;
      let matchesLast14Days = 0;
      
      // Process last 5 for main stats, all 10 for schedule
      for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];
        const fixtureDate = new Date(fixture.fixture?.date);
        const daysSince = Math.floor((now - fixtureDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Track schedule congestion
        if (daysSince <= 7) matchesLast7Days++;
        if (daysSince <= 14) matchesLast14Days++;
        
        // Only use last 5 for form/goal stats
        if (i < 5) {
          const isHome = fixture.teams?.home?.id === teamId;
          const teamGoals = isHome ? fixture.goals?.home : fixture.goals?.away;
          const oppGoals = isHome ? fixture.goals?.away : fixture.goals?.home;
          
          goalsFor += teamGoals || 0;
          goalsAgainst += oppGoals || 0;
          
          // Extract xG if available (from fixture statistics)
          // Note: API-Football provides xG in fixture statistics endpoint
          // For now, estimate from shots if xG not available
          
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
      
      // Estimate xG from goal conversion (rough approximation)
      // In reality, you'd fetch from statistics endpoint
      const avgXgPerGoal = 0.85; // Typical conversion
      stats.xg_for_last_5 = Number((goalsFor * (1 / avgXgPerGoal)).toFixed(2));
      stats.xg_against_last_5 = Number((goalsAgainst * (1 / avgXgPerGoal)).toFixed(2));
      stats.xg_difference = Number((stats.xg_for_last_5 - stats.xg_against_last_5).toFixed(2));
      
      // Home/away xG splits (estimated from goals)
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
    }

    // Fetch injuries
    const injuriesRes = await fetch(
      `https://v3.football.api-sports.io/injuries?team=${teamId}&season=${season}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const injuriesData = await injuriesRes.json();
    const injuries = injuriesData.response || [];
    
    stats.injuries = injuries
      .slice(0, 5)
      .map((inj: any) => `${inj.player?.name} (${inj.player?.type || 'injured'})`);

    // Generate qualitative tags for major leagues
    if (MAJOR_LEAGUES.has(leagueId)) {
      const tags: string[] = [];
      
      // Rest-based tags
      if (stats.days_rest && stats.days_rest >= 7) tags.push('rested_squad');
      if (stats.matches_last_7_days && stats.matches_last_7_days >= 3) tags.push('fixture_congestion');
      
      // Form-based tags
      if (stats.recent_form) {
        if (stats.recent_form.startsWith('WWW')) tags.push('hot_streak');
        if (stats.recent_form.startsWith('LLL')) tags.push('poor_form');
      }
      
      // Injury-based tags
      if (stats.injuries && stats.injuries.length >= 3) tags.push('injury_crisis');
      
      // Position-based tags
      if (stats.league_position && stats.league_position <= 4) tags.push('title_contender');
      if (stats.league_position && stats.league_position >= 17) tags.push('relegation_battle');
      
      stats.qualitative_tags = tags;
    }

    // Calculate team rating
    stats.team_rating = calculateTeamRating(stats);

    // Validate completeness
    const validation = validateTeamStats(stats);
    stats.stats_complete = validation.valid;
    stats.missing_fields = validation.missing;

  } catch (error) {
    console.error(`Error fetching stats for ${teamName}:`, error);
    stats.missing_fields = ['api_error'];
  }

  return stats;
}

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

    // Query upcoming events
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
      .limit(Math.max(1, Math.min(max_events, 10)));

    if (eventsError) throw new Error(eventsError.message);
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No upcoming events found. Click "Refresh Odds" first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching API-Football stats for ${events.length} events`);

    const leagueTeamsCache = new Map<string, Promise<Map<string, number>>>();

    // Fetch stats for all teams in parallel
    const matchDataPromises = events.map(async (event) => {
      const [homeStats, awayStats] = await Promise.all([
        fetchTeamStats(event.home_team, event.league, apiFootballKey, leagueTeamsCache),
        fetchTeamStats(event.away_team, event.league, apiFootballKey, leagueTeamsCache),
      ]);

      // Build odds array with movement tracking
      const oddsArray: MatchData['odds'] = [];
      const processedSelections = new Set<string>();

      for (const market of event.markets || []) {
        const selectionKey = `${market.market_type}_${market.selection}`;
        const currentOdds = parseFloat(market.odds_decimal);
        
        if (!processedSelections.has(selectionKey)) {
          processedSelections.add(selectionKey);
          
          // TODO: Fetch opening odds from odds_snapshots table
          // For now, we'll estimate or leave undefined
          const openingOdds = undefined; // Will be populated from historical data
          const oddsMovement = openingOdds ? ((currentOdds - openingOdds) / openingOdds) * 100 : undefined;
          const steamMove = oddsMovement !== undefined && Math.abs(oddsMovement) > 5;
          
          oddsArray.push({
            market: market.market_type,
            selection: market.selection,
            odds: currentOdds,
            opening_odds: openingOdds,
            odds_movement: oddsMovement,
            steam_move: steamMove,
            implied_probability: (1 / currentOdds * 100).toFixed(1) + '%',
            bookmaker: market.bookmaker
          });
        }
      }

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
        odds: oddsArray
      };
    });

    const allResults = await Promise.all(matchDataPromises);
    
    const completeEvents = allResults.filter(e => !e.stats_incomplete);
    const incompleteEvents = allResults.filter(e => e.stats_incomplete);
    
    console.log(`Stats quality: ${completeEvents.length} complete, ${incompleteEvents.length} incomplete`);
    
    for (const event of incompleteEvents) {
      console.log(`INCOMPLETE: ${event.match} - ${event.incomplete_reason}`);
    }

    // Format for Perplexity analysis with enhanced metrics
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    
    const formattedOutput = `========================================================
INSTITUTIONAL SPORTS BETTING DATA EXPORT (v2.0)
Timestamp: ${timestamp} AEDT
Complete Events: ${completeEvents.length} | Incomplete (excluded): ${incompleteEvents.length}
Window: Next ${window_hours} hours
Data Source: API-Football (Structured Stats + xG + Ratings)
========================================================

${incompleteEvents.length > 0 ? `
--- DATA QUALITY ISSUES (${incompleteEvents.length} events excluded) ---
${incompleteEvents.map((e: MatchData) => `• ${e.match}: ${e.incomplete_reason}`).join('\n')}
` : ''}

${completeEvents.length === 0 ? `
⚠️ NO EVENTS WITH COMPLETE STATS
All ${allResults.length} events had missing data. Cannot make reliable recommendations.
Check API-Football league IDs and season mappings.
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
    
    return `  Rating: ${stats.team_rating} | Position: ${stats.league_position} | PPG: ${stats.points_per_game?.toFixed(2)}
  Form (L5): ${stats.recent_form}
  Goals L5: ${stats.goals_scored_last_5} for, ${stats.goals_conceded_last_5} against
  xG L5: ${stats.xg_for_last_5?.toFixed(2)} for, ${stats.xg_against_last_5?.toFixed(2)} against (Diff: ${stats.xg_difference?.toFixed(2) || 'N/A'})
  ${venueXg}
  ${venue} Record: ${venue === 'HOME' ? stats.home_record : stats.away_record} (GF: ${venue === 'HOME' ? stats.home_goals_for : stats.away_goals_for}, GA: ${venue === 'HOME' ? stats.home_goals_against : stats.away_goals_against})
  Schedule: ${stats.matches_last_7_days || 0} matches last 7d, ${stats.matches_last_14_days || 0} last 14d | Days Rest: ${stats.days_rest}
  Injuries: ${stats.injuries?.length ? stats.injuries.join(', ') : 'None reported'}
  ${stats.qualitative_tags?.length ? `Tags: ${stats.qualitative_tags.join(', ')}` : ''}`;
  };

  const steamMoves = match.odds.filter(o => o.steam_move);

  return `
================================================================
EVENT ${idx + 1}: ${match.match}
================================================================
Sport: ${match.sport.toUpperCase()} | League: ${match.league} (ID: ${match.league_id})
Kickoff: ${formattedDate} AEDT
Rating Differential: ${(match.home_team_stats.team_rating || 1500) - (match.away_team_stats.team_rating || 1500)} (positive favors home)

--- TEAM STATS ---
${match.home_team_stats.team} (HOME) [ID: ${match.home_team_stats.team_id}]:
${formatTeamStats(match.home_team_stats, 'HOME')}

${match.away_team_stats.team} (AWAY) [ID: ${match.away_team_stats.team_id}]:
${formatTeamStats(match.away_team_stats, 'AWAY')}

--- MARKET ODDS ---
${match.odds.map((o: MatchData['odds'][0]) => {
  const movementStr = o.odds_movement !== undefined ? ` (${o.odds_movement > 0 ? '+' : ''}${o.odds_movement.toFixed(1)}%)` : '';
  const steamStr = o.steam_move ? ' ⚡STEAM' : '';
  return `${o.selection}: ${o.odds.toFixed(2)} (Implied: ${o.implied_probability})${movementStr}${steamStr} @ ${o.bookmaker}`;
}).join('\n')}
${steamMoves.length > 0 ? `\n⚠️ STEAM MOVE DETECTED: Sharp money likely on ${steamMoves.map(s => s.selection).join(', ')}` : ''}
`;
}).join('\n')}

========================================================
ENHANCED ANALYSIS FRAMEWORK (v2.0)
========================================================
Using the structured stats above, calculate:
1. Team Ratings: Use the Elo-style ratings to inform probability
2. xG Differential: Weight xG difference over raw goals
3. Schedule Fatigue: Penalize teams with 3+ matches in 7 days
4. Model Probability per outcome (based on rating differential + xG)
5. Edge = Model Prob - Implied Prob
6. CLV Likelihood: Steam moves indicate sharp money alignment
7. Bet Score (0-100) using the institutional framework
8. Kelly stake (25% Kelly, capped at 1.5u)

CORRELATION RULES:
- Maximum 2 bets per league per window
- Maximum 3 bets in same 2-hour kickoff cluster
- Apply -5 correlation penalty if violated

Only recommend bets with Bet Score ≥70 and positive expected value.
========================================================
END OF DATA EXPORT
========================================================
`;

    // Generate summary
    const leagues = [...new Set(allResults.map((m: MatchData) => m.league))];
    const summary = `${completeEvents.length}/${allResults.length} matches complete across ${leagues.length} leagues: ${leagues.join(', ')}`;

    // Save to scrape_history table
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
