// ============================================================================
// WATCH-MODE-POLL: H2H Movement Detection via Bookmaker Signals
// ============================================================================
// CORE LOGIC VERSION: v1.3 - "Match Failure Flip"
// ============================================================================
// This function detects arbitrage opportunities by:
// 1. Query Polymarket H2H cache for active sports markets (24hr horizon)
// 2. Query bookmaker_signals table for recent H2H data
// 3. Match markets by team names with fuzzy logic
// 4. Calculate edge = bookmaker_fair_prob - polymarket_yes_price
// 5. Store snapshots for movement tracking
// 6. Escalate markets with edge to active monitoring
// 7. [V1.3] Log all match failures to match_failures table
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORE_LOGIC_VERSION = 'v1.3';

// ============================================================================
// V1.3: MATCH FAILURE TYPES
// ============================================================================
type FailureReason = 
  | 'TEAM_PARSE_FAILED'      // Could not extract 2 teams from event name
  | 'NO_BOOK_GAME_FOUND'     // No matching bookmaker event found
  | 'TEAM_ALIAS_MISSING'     // Found event but team name mismatch
  | 'OUTCOME_NOT_FOUND';     // Matched event but no outcome for home team

interface MatchFailureLog {
  poly_event_title: string;
  poly_team_a: string;
  poly_team_b: string;
  poly_condition_id: string | null;
  sport_code: string | null;
  failure_reason: FailureReason;
  last_seen_at: string;
}

// ============================================================================
// V1.3: Helper to log match failures
// ============================================================================
async function logMatchFailure(
  supabase: any,
  failure: MatchFailureLog
): Promise<void> {
  try {
    await supabase.from('match_failures').upsert({
      poly_event_title: failure.poly_event_title,
      poly_team_a: failure.poly_team_a,
      poly_team_b: failure.poly_team_b,
      poly_condition_id: failure.poly_condition_id,
      sport_code: failure.sport_code,
      failure_reason: failure.failure_reason,
      last_seen_at: failure.last_seen_at,
      resolution_status: 'pending',
    }, {
      onConflict: 'poly_condition_id',
      ignoreDuplicates: false,
    });
  } catch (err) {
    console.warn(`[${CORE_LOGIC_VERSION}] Failed to log match failure:`, err);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CORE LOGIC v1.3 THRESHOLDS (from canonical spec)
// ============================================================================
const V1_3_GATES = {
  MOVEMENT_THRESHOLD: 0.05,       // 5% absolute probability change
  VELOCITY_THRESHOLD: 0.003,      // 0.3% per minute
  SHARP_CONSENSUS_MIN: 2,
  TIME_WINDOW_MIN: 5,             // minutes
  TIME_WINDOW_MAX: 15,            // minutes
  S1_BOOK_PROB_MIN: 0.45,         // 45% minimum for any signal
  S2_BOOK_PROB_MIN: 0.50,         // 50% minimum for execution-eligible
} as const;

// ============================================================================
// CONFIGURATION
// ============================================================================
const MIN_EDGE_PCT = 2.0;
const MIN_VOLUME = 5000;
const MAX_MARKETS_PER_SCAN = 100;
const ACTIVE_WINDOW_MINUTES = 30;
const MAX_SIMULTANEOUS_ACTIVE = 10;
const BOOKMAKER_LOOKBACK_HOURS = 2;

// ============================================================================
// SPORT CATEGORY NORMALIZATION
// ============================================================================
function normalizeSportCategory(sport: string | null): string {
  if (!sport) return 'unknown';
  
  const aliases: Record<string, string> = {
    'NHL': 'icehockey_nhl',
    'nhl': 'icehockey_nhl',
    'NBA': 'basketball_nba',
    'nba': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'nfl': 'americanfootball_nfl',
    'MLB': 'baseball_mlb',
    'mlb': 'baseball_mlb',
  };
  
  return aliases[sport] || sport;
}

// ============================================================================
// COMPREHENSIVE TEAM ALIASES (NHL + NBA + NFL)
// ============================================================================
const TEAM_ALIASES: Record<string, string[]> = {
  // NHL Teams
  'winnipeg jets': ['jets', 'winnipeg', 'wpg'],
  'tampa bay lightning': ['lightning', 'tampa bay', 'tampa', 'tbl'],
  'edmonton oilers': ['oilers', 'edmonton', 'edm'],
  'san jose sharks': ['sharks', 'san jose', 'sjs'],
  'carolina hurricanes': ['hurricanes', 'carolina', 'car', 'canes'],
  'florida panthers': ['panthers', 'florida', 'fla'],
  'colorado avalanche': ['avalanche', 'avs', 'colorado', 'col'],
  'vegas golden knights': ['golden knights', 'vegas', 'vgk', 'knights'],
  'dallas stars': ['stars', 'dallas', 'dal'],
  'new york rangers': ['rangers', 'ny rangers', 'nyr'],
  'new york islanders': ['islanders', 'ny islanders', 'nyi'],
  'toronto maple leafs': ['maple leafs', 'leafs', 'toronto', 'tor'],
  'montreal canadiens': ['canadiens', 'habs', 'montreal', 'mtl'],
  'boston bruins': ['bruins', 'boston', 'bos'],
  'detroit red wings': ['red wings', 'wings', 'detroit', 'det'],
  'chicago blackhawks': ['blackhawks', 'hawks', 'chicago', 'chi'],
  'pittsburgh penguins': ['penguins', 'pens', 'pittsburgh', 'pit'],
  'washington capitals': ['capitals', 'caps', 'washington', 'wsh'],
  'philadelphia flyers': ['flyers', 'philly', 'philadelphia', 'phi'],
  'new jersey devils': ['devils', 'new jersey', 'nj', 'njd'],
  'columbus blue jackets': ['blue jackets', 'jackets', 'columbus', 'cbj'],
  'buffalo sabres': ['sabres', 'buffalo', 'buf'],
  'ottawa senators': ['senators', 'sens', 'ottawa', 'ott'],
  'minnesota wild': ['wild', 'minnesota', 'min'],
  'st louis blues': ['blues', 'st louis', 'stl'],
  'nashville predators': ['predators', 'preds', 'nashville', 'nsh'],
  'calgary flames': ['flames', 'calgary', 'cgy'],
  'vancouver canucks': ['canucks', 'vancouver', 'van'],
  'anaheim ducks': ['ducks', 'anaheim', 'ana'],
  'los angeles kings': ['kings', 'la kings', 'los angeles', 'lak'],
  'seattle kraken': ['kraken', 'seattle', 'sea'],
  'arizona coyotes': ['coyotes', 'arizona', 'ari'],
  'utah hockey club': ['utah', 'uhc'],
  
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
  'cleveland cavaliers': ['cavs', 'cavaliers', 'cleveland', 'cle'],
  'memphis grizzlies': ['grizzlies', 'memphis', 'mem'],
  'houston rockets': ['rockets', 'houston', 'hou'],
  'orlando magic': ['magic', 'orlando', 'orl'],
  'indiana pacers': ['pacers', 'indiana', 'ind'],
  'atlanta hawks': ['hawks', 'atlanta', 'atl'],
  'chicago bulls': ['bulls', 'chicago', 'chi'],
  'toronto raptors': ['raptors', 'toronto', 'tor'],
  'charlotte hornets': ['hornets', 'charlotte', 'cha'],
  'washington wizards': ['wizards', 'washington', 'wsh'],
  'detroit pistons': ['pistons', 'detroit', 'det'],
  'san antonio spurs': ['spurs', 'san antonio', 'sas'],
  'utah jazz': ['jazz', 'utah', 'uta'],
  'portland trail blazers': ['blazers', 'trail blazers', 'portland', 'por'],
  'new orleans pelicans': ['pelicans', 'new orleans', 'nop'],
  
  // NFL Teams
  'kansas city chiefs': ['chiefs', 'kc', 'kansas city'],
  'san francisco 49ers': ['49ers', 'niners', 'sf', 'san francisco'],
  'philadelphia eagles': ['eagles', 'philly', 'phi'],
  'buffalo bills': ['bills', 'buffalo', 'buf'],
  'baltimore ravens': ['ravens', 'baltimore', 'bal'],
  'cincinnati bengals': ['bengals', 'cincy', 'cincinnati', 'cin'],
  'miami dolphins': ['dolphins', 'miami', 'mia'],
  'new england patriots': ['patriots', 'pats', 'new england', 'ne'],
  'new york jets': ['jets', 'ny jets', 'nyj'],
  'new york giants': ['giants', 'ny giants', 'nyg'],
  'green bay packers': ['packers', 'green bay', 'gb'],
  'detroit lions': ['lions', 'detroit', 'det'],
  'dallas cowboys': ['cowboys', 'dallas', 'dal'],
  'seattle seahawks': ['seahawks', 'seattle', 'sea'],
  'los angeles rams': ['rams', 'la rams', 'lar'],
  'los angeles chargers': ['chargers', 'la chargers', 'lac'],
  'las vegas raiders': ['raiders', 'vegas', 'lvr'],
  'denver broncos': ['broncos', 'denver', 'den'],
  'pittsburgh steelers': ['steelers', 'pittsburgh', 'pit'],
  'cleveland browns': ['browns', 'cleveland', 'cle'],
  'tennessee titans': ['titans', 'tennessee', 'ten'],
  'jacksonville jaguars': ['jaguars', 'jags', 'jacksonville', 'jax'],
  'indianapolis colts': ['colts', 'indy', 'indianapolis', 'ind'],
  'houston texans': ['texans', 'houston', 'hou'],
  'minnesota vikings': ['vikings', 'minnesota', 'min'],
  'chicago bears': ['bears', 'chicago', 'chi'],
  'new orleans saints': ['saints', 'new orleans', 'no'],
  'tampa bay buccaneers': ['buccaneers', 'bucs', 'tampa bay', 'tb'],
  'atlanta falcons': ['falcons', 'atlanta', 'atl'],
  'carolina panthers': ['panthers', 'carolina', 'car'],
  'arizona cardinals': ['cardinals', 'arizona', 'ari'],
  'washington commanders': ['commanders', 'washington', 'wsh'],
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
  event_date?: string | null;
  bookmaker_commence_time?: string | null;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
}

interface BookmakerSignal {
  id: string;
  event_name: string;
  outcome: string;
  bookmaker: string;
  odds: number;
  implied_probability: number;
  market_type: string;
  captured_at: string;
  commence_time?: string | null;
  is_sharp_book: boolean | null;
}

function inferCommenceTime(polyMarket: PolymarketCacheEntry, matchedSignals: BookmakerSignal[] | null): string | null {
  // Prefer bookmaker commence_time (most reliable), then cached commence time, then Polymarket event_date
  const fromBook = matchedSignals?.[0]?.commence_time || null;
  const fromCache = (polyMarket.bookmaker_commence_time as string | null) || null;
  const fromPoly = (polyMarket.event_date as string | null) || null;
  return fromBook || fromCache || fromPoly;
}

function isPastCommenceTime(commenceTime: string | null, graceMinutes = 30): boolean {
  if (!commenceTime) return false;
  const t = new Date(commenceTime).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now() - graceMinutes * 60 * 1000;
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

function extractTeamsFromEvent(eventName: string): string[] {
  // Handle formats like "Jets vs. Lightning", "Lightning vs Jets", "Team A @ Team B"
  const normalized = eventName.toLowerCase();
  const separators = [' vs. ', ' vs ', ' @ ', ' at ', ' v ', ' - '];
  
  for (const sep of separators) {
    if (normalized.includes(sep)) {
      const parts = normalized.split(sep);
      if (parts.length === 2) {
        return parts.map(p => normalizeTeamName(p.trim()));
      }
    }
  }
  
  return [];
}

function teamsMatch(polyTeams: string[], bookmakerEvent: string): boolean {
  if (polyTeams.length !== 2) return false;
  
  const bookTeams = extractTeamsFromEvent(bookmakerEvent);
  if (bookTeams.length !== 2) return false;
  
  const polyCanon = polyTeams.map(getCanonicalName);
  const bookCanon = bookTeams.map(getCanonicalName);
  
  // Check if both teams match (order may differ)
  const match1 = polyCanon[0] === bookCanon[0] && polyCanon[1] === bookCanon[1];
  const match2 = polyCanon[0] === bookCanon[1] && polyCanon[1] === bookCanon[0];
  
  return match1 || match2;
}

function findMatchingOutcome(
  polyTeam: string | null,
  bookmakerSignals: BookmakerSignal[]
): BookmakerSignal | null {
  if (!polyTeam) return null;
  
  const polyCanon = getCanonicalName(polyTeam);
  
  for (const signal of bookmakerSignals) {
    const outcomeCanon = getCanonicalName(signal.outcome);
    
    // Direct match
    if (polyCanon === outcomeCanon) return signal;
    
    // Check if canonical names share an alias
    for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
      const polyInGroup = polyCanon === canonical || aliases.some(a => polyCanon.includes(a) || a.includes(polyCanon));
      const outcomeInGroup = outcomeCanon === canonical || aliases.some(a => outcomeCanon.includes(a) || a.includes(outcomeCanon));
      
      if (polyInGroup && outcomeInGroup) return signal;
    }
  }
  
  return null;
}

function calculateVigFreeProb(signals: BookmakerSignal[]): number {
  // Group by outcome and calculate vig-free probability
  // For H2H, we need both sides to remove vig
  const outcomeProbs: Map<string, number[]> = new Map();
  
  for (const signal of signals) {
    const outcome = getCanonicalName(signal.outcome);
    if (!outcomeProbs.has(outcome)) {
      outcomeProbs.set(outcome, []);
    }
    outcomeProbs.get(outcome)!.push(signal.implied_probability);
  }
  
  // Average probabilities per outcome
  const avgProbs: Map<string, number> = new Map();
  let totalRawProb = 0;
  
  for (const [outcome, probs] of outcomeProbs) {
    const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
    avgProbs.set(outcome, avg);
    totalRawProb += avg;
  }
  
  // Normalize to remove vig (total should be 1.0)
  const vigFreeProbs: Map<string, number> = new Map();
  for (const [outcome, prob] of avgProbs) {
    vigFreeProbs.set(outcome, prob / totalRawProb);
  }
  
  return totalRawProb > 0 ? 1 / totalRawProb : 0; // Return vig multiplier for logging
}

// ============================================================================
// MOVEMENT VELOCITY CALCULATION (v1.3)
// ============================================================================
// Calculate velocity from probability_snapshots time-series data
// Returns: velocity in probability units per minute

interface VelocityResult {
  velocity: number;          // prob change per minute
  absoluteMove: number;      // total probability change
  timeWindowMinutes: number; // actual time window used
  snapshotCount: number;     // number of snapshots analyzed
  direction: 'shortening' | 'drifting' | null;
  triggered: boolean;        // meets v1.3 velocity threshold
}

async function calculateMovementVelocity(
  supabase: any,
  eventKey: string,
): Promise<VelocityResult> {
  const nullResult: VelocityResult = {
    velocity: 0,
    absoluteMove: 0,
    timeWindowMinutes: 0,
    snapshotCount: 0,
    direction: null,
    triggered: false,
  };
  
  try {
    // Get snapshots from the last 15 minutes (v1.3 TIME_WINDOW_MAX)
    const windowStart = new Date(Date.now() - V1_3_GATES.TIME_WINDOW_MAX * 60 * 1000).toISOString();
    
    const { data: snapshots, error } = await supabase
      .from('probability_snapshots')
      .select('fair_probability, captured_at')
      .eq('event_key', eventKey)
      .gte('captured_at', windowStart)
      .order('captured_at', { ascending: true });
    
    if (error || !snapshots || snapshots.length < 2) {
      return nullResult;
    }
    
    // Calculate time window
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];
    const firstTime = new Date(firstSnapshot.captured_at).getTime();
    const lastTime = new Date(lastSnapshot.captured_at).getTime();
    const timeWindowMs = lastTime - firstTime;
    const timeWindowMinutes = timeWindowMs / (60 * 1000);
    
    // Need at least TIME_WINDOW_MIN of data
    if (timeWindowMinutes < V1_3_GATES.TIME_WINDOW_MIN) {
      return nullResult;
    }
    
    // Calculate probability change
    const firstProb = firstSnapshot.fair_probability;
    const lastProb = lastSnapshot.fair_probability;
    const absoluteMove = lastProb - firstProb;
    
    // Calculate velocity (probability change per minute)
    const velocity = timeWindowMinutes > 0 ? absoluteMove / timeWindowMinutes : 0;
    
    // Determine direction
    const direction = absoluteMove > 0 ? 'shortening' : absoluteMove < 0 ? 'drifting' : null;
    
    // Check if velocity meets threshold (v1.3: 0.3% per minute = 0.003)
    const triggered = Math.abs(velocity) >= V1_3_GATES.VELOCITY_THRESHOLD;
    
    console.log(`[V1.3] VELOCITY: ${eventKey.substring(0, 40)} | ${snapshots.length} snaps, ${timeWindowMinutes.toFixed(1)}m window, ${(absoluteMove * 100).toFixed(2)}% move, ${(velocity * 100).toFixed(3)}%/min velocity, triggered=${triggered}`);
    
    return {
      velocity: Math.abs(velocity),
      absoluteMove: Math.abs(absoluteMove),
      timeWindowMinutes,
      snapshotCount: snapshots.length,
      direction,
      triggered,
    };
  } catch (err) {
    console.error(`[V1.3] Velocity calc error for ${eventKey}:`, err);
    return nullResult;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[WATCH-MODE-POLL] Starting H2H movement detection...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get config
    const { data: configData } = await supabase
      .from('scan_config')
      .select('min_poly_volume, enabled_market_types, max_simultaneous_active')
      .limit(1)
      .maybeSingle();

    const minVolume = configData?.min_poly_volume || MIN_VOLUME;
    const maxActive = configData?.max_simultaneous_active || MAX_SIMULTANEOUS_ACTIVE;

    // ========================================================================
    // STEP 1: Load Polymarket H2H markets from cache (24hr max horizon)
    // Split query: API markets with volume filter + Firecrawl markets without
    // ========================================================================
    const maxEventDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    // Load API-sourced markets with volume filter
    // FIXED: Filter out stale 50¢ placeholder prices and prioritize fresh data
    const { data: apiMarkets, error: apiError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .eq('market_type', 'h2h')
      .gte('volume', minVolume)
      .not('event_date', 'is', null)
      .lte('event_date', maxEventDate)
      .or('source.is.null,source.neq.firecrawl')
      .neq('yes_price', 0.5) // Exclude stale 50/50 placeholder prices
      .order('last_price_update', { ascending: false }) // Prioritize freshest
      .order('volume', { ascending: false })
      .limit(MAX_MARKETS_PER_SCAN);

    if (apiError) throw apiError;

    // Load Firecrawl-sourced markets WITHOUT volume filter (scraped data lacks volume)
    const { data: firecrawlMarkets, error: fcError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .eq('market_type', 'h2h')
      .eq('source', 'firecrawl')
      .not('event_date', 'is', null)
      .lte('event_date', maxEventDate)
      .in('extracted_league', ['NBA', 'NCAA', 'NFL'])
      .neq('yes_price', 0.5) // Exclude stale 50/50 placeholder prices
      .order('last_price_update', { ascending: false })
      .order('event_date', { ascending: true })
      .limit(50);

    if (fcError) {
      console.warn('[WATCH-MODE-POLL] Firecrawl market fetch error:', fcError);
    }

    // Load MANUAL entries (user-submitted from screenshots) - NO volume filter
    const { data: manualMarkets, error: manualError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .eq('market_type', 'h2h')
      .eq('source', 'manual')
      .not('event_date', 'is', null)
      .lte('event_date', maxEventDate)
      .neq('yes_price', 0.5) // Exclude stale 50/50 placeholder prices
      .order('last_price_update', { ascending: false })
      .order('event_date', { ascending: true })
      .limit(50);

    if (manualError) {
      console.warn('[WATCH-MODE-POLL] Manual market fetch error:', manualError);
    }

    // Combine all market sets
    const allMarkets = [...(apiMarkets || []), ...(firecrawlMarkets || []), ...(manualMarkets || [])];

    // Deduplicate by event_title, keeping the one with most recent price update
    // This prevents the same game from appearing multiple times with different prices
    const seenEvents = new Map<string, typeof allMarkets[0]>();
    for (const market of allMarkets) {
      const existing = seenEvents.get(market.event_title);
      if (!existing) {
        seenEvents.set(market.event_title, market);
      } else {
        // Keep the market with fresher price data
        const existingTime = existing.last_price_update ? new Date(existing.last_price_update).getTime() : 0;
        const currentTime = market.last_price_update ? new Date(market.last_price_update).getTime() : 0;
        
        // Prefer non-50¢ prices, then prefer most recent update
        const existingIs50 = existing.yes_price === 0.5;
        const currentIs50 = market.yes_price === 0.5;
        
        if ((existingIs50 && !currentIs50) || (!existingIs50 && !currentIs50 && currentTime > existingTime)) {
          seenEvents.set(market.event_title, market);
        }
      }
    }
    const polyMarkets = Array.from(seenEvents.values());

    if (polyMarkets.length === 0) {
      console.log('[WATCH-MODE-POLL] No H2H markets within 24hr horizon');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No H2H markets within 24hr horizon',
          snapshots_stored: 0,
          edges_found: 0,
          api_markets: 0,
          firecrawl_markets: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[WATCH-MODE-POLL] Loaded ${polyMarkets.length} H2H markets (API: ${apiMarkets?.length || 0}, Firecrawl: ${firecrawlMarkets?.length || 0}, Manual: ${manualMarkets?.length || 0})`);

    // ========================================================================
    // STEP 2: Query bookmaker_signals for recent H2H data
    // ========================================================================
    const lookbackTime = new Date(Date.now() - BOOKMAKER_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    
    const { data: bookmakerSignals, error: bookError } = await supabase
      .from('bookmaker_signals')
      .select('*')
      .eq('market_type', 'h2h')
      .gte('captured_at', lookbackTime);

    if (bookError) throw bookError;

    if (!bookmakerSignals || bookmakerSignals.length === 0) {
      console.log('[WATCH-MODE-POLL] No recent bookmaker H2H signals found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No recent bookmaker signals',
          polymarket_count: polyMarkets.length,
          snapshots_stored: 0,
          edges_found: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[WATCH-MODE-POLL] Loaded ${bookmakerSignals.length} bookmaker H2H signals`);

    // Group bookmaker signals by event
    const signalsByEvent: Map<string, BookmakerSignal[]> = new Map();
    for (const signal of bookmakerSignals as BookmakerSignal[]) {
      const eventKey = normalizeTeamName(signal.event_name);
      if (!signalsByEvent.has(eventKey)) {
        signalsByEvent.set(eventKey, []);
      }
      signalsByEvent.get(eventKey)!.push(signal);
    }

    // ========================================================================
    // STEP 3: Match Polymarket markets to bookmaker signals
    // ========================================================================
    const edgesFound: Array<{
      polyMarket: PolymarketCacheEntry;
      bookmakerFairProb: number;
      edge: number;
      matchedTeam: string;
      matchedEvent: string;
      commenceTime: string | null;
    }> = [];

    // V1.3.1: Track ALL matched markets for "monitored" state (not just edges)
    // This ensures book prices are visible in Pipeline even before edge develops
    const allMatchedMarkets: Array<{
      polyMarket: PolymarketCacheEntry;
      bookmakerFairProb: number;
      edge: number;
      matchedTeam: string;
      matchedEvent: string;
      commenceTime: string | null;
    }> = [];

    const snapshots: Array<{
      event_key: string;
      event_name: string;
      outcome: string;
      fair_probability: number;
      captured_at: string;
      source: string;
    }> = [];

    let matchedCount = 0;
    let unmatchedCount = 0;

    // V1.3: Split metrics tracking
    const failureStats = {
      team_parse_failed: 0,
      no_book_game_found: 0,
      team_alias_missing: 0,
      outcome_not_found: 0,
    };

    for (const polyMarket of polyMarkets as PolymarketCacheEntry[]) {
      // Extract teams from Polymarket event
      const polyEventName = polyMarket.question || polyMarket.event_title;
      const polyTeams = extractTeamsFromEvent(polyEventName);
      
      // Also try team_home/team_away if extraction fails
      if (polyTeams.length !== 2 && polyMarket.team_home && polyMarket.team_away) {
        polyTeams.push(normalizeTeamName(polyMarket.team_home));
        polyTeams.push(normalizeTeamName(polyMarket.team_away));
      }

      if (polyTeams.length !== 2) {
        console.log(`[${CORE_LOGIC_VERSION}] TEAM_PARSE_FAILED: ${polyEventName}`);
        unmatchedCount++;
        failureStats.team_parse_failed++;
        
        // Log to match_failures
        await logMatchFailure(supabase, {
          poly_event_title: polyEventName,
          poly_team_a: polyTeams[0] || 'UNKNOWN',
          poly_team_b: polyTeams[1] || 'UNKNOWN',
          poly_condition_id: polyMarket.condition_id,
          sport_code: polyMarket.sport_category,
          failure_reason: 'TEAM_PARSE_FAILED',
          last_seen_at: new Date().toISOString(),
        });
        continue;
      }

      // Find matching bookmaker event
      let matchedEventKey: string | null = null;
      let matchedSignals: BookmakerSignal[] = [];

      for (const [eventKey, signals] of signalsByEvent) {
        if (teamsMatch(polyTeams, signals[0].event_name)) {
          matchedEventKey = eventKey;
          matchedSignals = signals;
          break;
        }
      }

      if (!matchedEventKey || matchedSignals.length === 0) {
        console.log(`[${CORE_LOGIC_VERSION}] NO_BOOK_GAME_FOUND: ${polyEventName} (teams: ${polyTeams.join(' vs ')})`);
        unmatchedCount++;
        failureStats.no_book_game_found++;
        
        // Log to match_failures
        await logMatchFailure(supabase, {
          poly_event_title: polyEventName,
          poly_team_a: polyTeams[0],
          poly_team_b: polyTeams[1],
          poly_condition_id: polyMarket.condition_id,
          sport_code: polyMarket.sport_category,
          failure_reason: 'NO_BOOK_GAME_FOUND',
          last_seen_at: new Date().toISOString(),
        });
        continue;
      }

      matchedCount++;

      // Use bookmaker commence_time when available to prevent past events hanging around with NULL commence_time
      const commenceTime = inferCommenceTime(polyMarket, matchedSignals);
      if (isPastCommenceTime(commenceTime, 30)) {
        // If we already have a watch_state row, force-expire it; otherwise just skip
        try {
          await supabase
            .from('event_watch_state')
            .update({ watch_state: 'expired', commence_time: commenceTime })
            .eq('event_key', `poly_${polyMarket.condition_id}`);
        } catch (_) {
          // ignore
        }
        continue;
      }

      // Find the specific outcome matching Polymarket's team_home (the YES side)
      const homeTeam = polyMarket.team_home || polyTeams[0];
      const matchedOutcome = findMatchingOutcome(homeTeam, matchedSignals);

      if (!matchedOutcome) {
        console.log(`[${CORE_LOGIC_VERSION}] TEAM_ALIAS_MISSING: ${homeTeam} in ${polyEventName}`);
        failureStats.team_alias_missing++;
        
        // Log to match_failures - matched event but can't resolve outcome
        await logMatchFailure(supabase, {
          poly_event_title: polyEventName,
          poly_team_a: polyTeams[0],
          poly_team_b: polyTeams[1],
          poly_condition_id: polyMarket.condition_id,
          sport_code: polyMarket.sport_category,
          failure_reason: 'TEAM_ALIAS_MISSING',
          last_seen_at: new Date().toISOString(),
        });
        continue;
      }

      // Calculate vig-free fair probability
      const outcomeProbs: Map<string, number[]> = new Map();
      for (const signal of matchedSignals) {
        const outcome = getCanonicalName(signal.outcome);
        if (!outcomeProbs.has(outcome)) {
          outcomeProbs.set(outcome, []);
        }
        outcomeProbs.get(outcome)!.push(signal.implied_probability);
      }

      // Calculate averages and remove vig
      let totalRawProb = 0;
      const avgProbs: Map<string, number> = new Map();
      for (const [outcome, probs] of outcomeProbs) {
        const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
        avgProbs.set(outcome, avg);
        totalRawProb += avg;
      }

      // V1.3 FIX: For NHL (and other 3-way sports), filter out Draw/Tie and renormalize to 2-way
      // Polymarket H2H markets are always 2-way (Team A wins vs Team B wins), so we must
      // compare against 2-way fair probabilities, not raw 3-way odds that include Draw
      const isNHL = polyMarket.sport_category?.toLowerCase().includes('nhl') || 
                    polyMarket.sport_category?.toLowerCase().includes('icehockey');
      
      if (isNHL) {
        // Remove Draw/Tie outcomes from the probability map
        const drawKeys = [...avgProbs.keys()].filter(k => 
          k.toLowerCase() === 'draw' || k.toLowerCase() === 'tie'
        );
        for (const drawKey of drawKeys) {
          const drawProb = avgProbs.get(drawKey) || 0;
          avgProbs.delete(drawKey);
          totalRawProb -= drawProb;
          console.log(`[${CORE_LOGIC_VERSION}] NHL 3→2 normalization: removed ${drawKey} (${(drawProb * 100).toFixed(1)}%) from ${polyEventName.substring(0, 30)}`);
        }
      }

      // Vig-free probability for matched outcome (now normalized to 2-way for NHL)
      const matchedOutcomeCanon = getCanonicalName(matchedOutcome.outcome);
      const rawProb = avgProbs.get(matchedOutcomeCanon) || matchedOutcome.implied_probability;
      const vigFreeFairProb = totalRawProb > 0 ? rawProb / totalRawProb : rawProb;

      // Store snapshot for movement tracking
      const eventKey = `poly_${polyMarket.condition_id}`;
      snapshots.push({
        event_key: eventKey,
        event_name: polyMarket.question,
        outcome: homeTeam,
        fair_probability: vigFreeFairProb,
        captured_at: new Date().toISOString(),
        source: 'bookmaker_h2h',
      });

      // Calculate edge
      const edge = (vigFreeFairProb - polyMarket.yes_price) * 100;

      console.log(`[${CORE_LOGIC_VERSION}] Match: ${polyEventName.substring(0, 40)}... | Book: ${(vigFreeFairProb * 100).toFixed(1)}% | Poly: ${(polyMarket.yes_price * 100).toFixed(1)}% | Edge: ${edge.toFixed(1)}%`);

      // V1.3.1: Store ALL matched markets for "monitored" state
      allMatchedMarkets.push({
        polyMarket,
        bookmakerFairProb: vigFreeFairProb,
        edge,
        matchedTeam: homeTeam,
        matchedEvent: matchedSignals[0].event_name,
        commenceTime,
      });

      if (edge >= MIN_EDGE_PCT) {
        edgesFound.push({
          polyMarket,
          bookmakerFairProb: vigFreeFairProb,
          edge,
          matchedTeam: homeTeam,
          matchedEvent: matchedSignals[0].event_name,
          commenceTime,
        });
      }
    }

    // ========================================================================
    // V1.3: SPLIT METRICS LOGGING
    // ========================================================================
    const bookCoverageAvailable = matchedCount + failureStats.team_alias_missing;
    const bookCoverageMissing = failureStats.no_book_game_found;
    const matchRateCovered = bookCoverageAvailable > 0 
      ? ((matchedCount / bookCoverageAvailable) * 100).toFixed(1) 
      : '0.0';

    console.log(`[${CORE_LOGIC_VERSION}] COVERAGE: ${bookCoverageAvailable}/${polyMarkets.length} markets have book data (${((bookCoverageAvailable / polyMarkets.length) * 100).toFixed(0)}%)`);
    console.log(`[${CORE_LOGIC_VERSION}] MATCH_RATE_COVERED: ${matchedCount}/${bookCoverageAvailable} matched (${matchRateCovered}%)`);
    console.log(`[${CORE_LOGIC_VERSION}] FAILURES: ${failureStats.team_alias_missing} team_alias, ${failureStats.team_parse_failed} parse_failed, ${failureStats.no_book_game_found} no_book_data`);

    // ========================================================================
    // STEP 4: Store snapshots
    // ========================================================================
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('probability_snapshots')
        .insert(snapshots);

      if (insertError) {
        console.error(`[${CORE_LOGIC_VERSION}] Snapshot insert error:`, insertError);
      } else {
        console.log(`[${CORE_LOGIC_VERSION}] Stored ${snapshots.length} snapshots`);
      }
    }

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
    let velocityTriggeredCount = 0;

    for (const edgeData of toEscalate) {
      const { polyMarket, bookmakerFairProb, edge, matchedTeam, commenceTime } = edgeData;
      
      const eventKey = `poly_${polyMarket.condition_id}`;
      const activeUntil = new Date(Date.now() + ACTIVE_WINDOW_MINUTES * 60 * 1000).toISOString();

      // ========================================================================
      // V1.3: Calculate movement velocity from probability_snapshots
      // ========================================================================
      const velocityResult = await calculateMovementVelocity(supabase, eventKey);
      
      if (velocityResult.triggered) {
        velocityTriggeredCount++;
        console.log(`[V1.3] VELOCITY_TRIGGERED: ${polyMarket.question.substring(0, 40)}... | ${(velocityResult.velocity * 100).toFixed(3)}%/min, ${velocityResult.direction}`);
      }
      
      // ========================================================================
      // V1.3: Book probability gate - reject signals with book prob < 45%
      // ========================================================================
      if (bookmakerFairProb < V1_3_GATES.S1_BOOK_PROB_MIN) {
        console.log(`[V1.3] BOOK_PROB_GATE_REJECT: ${polyMarket.question.substring(0, 40)}... | ${(bookmakerFairProb * 100).toFixed(1)}% < ${V1_3_GATES.S1_BOOK_PROB_MIN * 100}% floor`);
        continue; // Skip this market entirely
      }

      const { error: upsertError } = await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: polyMarket.question,
          watch_state: 'active',
          commence_time: commenceTime,
          polymarket_condition_id: polyMarket.condition_id,
          polymarket_question: polyMarket.question,
          polymarket_yes_price: polyMarket.yes_price,
          polymarket_volume: polyMarket.volume,
          bookmaker_market_key: matchedTeam,
          bookmaker_source: normalizeSportCategory(polyMarket.sport_category),
          initial_probability: bookmakerFairProb,
          current_probability: bookmakerFairProb,
          peak_probability: bookmakerFairProb,
          movement_pct: velocityResult.absoluteMove * 100, // Use actual movement, not edge
          movement_velocity: velocityResult.velocity,      // NEW: Store velocity for monitor
          polymarket_price: polyMarket.yes_price,
          polymarket_matched: true,
          escalated_at: new Date().toISOString(),
          active_until: activeUntil,
          hold_start_at: new Date().toISOString(),
          samples_since_hold: velocityResult.snapshotCount,
          last_poly_refresh: new Date().toISOString(),
        }, { onConflict: 'event_key' });

      if (!upsertError) {
        escalatedCount++;
        const velocityLabel = velocityResult.triggered ? `[VEL=${(velocityResult.velocity * 100).toFixed(2)}%/min]` : '';
        console.log(`[${CORE_LOGIC_VERSION}] Escalated: ${polyMarket.question.substring(0, 40)}... (+${edge.toFixed(1)}% edge) ${velocityLabel}`);
      }
    }

    // Store non-escalated edges in watching state (with velocity data)
    for (const edgeData of edgesFound.filter(e => !toEscalate.includes(e))) {
      const { polyMarket, bookmakerFairProb, edge, matchedTeam, commenceTime } = edgeData;
      const eventKey = `poly_${polyMarket.condition_id}`;
      
      // V1.3: Book probability gate for watching state too
      if (bookmakerFairProb < V1_3_GATES.S1_BOOK_PROB_MIN) {
        console.log(`[V1.3] WATCHING_REJECT: ${polyMarket.question.substring(0, 40)}... | ${(bookmakerFairProb * 100).toFixed(1)}% < floor`);
        continue;
      }
      
      // Calculate velocity for watching state too
      const velocityResult = await calculateMovementVelocity(supabase, eventKey);

      await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: polyMarket.question,
          watch_state: 'watching',
          commence_time: commenceTime,
          polymarket_condition_id: polyMarket.condition_id,
          polymarket_question: polyMarket.question,
          polymarket_yes_price: polyMarket.yes_price,
          polymarket_volume: polyMarket.volume,
          bookmaker_market_key: matchedTeam,
          bookmaker_source: normalizeSportCategory(polyMarket.sport_category),
          initial_probability: bookmakerFairProb,
          current_probability: bookmakerFairProb,
          movement_pct: velocityResult.absoluteMove * 100,
          movement_velocity: velocityResult.velocity,
          polymarket_price: polyMarket.yes_price,
          polymarket_matched: true,
        }, { onConflict: 'event_key' });
    }

    // ========================================================================
    // STEP 6.5 (V1.3.1): Upsert ALL matched markets as "monitored" with book data
    // This ensures Pipeline shows book prices even for markets without current edge
    // Critical for tracking: markets may develop edge later via movement
    // ========================================================================
    let monitoredCount = 0;
    const escalatedKeys = new Set(toEscalate.map(e => `poly_${e.polyMarket.condition_id}`));
    
    for (const matchData of allMatchedMarkets) {
      const { polyMarket, bookmakerFairProb, edge, matchedTeam, commenceTime } = matchData;
      const eventKey = `poly_${polyMarket.condition_id}`;
      
      // Skip if already escalated to active/watching (higher priority state)
      if (escalatedKeys.has(eventKey)) {
        continue;
      }
      
      // Check if event already exists in a higher-priority state
      const { data: existing } = await supabase
        .from('event_watch_state')
        .select('watch_state')
        .eq('event_key', eventKey)
        .single();
      
      // Don't downgrade from active/confirmed/signal states
      const preserveStates = ['active', 'confirmed', 'signal'];
      if (existing && preserveStates.includes(existing.watch_state)) {
        // Just update the book data without changing state
        await supabase
          .from('event_watch_state')
          .update({
            current_probability: bookmakerFairProb,
            bookmaker_market_key: matchedTeam,
            bookmaker_source: normalizeSportCategory(polyMarket.sport_category),
            polymarket_yes_price: polyMarket.yes_price,
            polymarket_volume: polyMarket.volume,
            commence_time: commenceTime,
            last_poly_refresh: new Date().toISOString(),
          })
          .eq('event_key', eventKey);
        continue;
      }
      
      // Upsert as "monitored" state with full book data
      const { error: monitorError } = await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: polyMarket.question,
          watch_state: 'monitored',
          commence_time: commenceTime,
          polymarket_condition_id: polyMarket.condition_id,
          polymarket_question: polyMarket.question,
          polymarket_yes_price: polyMarket.yes_price,
          polymarket_volume: polyMarket.volume,
          bookmaker_market_key: matchedTeam,
          bookmaker_source: normalizeSportCategory(polyMarket.sport_category),
          initial_probability: existing ? undefined : bookmakerFairProb, // Don't overwrite initial
          current_probability: bookmakerFairProb,
          movement_pct: Math.abs(edge), // Store absolute edge as movement indicator
          polymarket_price: polyMarket.yes_price,
          polymarket_matched: true,
          last_poly_refresh: new Date().toISOString(),
        }, { onConflict: 'event_key' });
      
      if (!monitorError) {
        monitoredCount++;
      }
    }
    
    console.log(`[${CORE_LOGIC_VERSION}] Monitored ${monitoredCount} matched markets with book data`);

    // Cleanup old snapshots (>24h)
    const cleanupTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('probability_snapshots')
      .delete()
      .lt('captured_at', cleanupTime);

    const duration = Date.now() - startTime;
    console.log(`[${CORE_LOGIC_VERSION}] Complete in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        core_logic_version: CORE_LOGIC_VERSION,
        polymarket_count: polyMarkets.length,
        bookmaker_signals_count: bookmakerSignals.length,
        matched_markets: matchedCount,
        unmatched_markets: unmatchedCount,
        monitored_with_book_data: monitoredCount,
        book_coverage_available: bookCoverageAvailable,
        book_coverage_missing: bookCoverageMissing,
        match_rate_covered_pct: parseFloat(matchRateCovered),
        failure_stats: failureStats,
        snapshots_stored: snapshots.length,
        edges_found: edgesFound.length,
        escalated_to_active: escalatedCount,
        velocity_triggered: velocityTriggeredCount,
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
