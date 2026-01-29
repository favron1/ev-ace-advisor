// ============================================================================
// WATCH-MODE-POLL: H2H Movement Detection via Bookmaker Signals
// ============================================================================
// This function detects arbitrage opportunities by:
// 1. Query Polymarket H2H cache for active sports markets (24hr horizon)
// 2. Query bookmaker_signals table for recent H2H data
// 3. Match markets by team names with fuzzy logic
// 4. Calculate edge = bookmaker_fair_prob - polymarket_yes_price
// 5. Store snapshots for movement tracking
// 6. Escalate markets with edge to active monitoring
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
  is_sharp_book: boolean | null;
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
    // ========================================================================
    const maxEventDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    const { data: polyMarkets, error: fetchError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .eq('market_type', 'h2h')
      .gte('volume', minVolume)
      .not('event_date', 'is', null)
      .lte('event_date', maxEventDate)
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
    
    console.log(`[WATCH-MODE-POLL] Loaded ${polyMarkets.length} Polymarket H2H markets`);

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
        console.log(`[WATCH-MODE-POLL] Could not parse teams from: ${polyEventName}`);
        unmatchedCount++;
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
        console.log(`[WATCH-MODE-POLL] No bookmaker match for: ${polyEventName} (teams: ${polyTeams.join(' vs ')})`);
        unmatchedCount++;
        continue;
      }

      matchedCount++;

      // Find the specific outcome matching Polymarket's team_home (the YES side)
      const homeTeam = polyMarket.team_home || polyTeams[0];
      const matchedOutcome = findMatchingOutcome(homeTeam, matchedSignals);

      if (!matchedOutcome) {
        console.log(`[WATCH-MODE-POLL] Matched event but no outcome for: ${homeTeam}`);
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

      // Vig-free probability for matched outcome
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

      console.log(`[WATCH-MODE-POLL] Match: ${polyEventName.substring(0, 40)}... | Book: ${(vigFreeFairProb * 100).toFixed(1)}% | Poly: ${(polyMarket.yes_price * 100).toFixed(1)}% | Edge: ${edge.toFixed(1)}%`);

      if (edge >= MIN_EDGE_PCT) {
        edgesFound.push({
          polyMarket,
          bookmakerFairProb: vigFreeFairProb,
          edge,
          matchedTeam: homeTeam,
          matchedEvent: matchedSignals[0].event_name,
        });
      }
    }

    console.log(`[WATCH-MODE-POLL] Matched: ${matchedCount}/${polyMarkets.length} markets, Unmatched: ${unmatchedCount}`);

    // ========================================================================
    // STEP 4: Store snapshots
    // ========================================================================
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('probability_snapshots')
        .insert(snapshots);

      if (insertError) {
        console.error('[WATCH-MODE-POLL] Snapshot insert error:', insertError);
      } else {
        console.log(`[WATCH-MODE-POLL] Stored ${snapshots.length} snapshots`);
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
          bookmaker_source: normalizeSportCategory(polyMarket.sport_category),
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
          bookmaker_source: normalizeSportCategory(polyMarket.sport_category),
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
        polymarket_count: polyMarkets.length,
        bookmaker_signals_count: bookmakerSignals.length,
        matched_markets: matchedCount,
        unmatched_markets: unmatchedCount,
        snapshots_stored: snapshots.length,
        edges_found: edgesFound.length,
        escalated_to_active: escalatedCount,
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
