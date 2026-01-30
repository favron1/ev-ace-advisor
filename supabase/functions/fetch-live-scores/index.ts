import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreRequest {
  event_names: string[];
}

interface LiveScore {
  event_name: string;
  home_team: string;
  away_team: string;
  home_score: string | null;
  away_score: string | null;
  completed: boolean;
  game_status: string;
  last_update: string | null;
}

interface OddsApiScore {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
  last_update: string | null;
}

// Sport detection based on event name patterns - CORE 4 SPORTS ONLY
function detectSport(eventName: string): string[] {
  const name = eventName.toLowerCase();
  
  // NHL detection - check first due to overlapping team names (Hawks = Blackhawks not Atlanta)
  const nhlTeams = ['blackhawks', 'bruins', 'canadiens', 'canucks', 'capitals', 'coyotes', 
    'devils', 'ducks', 'flames', 'flyers', 'hurricanes', 'islanders', 'jets', 'kings',
    'lightning', 'maple leafs', 'oilers', 'panthers', 'penguins', 'predators', 'rangers',
    'red wings', 'sabres', 'senators', 'sharks', 'blues', 'kraken', 'stars', 'wild',
    'avalanche', 'golden knights', 'utah'];
  
  if (nhlTeams.some(team => name.includes(team))) {
    return ['icehockey_nhl'];
  }
  
  // NBA detection
  const nbaTeams = ['lakers', 'celtics', 'warriors', 'nets', 'knicks', 'bulls', 'heat',
    'bucks', 'suns', 'mavericks', 'clippers', '76ers', 'sixers', 'raptors', 'nuggets',
    'grizzlies', 'timberwolves', 'pelicans', 'thunder', 'trail blazers', 'blazers',
    'spurs', 'jazz', 'kings', 'hawks', 'hornets', 'cavaliers', 'pistons', 'pacers',
    'magic', 'wizards', 'rockets'];
  
  if (nbaTeams.some(team => name.includes(team))) {
    return ['basketball_nba'];
  }
  
  // NFL detection
  const nflTeams = ['chiefs', 'eagles', 'cowboys', 'patriots', 'packers', '49ers',
    'ravens', 'bills', 'dolphins', 'jets', 'bengals', 'steelers', 'browns', 'colts',
    'titans', 'jaguars', 'texans', 'broncos', 'raiders', 'chargers', 'commanders',
    'giants', 'lions', 'vikings', 'bears', 'saints', 'falcons', 'buccaneers', 'panthers',
    'rams', 'seahawks', 'cardinals'];
  
  if (nflTeams.some(team => name.includes(team))) {
    return ['americanfootball_nfl'];
  }
  
  // Default: try NBA and NHL (most common)
  return ['basketball_nba', 'icehockey_nhl'];
}

// Normalize team name for matching
function normalizeTeamName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

// Calculate approximate game status based on commence time and sport
function calculateGameStatus(sport: string, commenceTime: string, completed: boolean): string {
  if (completed) return 'Final';
  
  const startTime = new Date(commenceTime).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.floor((now - startTime) / 60000);
  
  if (elapsedMinutes < 0) return 'Pre-game';
  
  switch (sport) {
    case 'icehockey_nhl':
      if (elapsedMinutes <= 20) return 'P1';
      if (elapsedMinutes <= 40) return 'P2';
      if (elapsedMinutes <= 60) return 'P3';
      return 'OT';
    
    case 'basketball_nba':
      if (elapsedMinutes <= 12) return 'Q1';
      if (elapsedMinutes <= 24) return 'Q2';
      if (elapsedMinutes <= 36) return 'Q3';
      if (elapsedMinutes <= 48) return 'Q4';
      return 'OT';
    
    case 'soccer_epl':
    default:
      if (elapsedMinutes <= 45) return `${elapsedMinutes}'`;
      if (elapsedMinutes <= 60) return 'HT';
      return `${elapsedMinutes}'`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    const { event_names } = await req.json() as ScoreRequest;
    
    if (!event_names || event_names.length === 0) {
      return new Response(
        JSON.stringify({ scores: [], message: 'No events provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching live scores for ${event_names.length} events`);

    // Determine which sports to query based on event names
    const sportsToQuery = new Set<string>();
    event_names.forEach(name => {
      detectSport(name).forEach(sport => sportsToQuery.add(sport));
    });

    console.log('Sports to query:', Array.from(sportsToQuery));

    // Fetch scores for each sport
    const allApiScores: OddsApiScore[] = [];
    
    for (const sport of sportsToQuery) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`;
        console.log(`Fetching ${sport} scores...`);
        
        const response = await fetch(url);
        
        if (response.ok) {
          const scores = await response.json() as OddsApiScore[];
          console.log(`Got ${scores.length} scores for ${sport}`);
          allApiScores.push(...scores);
        } else {
          console.warn(`Failed to fetch ${sport}: ${response.status}`);
        }
      } catch (err) {
        console.error(`Error fetching ${sport}:`, err);
      }
    }

    // Match events to API scores using fuzzy matching
    const results: LiveScore[] = [];
    
    for (const eventName of event_names) {
      const normalizedEvent = normalizeTeamName(eventName);
      
      // Find matching score
      let bestMatch: OddsApiScore | null = null;
      let bestScore = 0;
      
      for (const apiScore of allApiScores) {
        const normalizedHome = normalizeTeamName(apiScore.home_team);
        const normalizedAway = normalizeTeamName(apiScore.away_team);
        
        // Check if both teams appear in the event name
        const homeMatch = normalizedEvent.includes(normalizedHome) || 
          normalizedHome.split(' ').some(word => word.length > 3 && normalizedEvent.includes(word));
        const awayMatch = normalizedEvent.includes(normalizedAway) || 
          normalizedAway.split(' ').some(word => word.length > 3 && normalizedEvent.includes(word));
        
        if (homeMatch && awayMatch) {
          // Both teams match - good match
          const matchScore = 2;
          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestMatch = apiScore;
          }
        } else if (homeMatch || awayMatch) {
          // Partial match
          const matchScore = 1;
          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestMatch = apiScore;
          }
        }
      }
      
      if (bestMatch) {
        const homeScore = bestMatch.scores?.find(s => 
          normalizeTeamName(s.name) === normalizeTeamName(bestMatch!.home_team)
        );
        const awayScore = bestMatch.scores?.find(s => 
          normalizeTeamName(s.name) === normalizeTeamName(bestMatch!.away_team)
        );
        
        results.push({
          event_name: eventName,
          home_team: bestMatch.home_team,
          away_team: bestMatch.away_team,
          home_score: homeScore?.score || null,
          away_score: awayScore?.score || null,
          completed: bestMatch.completed,
          game_status: calculateGameStatus(bestMatch.sport_key, bestMatch.commence_time, bestMatch.completed),
          last_update: bestMatch.last_update,
        });
      }
    }

    console.log(`Matched ${results.length}/${event_names.length} events to live scores`);

    return new Response(
      JSON.stringify({ scores: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-live-scores:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
