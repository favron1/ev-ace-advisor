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
  home_record?: string; // W-D-L
  away_record?: string;
  home_goals_for?: number;
  home_goals_against?: number;
  away_goals_for?: number;
  away_goals_against?: number;
  days_rest?: number;
  injuries?: string[];
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
  odds: Array<{
    market: string;
    selection: string;
    odds: number;
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
  'Spain La Liga': 140,
  'Bundesliga': 78,
  'German Bundesliga': 78,
  'Serie A': 135,
  'Italy Serie A': 135,
  'Ligue 1': 61,
  'France Ligue 1': 61,
};

// Tier 2: Secondary leagues (add once core works)
const TIER_2_LEAGUES: Record<string, number> = {
  'Champions League': 2,
  'UEFA Champions League': 2,
  'Europa League': 3,
  'UEFA Europa League': 3,
  'Argentina Primera División': 128,
  'Liga Profesional Argentina': 128,
  'A-League': 188,
  'Australia A-League': 188,
  'A-League Men': 188,
};

// Combined league mapping
const LEAGUE_IDS: Record<string, number> = {
  ...TIER_1_LEAGUES,
  ...TIER_2_LEAGUES,
  // Fallback mappings
  'MLS': 253,
  'Eredivisie': 88,
  'Primeira Liga': 94,
};

// Get current season year
function getCurrentSeason(): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  // If before August, use previous year as season start
  return month < 7 ? year - 1 : year;
}

// Validate team stats have minimum required fields
function validateTeamStats(stats: TeamStats): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Required fields for valid analysis
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

// Fetch team stats from API-Football with validation
async function fetchTeamStats(
  teamName: string,
  leagueName: string,
  apiKey: string
): Promise<TeamStats> {
  const leagueId = LEAGUE_IDS[leagueName] || null;
  const season = getCurrentSeason();
  
  const stats: TeamStats = { 
    team: teamName,
    league_id: leagueId || undefined,
    season,
    stats_complete: false,
    missing_fields: []
  };

  if (!leagueId) {
    console.log(`Unknown league: ${leagueName} - cannot fetch stats`);
    stats.missing_fields = ['league_id_unknown'];
    return stats;
  }

  try {
    // Search for team ID with league filter for accuracy
    const searchRes = await fetch(
      `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(teamName)}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const searchData = await searchRes.json();
    
    // Try to find the team that plays in the correct league
    let team = searchData.response?.[0]?.team;
    const teamId = team?.id;
    
    if (!teamId) {
      console.log(`Team not found: ${teamName} in ${leagueName}`);
      stats.missing_fields = ['team_not_found'];
      return stats;
    }

    stats.team_id = teamId;
    console.log(`Found team: ${teamName} (ID: ${teamId}) for league ${leagueName} (ID: ${leagueId})`);

    // Fetch standings for this specific league and season
    const standingsRes = await fetch(
      `https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const standingsData = await standingsRes.json();
    const standings = standingsData.response?.[0]?.league?.standings;
    
    // Handle group stages (e.g., Champions League) - flatten all groups
    const allStandings = Array.isArray(standings?.[0]) 
      ? standings.flat() 
      : standings || [];
    
    const teamStanding = allStandings.find((s: any) => s.team?.id === teamId);
    
    if (teamStanding) {
      stats.league_position = teamStanding.rank;
      const played = teamStanding.all?.played || 1;
      stats.points_per_game = Number((teamStanding.points / played).toFixed(2));
      stats.recent_form = teamStanding.form?.slice(-5) || '';
      
      // Home record
      const home = teamStanding.home || {};
      stats.home_record = `${home.win || 0}-${home.draw || 0}-${home.lose || 0}`;
      stats.home_goals_for = home.goals?.for || 0;
      stats.home_goals_against = home.goals?.against || 0;
      
      // Away record
      const away = teamStanding.away || {};
      stats.away_record = `${away.win || 0}-${away.draw || 0}-${away.lose || 0}`;
      stats.away_goals_for = away.goals?.for || 0;
      stats.away_goals_against = away.goals?.against || 0;
    } else {
      console.log(`Team ${teamName} (${teamId}) not found in standings for league ${leagueId} season ${season}`);
    }

    // Fetch last 5 fixtures for goals and days rest
    const fixturesRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=5&league=${leagueId}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.response || [];

    if (fixtures.length > 0) {
      let goalsFor = 0;
      let goalsAgainst = 0;
      let lastMatchDate: Date | null = null;
      const formResults: string[] = [];

      for (const fixture of fixtures) {
        const isHome = fixture.teams?.home?.id === teamId;
        const teamGoals = isHome ? fixture.goals?.home : fixture.goals?.away;
        const oppGoals = isHome ? fixture.goals?.away : fixture.goals?.home;
        
        goalsFor += teamGoals || 0;
        goalsAgainst += oppGoals || 0;
        
        // Determine W/D/L
        if (teamGoals > oppGoals) formResults.push('W');
        else if (teamGoals < oppGoals) formResults.push('L');
        else formResults.push('D');
        
        const matchDate = new Date(fixture.fixture?.date);
        if (!lastMatchDate || matchDate > lastMatchDate) {
          lastMatchDate = matchDate;
        }
      }

      stats.goals_scored_last_5 = goalsFor;
      stats.goals_conceded_last_5 = goalsAgainst;
      
      // Use fixture-derived form if standings form is incomplete
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

    // Fetch stats for all teams in parallel
    const matchDataPromises = events.map(async (event) => {
      const [homeStats, awayStats] = await Promise.all([
        fetchTeamStats(event.home_team, event.league, apiFootballKey),
        fetchTeamStats(event.away_team, event.league, apiFootballKey),
      ]);

      // Build odds array
      const oddsArray: MatchData['odds'] = [];
      const processedSelections = new Set<string>();

      for (const market of event.markets || []) {
        const selectionKey = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        if (!processedSelections.has(selectionKey)) {
          processedSelections.add(selectionKey);
          oddsArray.push({
            market: market.market_type,
            selection: market.selection,
            odds,
            implied_probability: (1 / odds * 100).toFixed(1) + '%',
            bookmaker: market.bookmaker
          });
        }
      }

      // Determine if stats are incomplete
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
    
    // Separate complete vs incomplete events
    const completeEvents = allResults.filter(e => !e.stats_incomplete);
    const incompleteEvents = allResults.filter(e => e.stats_incomplete);
    
    console.log(`Stats quality: ${completeEvents.length} complete, ${incompleteEvents.length} incomplete`);
    
    // Log incomplete events for debugging
    for (const event of incompleteEvents) {
      console.log(`INCOMPLETE: ${event.match} - ${event.incomplete_reason}`);
    }

    // Format for Perplexity analysis - ONLY include complete events
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    
    const formattedOutput = `========================================================
INSTITUTIONAL SPORTS BETTING DATA EXPORT
Timestamp: ${timestamp} AEDT
Complete Events: ${completeEvents.length} | Incomplete (excluded): ${incompleteEvents.length}
Window: Next ${window_hours} hours
Data Source: API-Football (Structured Stats)
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
  
  const formatTeamStats = (stats: TeamStats) => {
    return `  Position: ${stats.league_position} | PPG: ${stats.points_per_game?.toFixed(2)}
  Form (L5): ${stats.recent_form}
  Goals L5: ${stats.goals_scored_last_5} for, ${stats.goals_conceded_last_5} against
  Home Record: ${stats.home_record} (GF: ${stats.home_goals_for}, GA: ${stats.home_goals_against})
  Away Record: ${stats.away_record} (GF: ${stats.away_goals_for}, GA: ${stats.away_goals_against})
  Days Rest: ${stats.days_rest}
  Injuries: ${stats.injuries?.length ? stats.injuries.join(', ') : 'None reported'}`;
  };

  return `
================================================================
EVENT ${idx + 1}: ${match.match}
================================================================
Sport: ${match.sport.toUpperCase()} | League: ${match.league} (ID: ${match.league_id})
Kickoff: ${formattedDate} AEDT

--- TEAM STATS ---
${match.home_team_stats.team} (HOME) [ID: ${match.home_team_stats.team_id}]:
${formatTeamStats(match.home_team_stats)}

${match.away_team_stats.team} (AWAY) [ID: ${match.away_team_stats.team_id}]:
${formatTeamStats(match.away_team_stats)}

--- MARKET ODDS ---
${match.odds.map((o: MatchData['odds'][0]) => `${o.selection}: ${o.odds.toFixed(2)} (Implied: ${o.implied_probability}) @ ${o.bookmaker}`).join('\n')}
`;
}).join('\n')}

========================================================
ANALYSIS FRAMEWORK
========================================================
Using the structured stats above, calculate:
1. Model Probability per outcome (based on team strength differential)
2. Edge = Model Prob - Implied Prob
3. Bet Score (0-100) using the institutional framework
4. Kelly stake (25% Kelly, capped at 1.5u)

Only recommend bets with Bet Score ≥55 and positive expected value.
========================================================
END OF DATA EXPORT
========================================================
`;

    // Generate summary for quick reference
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
