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
  homeScore: number | string | null;
  awayScore: number | string | null;
  league: string;
  sport: 'soccer' | 'tennis' | 'basketball';
  commenceTime: string;
  status: 'live' | 'upcoming' | 'completed';
  lastUpdate: string | null;
  // Tennis-specific
  sets?: { home: number; away: number }[];
  currentSet?: number;
  serving?: 'home' | 'away';
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

    // Expanded sport coverage - using correct API sport keys
    const sportConfigs = [
      // Soccer
      { key: 'soccer_epl', sport: 'soccer' as const },
      { key: 'soccer_spain_la_liga', sport: 'soccer' as const },
      { key: 'soccer_germany_bundesliga', sport: 'soccer' as const },
      { key: 'soccer_italy_serie_a', sport: 'soccer' as const },
      { key: 'soccer_france_ligue_one', sport: 'soccer' as const },
      // Tennis - Grand Slams (correct keys with _singles suffix for AUS Open)
      { key: 'tennis_atp_aus_open_singles', sport: 'tennis' as const },
      { key: 'tennis_wta_aus_open_singles', sport: 'tennis' as const },
      { key: 'tennis_atp_french_open', sport: 'tennis' as const },
      { key: 'tennis_wta_french_open', sport: 'tennis' as const },
      { key: 'tennis_atp_wimbledon', sport: 'tennis' as const },
      { key: 'tennis_wta_wimbledon', sport: 'tennis' as const },
      { key: 'tennis_atp_us_open', sport: 'tennis' as const },
      { key: 'tennis_wta_us_open', sport: 'tennis' as const },
      // Basketball
      { key: 'basketball_nba', sport: 'basketball' as const },
      { key: 'basketball_euroleague', sport: 'basketball' as const },
    ];

    const allMatches: LiveMatch[] = [];
    const now = new Date();

    for (const config of sportConfigs) {
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${config.key}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`;
        console.log(`Fetching scores for ${config.key}...`);
        
        const response = await fetch(scoresUrl);
        if (response.ok) {
          const scores: ScoreEvent[] = await response.json();
          console.log(`Got ${scores.length} matches for ${config.key}`);
          
          for (const match of scores) {
            const commenceTime = new Date(match.commence_time);
            const timeDiff = now.getTime() - commenceTime.getTime();
            const minutesSinceStart = timeDiff / (1000 * 60);
            
            // Determine match status
            let status: 'live' | 'upcoming' | 'completed' = 'upcoming';
            
            if (match.completed) {
              status = 'completed';
            } else if (minutesSinceStart >= 0) {
              // Different duration windows per sport
              const maxDuration = config.sport === 'tennis' ? 300 : // 5 hours for tennis
                                  config.sport === 'basketball' ? 180 : // 3 hours for basketball
                                  150; // 2.5 hours for soccer
              if (minutesSinceStart <= maxDuration) {
                status = 'live';
              }
            }

            // Parse scores based on sport
            let homeScore: number | string | null = null;
            let awayScore: number | string | null = null;
            let sets: { home: number; away: number }[] | undefined;
            
            if (match.scores && match.scores.length > 0) {
              const homeScoreData = match.scores.find(s => s.name === match.home_team);
              const awayScoreData = match.scores.find(s => s.name === match.away_team);
              
              if (config.sport === 'tennis') {
                // Tennis scores come as "6-4, 6-3" format or just the set wins
                homeScore = homeScoreData?.score ?? null;
                awayScore = awayScoreData?.score ?? null;
                
                // Try to parse set scores if available
                if (homeScore && awayScore) {
                  const homeSets = parseInt(String(homeScore));
                  const awaySets = parseInt(String(awayScore));
                  if (!isNaN(homeSets) && !isNaN(awaySets)) {
                    sets = [{ home: homeSets, away: awaySets }];
                  }
                }
              } else {
                homeScore = homeScoreData ? parseInt(homeScoreData.score) : null;
                awayScore = awayScoreData ? parseInt(awayScoreData.score) : null;
              }
            }

            // Format league name
            let leagueName = match.sport_title;
            if (config.sport === 'tennis') {
              // Clean up tennis league names (handle _singles suffix keys)
              if (config.key.includes('aus_open')) leagueName = 'Australian Open';
              else if (config.key.includes('french_open')) leagueName = 'French Open';
              else if (config.key.includes('wimbledon')) leagueName = 'Wimbledon';
              else if (config.key.includes('us_open') && !config.key.includes('aus')) leagueName = 'US Open';
              
              if (config.key.includes('wta')) leagueName = `WTA ${leagueName}`;
              else if (config.key.includes('atp')) leagueName = `ATP ${leagueName}`;
            }

            allMatches.push({
              id: match.id,
              homeTeam: match.home_team,
              awayTeam: match.away_team,
              homeScore,
              awayScore,
              league: leagueName,
              sport: config.sport,
              commenceTime: match.commence_time,
              status,
              lastUpdate: match.last_update,
              ...(sets && { sets })
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching scores for ${config.key}:`, e);
      }
    }

    // Sort: live first, then upcoming, then completed
    const statusOrder = { live: 0, upcoming: 1, completed: 2 };
    allMatches.sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
    });

    // Return categorized matches
    const liveMatches = allMatches.filter(m => m.status === 'live');
    const upcomingMatches = allMatches.filter(m => m.status === 'upcoming').slice(0, 15);
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
