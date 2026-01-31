// ============================================================================
// SOCCER MARKET SCRAPER - EPL, LA LIGA, SERIE A, BUNDESLIGA, CHAMPIONS LEAGUE
// ============================================================================
// Uses Gamma API to fetch soccer H2H markets directly (more reliable than scraping)
// Falls back to Firecrawl for additional coverage
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Soccer league configurations
const SOCCER_LEAGUES = {
  epl: {
    name: 'EPL',
    gammaTag: 'epl',
    oddsApiSport: 'soccer_epl',
  },
  laliga: {
    name: 'La Liga',
    gammaTag: 'la-liga',
    oddsApiSport: 'soccer_spain_la_liga',
  },
  seriea: {
    name: 'Serie A',
    gammaTag: 'serie-a',
    oddsApiSport: 'soccer_italy_serie_a',
  },
  bundesliga: {
    name: 'Bundesliga',
    gammaTag: 'bundesliga',
    oddsApiSport: 'soccer_germany_bundesliga',
  },
  ucl: {
    name: 'UCL',
    gammaTag: 'champions-league',
    oddsApiSport: 'soccer_uefa_champs_league',
  },
};

interface SoccerMarket {
  conditionId: string;
  question: string;
  teamHome: string;
  teamAway: string;
  yesPrice: number;
  noPrice: number;
  tokenIdYes: string | null;
  tokenIdNo: string | null;
  volume: number;
  slug: string | null;
  eventDate: string | null;
  league: string;
}

// Extract team names from event title like "Liverpool vs Arsenal" or "Real Madrid vs Barcelona"
function extractTeamsFromTitle(title: string): { home: string; away: string } | null {
  // Pattern: "Team1 vs Team2" or "Team1 v Team2"
  const vsMatch = title.match(/^(.+?)\s+(?:vs?\.?|versus)\s+(.+?)(?:\s*[-–]\s*|\s*$)/i);
  if (vsMatch) {
    return { home: vsMatch[1].trim(), away: vsMatch[2].trim() };
  }
  
  // Pattern: "Will Team1 beat Team2?"
  const beatMatch = title.match(/will\s+(.+?)\s+beat\s+(.+?)[\?\s]/i);
  if (beatMatch) {
    return { home: beatMatch[1].trim(), away: beatMatch[2].trim() };
  }
  
  return null;
}

// Fetch markets from Gamma API for a specific league tag
async function fetchGammaMarkets(leagueTag: string, leagueName: string): Promise<SoccerMarket[]> {
  const markets: SoccerMarket[] = [];
  
  try {
    // Try with specific league tag first
    const urls = [
      `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=${leagueTag}&limit=100`,
      `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=soccer&limit=200`,
    ];
    
    const seenConditions = new Set<string>();
    
    for (const url of urls) {
      console.log(`[GAMMA] Fetching ${leagueName} from ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const events = await response.json();
      console.log(`[GAMMA] Got ${events.length} events for ${leagueName}`);
      
      for (const event of events) {
        const eventMarkets = event.markets || [];
        
        for (const market of eventMarkets) {
          // Skip if already seen
          if (seenConditions.has(market.conditionId)) continue;
          
          const question = (market.question || '').toLowerCase();
          const gammaType = (market.sportsMarketType || '').toLowerCase();
          const eventTitle = event.title || '';
          
          // Only H2H/Moneyline - skip draws, totals, props
          const isH2H = gammaType === 'moneyline' || 
                       gammaType === 'h2h' || 
                       gammaType === 'winner' ||
                       gammaType === 'match_winner' ||
                       question.includes(' beat ') ||
                       question.includes(' win ');
          const isDraw = question.includes('draw') || question.includes('tie');
          const isTotal = question.includes('over') || question.includes('under') || question.includes('goals');
          const isSpread = question.includes('handicap') || question.includes('spread');
          
          if (!isH2H || isDraw || isTotal || isSpread) continue;
          
          // Check if event is from the right league (for general soccer query)
          const tags = event.tags || [];
          const tagSlugs = tags.map((t: any) => (t.slug || t).toLowerCase());
          const isCorrectLeague = tagSlugs.includes(leagueTag) || 
                                  (leagueTag === 'champions-league' && tagSlugs.some((t: string) => t.includes('ucl') || t.includes('champions')));
          
          if (url.includes('soccer') && !isCorrectLeague) continue;
          
          // Extract teams
          const teams = extractTeamsFromTitle(eventTitle) || extractTeamsFromTitle(market.question || '');
          if (!teams) continue;
          
          // Extract token IDs
          let tokenIdYes = null;
          let tokenIdNo = null;
          
          if (market.clobTokenIds) {
            let tokenIds = market.clobTokenIds;
            if (typeof tokenIds === 'string') {
              try { tokenIds = JSON.parse(tokenIds); } catch {}
            }
            if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
              tokenIdYes = tokenIds[0];
              tokenIdNo = tokenIds[1];
            }
          }
          
          // Parse prices
          let yesPrice = 0.5;
          let noPrice = 0.5;
          
          if (market.outcomePrices) {
            try {
              const prices = typeof market.outcomePrices === 'string' 
                ? JSON.parse(market.outcomePrices) 
                : market.outcomePrices;
              if (Array.isArray(prices) && prices.length >= 2) {
                yesPrice = parseFloat(prices[0]) || 0.5;
                noPrice = parseFloat(prices[1]) || 0.5;
              }
            } catch {}
          }
          
          seenConditions.add(market.conditionId);
          
          markets.push({
            conditionId: market.conditionId,
            question: market.question || `${teams.home} vs ${teams.away}`,
            teamHome: teams.home,
            teamAway: teams.away,
            yesPrice,
            noPrice,
            tokenIdYes,
            tokenIdNo,
            volume: parseFloat(market.volume || '0') || 0,
            slug: event.slug || null,
            eventDate: event.endDate || market.endDate || null,
            league: leagueName,
          });
        }
      }
    }
    
    console.log(`[GAMMA] Found ${markets.length} H2H markets for ${leagueName}`);
    return markets;
  } catch (e) {
    console.error(`[GAMMA] Error fetching ${leagueName}:`, e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[SCRAPE-SOCCER] Starting soccer market sync (Gamma API)...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for specific league in request body
    let leaguesToFetch = Object.entries(SOCCER_LEAGUES);
    try {
      const body = await req.json();
      if (body.league && SOCCER_LEAGUES[body.league as keyof typeof SOCCER_LEAGUES]) {
        leaguesToFetch = [[body.league, SOCCER_LEAGUES[body.league as keyof typeof SOCCER_LEAGUES]]];
      }
    } catch {}

    // Fetch all leagues in parallel
    const allMarkets: SoccerMarket[] = [];
    
    const results = await Promise.all(
      leaguesToFetch.map(([key, config]) => 
        fetchGammaMarkets(config.gammaTag, config.name)
      )
    );
    
    for (const markets of results) {
      allMarkets.push(...markets);
    }

    console.log(`[SCRAPE-SOCCER] Total markets found: ${allMarkets.length}`);

    // Upsert to polymarket_h2h_cache
    const now = new Date().toISOString();
    let upsertCount = 0;
    
    for (const market of allMarkets) {
      const cacheEntry = {
        condition_id: market.conditionId,
        event_title: `${market.teamHome} vs ${market.teamAway}`,
        question: market.question,
        yes_price: market.yesPrice,
        no_price: market.noPrice,
        team_home: market.teamHome,
        team_away: market.teamAway,
        team_home_normalized: market.teamHome.toLowerCase().replace(/[^a-z0-9]/g, ''),
        team_away_normalized: market.teamAway.toLowerCase().replace(/[^a-z0-9]/g, ''),
        sport_category: market.league,
        market_type: 'h2h',
        source: 'gamma-api',
        status: 'active',
        token_id_yes: market.tokenIdYes,
        token_id_no: market.tokenIdNo,
        polymarket_slug: market.slug,
        event_date: market.eventDate,
        volume: market.volume,
        last_price_update: now,
        last_bulk_sync: now,
        monitoring_status: 'idle',
      };

      const { error } = await supabase
        .from('polymarket_h2h_cache')
        .upsert(cacheEntry, { onConflict: 'condition_id' });

      if (error) {
        console.error(`[SCRAPE-SOCCER] Upsert error for ${market.teamHome} vs ${market.teamAway}:`, error.message);
      } else {
        upsertCount++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[SCRAPE-SOCCER] Complete: ${upsertCount} markets cached in ${elapsed}ms`);

    // Get updated cache stats by league
    const { data: stats } = await supabase
      .from('polymarket_h2h_cache')
      .select('sport_category, volume')
      .in('sport_category', Object.values(SOCCER_LEAGUES).map(l => l.name));
    
    const byLeague: Record<string, { count: number; volume: number }> = {};
    for (const row of stats || []) {
      if (!byLeague[row.sport_category]) {
        byLeague[row.sport_category] = { count: 0, volume: 0 };
      }
      byLeague[row.sport_category].count++;
      byLeague[row.sport_category].volume += row.volume || 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        fetched: allMarkets.length,
        cached: upsertCount,
        elapsed_ms: elapsed,
        by_league: byLeague,
        sample: allMarkets.slice(0, 5).map(m => ({
          match: `${m.teamHome} vs ${m.teamAway}`,
          league: m.league,
          prices: [m.yesPrice, m.noPrice],
          volume: m.volume,
          hasTokenIds: !!(m.tokenIdYes && m.tokenIdNo),
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SCRAPE-SOCCER] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
