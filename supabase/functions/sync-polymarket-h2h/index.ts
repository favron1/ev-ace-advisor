// ============================================================================
// SYNC-POLYMARKET-H2H: Bulk fetch ALL Polymarket sports H2H markets
// ============================================================================
// This function runs daily (or on-demand) to populate the polymarket_h2h_cache
// table with all active sports markets. This enables reliable matching by
// pre-caching markets rather than searching per-event.
//
// FLOW:
// 1. Paginate through ALL active Polymarket events
// 2. Filter for sports-related H2H markets (NBA, NFL, NHL, UFC, Tennis, Soccer)
// 3. Extract normalized team names using regex patterns
// 4. Store in polymarket_h2h_cache for fast matching by bookmaker detection
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket Gamma API base URL
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Sports category keywords to filter events
const SPORTS_KEYWORDS = [
  // Basketball
  'nba', 'basketball', 'lakers', 'celtics', 'warriors', 'bucks', 'heat', 'nuggets',
  'suns', '76ers', 'knicks', 'clippers', 'thunder', 'timberwolves', 'mavericks',
  'cavaliers', 'grizzlies', 'rockets', 'magic', 'pacers', 'hawks', 'bulls', 'raptors',
  'hornets', 'pistons', 'spurs', 'blazers', 'jazz', 'wizards', 'nets', 'pelicans', 'kings',
  
  // American Football
  'nfl', 'football', 'chiefs', 'eagles', 'cowboys', 'patriots', 'packers', '49ers',
  'ravens', 'bills', 'dolphins', 'jets', 'bengals', 'steelers', 'browns', 'colts',
  'titans', 'jaguars', 'texans', 'broncos', 'raiders', 'chargers', 'commanders',
  'giants', 'lions', 'vikings', 'bears', 'saints', 'falcons', 'buccaneers', 'panthers',
  'rams', 'seahawks', 'cardinals', 'super bowl',
  
  // Hockey
  'nhl', 'hockey', 'bruins', 'maple leafs', 'canadiens', 'lightning', 'avalanche',
  'oilers', 'panthers', 'rangers', 'devils', 'islanders', 'penguins', 'capitals',
  'hurricanes', 'flyers', 'blue jackets', 'red wings', 'predators', 'blues',
  'wild', 'blackhawks', 'jets', 'stars', 'flames', 'canucks', 'kraken', 'golden knights',
  'coyotes', 'ducks', 'sharks', 'kings', 'stanley cup',
  
  // MMA/UFC
  'ufc', 'mma', 'bellator', 'makhachev', 'jones', 'adesanya', 'pereira', 'volkanovski',
  'edwards', 'chimaev', 'poirier', 'gaethje', 'holloway', 'oliveira',
  
  // Tennis
  'tennis', 'australian open', 'french open', 'wimbledon', 'us open', 'atp', 'wta',
  'djokovic', 'sinner', 'alcaraz', 'medvedev', 'zverev', 'rune', 'tsitsipas',
  'sabalenka', 'swiatek', 'gauff', 'pegula', 'rybakina',
  
  // Soccer/Football
  'premier league', 'epl', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
  'champions league', 'ucl', 'manchester united', 'man city', 'liverpool',
  'chelsea', 'arsenal', 'tottenham', 'real madrid', 'barcelona', 'bayern',
  'world cup', 'euro 20',
  
  // Match indicators
  'vs', 'versus', 'beat', 'win against', 'game', 'match',
];

// Team alias mapping for normalization
const TEAM_ALIASES: Record<string, string[]> = {
  // NBA Teams
  'los angeles lakers': ['la lakers', 'lakers', 'lal'],
  'golden state warriors': ['gsw', 'warriors', 'gs warriors', 'golden state'],
  'boston celtics': ['celtics', 'boston'],
  'miami heat': ['heat', 'miami'],
  'phoenix suns': ['suns', 'phoenix'],
  'denver nuggets': ['nuggets', 'denver'],
  'milwaukee bucks': ['bucks', 'milwaukee'],
  'philadelphia 76ers': ['76ers', 'sixers', 'philly'],
  'new york knicks': ['knicks', 'ny knicks', 'new york'],
  'brooklyn nets': ['nets', 'brooklyn'],
  'dallas mavericks': ['mavs', 'mavericks', 'dallas'],
  'los angeles clippers': ['la clippers', 'clippers', 'lac'],
  'oklahoma city thunder': ['thunder', 'okc'],
  'minnesota timberwolves': ['wolves', 'timberwolves', 'minnesota'],
  'sacramento kings': ['kings', 'sacramento'],
  'new orleans pelicans': ['pelicans', 'nola'],
  'cleveland cavaliers': ['cavs', 'cavaliers', 'cleveland'],
  'memphis grizzlies': ['grizzlies', 'memphis'],
  'houston rockets': ['rockets', 'houston'],
  'orlando magic': ['magic', 'orlando'],
  'indiana pacers': ['pacers', 'indiana'],
  'atlanta hawks': ['hawks', 'atlanta'],
  'chicago bulls': ['bulls', 'chicago'],
  'toronto raptors': ['raptors', 'toronto'],
  'charlotte hornets': ['hornets', 'charlotte'],
  'detroit pistons': ['pistons', 'detroit'],
  'san antonio spurs': ['spurs', 'san antonio'],
  'portland trail blazers': ['blazers', 'portland', 'trail blazers'],
  'utah jazz': ['jazz', 'utah'],
  'washington wizards': ['wizards', 'washington'],
  
  // Tennis players
  'jannik sinner': ['sinner', 'jannik'],
  'carlos alcaraz': ['alcaraz', 'carlos'],
  'novak djokovic': ['djokovic', 'novak', 'nole'],
  'aryna sabalenka': ['sabalenka', 'aryna'],
  'iga swiatek': ['swiatek', 'iga'],
  'coco gauff': ['gauff', 'coco'],
  'jessica pegula': ['pegula', 'jessica'],
  'elena rybakina': ['rybakina', 'elena'],
};

interface PolymarketEvent {
  id: string;
  title: string;
  slug?: string;
  startDate?: string;
  endDate?: string;
  markets?: PolymarketMarket[];
}

interface PolymarketMarket {
  id: string;
  conditionId: string;
  question: string;
  outcomePrices?: string | number[];
  volume?: string | number;
  liquidity?: string | number;
  active?: boolean;
  closed?: boolean;
  lastUpdateTimestamp?: string;
}

interface ExtractedTeams {
  home: string | null;
  away: string | null;
  homeNormalized: string | null;
  awayNormalized: string | null;
}

// Normalize team name for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get the canonical (longest) name for a team
function getCanonicalName(name: string): string {
  const normalized = normalizeTeamName(name);
  
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (normalized === canonical || aliases.some(a => normalized === a || normalized.includes(a))) {
      return canonical;
    }
  }
  
  return normalized;
}

// Extract team names from event title/question
function extractTeams(title: string, question: string): ExtractedTeams {
  const text = `${title} ${question}`.toLowerCase();
  
  // Pattern 1: "Team A vs Team B" or "Team A vs. Team B"
  const vsMatch = text.match(/([a-z\s]+?)\s+(?:vs\.?|versus|v\.?)\s+([a-z\s]+?)(?:\s|$|\.|\?)/i);
  if (vsMatch) {
    const home = vsMatch[1].trim();
    const away = vsMatch[2].trim();
    return {
      home,
      away,
      homeNormalized: getCanonicalName(home),
      awayNormalized: getCanonicalName(away),
    };
  }
  
  // Pattern 2: "Will X beat Y?" or "X to beat Y"
  const beatMatch = text.match(/(?:will\s+)?(?:the\s+)?([a-z\s]+?)\s+beat\s+(?:the\s+)?([a-z\s]+?)(?:\s|$|\.|\?)/i);
  if (beatMatch) {
    const home = beatMatch[1].trim();
    const away = beatMatch[2].trim();
    return {
      home,
      away,
      homeNormalized: getCanonicalName(home),
      awayNormalized: getCanonicalName(away),
    };
  }
  
  // Pattern 3: "X game" - single team, likely a championship market
  const singleTeamMatch = text.match(/(?:will\s+)?(?:the\s+)?([a-z\s]+?)\s+win/i);
  if (singleTeamMatch) {
    const team = singleTeamMatch[1].trim();
    return {
      home: team,
      away: null,
      homeNormalized: getCanonicalName(team),
      awayNormalized: null,
    };
  }
  
  return {
    home: null,
    away: null,
    homeNormalized: null,
    awayNormalized: null,
  };
}

// Detect sport category from event title/question
function detectSportCategory(title: string, question: string): string | null {
  const text = `${title} ${question}`.toLowerCase();
  
  if (text.includes('nba') || text.includes('basketball')) return 'basketball_nba';
  if (text.includes('nfl') || text.includes('super bowl')) return 'americanfootball_nfl';
  if (text.includes('nhl') || text.includes('stanley cup') || text.includes('hockey')) return 'icehockey_nhl';
  if (text.includes('ufc') || text.includes('mma')) return 'mma_mixed_martial_arts';
  if (text.includes('tennis') || text.includes('atp') || text.includes('wta') ||
      text.includes('wimbledon') || text.includes('australian open') ||
      text.includes('french open') || text.includes('us open')) return 'tennis';
  if (text.includes('premier league') || text.includes('epl') || text.includes('champions league') ||
      text.includes('la liga') || text.includes('bundesliga') || text.includes('serie a')) return 'soccer';
  
  // Check for known team names
  for (const [canonical] of Object.entries(TEAM_ALIASES)) {
    if (text.includes(canonical)) {
      if (canonical.includes('celtics') || canonical.includes('lakers') || canonical.includes('warriors')) {
        return 'basketball_nba';
      }
    }
  }
  
  return null;
}

// Check if event is sports-related
function isSportsEvent(title: string, question: string): boolean {
  const text = `${title} ${question}`.toLowerCase();
  return SPORTS_KEYWORDS.some(keyword => text.includes(keyword));
}

// Check if market is an H2H (head-to-head) market vs a futures market
function isH2HMarket(title: string, question: string): boolean {
  const text = `${title} ${question}`.toLowerCase();
  
  // H2H indicators
  const h2hIndicators = ['vs', 'versus', 'beat', 'win against', 'game', 'match'];
  const hasH2HIndicator = h2hIndicators.some(ind => text.includes(ind));
  
  // Futures/championship indicators (negative)
  const futuresIndicators = ['championship', 'finals', 'win the', 'mvp', 'award', 'season'];
  const hasFuturesIndicator = futuresIndicators.some(ind => text.includes(ind));
  
  return hasH2HIndicator && !hasFuturesIndicator;
}

// Parse date from Polymarket event
function parseEventDate(event: PolymarketEvent): Date | null {
  if (event.endDate) {
    try {
      return new Date(event.endDate);
    } catch {
      // Ignore parse errors
    }
  }
  if (event.startDate) {
    try {
      return new Date(event.startDate);
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

// Parse prices from market
function parsePrices(market: PolymarketMarket): { yesPrice: number; noPrice: number } {
  let yesPrice = 0.5;
  let noPrice = 0.5;
  
  if (market.outcomePrices) {
    try {
      const prices = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices;
      
      if (Array.isArray(prices) && prices.length >= 2) {
        yesPrice = parseFloat(String(prices[0])) || 0.5;
        noPrice = parseFloat(String(prices[1])) || 0.5;
      }
    } catch {
      // Use defaults
    }
  }
  
  return { yesPrice, noPrice };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[SYNC-POLYMARKET-H2H] Starting bulk sync...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Paginate through all active events
    const allEvents: PolymarketEvent[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=${limit}&offset=${offset}`;
      console.log(`[SYNC-POLYMARKET-H2H] Fetching page at offset ${offset}...`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        console.error(`[SYNC-POLYMARKET-H2H] API error: ${response.status}`);
        break;
      }

      const events: PolymarketEvent[] = await response.json();
      
      if (!Array.isArray(events) || events.length === 0) {
        hasMore = false;
        break;
      }

      allEvents.push(...events);
      offset += limit;
      
      // Safety limit to prevent infinite loops
      if (offset > 1000) {
        console.log('[SYNC-POLYMARKET-H2H] Reached 1000 event limit, stopping pagination');
        break;
      }
      
      // Small delay to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[SYNC-POLYMARKET-H2H] Fetched ${allEvents.length} total events`);

    // Filter and process sports events
    const sportsMarkets: any[] = [];
    let skippedNonSports = 0;
    let skippedFutures = 0;
    let skippedNoTeams = 0;

    for (const event of allEvents) {
      const title = event.title || '';
      
      // Skip non-sports events
      if (!isSportsEvent(title, '')) {
        skippedNonSports++;
        continue;
      }

      for (const market of event.markets || []) {
        // Skip closed/inactive markets
        if (market.closed || market.active === false) continue;

        const question = market.question || title;
        
        // Focus on H2H markets (skip futures for now)
        if (!isH2HMarket(title, question)) {
          skippedFutures++;
          continue;
        }

        // Extract team names
        const teams = extractTeams(title, question);
        if (!teams.home && !teams.away) {
          skippedNoTeams++;
          continue;
        }

        // Parse prices
        const { yesPrice, noPrice } = parsePrices(market);
        
        // Skip markets with no real pricing
        if (yesPrice === 0.5 && noPrice === 0.5) continue;

        // Detect sport category
        const sportCategory = detectSportCategory(title, question);
        
        // Parse event date
        const eventDate = parseEventDate(event);
        
        // Parse volume/liquidity
        const volume = parseFloat(String(market.volume || 0));
        const liquidity = parseFloat(String(market.liquidity || 0));

        sportsMarkets.push({
          condition_id: market.conditionId || market.id,
          event_title: title,
          question: question,
          team_home: teams.home,
          team_away: teams.away,
          team_home_normalized: teams.homeNormalized,
          team_away_normalized: teams.awayNormalized,
          sport_category: sportCategory,
          event_date: eventDate?.toISOString() || null,
          yes_price: yesPrice,
          no_price: noPrice,
          volume,
          liquidity,
          status: 'active',
          last_price_update: new Date().toISOString(),
          last_bulk_sync: new Date().toISOString(),
        });
      }
    }

    console.log(`[SYNC-POLYMARKET-H2H] Found ${sportsMarkets.length} sports H2H markets`);
    console.log(`[SYNC-POLYMARKET-H2H] Skipped: ${skippedNonSports} non-sports, ${skippedFutures} futures, ${skippedNoTeams} no teams`);

    // Upsert to database
    if (sportsMarkets.length > 0) {
      // Process in batches to avoid hitting limits
      const batchSize = 50;
      let inserted = 0;
      let updated = 0;

      for (let i = 0; i < sportsMarkets.length; i += batchSize) {
        const batch = sportsMarkets.slice(i, i + batchSize);
        
        const { error: upsertError, count } = await supabase
          .from('polymarket_h2h_cache')
          .upsert(batch, {
            onConflict: 'condition_id',
            count: 'exact',
          });

        if (upsertError) {
          console.error(`[SYNC-POLYMARKET-H2H] Upsert error for batch ${i}:`, upsertError);
        } else {
          inserted += batch.length;
          console.log(`[SYNC-POLYMARKET-H2H] Upserted batch ${i / batchSize + 1}: ${batch.length} markets`);
        }
      }
    }

    // Mark stale markets as inactive (not updated in this sync)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: staleError } = await supabase
      .from('polymarket_h2h_cache')
      .update({ status: 'inactive' })
      .lt('last_bulk_sync', oneHourAgo)
      .eq('status', 'active');

    if (staleError) {
      console.error('[SYNC-POLYMARKET-H2H] Error marking stale markets:', staleError);
    }

    const duration = Date.now() - startTime;
    console.log(`[SYNC-POLYMARKET-H2H] Complete in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        total_events_fetched: allEvents.length,
        sports_h2h_markets: sportsMarkets.length,
        skipped: {
          non_sports: skippedNonSports,
          futures: skippedFutures,
          no_teams: skippedNoTeams,
        },
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SYNC-POLYMARKET-H2H] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
