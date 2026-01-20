import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= INTERFACES =============

interface TennisPlayerStats {
  player_name: string;
  player_name_normalized: string;
  atp_ranking?: number;
  wta_ranking?: number;
  ranking_points?: number;
  elo_overall?: number;
  elo_hard?: number;
  elo_clay?: number;
  elo_grass?: number;
  recent_form?: string;
  win_rate_last_10?: number;
  win_rate_last_20?: number;
  hard_win_rate?: number;
  clay_win_rate?: number;
  grass_win_rate?: number;
  matches_last_7_days?: number;
  matches_last_14_days?: number;
  days_since_last_match?: number;
  injury_status?: string;
  injury_details?: string;
  qualitative_tags?: string[];
  data_source: 'odds_only' | 'perplexity' | 'api';
  data_quality: 'high' | 'medium' | 'low';
  quality_score: number;
}

interface H2HRecord {
  player1_name: string;
  player2_name: string;
  player1_wins: number;
  player2_wins: number;
  hard_player1_wins?: number;
  hard_player2_wins?: number;
  clay_player1_wins?: number;
  clay_player2_wins?: number;
  grass_player1_wins?: number;
  grass_player2_wins?: number;
  last_match_surface?: string;
  last_winner?: string;
}

interface MatchEnrichment {
  player1: TennisPlayerStats;
  player2: TennisPlayerStats;
  h2h?: H2HRecord;
  surface: 'hard' | 'clay' | 'grass' | 'unknown';
  tournament_tier: 'grand_slam' | 'masters' | 'atp500' | 'atp250' | 'challenger' | 'unknown';
}

// ============= HELPER FUNCTIONS =============

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .trim();
}

function detectSurface(league: string, tournament: string): 'hard' | 'clay' | 'grass' | 'unknown' {
  const combined = `${league} ${tournament}`.toLowerCase();
  
  if (combined.includes('roland garros') || combined.includes('french open') || 
      combined.includes('madrid') || combined.includes('rome') || combined.includes('monte carlo') ||
      combined.includes('barcelona') || combined.includes('clay')) {
    return 'clay';
  }
  if (combined.includes('wimbledon') || combined.includes('halle') || 
      combined.includes("queen's") || combined.includes('grass')) {
    return 'grass';
  }
  // Most other tournaments are hard court
  if (combined.includes('australian open') || combined.includes('us open') ||
      combined.includes('miami') || combined.includes('indian wells') ||
      combined.includes('cincinnati') || combined.includes('hard')) {
    return 'hard';
  }
  return 'hard'; // Default to hard court
}

function detectTournamentTier(league: string): 'grand_slam' | 'masters' | 'atp500' | 'atp250' | 'challenger' | 'unknown' {
  const l = league.toLowerCase();
  if (l.includes('australian open') || l.includes('french open') || l.includes('roland garros') ||
      l.includes('wimbledon') || l.includes('us open')) {
    return 'grand_slam';
  }
  if (l.includes('masters') || l.includes('indian wells') || l.includes('miami') ||
      l.includes('monte carlo') || l.includes('madrid') || l.includes('rome') ||
      l.includes('canada') || l.includes('cincinnati') || l.includes('shanghai') || l.includes('paris')) {
    return 'masters';
  }
  if (l.includes('500') || l.includes('atp 500')) return 'atp500';
  if (l.includes('250') || l.includes('atp 250')) return 'atp250';
  if (l.includes('challenger')) return 'challenger';
  return 'unknown';
}

// ============= PERPLEXITY PLAYER STATS FETCH =============

async function getPlayerStatsFromPerplexity(
  playerName: string,
  perplexityApiKey: string,
  surface: string
): Promise<Partial<TennisPlayerStats>> {
  console.log(`[Perplexity] Fetching stats for ${playerName} (${surface})`);
  
  const systemPrompt = `You are a tennis statistics expert. Provide accurate, current data for tennis players.
Return ONLY a valid JSON object with no markdown formatting or explanation.`;

  const userPrompt = `Get current stats for tennis player "${playerName}":

Required JSON format:
{
  "atp_ranking": <number or null>,
  "wta_ranking": <number or null>,
  "ranking_points": <number or null>,
  "recent_form": "<last 5-10 match results as W/L string, e.g., 'WWLWWWLW'>",
  "win_rate_last_10": <decimal 0-1>,
  "hard_win_rate": <decimal 0-1>,
  "clay_win_rate": <decimal 0-1>,
  "grass_win_rate": <decimal 0-1>,
  "recent_matches_count": <matches in last 14 days>,
  "days_since_last_match": <number>,
  "injury_status": "<'fit' or 'doubtful' or 'injured'>",
  "injury_details": "<details if any>",
  "qualitative_notes": "<any important context like recent form trend, fatigue, surface preference>"
}

Focus on current 2024-2025 season data. Include ATP OR WTA ranking based on tour.`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      console.log(`[Perplexity] HTTP error: ${response.status}`);
      return {};
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`[Perplexity] Parsed stats for ${playerName}:`, Object.keys(parsed));
      
      const qualitativeTags: string[] = [];
      
      // Generate tags from notes
      const notes = (parsed.qualitative_notes || '').toLowerCase();
      if (notes.includes('peak') || notes.includes('excellent')) qualitativeTags.push('peak_form');
      if (notes.includes('fatigue') || notes.includes('tired')) qualitativeTags.push('fatigue_risk');
      if (notes.includes('injury') || notes.includes('recovering')) qualitativeTags.push('injury_concern');
      if (notes.includes('clay specialist') || notes.includes('clay court')) qualitativeTags.push('clay_specialist');
      if (notes.includes('grass') && notes.includes('strong')) qualitativeTags.push('grass_specialist');
      
      return {
        atp_ranking: parsed.atp_ranking,
        wta_ranking: parsed.wta_ranking,
        ranking_points: parsed.ranking_points,
        recent_form: parsed.recent_form,
        win_rate_last_10: parsed.win_rate_last_10,
        hard_win_rate: parsed.hard_win_rate,
        clay_win_rate: parsed.clay_win_rate,
        grass_win_rate: parsed.grass_win_rate,
        matches_last_7_days: Math.ceil((parsed.recent_matches_count || 0) / 2),
        matches_last_14_days: parsed.recent_matches_count,
        days_since_last_match: parsed.days_since_last_match,
        injury_status: parsed.injury_status,
        injury_details: parsed.injury_details,
        qualitative_tags: qualitativeTags,
      };
    } catch (parseError) {
      console.log(`[Perplexity] JSON parse error for ${playerName}:`, parseError);
      return {};
    }
  } catch (error) {
    console.log(`[Perplexity] Request error for ${playerName}:`, error);
    return {};
  }
}

// ============= HEAD-TO-HEAD FETCH =============

async function getH2HFromPerplexity(
  player1: string,
  player2: string,
  perplexityApiKey: string
): Promise<H2HRecord | null> {
  console.log(`[Perplexity] Fetching H2H: ${player1} vs ${player2}`);
  
  const systemPrompt = `You are a tennis statistics expert. Provide head-to-head records between players.
Return ONLY a valid JSON object with no markdown formatting.`;

  const userPrompt = `Get head-to-head record between "${player1}" and "${player2}":

Required JSON format:
{
  "player1_wins": <total wins for first player>,
  "player2_wins": <total wins for second player>,
  "hard_p1_wins": <wins on hard court for player1>,
  "hard_p2_wins": <wins on hard court for player2>,
  "clay_p1_wins": <wins on clay for player1>,
  "clay_p2_wins": <wins on clay for player2>,
  "grass_p1_wins": <wins on grass for player1>,
  "grass_p2_wins": <wins on grass for player2>,
  "last_match_surface": "<hard/clay/grass>",
  "last_winner": "<name of last match winner>",
  "last_match_date": "<YYYY-MM-DD or null>"
}

If they have never played, return {"player1_wins": 0, "player2_wins": 0}.`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.log(`[Perplexity H2H] HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`[Perplexity H2H] ${player1} ${parsed.player1_wins}-${parsed.player2_wins} ${player2}`);
      
      return {
        player1_name: player1,
        player2_name: player2,
        player1_wins: parsed.player1_wins || 0,
        player2_wins: parsed.player2_wins || 0,
        hard_player1_wins: parsed.hard_p1_wins || 0,
        hard_player2_wins: parsed.hard_p2_wins || 0,
        clay_player1_wins: parsed.clay_p1_wins || 0,
        clay_player2_wins: parsed.clay_p2_wins || 0,
        grass_player1_wins: parsed.grass_p1_wins || 0,
        grass_player2_wins: parsed.grass_p2_wins || 0,
        last_match_surface: parsed.last_match_surface,
        last_winner: parsed.last_winner,
      };
    } catch (parseError) {
      console.log(`[Perplexity H2H] Parse error:`, parseError);
      return null;
    }
  } catch (error) {
    console.log(`[Perplexity H2H] Request error:`, error);
    return null;
  }
}

// ============= CALCULATE ELO FROM RANKING =============

function estimateEloFromRanking(ranking: number | undefined): number {
  if (!ranking) return 1500;
  
  // Top 10: 2000-2200, Top 50: 1800-2000, Top 100: 1600-1800, Rest: 1400-1600
  if (ranking <= 1) return 2200;
  if (ranking <= 5) return 2100 - (ranking - 1) * 20;
  if (ranking <= 10) return 2020 - (ranking - 5) * 20;
  if (ranking <= 20) return 1900 - (ranking - 10) * 10;
  if (ranking <= 50) return 1800 - (ranking - 20) * 5;
  if (ranking <= 100) return 1650 - (ranking - 50) * 3;
  if (ranking <= 200) return 1500 - (ranking - 100) * 2;
  return Math.max(1200, 1300 - (ranking - 200));
}

// ============= CALCULATE QUALITY SCORE =============

function calculateQualityScore(stats: Partial<TennisPlayerStats>): { score: number; quality: 'high' | 'medium' | 'low' } {
  let score = 0;
  
  // Critical fields (60% weight)
  if (stats.atp_ranking || stats.wta_ranking) score += 20;
  if (stats.recent_form && stats.recent_form.length >= 5) score += 20;
  if (stats.win_rate_last_10 !== undefined) score += 20;
  
  // Surface data (20% weight)
  if (stats.hard_win_rate !== undefined) score += 7;
  if (stats.clay_win_rate !== undefined) score += 7;
  if (stats.grass_win_rate !== undefined) score += 6;
  
  // Fatigue/context (20% weight)
  if (stats.matches_last_14_days !== undefined) score += 7;
  if (stats.days_since_last_match !== undefined) score += 7;
  if (stats.injury_status) score += 6;
  
  const quality: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, quality };
}

// ============= BUILD FULL PLAYER STATS =============

async function buildPlayerStats(
  playerName: string,
  surface: string,
  perplexityApiKey: string,
  supabaseAdmin: any
): Promise<TennisPlayerStats> {
  const normalized = normalizePlayerName(playerName);
  
  // Check cache first
  const { data: cached } = await supabaseAdmin
    .from('tennis_players')
    .select('*')
    .eq('player_name_normalized', normalized)
    .single();
  
  // Use cache if less than 6 hours old
  if (cached && cached.last_updated) {
    const cacheAge = Date.now() - new Date(cached.last_updated).getTime();
    if (cacheAge < 6 * 60 * 60 * 1000) {
      console.log(`[Cache Hit] Using cached stats for ${playerName}`);
      return cached as TennisPlayerStats;
    }
  }
  
  // Fetch fresh data from Perplexity
  const perplexityStats = await getPlayerStatsFromPerplexity(playerName, perplexityApiKey, surface);
  
  const ranking = perplexityStats.atp_ranking || perplexityStats.wta_ranking;
  const baseElo = estimateEloFromRanking(ranking);
  
  // Adjust Elo by surface win rates
  const surfaceAdjustments = {
    hard: (perplexityStats.hard_win_rate || 0.5) - 0.5,
    clay: (perplexityStats.clay_win_rate || 0.5) - 0.5,
    grass: (perplexityStats.grass_win_rate || 0.5) - 0.5,
  };
  
  const { score, quality } = calculateQualityScore(perplexityStats);
  
  const fullStats: TennisPlayerStats = {
    player_name: playerName,
    player_name_normalized: normalized,
    atp_ranking: perplexityStats.atp_ranking,
    wta_ranking: perplexityStats.wta_ranking,
    ranking_points: perplexityStats.ranking_points,
    elo_overall: baseElo,
    elo_hard: baseElo + surfaceAdjustments.hard * 100,
    elo_clay: baseElo + surfaceAdjustments.clay * 100,
    elo_grass: baseElo + surfaceAdjustments.grass * 100,
    recent_form: perplexityStats.recent_form,
    win_rate_last_10: perplexityStats.win_rate_last_10,
    win_rate_last_20: undefined,
    hard_win_rate: perplexityStats.hard_win_rate,
    clay_win_rate: perplexityStats.clay_win_rate,
    grass_win_rate: perplexityStats.grass_win_rate,
    matches_last_7_days: perplexityStats.matches_last_7_days,
    matches_last_14_days: perplexityStats.matches_last_14_days,
    days_since_last_match: perplexityStats.days_since_last_match,
    injury_status: perplexityStats.injury_status,
    injury_details: perplexityStats.injury_details,
    qualitative_tags: perplexityStats.qualitative_tags || [],
    data_source: score >= 45 ? 'perplexity' : 'odds_only',
    data_quality: quality,
    quality_score: score,
  };
  
  // Upsert to cache
  await supabaseAdmin.from('tennis_players').upsert({
    ...fullStats,
    last_updated: new Date().toISOString(),
  }, { onConflict: 'player_name_normalized' });
  
  console.log(`[Stats Built] ${playerName}: quality=${quality}, score=${score}, ranking=${ranking}`);
  return fullStats;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      return new Response(
        JSON.stringify({ error: 'PERPLEXITY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { matches } = await req.json();
    
    if (!matches || !Array.isArray(matches)) {
      return new Response(
        JSON.stringify({ error: 'Missing matches array in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Tennis Scraper] Processing ${matches.length} matches`);
    
    const enrichments: Record<string, MatchEnrichment> = {};
    
    for (const match of matches) {
      const { event_id, home_team, away_team, league } = match;
      
      if (!home_team || !away_team) {
        console.log(`[Skip] Missing player names for ${event_id}`);
        continue;
      }
      
      const surface = detectSurface(league, '');
      const tournamentTier = detectTournamentTier(league);
      
      console.log(`[Processing] ${home_team} vs ${away_team} (${surface}/${tournamentTier})`);
      
      // Fetch player stats in parallel
      const [player1Stats, player2Stats] = await Promise.all([
        buildPlayerStats(home_team, surface, perplexityApiKey, supabaseAdmin),
        buildPlayerStats(away_team, surface, perplexityApiKey, supabaseAdmin),
      ]);
      
      // Fetch H2H
      let h2h: H2HRecord | null = null;
      
      // Check H2H cache first
      const normalizedP1 = normalizePlayerName(home_team);
      const normalizedP2 = normalizePlayerName(away_team);
      const [key1, key2] = [normalizedP1, normalizedP2].sort();
      
      const { data: cachedH2H } = await supabaseAdmin
        .from('tennis_h2h')
        .select('*')
        .or(`and(player1_name.eq.${home_team},player2_name.eq.${away_team}),and(player1_name.eq.${away_team},player2_name.eq.${home_team})`)
        .single();
      
      if (cachedH2H) {
        console.log(`[Cache Hit] H2H for ${home_team} vs ${away_team}`);
        h2h = cachedH2H as H2HRecord;
      } else {
        h2h = await getH2HFromPerplexity(home_team, away_team, perplexityApiKey);
        if (h2h && (h2h.player1_wins > 0 || h2h.player2_wins > 0)) {
          await supabaseAdmin.from('tennis_h2h').upsert({
            ...h2h,
            last_updated: new Date().toISOString(),
          }, { onConflict: 'player1_name,player2_name' });
        }
      }
      
      enrichments[event_id] = {
        player1: player1Stats,
        player2: player2Stats,
        h2h: h2h || undefined,
        surface,
        tournament_tier: tournamentTier,
      };
    }

    console.log(`[Tennis Scraper] Enriched ${Object.keys(enrichments).length} matches`);
    
    return new Response(
      JSON.stringify({
        enrichments,
        matches_processed: Object.keys(enrichments).length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[Tennis Scraper] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
