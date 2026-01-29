// ============================================================================
// SYNC-POLYMARKET-SPORTS: Bulk fetch ALL Polymarket sports markets
// ============================================================================
// This function runs daily (or on-demand) to populate the polymarket_h2h_cache
// table with all active sports markets including:
// - H2H (head-to-head matchups)
// - Props (player/team propositions)
// - Totals (over/under)
// - Spreads (point spreads)
// - Player-specific markets
//
// FLOW:
// 1. Paginate through ALL active Polymarket events
// 2. Filter for sports-related markets (NBA, NFL, NHL, UFC, Tennis, Soccer)
// 3. Classify market type and extract relevant data
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
  
  // Generic sports terms
  'game', 'match', 'points', 'score', 'goals', 'assists', 'rebounds', 'touchdowns',
  'yards', 'passing', 'rushing', 'receiving', 'strikeouts', 'home runs',
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
  
  // NHL Teams
  'washington capitals': ['capitals', 'caps'],
  'detroit red wings': ['red wings', 'wings', 'detroit'],
  'tampa bay lightning': ['lightning', 'bolts', 'tampa bay'],
  'winnipeg jets': ['jets', 'winnipeg'],
  'new jersey devils': ['devils', 'nj devils', 'new jersey'],
  'nashville predators': ['predators', 'preds', 'nashville'],
  'toronto maple leafs': ['maple leafs', 'leafs', 'toronto'],
  'seattle kraken': ['kraken', 'seattle'],
  'colorado avalanche': ['avalanche', 'avs', 'colorado'],
  'montreal canadiens': ['canadiens', 'habs', 'montreal'],
  'dallas stars': ['stars'],
  'vegas golden knights': ['golden knights', 'knights', 'vegas'],
  'philadelphia flyers': ['flyers', 'philly'],
  'boston bruins': ['bruins', 'boston'],
  'florida panthers': ['panthers', 'florida', 'cats'],
  'st louis blues': ['blues', 'st louis'],
  'carolina hurricanes': ['hurricanes', 'canes', 'carolina'],
  'chicago blackhawks': ['blackhawks', 'hawks'],
  'pittsburgh penguins': ['penguins', 'pens', 'pittsburgh'],
  'san jose sharks': ['sharks', 'san jose'],
  'edmonton oilers': ['oilers', 'edmonton'],
  'calgary flames': ['flames', 'calgary'],
  'minnesota wild': ['wild'],
  'anaheim ducks': ['ducks', 'anaheim'],
  'vancouver canucks': ['canucks', 'vancouver'],
  'new york islanders': ['islanders', 'isles', 'ny islanders'],
  'new york rangers': ['rangers', 'ny rangers'],
  'los angeles kings': ['la kings'],
  'buffalo sabres': ['sabres', 'buffalo'],
  'utah hockey club': ['utah', 'utah hc'],
  'ottawa senators': ['senators', 'sens', 'ottawa'],
  'columbus blue jackets': ['blue jackets', 'cbj', 'columbus'],
  
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
  clobTokenIds?: string | string[];
  tokens?: Array<{ token_id: string; outcome: string }>;
  volume?: string | number;
  liquidity?: string | number;
  active?: boolean;
  closed?: boolean;
  lastUpdateTimestamp?: string;
}

// CLOB API types
interface ClobPriceRequest {
  token_id: string;
  side: 'BUY' | 'SELL';
}

interface ClobPriceResponse {
  [tokenId: string]: {
    BUY?: string;
    SELL?: string;
  };
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

// Classify market type based on title/question content
function classifyMarketType(title: string, question: string): string {
  const text = `${title} ${question}`.toLowerCase();
  
  // Player props indicators
  const playerPropIndicators = ['points', 'rebounds', 'assists', 'touchdowns', 'yards', 
    'passing', 'rushing', 'receiving', 'strikeouts', 'home runs', 'goals scored by',
    'will score', 'how many', 'over/under player'];
  if (playerPropIndicators.some(ind => text.includes(ind))) return 'player_prop';
  
  // Totals/Over-Under indicators
  const totalIndicators = ['over', 'under', 'total points', 'total goals', 'combined score',
    'total score', 'o/u', 'over/under'];
  if (totalIndicators.some(ind => text.includes(ind))) return 'total';
  
  // Spread indicators
  const spreadIndicators = ['spread', 'handicap', 'by more than', 'margin', 'cover'];
  if (spreadIndicators.some(ind => text.includes(ind))) return 'spread';
  
  // H2H indicators
  const h2hIndicators = ['vs', 'versus', 'beat', 'win against', 'to win'];
  if (h2hIndicators.some(ind => text.includes(ind))) return 'h2h';
  
  // Futures/championship (still capture but classify)
  const futuresIndicators = ['championship', 'finals', 'win the', 'mvp', 'award', 'season', 'playoff'];
  if (futuresIndicators.some(ind => text.includes(ind))) return 'futures';
  
  // Default to prop for unclassified sports markets
  return 'prop';
}

// Check if market should be included (more permissive than before)
function shouldIncludeMarket(title: string, question: string): boolean {
  const text = `${title} ${question}`.toLowerCase();
  
  // Exclude purely political/non-sports markets
  const excludeIndicators = ['election', 'president', 'congress', 'senate', 'political',
    'bitcoin', 'crypto', 'stock', 'fed', 'interest rate', 'cpi', 'gdp'];
  if (excludeIndicators.some(ind => text.includes(ind))) return false;
  
  // Include if it matches any sports keyword
  return isSportsEvent(title, question);
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

// Extract token IDs from market data
function extractTokenIds(market: PolymarketMarket): { yesTokenId: string | null; noTokenId: string | null } {
  let yesTokenId: string | null = null;
  let noTokenId: string | null = null;
  
  // Try clobTokenIds first (can be stringified JSON or array)
  if (market.clobTokenIds) {
    try {
      const tokenIds = typeof market.clobTokenIds === 'string'
        ? JSON.parse(market.clobTokenIds)
        : market.clobTokenIds;
      
      if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
        yesTokenId = String(tokenIds[0]);
        noTokenId = String(tokenIds[1]);
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  // Fallback to tokens array
  if (!yesTokenId && market.tokens && Array.isArray(market.tokens)) {
    for (const token of market.tokens) {
      const outcome = token.outcome?.toLowerCase();
      if (outcome === 'yes' && token.token_id) {
        yesTokenId = token.token_id;
      } else if (outcome === 'no' && token.token_id) {
        noTokenId = token.token_id;
      }
    }
  }
  
  return { yesTokenId, noTokenId };
}

// Batch fetch CLOB prices for token IDs
async function fetchClobPrices(tokenIds: string[]): Promise<ClobPriceResponse> {
  if (tokenIds.length === 0) return {};
  
  const CLOB_API_BASE = 'https://clob.polymarket.com';
  const batchSize = 50; // CLOB API limit per request
  const allPrices: ClobPriceResponse = {};
  
  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const batch = tokenIds.slice(i, i + batchSize);
    const requestBody: ClobPriceRequest[] = batch.map(token_id => ({
      token_id,
      side: 'BUY' as const
    }));
    
    try {
      const response = await fetch(`${CLOB_API_BASE}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (response.ok) {
        const prices = await response.json();
        Object.assign(allPrices, prices);
      } else {
        console.warn(`[CLOB] Batch ${i} failed: ${response.status}`);
      }
    } catch (error) {
      console.warn(`[CLOB] Batch ${i} error:`, error);
    }
    
    // Small delay between batches
    if (i + batchSize < tokenIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return allPrices;
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
        
        // Check if market should be included (sports-related, not political)
        if (!shouldIncludeMarket(title, question)) {
          skippedFutures++;
          continue;
        }

        // Classify market type
        const marketType = classifyMarketType(title, question);

        // Extract team names (will be null for non-H2H markets)
        const teams = extractTeams(title, question);
        if (!teams.home && !teams.away) {
          skippedNoTeams++;
          continue;
        }

        // Parse prices (may be placeholder - we'll refresh from CLOB later)
        const { yesPrice, noPrice } = parsePrices(market);
        
        // Extract token IDs for CLOB price refresh
        const { yesTokenId, noTokenId } = extractTokenIds(market);

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
          market_type: marketType,
          event_date: eventDate?.toISOString() || null,
          yes_price: yesPrice,
          no_price: noPrice,
          token_id_yes: yesTokenId,
          token_id_no: noTokenId,
          volume,
          liquidity,
          status: 'active',
          last_price_update: new Date().toISOString(),
          last_bulk_sync: new Date().toISOString(),
        });
      }
    }

    console.log(`[SYNC-POLYMARKET-SPORTS] Found ${sportsMarkets.length} sports markets`);
    console.log(`[SYNC-POLYMARKET-SPORTS] Skipped: ${skippedNonSports} non-sports, ${skippedFutures} excluded, ${skippedNoTeams} no data`);
    
    // Log market type breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const m of sportsMarkets) {
      typeBreakdown[m.market_type] = (typeBreakdown[m.market_type] || 0) + 1;
    }
    console.log(`[SYNC-POLYMARKET-SPORTS] By type:`, JSON.stringify(typeBreakdown));

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

    // ============= CLOB PRICE REFRESH =============
    // Fetch real executable prices from Polymarket CLOB API
    console.log('[SYNC-POLYMARKET-H2H] Starting CLOB price refresh...');
    
    // Get all H2H markets with token IDs from the cache
    const { data: h2hMarkets, error: fetchError } = await supabase
      .from('polymarket_h2h_cache')
      .select('condition_id, token_id_yes, token_id_no')
      .eq('status', 'active')
      .eq('market_type', 'h2h')
      .not('token_id_yes', 'is', null);
    
    if (fetchError) {
      console.error('[SYNC-POLYMARKET-H2H] Error fetching H2H markets for CLOB refresh:', fetchError);
    } else if (h2hMarkets && h2hMarkets.length > 0) {
      console.log(`[SYNC-POLYMARKET-H2H] Refreshing CLOB prices for ${h2hMarkets.length} H2H markets`);
      
      // Collect all YES token IDs
      const tokenIdToCondition: Map<string, string> = new Map();
      const allTokenIds: string[] = [];
      
      for (const market of h2hMarkets) {
        if (market.token_id_yes) {
          tokenIdToCondition.set(market.token_id_yes, market.condition_id);
          allTokenIds.push(market.token_id_yes);
        }
      }
      
      if (allTokenIds.length > 0) {
        const clobPrices = await fetchClobPrices(allTokenIds);
        const priceUpdates: Array<{ condition_id: string; yes_price: number; no_price: number; best_bid: number; best_ask: number }> = [];
        
        for (const [tokenId, priceData] of Object.entries(clobPrices)) {
          const conditionId = tokenIdToCondition.get(tokenId);
          if (!conditionId) continue;
          
          // BUY price = what you pay = best ask
          // For YES token: this is the YES price
          const buyPrice = parseFloat(priceData.BUY || '0');
          const sellPrice = parseFloat(priceData.SELL || '0');
          
          if (buyPrice > 0) {
            priceUpdates.push({
              condition_id: conditionId,
              yes_price: buyPrice,
              no_price: 1 - buyPrice,
              best_bid: sellPrice,
              best_ask: buyPrice,
            });
          }
        }
        
        console.log(`[SYNC-POLYMARKET-H2H] Got ${priceUpdates.length} valid CLOB prices`);
        
        // Update cache with real prices
        let clobUpdated = 0;
        for (const update of priceUpdates) {
          const { error: updateError } = await supabase
            .from('polymarket_h2h_cache')
            .update({
              yes_price: update.yes_price,
              no_price: update.no_price,
              best_bid: update.best_bid,
              best_ask: update.best_ask,
              last_price_update: new Date().toISOString(),
            })
            .eq('condition_id', update.condition_id);
          
          if (!updateError) clobUpdated++;
        }
        
        console.log(`[SYNC-POLYMARKET-H2H] Updated ${clobUpdated} markets with CLOB prices`);
      }
    } else {
      console.log('[SYNC-POLYMARKET-H2H] No H2H markets with token IDs found for CLOB refresh');
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
    console.log(`[SYNC-POLYMARKET-SPORTS] Complete in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        total_events_fetched: allEvents.length,
        sports_markets: sportsMarkets.length,
        by_type: typeBreakdown,
        skipped: {
          non_sports: skippedNonSports,
          excluded: skippedFutures,
          no_data: skippedNoTeams,
        },
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SYNC-POLYMARKET-SPORTS] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
