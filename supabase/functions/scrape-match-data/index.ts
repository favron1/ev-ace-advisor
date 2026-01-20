import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TeamStats {
  team: string;
  league_position?: number;
  points_per_game?: number;
  recent_form?: string;
  goals_scored_last_5?: number;
  goals_conceded_last_5?: number;
  home_record?: string;
  away_record?: string;
  days_rest?: number;
  injuries?: string[];
}

interface MatchData {
  match: string;
  sport: string;
  league: string;
  start_time: string;
  home_team_stats: TeamStats;
  away_team_stats: TeamStats;
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

// Fetch team stats from API-Football
async function fetchTeamStats(
  teamName: string,
  leagueName: string,
  apiKey: string
): Promise<TeamStats> {
  const stats: TeamStats = { team: teamName };
  const leagueId = LEAGUE_IDS[leagueName] || LEAGUE_IDS['Premier League'];
  const season = getCurrentSeason();

  try {
    // Search for team ID
    const searchRes = await fetch(
      `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(teamName)}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const searchData = await searchRes.json();
    const team = searchData.response?.[0]?.team;
    
    if (!team?.id) {
      console.log(`Team not found: ${teamName}`);
      return stats;
    }

    const teamId = team.id;

    // Fetch standings for league position
    const standingsRes = await fetch(
      `https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const standingsData = await standingsRes.json();
    const standings = standingsData.response?.[0]?.league?.standings?.[0] || [];
    
    const teamStanding = standings.find((s: any) => s.team?.id === teamId);
    if (teamStanding) {
      stats.league_position = teamStanding.rank;
      stats.points_per_game = teamStanding.points / (teamStanding.all?.played || 1);
      stats.recent_form = teamStanding.form?.slice(-5);
      stats.home_record = `${teamStanding.home?.win}-${teamStanding.home?.draw}-${teamStanding.home?.lose}`;
      stats.away_record = `${teamStanding.away?.win}-${teamStanding.away?.draw}-${teamStanding.away?.lose}`;
    }

    // Fetch last 5 fixtures for goals
    const fixturesRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=5`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.response || [];

    let goalsFor = 0;
    let goalsAgainst = 0;
    let lastMatchDate: Date | null = null;

    for (const fixture of fixtures) {
      const isHome = fixture.teams?.home?.id === teamId;
      goalsFor += isHome ? fixture.goals?.home || 0 : fixture.goals?.away || 0;
      goalsAgainst += isHome ? fixture.goals?.away || 0 : fixture.goals?.home || 0;
      
      const matchDate = new Date(fixture.fixture?.date);
      if (!lastMatchDate || matchDate > lastMatchDate) {
        lastMatchDate = matchDate;
      }
    }

    stats.goals_scored_last_5 = goalsFor;
    stats.goals_conceded_last_5 = goalsAgainst;

    if (lastMatchDate) {
      const daysSince = Math.floor((Date.now() - lastMatchDate.getTime()) / (1000 * 60 * 60 * 24));
      stats.days_rest = daysSince;
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

  } catch (error) {
    console.error(`Error fetching stats for ${teamName}:`, error);
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

      return {
        match: `${event.home_team} vs ${event.away_team}`,
        sport: event.sport,
        league: event.league,
        start_time: event.start_time_aedt,
        home_team_stats: homeStats,
        away_team_stats: awayStats,
        odds: oddsArray
      };
    });

    const scrapedResults = await Promise.all(matchDataPromises);

    // Format for Perplexity analysis
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    
    const formattedOutput = `========================================================
INSTITUTIONAL SPORTS BETTING DATA EXPORT
Timestamp: ${timestamp} AEDT
Events: ${scrapedResults.length} matches | Window: Next ${window_hours} hours
Data Source: API-Football (Structured Stats)
========================================================

${scrapedResults.map((match, idx) => {
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
    return `  Position: ${stats.league_position || '?'} | PPG: ${stats.points_per_game?.toFixed(2) || '?'}
  Form (L5): ${stats.recent_form || '?'}
  Goals L5: ${stats.goals_scored_last_5 ?? '?'} for, ${stats.goals_conceded_last_5 ?? '?'} against
  Home Record: ${stats.home_record || '?'} | Away: ${stats.away_record || '?'}
  Days Rest: ${stats.days_rest ?? '?'}
  Injuries: ${stats.injuries?.length ? stats.injuries.join(', ') : 'None reported'}`;
  };

  return `
================================================================
EVENT ${idx + 1}: ${match.match}
================================================================
Sport: ${match.sport.toUpperCase()} | League: ${match.league}
Kickoff: ${formattedDate} AEDT

--- TEAM STATS ---
${match.home_team_stats.team} (HOME):
${formatTeamStats(match.home_team_stats)}

${match.away_team_stats.team} (AWAY):
${formatTeamStats(match.away_team_stats)}

--- MARKET ODDS ---
${match.odds.map(o => `${o.selection}: ${o.odds.toFixed(2)} (Implied: ${o.implied_probability}) @ ${o.bookmaker}`).join('\n')}
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

    return new Response(
      JSON.stringify({
        matches_scraped: scrapedResults.length,
        formatted_data: formattedOutput,
        raw_data: scrapedResults
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
