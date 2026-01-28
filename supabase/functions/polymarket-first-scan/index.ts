// ============================================================================
// POLYMARKET-FIRST-SCAN: The core Polymarket-first arbitrage detection engine
// ============================================================================
// This function implements the correct flow:
// 1. Start with Polymarket markets from cache (source of truth)
// 2. Group by sport/market_type for efficient bookmaker API calls
// 3. Fetch corresponding bookmaker odds (outrights for futures)
// 4. Calculate edge = bookmaker_fair_prob - polymarket_yes_price
// 5. Escalate markets with edge >= MIN_EDGE to active monitoring
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const MIN_EDGE_PCT = 2.0;           // Minimum edge to escalate
const MIN_VOLUME = 5000;            // Minimum Polymarket volume
const MAX_POLY_LOOKUPS = 100;       // Max markets to process per scan
const ACTIVE_WINDOW_MINUTES = 30;   // How long to monitor escalated markets

// Team name normalization and alias mapping
const TEAM_ALIASES: Record<string, string[]> = {
  // NBA Teams
  'los angeles lakers': ['la lakers', 'lakers', 'lal'],
  'golden state warriors': ['gsw', 'warriors', 'gs warriors', 'golden state'],
  'boston celtics': ['celtics', 'boston', 'bos'],
  'miami heat': ['heat', 'miami', 'mia'],
  'phoenix suns': ['suns', 'phoenix', 'phx'],
  'denver nuggets': ['nuggets', 'denver', 'den'],
  'milwaukee bucks': ['bucks', 'milwaukee', 'mil'],
  'philadelphia 76ers': ['76ers', 'sixers', 'philly', 'phi'],
  'new york knicks': ['knicks', 'ny knicks', 'new york', 'nyk'],
  'brooklyn nets': ['nets', 'brooklyn', 'bkn'],
  'dallas mavericks': ['mavs', 'mavericks', 'dallas', 'dal'],
  'los angeles clippers': ['la clippers', 'clippers', 'lac'],
  'oklahoma city thunder': ['thunder', 'okc', 'oklahoma'],
  'minnesota timberwolves': ['wolves', 'timberwolves', 'minnesota', 'min'],
  'sacramento kings': ['kings', 'sacramento', 'sac'],
  'new orleans pelicans': ['pelicans', 'nola', 'new orleans'],
  'cleveland cavaliers': ['cavs', 'cavaliers', 'cleveland', 'cle'],
  'memphis grizzlies': ['grizzlies', 'memphis', 'mem'],
  'houston rockets': ['rockets', 'houston', 'hou'],
  'orlando magic': ['magic', 'orlando', 'orl'],
  'indiana pacers': ['pacers', 'indiana', 'ind'],
  'atlanta hawks': ['hawks', 'atlanta', 'atl'],
  'chicago bulls': ['bulls', 'chicago', 'chi'],
  'toronto raptors': ['raptors', 'toronto', 'tor'],
  'charlotte hornets': ['hornets', 'charlotte', 'cha'],
  'detroit pistons': ['pistons', 'detroit', 'det'],
  'san antonio spurs': ['spurs', 'san antonio', 'sas'],
  'portland trail blazers': ['blazers', 'portland', 'por'],
  'utah jazz': ['jazz', 'utah', 'uta'],
  'washington wizards': ['wizards', 'washington', 'was'],
  // NFL Teams
  'kansas city chiefs': ['chiefs', 'kc', 'kansas city'],
  'san francisco 49ers': ['49ers', 'niners', 'sf', 'san francisco'],
  'philadelphia eagles': ['eagles', 'philly', 'phi'],
  'buffalo bills': ['bills', 'buffalo', 'buf'],
  'dallas cowboys': ['cowboys', 'dallas', 'dal'],
  // NHL Teams
  'edmonton oilers': ['oilers', 'edmonton', 'edm'],
  'florida panthers': ['panthers', 'florida', 'fla'],
  'colorado avalanche': ['avalanche', 'avs', 'colorado', 'col'],
  'boston bruins': ['bruins', 'boston', 'bos'],
  'vegas golden knights': ['golden knights', 'vegas', 'vgk'],
};

// Bookmaker sport-to-outright endpoint mapping
const SPORT_TO_OUTRIGHT_ENDPOINT: Record<string, string> = {
  'basketball_nba': 'basketball_nba_championship_winner',
  'americanfootball_nfl': 'americanfootball_nfl_super_bowl_winner',
  'icehockey_nhl': 'icehockey_nhl_championship_winner',
  'soccer': 'soccer_epl_championship_winner',
  'soccer_epl': 'soccer_epl_championship_winner',
  'soccer_uefa_champs_league': 'soccer_uefa_champs_league_winner',
};

interface PolymarketCacheEntry {
  id: string;
  condition_id: string;
  event_title: string;
  question: string;
  team_home: string | null;
  team_away: string | null;
  team_home_normalized: string | null;
  team_away_normalized: string | null;
  sport_category: string | null;
  market_type: string | null;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  status: string;
}

interface BookmakerOutcome {
  name: string;
  price: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCanonicalName(name: string): string {
  const normalized = normalizeTeamName(name);
  
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (normalized === canonical || 
        normalized.includes(canonical) || 
        aliases.some(a => normalized.includes(a) || a.includes(normalized))) {
      return canonical;
    }
  }
  
  return normalized;
}

function matchTeamNames(polyTeam: string | null, bookmakerTeam: string): boolean {
  if (!polyTeam) return false;
  
  const polyCanon = getCanonicalName(polyTeam);
  const bookCanon = getCanonicalName(bookmakerTeam);
  
  // Exact match
  if (polyCanon === bookCanon) return true;
  
  // Partial match (one contains the other)
  if (polyCanon.includes(bookCanon) || bookCanon.includes(polyCanon)) return true;
  
  // Check aliases
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const polyInAliases = polyCanon === canonical || aliases.some(a => polyCanon.includes(a));
    const bookInAliases = bookCanon === canonical || aliases.some(a => bookCanon.includes(a));
    
    if (polyInAliases && bookInAliases) return true;
  }
  
  return false;
}

function calculateFairProbability(outcomes: BookmakerOutcome[]): Map<string, number> {
  const fairProbs = new Map<string, number>();
  
  // Calculate raw implied probabilities
  const rawProbs = outcomes.map(o => ({
    name: o.name,
    rawProb: 1 / o.price
  }));
  
  // Sum for vig removal
  const totalProb = rawProbs.reduce((sum, o) => sum + o.rawProb, 0);
  
  // Normalize to remove vig
  for (const outcome of rawProbs) {
    fairProbs.set(outcome.name, outcome.rawProb / totalProb);
  }
  
  return fairProbs;
}

// ============================================================================
// BOOKMAKER API FETCHING
// ============================================================================

async function fetchBookmakerOutrights(
  sportKey: string,
  oddsApiKey: string
): Promise<Map<string, number>> {
  const fairProbabilities = new Map<string, number>();
  
  const endpoint = SPORT_TO_OUTRIGHT_ENDPOINT[sportKey];
  if (!endpoint) {
    console.log(`[POLY-FIRST] No outright endpoint for sport: ${sportKey}`);
    return fairProbabilities;
  }
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${endpoint}/odds/?apiKey=${oddsApiKey}&regions=us,uk,eu&oddsFormat=decimal&markets=outrights`;
    
    console.log(`[POLY-FIRST] Fetching outrights for ${endpoint}...`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[POLY-FIRST] API error ${response.status} for ${endpoint}`);
      return fairProbabilities;
    }
    
    const events = await response.json();
    
    if (!Array.isArray(events) || events.length === 0) {
      console.log(`[POLY-FIRST] No outright data for ${endpoint}`);
      return fairProbabilities;
    }
    
    // Aggregate outcomes across all bookmakers
    const outcomeOdds: Map<string, number[]> = new Map();
    
    for (const event of events) {
      for (const bookmaker of event.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          if (market.key !== 'outrights') continue;
          
          for (const outcome of market.outcomes || []) {
            const name = normalizeTeamName(outcome.name);
            if (!outcomeOdds.has(name)) {
              outcomeOdds.set(name, []);
            }
            outcomeOdds.get(name)!.push(outcome.price);
          }
        }
      }
    }
    
    // Calculate average odds and fair probabilities
    for (const [name, prices] of outcomeOdds.entries()) {
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const impliedProb = 1 / avgPrice;
      fairProbabilities.set(name, impliedProb);
    }
    
    console.log(`[POLY-FIRST] Found ${fairProbabilities.size} outcomes for ${endpoint}`);
    
  } catch (error) {
    console.error(`[POLY-FIRST] Error fetching ${endpoint}:`, error);
  }
  
  return fairProbabilities;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-FIRST-SCAN] Starting Polymarket-first scan...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    // Get scan config
    const { data: configData } = await supabase
      .from('scan_config')
      .select('min_poly_volume, enabled_market_types')
      .limit(1)
      .maybeSingle();

    const minVolume = configData?.min_poly_volume || MIN_VOLUME;
    const enabledTypes = configData?.enabled_market_types || ['futures', 'h2h', 'total'];

    // ========================================================================
    // STEP 1: Query all active Polymarket sports markets from cache
    // ========================================================================
    const { data: polyMarkets, error: fetchError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .gte('volume', minVolume)
      .in('market_type', enabledTypes)
      .order('volume', { ascending: false })
      .limit(MAX_POLY_LOOKUPS);

    if (fetchError) throw fetchError;

    if (!polyMarkets || polyMarkets.length === 0) {
      console.log('[POLY-FIRST-SCAN] No Polymarket markets in cache. Run sync-polymarket-h2h first.');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No Polymarket markets found. Sync required.',
          markets_scanned: 0,
          edges_found: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[POLY-FIRST-SCAN] Loaded ${polyMarkets.length} Polymarket markets from cache`);

    // ========================================================================
    // STEP 2: Group markets by sport_category for efficient API calls
    // ========================================================================
    const marketsBySport: Map<string, PolymarketCacheEntry[]> = new Map();
    
    for (const market of polyMarkets as PolymarketCacheEntry[]) {
      const sport = market.sport_category || 'unknown';
      if (!marketsBySport.has(sport)) {
        marketsBySport.set(sport, []);
      }
      marketsBySport.get(sport)!.push(market);
    }

    console.log(`[POLY-FIRST-SCAN] Markets grouped into ${marketsBySport.size} sport categories`);

    // ========================================================================
    // STEP 3: Fetch bookmaker outrights for each sport category
    // ========================================================================
    const bookmakerData: Map<string, Map<string, number>> = new Map();
    let apiCallsUsed = 0;

    for (const [sport] of marketsBySport) {
      if (SPORT_TO_OUTRIGHT_ENDPOINT[sport]) {
        const fairProbs = await fetchBookmakerOutrights(sport, ODDS_API_KEY);
        bookmakerData.set(sport, fairProbs);
        apiCallsUsed++;
      }
    }

    console.log(`[POLY-FIRST-SCAN] Fetched bookmaker data (${apiCallsUsed} API calls)`);

    // ========================================================================
    // STEP 4: Match and calculate edges
    // ========================================================================
    const edgesFound: Array<{
      polyMarket: PolymarketCacheEntry;
      bookmakerFairProb: number;
      edge: number;
      matchedTeam: string;
    }> = [];

    for (const [sport, markets] of marketsBySport) {
      const bookmakerProbs = bookmakerData.get(sport);
      if (!bookmakerProbs || bookmakerProbs.size === 0) {
        console.log(`[POLY-FIRST-SCAN] No bookmaker data for ${sport}, skipping ${markets.length} markets`);
        continue;
      }

      for (const polyMarket of markets) {
        // Try to match team_home or extracted entity
        const teamToMatch = polyMarket.team_home_normalized || polyMarket.team_home;
        
        if (!teamToMatch) continue;

        // Find matching bookmaker outcome
        let bestMatch: { team: string; prob: number } | null = null;
        
        for (const [bookTeam, fairProb] of bookmakerProbs) {
          if (matchTeamNames(teamToMatch, bookTeam)) {
            bestMatch = { team: bookTeam, prob: fairProb };
            break;
          }
        }

        if (!bestMatch) continue;

        // Calculate edge: bookmaker says higher probability than Polymarket price
        const edge = (bestMatch.prob - polyMarket.yes_price) * 100;

        if (edge >= MIN_EDGE_PCT) {
          edgesFound.push({
            polyMarket,
            bookmakerFairProb: bestMatch.prob,
            edge,
            matchedTeam: bestMatch.team,
          });
          console.log(`[POLY-FIRST-SCAN] EDGE FOUND: ${polyMarket.question.substring(0, 50)}... | Edge: +${edge.toFixed(1)}% | Poly: ${(polyMarket.yes_price * 100).toFixed(0)}c | Book: ${(bestMatch.prob * 100).toFixed(0)}%`);
        }
      }
    }

    console.log(`[POLY-FIRST-SCAN] Found ${edgesFound.length} edges >= ${MIN_EDGE_PCT}%`);

    // ========================================================================
    // STEP 5: Escalate edges to event_watch_state for active monitoring
    // ========================================================================
    let escalatedCount = 0;

    for (const edgeData of edgesFound) {
      const { polyMarket, bookmakerFairProb, edge, matchedTeam } = edgeData;
      
      const eventKey = `poly_${polyMarket.condition_id}`;
      const activeUntil = new Date(Date.now() + ACTIVE_WINDOW_MINUTES * 60 * 1000).toISOString();

      const { error: upsertError } = await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: polyMarket.question,
          watch_state: 'active',
          polymarket_condition_id: polyMarket.condition_id,
          polymarket_question: polyMarket.question,
          polymarket_yes_price: polyMarket.yes_price,
          polymarket_volume: polyMarket.volume,
          bookmaker_market_key: matchedTeam,
          bookmaker_source: polyMarket.sport_category,
          initial_probability: bookmakerFairProb,
          current_probability: bookmakerFairProb,
          peak_probability: bookmakerFairProb,
          movement_pct: edge,
          polymarket_price: polyMarket.yes_price,
          polymarket_matched: true,
          escalated_at: new Date().toISOString(),
          active_until: activeUntil,
          hold_start_at: new Date().toISOString(),
          samples_since_hold: 0,
          last_poly_refresh: new Date().toISOString(),
        }, { onConflict: 'event_key' });

      if (!upsertError) {
        escalatedCount++;
      } else {
        console.error(`[POLY-FIRST-SCAN] Upsert error:`, upsertError);
      }
    }

    // ========================================================================
    // STEP 6: Also create signal_opportunities for immediate visibility
    // ========================================================================
    for (const edgeData of edgesFound) {
      const { polyMarket, bookmakerFairProb, edge } = edgeData;
      
      // Determine urgency based on edge magnitude
      let urgency = 'normal';
      if (edge >= 5) urgency = 'critical';
      else if (edge >= 3.5) urgency = 'high';
      
      await supabase.from('signal_opportunities').upsert({
        event_name: polyMarket.question,
        recommended_outcome: polyMarket.team_home,
        side: 'YES',
        polymarket_price: polyMarket.yes_price,
        polymarket_yes_price: polyMarket.yes_price,
        polymarket_volume: polyMarket.volume,
        polymarket_updated_at: new Date().toISOString(),
        polymarket_match_confidence: 1.0, // Direct match from cache
        bookmaker_probability: bookmakerFairProb,
        bookmaker_prob_fair: bookmakerFairProb,
        edge_percent: edge,
        is_true_arbitrage: true,
        confidence_score: Math.min(95, 60 + Math.round(edge * 5)),
        urgency,
        status: 'active',
        signal_factors: {
          edge_type: 'polymarket_first',
          market_type: polyMarket.market_type,
          sport_category: polyMarket.sport_category,
          matched_from_cache: true,
          condition_id: polyMarket.condition_id,
        },
      }, {
        onConflict: 'event_name',
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[POLY-FIRST-SCAN] Complete in ${duration}ms. Edges: ${edgesFound.length}, Escalated: ${escalatedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        markets_scanned: polyMarkets.length,
        sports_checked: marketsBySport.size,
        api_calls_used: apiCallsUsed,
        edges_found: edgesFound.length,
        escalated_to_active: escalatedCount,
        min_edge_threshold: MIN_EDGE_PCT,
        duration_ms: duration,
        edges: edgesFound.map(e => ({
          question: e.polyMarket.question.substring(0, 60),
          edge_pct: e.edge.toFixed(1),
          poly_price: e.polyMarket.yes_price,
          book_prob: e.bookmakerFairProb,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POLY-FIRST-SCAN] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
