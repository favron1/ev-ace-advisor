import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreEvent {
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

interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  league: string;
  commenceTime: string;
  status: 'live' | 'upcoming' | 'completed';
  lastUpdate: string | null;
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

    const leagues = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga'];
    const allMatches: LiveMatch[] = [];
    const now = new Date();

    for (const league of leagues) {
      try {
        // Fetch scores including live games
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${league}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`;
        console.log(`Fetching live scores for ${league}...`);
        
        const response = await fetch(scoresUrl);
        if (response.ok) {
          const scores: ScoreEvent[] = await response.json();
          console.log(`Got ${scores.length} matches for ${league}`);
          
          for (const match of scores) {
            const commenceTime = new Date(match.commence_time);
            const timeDiff = now.getTime() - commenceTime.getTime();
            const minutesSinceStart = timeDiff / (1000 * 60);
            
            // Determine match status
            let status: 'live' | 'upcoming' | 'completed' = 'upcoming';
            
            if (match.completed) {
              status = 'completed';
            } else if (minutesSinceStart >= 0 && minutesSinceStart <= 150) {
              // Match started within last 2.5 hours (generous for extra time)
              status = 'live';
            }

            // Parse scores
            let homeScore: number | null = null;
            let awayScore: number | null = null;
            
            if (match.scores && match.scores.length > 0) {
              const homeScoreData = match.scores.find(s => s.name === match.home_team);
              const awayScoreData = match.scores.find(s => s.name === match.away_team);
              homeScore = homeScoreData ? parseInt(homeScoreData.score) : null;
              awayScore = awayScoreData ? parseInt(awayScoreData.score) : null;
            }

            allMatches.push({
              id: match.id,
              homeTeam: match.home_team,
              awayTeam: match.away_team,
              homeScore,
              awayScore,
              league: match.sport_title,
              commenceTime: match.commence_time,
              status,
              lastUpdate: match.last_update
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching scores for ${league}:`, e);
      }
    }

    // Sort: live first, then upcoming, then completed
    const statusOrder = { live: 0, upcoming: 1, completed: 2 };
    allMatches.sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
    });

    // Return live and recent matches
    const liveMatches = allMatches.filter(m => m.status === 'live');
    const upcomingMatches = allMatches.filter(m => m.status === 'upcoming').slice(0, 10);
    const completedMatches = allMatches.filter(m => m.status === 'completed').slice(0, 5);

    console.log(`Found ${liveMatches.length} live, ${upcomingMatches.length} upcoming, ${completedMatches.length} completed matches`);

    return new Response(JSON.stringify({ 
      live: liveMatches,
      upcoming: upcomingMatches,
      completed: completedMatches
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching live scores:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
