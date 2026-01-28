// ============================================================================
// WATCH-MODE-POLL: Polymarket-First Tier 1 Polling
// ============================================================================
// This function now implements the CORRECT Polymarket-first flow:
// 1. Query Polymarket cache for all active sports markets
// 2. Group by sport/market_type
// 3. Fetch bookmaker outrights for matching sports
// 4. Calculate edge = bookmaker_fair_prob - polymarket_yes_price
// 5. Escalate markets with edge to active monitoring
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const MIN_EDGE_PCT = 2.0;
const MIN_VOLUME = 5000;
const MAX_MARKETS_PER_SCAN = 100;
const ACTIVE_WINDOW_MINUTES = 30;
const MAX_SIMULTANEOUS_ACTIVE = 10;

// Team aliases for matching
const TEAM_ALIASES: Record<string, string[]> = {
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
  'cleveland cavaliers': ['cavs', 'cavaliers', 'cleveland', 'cle'],
  'memphis grizzlies': ['grizzlies', 'memphis', 'mem'],
  'houston rockets': ['rockets', 'houston', 'hou'],
  'orlando magic': ['magic', 'orlando', 'orl'],
  'indiana pacers': ['pacers', 'indiana', 'ind'],
  'atlanta hawks': ['hawks', 'atlanta', 'atl'],
  'chicago bulls': ['bulls', 'chicago', 'chi'],
  'toronto raptors': ['raptors', 'toronto', 'tor'],
  'kansas city chiefs': ['chiefs', 'kc', 'kansas city'],
  'san francisco 49ers': ['49ers', 'niners', 'sf', 'san francisco'],
  'philadelphia eagles': ['eagles', 'philly', 'phi'],
  'edmonton oilers': ['oilers', 'edmonton', 'edm'],
  'florida panthers': ['panthers', 'florida', 'fla'],
  'colorado avalanche': ['avalanche', 'avs', 'colorado', 'col'],
  'vegas golden knights': ['golden knights', 'vegas', 'vgk'],
};

// Sport to bookmaker endpoint mapping
const SPORT_ENDPOINTS: Record<string, { outright: string; h2h?: string }> = {
  'basketball_nba': { 
    outright: 'basketball_nba_championship_winner',
    h2h: 'basketball_nba'
  },
  'americanfootball_nfl': { 
    outright: 'americanfootball_nfl_super_bowl_winner',
    h2h: 'americanfootball_nfl'
  },
  'icehockey_nhl': { 
    outright: 'icehockey_nhl_championship_winner',
    h2h: 'icehockey_nhl'
  },
  'soccer': { 
    outright: 'soccer_epl_championship_winner' 
  },
  'soccer_epl': { 
    outright: 'soccer_epl_championship_winner',
    h2h: 'soccer_epl'
  },
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
  
  if (polyCanon === bookCanon) return true;
  if (polyCanon.includes(bookCanon) || bookCanon.includes(polyCanon)) return true;
  
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const polyInAliases = polyCanon === canonical || aliases.some(a => polyCanon.includes(a));
    const bookInAliases = bookCanon === canonical || aliases.some(a => bookCanon.includes(a));
    
    if (polyInAliases && bookInAliases) return true;
  }
  
  return false;
}

async function fetchBookmakerOutrights(
  endpoint: string,
  oddsApiKey: string
): Promise<Map<string, number>> {
  const fairProbabilities = new Map<string, number>();
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${endpoint}/odds/?apiKey=${oddsApiKey}&regions=us,uk,eu&oddsFormat=decimal&markets=outrights`;
    
    console.log(`[WATCH-MODE-POLL] Fetching outrights: ${endpoint}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[WATCH-MODE-POLL] API error ${response.status} for ${endpoint}`);
      return fairProbabilities;
    }
    
    const events = await response.json();
    
    if (!Array.isArray(events) || events.length === 0) {
      return fairProbabilities;
    }
    
    // Aggregate across bookmakers
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
    
    // Calculate fair probabilities
    for (const [name, prices] of outcomeOdds.entries()) {
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      fairProbabilities.set(name, 1 / avgPrice);
    }
    
    console.log(`[WATCH-MODE-POLL] Found ${fairProbabilities.size} outcomes for ${endpoint}`);
    
  } catch (error) {
    console.error(`[WATCH-MODE-POLL] Error fetching ${endpoint}:`, error);
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
  console.log('[WATCH-MODE-POLL] Starting Polymarket-first Tier 1 polling...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    // Get config
    const { data: configData } = await supabase
      .from('scan_config')
      .select('min_poly_volume, enabled_market_types, max_simultaneous_active')
      .limit(1)
      .maybeSingle();

    const minVolume = configData?.min_poly_volume || MIN_VOLUME;
    const enabledTypes = configData?.enabled_market_types || ['futures', 'h2h', 'total'];
    const maxActive = configData?.max_simultaneous_active || MAX_SIMULTANEOUS_ACTIVE;

    // ========================================================================
    // STEP 1: Load Polymarket markets from cache - H2H ONLY, 24hr max
    // ========================================================================
    // Calculate 24-hour horizon cutoff
    const maxEventDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    // CRITICAL: Only H2H markets, NOT futures - futures are championship winner bets
    const { data: polyMarkets, error: fetchError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .eq('market_type', 'h2h')  // ONLY H2H - no futures
      .gte('volume', minVolume)
      .not('event_date', 'is', null)  // Must have event date
      .lte('event_date', maxEventDate)  // Within 24 hours
      .order('volume', { ascending: false })
      .limit(MAX_MARKETS_PER_SCAN);

    if (fetchError) throw fetchError;

    if (!polyMarkets || polyMarkets.length === 0) {
      console.log('[WATCH-MODE-POLL] No H2H markets within 24hr horizon');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No H2H markets within 24hr horizon',
          snapshots_stored: 0,
          edges_found: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[WATCH-MODE-POLL] Loaded ${polyMarkets.length} H2H markets within 24hr`);

    console.log(`[WATCH-MODE-POLL] Loaded ${polyMarkets.length} Polymarket markets`);

    // ========================================================================
    // STEP 2: Group by sport for efficient API calls
    // ========================================================================
    const marketsBySport: Map<string, PolymarketCacheEntry[]> = new Map();
    
    for (const market of polyMarkets as PolymarketCacheEntry[]) {
      const sport = market.sport_category || 'unknown';
      if (!marketsBySport.has(sport)) {
        marketsBySport.set(sport, []);
      }
      marketsBySport.get(sport)!.push(market);
    }

    // ========================================================================
    // STEP 3: Fetch bookmaker data for each sport
    // ========================================================================
    const bookmakerData: Map<string, Map<string, number>> = new Map();
    let apiCallsUsed = 0;

    for (const [sport] of marketsBySport) {
      const endpoints = SPORT_ENDPOINTS[sport];
      if (endpoints?.outright) {
        const fairProbs = await fetchBookmakerOutrights(endpoints.outright, ODDS_API_KEY);
        bookmakerData.set(sport, fairProbs);
        apiCallsUsed++;
      }
    }

    // ========================================================================
    // STEP 4: Calculate edges and store snapshots
    // ========================================================================
    const edgesFound: Array<{
      polyMarket: PolymarketCacheEntry;
      bookmakerFairProb: number;
      edge: number;
      matchedTeam: string;
    }> = [];

    // Store probability snapshots for tracking
    const snapshots: Array<{
      event_key: string;
      event_name: string;
      outcome: string;
      fair_probability: number;
      captured_at: string;
      source: string;
    }> = [];

    for (const [sport, markets] of marketsBySport) {
      const bookmakerProbs = bookmakerData.get(sport);
      if (!bookmakerProbs || bookmakerProbs.size === 0) continue;

      for (const polyMarket of markets) {
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

        // Store snapshot for movement tracking
        const eventKey = `poly_${polyMarket.condition_id}`;
        snapshots.push({
          event_key: eventKey,
          event_name: polyMarket.question,
          outcome: polyMarket.team_home || 'YES',
          fair_probability: bestMatch.prob,
          captured_at: new Date().toISOString(),
          source: 'bookmaker',
        });

        // Calculate edge
        const edge = (bestMatch.prob - polyMarket.yes_price) * 100;

        if (edge >= MIN_EDGE_PCT) {
          edgesFound.push({
            polyMarket,
            bookmakerFairProb: bestMatch.prob,
            edge,
            matchedTeam: bestMatch.team,
          });
        }
      }
    }

    // Store snapshots
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('probability_snapshots')
        .insert(snapshots);

      if (insertError) {
        console.error('[WATCH-MODE-POLL] Snapshot insert error:', insertError);
      }
    }

    console.log(`[WATCH-MODE-POLL] Stored ${snapshots.length} snapshots, found ${edgesFound.length} edges`);

    // ========================================================================
    // STEP 5: Check active slot availability and escalate
    // ========================================================================
    const { data: activeEvents } = await supabase
      .from('event_watch_state')
      .select('id')
      .eq('watch_state', 'active');

    const currentActiveCount = activeEvents?.length || 0;
    const slotsAvailable = Math.max(0, maxActive - currentActiveCount);

    // Sort edges by magnitude and take top available slots
    const toEscalate = edgesFound
      .sort((a, b) => b.edge - a.edge)
      .slice(0, slotsAvailable);

    let escalatedCount = 0;

    for (const edgeData of toEscalate) {
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
        console.log(`[WATCH-MODE-POLL] Escalated: ${polyMarket.question.substring(0, 40)}... (+${edge.toFixed(1)}%)`);
      }
    }

    // Store non-escalated edges in watching state
    for (const edgeData of edgesFound.filter(e => !toEscalate.includes(e))) {
      const { polyMarket, bookmakerFairProb, edge, matchedTeam } = edgeData;
      const eventKey = `poly_${polyMarket.condition_id}`;

      await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: polyMarket.question,
          watch_state: 'watching',
          polymarket_condition_id: polyMarket.condition_id,
          polymarket_question: polyMarket.question,
          polymarket_yes_price: polyMarket.yes_price,
          polymarket_volume: polyMarket.volume,
          bookmaker_market_key: matchedTeam,
          bookmaker_source: polyMarket.sport_category,
          initial_probability: bookmakerFairProb,
          current_probability: bookmakerFairProb,
          movement_pct: edge,
          polymarket_price: polyMarket.yes_price,
          polymarket_matched: true,
        }, { onConflict: 'event_key' });
    }

    // Cleanup old snapshots (>24h)
    const cleanupTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('probability_snapshots')
      .delete()
      .lt('captured_at', cleanupTime);

    const duration = Date.now() - startTime;
    console.log(`[WATCH-MODE-POLL] Complete in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        snapshots_stored: snapshots.length,
        events_analyzed: polyMarkets.length,
        escalation_candidates: edgesFound.length,
        escalated_to_active: escalatedCount,
        api_calls_used: apiCallsUsed,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WATCH-MODE-POLL] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
