import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= BASKETBALL INTERFACES =============

interface BasketballTeamStats {
  team: string;
  team_id?: number;
  league_id?: number;
  season?: string;
  league_position?: number;
  wins?: number;
  losses?: number;
  win_percentage?: number;
  points_per_game?: number;
  points_allowed_per_game?: number;
  pace?: number; // Possessions per game
  offensive_rating?: number; // Points per 100 possessions
  defensive_rating?: number; // Points allowed per 100 possessions
  net_rating?: number;
  // Recent form
  recent_form?: string; // W/L sequence
  last_5_record?: string;
  streak?: string; // e.g., "W3", "L2"
  // Home/Away splits
  home_record?: string;
  away_record?: string;
  home_ppg?: number;
  away_ppg?: number;
  // Schedule factors
  days_rest?: number;
  back_to_back?: boolean;
  games_last_7_days?: number;
  travel_miles_last_week?: number;
  // Key injuries (critical in basketball)
  injuries?: { player: string; status: string; position: string; ppg: number }[];
  missing_star_players?: number; // Count of top-3 scorers out
  // Advanced metrics
  three_point_percentage?: number;
  rebounds_per_game?: number;
  assists_per_game?: number;
  turnovers_per_game?: number;
  // Elo-style rating
  team_rating?: number;
  stats_complete: boolean;
  missing_fields?: string[];
  data_quality?: 'high' | 'medium' | 'low';
  quality_score?: number;
}

interface BasketballMatchData {
  match: string;
  event_id: string;
  sport: string;
  league: string;
  league_id?: number;
  start_time: string;
  home_team: string;
  away_team: string;
  home_team_stats: BasketballTeamStats;
  away_team_stats: BasketballTeamStats;
  stats_incomplete: boolean;
  incomplete_reason?: string;
  spread_line?: number;
  total_line?: number;
  odds: any[];
  market_structures?: any[];
  match_contextual_tags?: string[];
}

// ============= API-BASKETBALL LEAGUE MAPPINGS =============

const BASKETBALL_LEAGUES: Record<string, number> = {
  // NBA
  'NBA': 12,
  'basketball_nba': 12,
  // NCAA
  'NCAAB': 116,
  'NCAA': 116,
  'basketball_ncaab': 116,
  // Euroleague
  'Euroleague': 120,
  'basketball_euroleague': 120,
  // NBL Australia
  'NBL': 20,
  'NBL Australia': 20,
  'basketball_nbl': 20,
  // Other leagues
  'ACB Spain': 117,
  'LNB France': 37,
  'Lega A Italy': 81,
  'BBL Germany': 41,
  'BSL Turkey': 141,
  'VTB United': 143,
  'Greek League': 54,
  'EuroLeague': 120,
  'EuroCup': 121,
};

// ============= HELPER FUNCTIONS =============

function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // NBA season runs Oct-June, so if we're before October, use previous year
  if (month >= 10) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function normalizeLeagueName(league: string): number | null {
  const normalized = league.toLowerCase().trim();
  
  for (const [key, id] of Object.entries(BASKETBALL_LEAGUES)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return id;
    }
  }
  
  // Check for partial matches
  if (normalized.includes('nba')) return 12;
  if (normalized.includes('ncaa')) return 116;
  if (normalized.includes('nbl') || normalized.includes('australia')) return 20;
  if (normalized.includes('euroleague')) return 120;
  
  return null;
}

function calculateBasketballRating(stats: BasketballTeamStats): number {
  let rating = 1500;
  
  // Win percentage impact (major factor)
  if (stats.win_percentage !== undefined) {
    rating += (stats.win_percentage - 0.5) * 400;
  }
  
  // Net rating (offensive - defensive efficiency)
  if (stats.net_rating !== undefined) {
    rating += stats.net_rating * 15; // +15 rating per point of net rating
  } else if (stats.offensive_rating !== undefined && stats.defensive_rating !== undefined) {
    const netRating = stats.offensive_rating - stats.defensive_rating;
    rating += netRating * 15;
  }
  
  // Points differential bonus
  if (stats.points_per_game !== undefined && stats.points_allowed_per_game !== undefined) {
    const diff = stats.points_per_game - stats.points_allowed_per_game;
    rating += diff * 5;
  }
  
  // Streak adjustments
  if (stats.streak) {
    const match = stats.streak.match(/([WL])(\d+)/);
    if (match) {
      const [, type, count] = match;
      const streakValue = parseInt(count, 10) * 5;
      rating += type === 'W' ? streakValue : -streakValue;
    }
  }
  
  return Math.round(rating);
}

function validateBasketballStats(stats: BasketballTeamStats): { quality: 'high' | 'medium' | 'low'; score: number; missing: string[] } {
  const criticalFields = ['wins', 'losses', 'points_per_game', 'points_allowed_per_game'];
  const softFields = ['recent_form', 'offensive_rating', 'defensive_rating', 'days_rest', 'home_record', 'away_record'];
  
  const missingCritical = criticalFields.filter(f => (stats as any)[f] === undefined);
  const missingSoft = softFields.filter(f => (stats as any)[f] === undefined);
  
  // Calculate weighted score (critical: 70%, soft: 30%)
  const criticalScore = ((criticalFields.length - missingCritical.length) / criticalFields.length) * 70;
  const softScore = ((softFields.length - missingSoft.length) / softFields.length) * 30;
  const totalScore = Math.round(criticalScore + softScore);
  
  let quality: 'high' | 'medium' | 'low';
  if (totalScore >= 85) quality = 'high';
  else if (totalScore >= 70) quality = 'medium';
  else quality = 'low';
  
  return { quality, score: totalScore, missing: [...missingCritical, ...missingSoft] };
}

// ============= API-BASKETBALL DATA FETCHING =============

async function fetchBasketballTeamStats(
  teamName: string,
  leagueId: number,
  season: string,
  apiKey: string,
  isHome: boolean
): Promise<BasketballTeamStats> {
  const stats: BasketballTeamStats = {
    team: teamName,
    league_id: leagueId,
    season,
    stats_complete: false,
    missing_fields: [],
  };
  
  const headers = {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': 'api-basketball.p.rapidapi.com',
  };
  
  try {
    // Step 1: Find team ID
    console.log(`[Basketball] Fetching team ID for: ${teamName}`);
    
    const teamsResponse = await fetch(
      `https://api-basketball.p.rapidapi.com/teams?search=${encodeURIComponent(teamName)}`,
      { headers }
    );
    
    if (!teamsResponse.ok) {
      console.error(`[Basketball] Teams API error: ${teamsResponse.status}`);
      return stats;
    }
    
    const teamsData = await teamsResponse.json();
    const team = teamsData.response?.[0];
    
    if (!team) {
      console.log(`[Basketball] Team not found: ${teamName}`);
      return stats;
    }
    
    stats.team_id = team.id;
    console.log(`[Basketball] Found team: ${team.name} (ID: ${team.id})`);
    
    // Step 2: Fetch standings
    console.log(`[Basketball] Fetching standings for league ${leagueId}, season ${season}`);
    
    const standingsResponse = await fetch(
      `https://api-basketball.p.rapidapi.com/standings?league=${leagueId}&season=${season}`,
      { headers }
    );
    
    if (standingsResponse.ok) {
      const standingsData = await standingsResponse.json();
      const allStandings = standingsData.response?.flat() || [];
      
      // Find this team in standings
      const teamStanding = allStandings.find((s: any) => 
        s.team?.id === team.id || 
        s.team?.name?.toLowerCase() === teamName.toLowerCase()
      );
      
      if (teamStanding) {
        stats.league_position = teamStanding.position || teamStanding.rank;
        stats.wins = teamStanding.games?.win?.total ?? teamStanding.won;
        stats.losses = teamStanding.games?.lose?.total ?? teamStanding.lost;
        
        if (stats.wins !== undefined && stats.losses !== undefined) {
          const total = stats.wins + stats.losses;
          stats.win_percentage = total > 0 ? stats.wins / total : 0;
        }
        
        // Points data from standings
        if (teamStanding.points) {
          stats.points_per_game = teamStanding.points.for / (stats.wins! + stats.losses!) || undefined;
          stats.points_allowed_per_game = teamStanding.points.against / (stats.wins! + stats.losses!) || undefined;
        }
        
        // Home/Away records
        if (teamStanding.games?.win?.home !== undefined && teamStanding.games?.lose?.home !== undefined) {
          stats.home_record = `${teamStanding.games.win.home}-${teamStanding.games.lose.home}`;
        }
        if (teamStanding.games?.win?.away !== undefined && teamStanding.games?.lose?.away !== undefined) {
          stats.away_record = `${teamStanding.games.win.away}-${teamStanding.games.lose.away}`;
        }
        
        console.log(`[Basketball] Standings: Position ${stats.league_position}, Record ${stats.wins}-${stats.losses}`);
      }
    }
    
    // Step 3: Fetch recent games for form
    console.log(`[Basketball] Fetching recent games...`);
    
    const gamesResponse = await fetch(
      `https://api-basketball.p.rapidapi.com/games?team=${team.id}&season=${season}&last=5`,
      { headers }
    );
    
    if (gamesResponse.ok) {
      const gamesData = await gamesResponse.json();
      const games = gamesData.response || [];
      
      if (games.length > 0) {
        // Calculate form and streak
        let form = '';
        let lastPPG = 0;
        let lastPAG = 0;
        let daysRest = 0;
        let streak = { type: '', count: 0 };
        
        games.forEach((game: any, index: number) => {
          const isHomeGame = game.teams?.home?.id === team.id;
          const teamScore = isHomeGame ? game.scores?.home?.total : game.scores?.away?.total;
          const oppScore = isHomeGame ? game.scores?.away?.total : game.scores?.home?.total;
          
          if (teamScore !== undefined && oppScore !== undefined) {
            const won = teamScore > oppScore;
            form += won ? 'W' : 'L';
            lastPPG += teamScore;
            lastPAG += oppScore;
            
            // Track streak
            if (index === 0) {
              streak.type = won ? 'W' : 'L';
              streak.count = 1;
            } else if ((won && streak.type === 'W') || (!won && streak.type === 'L')) {
              streak.count++;
            }
          }
          
          // Days rest from most recent game
          if (index === 0 && game.date) {
            const gameDate = new Date(game.date);
            const now = new Date();
            daysRest = Math.floor((now.getTime() - gameDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        });
        
        stats.recent_form = form;
        stats.last_5_record = form;
        stats.streak = streak.count > 0 ? `${streak.type}${streak.count}` : undefined;
        stats.days_rest = daysRest;
        stats.back_to_back = daysRest === 0;
        
        if (games.length > 0) {
          stats.points_per_game = stats.points_per_game || (lastPPG / games.length);
          stats.points_allowed_per_game = stats.points_allowed_per_game || (lastPAG / games.length);
        }
        
        console.log(`[Basketball] Form: ${form}, Streak: ${stats.streak}, Days rest: ${daysRest}`);
      }
    }
    
    // Step 4: Fetch team statistics for advanced metrics
    console.log(`[Basketball] Fetching advanced statistics...`);
    
    const statsResponse = await fetch(
      `https://api-basketball.p.rapidapi.com/statistics?team=${team.id}&season=${season}&league=${leagueId}`,
      { headers }
    );
    
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      const teamStats = statsData.response;
      
      if (teamStats) {
        // Calculate per-game metrics
        const gamesPlayed = teamStats.games?.played?.total || (stats.wins || 0) + (stats.losses || 0);
        
        if (gamesPlayed > 0) {
          stats.points_per_game = stats.points_per_game || (teamStats.points?.for?.total?.total / gamesPlayed);
          stats.points_allowed_per_game = stats.points_allowed_per_game || (teamStats.points?.against?.total?.total / gamesPlayed);
          
          // Estimate efficiency ratings (simplified)
          if (stats.points_per_game && stats.points_allowed_per_game) {
            // Assume average pace of ~100 possessions per game for estimation
            stats.offensive_rating = stats.points_per_game; // Simplified
            stats.defensive_rating = stats.points_allowed_per_game;
            stats.net_rating = stats.offensive_rating - stats.defensive_rating;
          }
        }
        
        console.log(`[Basketball] PPG: ${stats.points_per_game?.toFixed(1)}, PAG: ${stats.points_allowed_per_game?.toFixed(1)}`);
      }
    }
    
    // Calculate team rating
    stats.team_rating = calculateBasketballRating(stats);
    
    // Validate data quality
    const validation = validateBasketballStats(stats);
    stats.data_quality = validation.quality;
    stats.quality_score = validation.score;
    stats.missing_fields = validation.missing;
    stats.stats_complete = validation.quality !== 'low';
    
    console.log(`[Basketball] ${teamName}: Quality ${validation.quality} (${validation.score}%), Rating: ${stats.team_rating}`);
    
    return stats;
    
  } catch (error) {
    console.error(`[Basketball] Error fetching stats for ${teamName}:`, error);
    return stats;
  }
}

// ============= MAIN SERVER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiBasketballKey = Deno.env.get('API_FOOTBALL_KEY'); // Same RapidAPI key

    if (!apiBasketballKey) {
      throw new Error('API_FOOTBALL_KEY not configured (used for API-Basketball)');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { sports = ['basketball'], window_hours = 48, max_events = 15 } = await req.json();

    console.log('=== BASKETBALL DATA SCRAPER START ===');
    console.log('Input:', { sports, window_hours, max_events });

    // Fetch upcoming basketball events
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`*, markets (*)`)
      .eq('sport', 'basketball')
      .eq('status', 'upcoming')
      .gte('start_time_utc', now.toISOString())
      .lte('start_time_utc', windowEnd.toISOString())
      .order('start_time_utc', { ascending: true })
      .limit(max_events);

    if (eventsError) {
      throw new Error(`Error fetching events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          matches_scraped: 0,
          raw_data: { complete: [], incomplete: [] },
          formatted_data: 'No upcoming basketball events found.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} upcoming basketball events`);

    const season = getCurrentSeason();
    const completeMatches: BasketballMatchData[] = [];
    const incompleteMatches: BasketballMatchData[] = [];
    let formattedOutput = `═══════════════════════════════════════════════════════════════════════════════
🏀 BASKETBALL DATA REPORT
Generated: ${now.toISOString()}
Season: ${season}
═══════════════════════════════════════════════════════════════════════════════

`;

    // Process each event
    for (const event of events) {
      const homeTeam = event.home_team;
      const awayTeam = event.away_team;
      const league = event.league;
      
      console.log(`\nProcessing: ${homeTeam} vs ${awayTeam} (${league})`);
      
      const leagueId = normalizeLeagueName(league);
      
      if (!leagueId) {
        console.log(`Unknown league: ${league}, skipping...`);
        continue;
      }
      
      // Fetch stats for both teams in parallel
      const [homeStats, awayStats] = await Promise.all([
        fetchBasketballTeamStats(homeTeam, leagueId, season, apiBasketballKey, true),
        fetchBasketballTeamStats(awayTeam, leagueId, season, apiBasketballKey, false),
      ]);
      
      // Get best odds for each market
      const bestOdds: Record<string, any> = {};
      for (const market of event.markets || []) {
        const key = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        if (!bestOdds[key] || odds > bestOdds[key].odds) {
          bestOdds[key] = {
            market: market.market_type,
            selection: market.selection,
            odds,
            bookmaker: market.bookmaker,
            implied_probability: (1 / odds * 100).toFixed(1) + '%',
          };
        }
      }
      
      const matchData: BasketballMatchData = {
        match: `${homeTeam} vs ${awayTeam}`,
        event_id: event.id,
        sport: 'basketball',
        league,
        league_id: leagueId,
        start_time: event.start_time_aedt,
        home_team: homeTeam,
        away_team: awayTeam,
        home_team_stats: homeStats,
        away_team_stats: awayStats,
        stats_incomplete: !homeStats.stats_complete || !awayStats.stats_complete,
        incomplete_reason: !homeStats.stats_complete || !awayStats.stats_complete
          ? `Missing: Home[${homeStats.missing_fields?.join(', ')}] Away[${awayStats.missing_fields?.join(', ')}]`
          : undefined,
        odds: Object.values(bestOdds),
      };
      
      // Add contextual tags
      matchData.match_contextual_tags = [];
      if (homeStats.back_to_back || awayStats.back_to_back) {
        matchData.match_contextual_tags.push('back_to_back');
      }
      if ((homeStats.streak?.startsWith('W') && parseInt(homeStats.streak.slice(1)) >= 5) ||
          (awayStats.streak?.startsWith('W') && parseInt(awayStats.streak.slice(1)) >= 5)) {
        matchData.match_contextual_tags.push('hot_streak');
      }
      
      if (matchData.stats_incomplete) {
        incompleteMatches.push(matchData);
      } else {
        completeMatches.push(matchData);
      }
      
      // Format for output
      formattedOutput += `───────────────────────────────────────────────────────────────────────────────
📅 ${event.start_time_aedt}
🏀 ${homeTeam} vs ${awayTeam}
🏆 ${league}
───────────────────────────────────────────────────────────────────────────────

🏠 HOME: ${homeTeam}
   Record: ${homeStats.wins ?? '?'} - ${homeStats.losses ?? '?'} (${homeStats.win_percentage ? (homeStats.win_percentage * 100).toFixed(1) : '?'}%)
   Position: ${homeStats.league_position ?? 'N/A'}
   PPG: ${homeStats.points_per_game?.toFixed(1) ?? 'N/A'} | PAG: ${homeStats.points_allowed_per_game?.toFixed(1) ?? 'N/A'}
   Net Rating: ${homeStats.net_rating?.toFixed(1) ?? 'N/A'}
   Form: ${homeStats.recent_form || 'N/A'} | Streak: ${homeStats.streak || 'N/A'}
   Days Rest: ${homeStats.days_rest ?? 'N/A'} ${homeStats.back_to_back ? '⚠️ B2B' : ''}
   Home Record: ${homeStats.home_record || 'N/A'}
   Rating: ${homeStats.team_rating} | Quality: ${homeStats.data_quality} (${homeStats.quality_score}%)

🚗 AWAY: ${awayTeam}
   Record: ${awayStats.wins ?? '?'} - ${awayStats.losses ?? '?'} (${awayStats.win_percentage ? (awayStats.win_percentage * 100).toFixed(1) : '?'}%)
   Position: ${awayStats.league_position ?? 'N/A'}
   PPG: ${awayStats.points_per_game?.toFixed(1) ?? 'N/A'} | PAG: ${awayStats.points_allowed_per_game?.toFixed(1) ?? 'N/A'}
   Net Rating: ${awayStats.net_rating?.toFixed(1) ?? 'N/A'}
   Form: ${awayStats.recent_form || 'N/A'} | Streak: ${awayStats.streak || 'N/A'}
   Days Rest: ${awayStats.days_rest ?? 'N/A'} ${awayStats.back_to_back ? '⚠️ B2B' : ''}
   Away Record: ${awayStats.away_record || 'N/A'}
   Rating: ${awayStats.team_rating} | Quality: ${awayStats.data_quality} (${awayStats.quality_score}%)

📊 RATING DIFFERENTIAL: ${(homeStats.team_rating || 1500) - (awayStats.team_rating || 1500)} (Home advantage adjusted)

💰 MARKETS:
${Object.values(bestOdds).map((o: any) => `   ${o.selection}: ${o.odds.toFixed(2)} (${o.implied_probability}) @ ${o.bookmaker}`).join('\n')}

${matchData.stats_incomplete ? `⚠️ DATA INCOMPLETE: ${matchData.incomplete_reason}` : '✅ DATA COMPLETE'}

`;
    }

    formattedOutput += `═══════════════════════════════════════════════════════════════════════════════
📈 SUMMARY
Complete Events: ${completeMatches.length}
Incomplete Events: ${incompleteMatches.length}
═══════════════════════════════════════════════════════════════════════════════`;

    console.log('=== BASKETBALL DATA SCRAPER COMPLETE ===');
    console.log(`Complete: ${completeMatches.length}, Incomplete: ${incompleteMatches.length}`);

    // Save to scrape_history
    await supabase.from('scrape_history').insert({
      sports: ['basketball'],
      window_hours,
      matches_count: events.length,
      summary: `Basketball: ${completeMatches.length} complete, ${incompleteMatches.length} incomplete`,
      formatted_data: formattedOutput,
      raw_data: { complete: completeMatches, incomplete: incompleteMatches },
    });

    return new Response(
      JSON.stringify({
        matches_scraped: events.length,
        complete_count: completeMatches.length,
        incomplete_count: incompleteMatches.length,
        formatted_data: formattedOutput,
        raw_data: {
          complete: completeMatches,
          incomplete: incompleteMatches,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-basketball-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
