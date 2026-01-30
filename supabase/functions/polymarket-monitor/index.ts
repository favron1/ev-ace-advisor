import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket CLOB API for live prices
const CLOB_API_BASE = 'https://clob.polymarket.com';

// Odds API for bookmaker data
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sport to API endpoint mapping with market types
const SPORT_ENDPOINTS: Record<string, { sport: string; markets: string }> = {
  'NBA': { sport: 'basketball_nba', markets: 'h2h,spreads,totals' },
  'NFL': { sport: 'americanfootball_nfl', markets: 'h2h,spreads,totals' },
  'NHL': { sport: 'icehockey_nhl', markets: 'h2h,spreads,totals' },
  'MLB': { sport: 'baseball_mlb', markets: 'h2h,spreads,totals' },
  'UFC': { sport: 'mma_mixed_martial_arts', markets: 'h2h' },
  'Tennis': { sport: 'tennis_atp_aus_open_singles', markets: 'h2h' },
  'EPL': { sport: 'soccer_epl', markets: 'h2h,spreads,totals' },
  'UCL': { sport: 'soccer_uefa_champs_league', markets: 'h2h' },
  'LaLiga': { sport: 'soccer_spain_la_liga', markets: 'h2h' },
  'SerieA': { sport: 'soccer_italy_serie_a', markets: 'h2h' },
  'Bundesliga': { sport: 'soccer_germany_bundesliga', markets: 'h2h' },
  'Boxing': { sport: 'boxing_boxing', markets: 'h2h' },
};

// Sharp books for weighting
const SHARP_BOOKS = ['pinnacle', 'betfair', 'betfair_ex_eu'];

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Detect sport from text (for fallback when extracted_league is null)
function detectSportFromText(title: string, question: string): string | null {
  const combined = `${title} ${question}`.toLowerCase();
  
  const sportPatterns: Array<{ patterns: RegExp[]; sport: string }> = [
    // NHL - check FIRST to catch "Blackhawks" before NBA's "hawks" pattern
    { patterns: [/\bnhl\b/, /blackhawks|maple leafs|canadiens|habs|bruins|rangers|islanders|devils|flyers|penguins|capitals|caps|hurricanes|canes|panthers|lightning|bolts|red wings|senators|sens|sabres|blue jackets|blues|wild|avalanche|avs|stars|predators|preds|jets|flames|oilers|canucks|kraken|golden knights|knights|coyotes|sharks|ducks|kings/i], sport: 'NHL' },
    
    // NBA - team names and league
    { patterns: [/\bnba\b/, /lakers|celtics|warriors|heat|bulls|knicks|nets|bucks|76ers|sixers|suns|nuggets|clippers|mavericks|rockets|grizzlies|timberwolves|pelicans|spurs|thunder|jazz|blazers|trail blazers|hornets|atlanta hawks|wizards|magic|pistons|cavaliers|raptors|pacers/i], sport: 'NBA' },
    
    // NFL - team names and league
    { patterns: [/\bnfl\b/, /chiefs|eagles|49ers|niners|cowboys|bills|ravens|bengals|dolphins|lions|packers|patriots|broncos|chargers|raiders|steelers|browns|texans|colts|jaguars|titans|commanders|giants|saints|panthers|falcons|buccaneers|bucs|seahawks|rams|cardinals|bears|vikings/i], sport: 'NFL' },
    
    // UFC/MMA
    { patterns: [/\bufc\b/, /\bmma\b/], sport: 'UFC' },
    
    // Tennis
    { patterns: [/\batp\b/, /\bwta\b/, /djokovic|sinner|alcaraz|medvedev|zverev|sabalenka|swiatek|gauff/i], sport: 'Tennis' },
    
    // EPL
    { patterns: [/premier league|\bepl\b|arsenal|chelsea|liverpool|man city|manchester city|man united|manchester united|tottenham|spurs/i], sport: 'EPL' },
    
    // MLB
    { patterns: [/\bmlb\b|yankees|red sox|dodgers|mets|phillies|braves|cubs|cardinals/i], sport: 'MLB' },
    
    // Champions League
    { patterns: [/champions league|\bucl\b|real madrid|barcelona|bayern|juventus/i], sport: 'UCL' },
    
    // La Liga
    { patterns: [/la liga|laliga|atletico madrid|sevilla|villarreal/i], sport: 'LaLiga' },
    
    // Serie A
    { patterns: [/serie a|napoli|roma|lazio|inter milan|ac milan/i], sport: 'SerieA' },
    
    // Bundesliga
    { patterns: [/bundesliga|leverkusen|leipzig|dortmund|frankfurt/i], sport: 'Bundesliga' },
    
    // Boxing
    { patterns: [/\bbox(?:ing)?\b|fury|usyk|joshua|canelo|crawford/i], sport: 'Boxing' },
  ];
  
  for (const { patterns, sport } of sportPatterns) {
    if (patterns.some(p => p.test(combined))) {
      return sport;
    }
  }
  
  return null;
}

// Generate event key for movement detection
function generateEventKey(eventName: string, outcome: string): string {
  return `${eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')}::${outcome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

// Calculate fair probability by removing vig (supports 2-way and 3-way markets)
function calculateFairProb(odds: number[], targetIndex: number): number {
  const probs = odds.map(o => 1 / o);
  const totalProb = probs.reduce((a, b) => a + b, 0);
  return probs[targetIndex] / totalProb;
}

// Calculate net edge after fees - now uses actual spread if available
function calculateNetEdge(
  rawEdge: number, 
  volume: number, 
  stakeAmount: number = 100,
  actualSpreadPct: number | null = null
): {
  netEdge: number;
  platformFee: number;
  spreadCost: number;
  slippage: number;
} {
  const platformFee = rawEdge > 0 ? rawEdge * 0.01 : 0;
  
  let spreadCost = actualSpreadPct !== null ? actualSpreadPct : 0.03;
  if (actualSpreadPct === null) {
    if (volume >= 500000) spreadCost = 0.005;
    else if (volume >= 100000) spreadCost = 0.01;
    else if (volume >= 50000) spreadCost = 0.015;
    else if (volume >= 10000) spreadCost = 0.02;
  }
  
  let slippage = 0.03;
  if (volume > 0) {
    const ratio = stakeAmount / volume;
    if (ratio < 0.001) slippage = 0.002;
    else if (ratio < 0.005) slippage = 0.005;
    else if (ratio < 0.01) slippage = 0.01;
    else if (ratio < 0.02) slippage = 0.02;
  }
  
  return { netEdge: rawEdge - platformFee - spreadCost - slippage, platformFee, spreadCost, slippage };
}

// ============= MOVEMENT DETECTION FUNCTIONS =============

interface MovementResult {
  triggered: boolean;
  velocity: number;
  booksConfirming: number;
  direction: 'shortening' | 'drifting' | null;
}

// Get movement threshold based on baseline probability (probability-relative)
function getMovementThreshold(baselineProb: number): number {
  // 3% move from 20% is massive, 3% from 75% is less meaningful
  return Math.max(0.02, 0.12 * baselineProb);
}

// Check if recent move accounts for 70%+ of total movement (recency bias)
function checkRecencyBias(snapshots: any[]): boolean {
  if (snapshots.length < 2) return false;
  
  const oldest = snapshots[0].implied_probability;
  const newest = snapshots[snapshots.length - 1].implied_probability;
  const totalMove = Math.abs(newest - oldest);
  
  if (totalMove < 0.01) return false; // Negligible total movement
  
  // Find price ~10 minutes ago
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentSnapshot = snapshots.find((s: any) => new Date(s.captured_at) >= tenMinAgo);
  
  if (!recentSnapshot) return true; // All movement is recent
  
  const recentMove = Math.abs(newest - recentSnapshot.implied_probability);
  return (recentMove / totalMove) >= 0.70;
}

// Check that no sharp book moved meaningfully in opposite direction
function checkNoCounterMoves(movements: { book: string; change: number; direction: number }[]): boolean {
  if (movements.length === 0) return false;
  
  const primaryDirection = movements[0].direction;
  
  for (const movement of movements) {
    // If any book moved meaningfully (>=2%) in opposite direction, fail
    if (movement.direction !== primaryDirection && Math.abs(movement.change) >= 0.02) {
      return false;
    }
  }
  
  return true;
}

// Main movement detection function
async function detectSharpMovement(
  supabase: any,
  eventKey: string,
  outcome: string
): Promise<MovementResult> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  // Get last 30 minutes of sharp book data for this event/outcome
  const { data: snapshots, error } = await supabase
    .from('sharp_book_snapshots')
    .select('*')
    .eq('event_key', eventKey)
    .eq('outcome', outcome)
    .gte('captured_at', thirtyMinAgo.toISOString())
    .order('captured_at', { ascending: true });
  
  if (error || !snapshots || snapshots.length < 2) {
    return { triggered: false, velocity: 0, booksConfirming: 0, direction: null };
  }
  
  // Group by bookmaker
  const byBook: Record<string, any[]> = {};
  for (const snap of snapshots) {
    if (!byBook[snap.bookmaker]) {
      byBook[snap.bookmaker] = [];
    }
    byBook[snap.bookmaker].push(snap);
  }
  
  // Calculate movement for each sharp book
  const movements: { book: string; change: number; direction: number }[] = [];
  const sharpBooks = ['pinnacle', 'betfair', 'circa', 'betonline', 'bookmaker'];
  
  for (const book of sharpBooks) {
    const bookSnapshots = byBook[book];
    if (!bookSnapshots || bookSnapshots.length < 2) continue;
    
    const oldest = bookSnapshots[0].implied_probability;
    const newest = bookSnapshots[bookSnapshots.length - 1].implied_probability;
    const change = newest - oldest;
    
    // Probability-relative threshold
    const threshold = getMovementThreshold(oldest);
    
    if (Math.abs(change) >= threshold) {
      // Check recency bias
      if (checkRecencyBias(bookSnapshots)) {
        movements.push({
          book,
          change,
          direction: Math.sign(change),
        });
      }
    }
  }
  
  // Coordination check: ≥2 books, same direction, no counter-moves
  if (movements.length >= 2) {
    if (checkNoCounterMoves(movements)) {
      const avgVelocity = movements.reduce((sum, m) => sum + Math.abs(m.change), 0) / movements.length;
      const direction = movements[0].direction > 0 ? 'shortening' : 'drifting';
      
      return {
        triggered: true,
        velocity: avgVelocity,
        booksConfirming: movements.length,
        direction,
      };
    }
  }
  
  return { triggered: false, velocity: 0, booksConfirming: 0, direction: null };
}

// Determine signal tier based on movement + edge
function calculateSignalTier(
  movementTriggered: boolean,
  netEdge: number
): 'elite' | 'strong' | 'static' {
  if (!movementTriggered) return 'static';
  if (netEdge >= 0.05) return 'elite';
  if (netEdge >= 0.03) return 'strong';
  return 'static';
}

// ============= END MOVEMENT DETECTION =============

// Batch fetch CLOB prices for multiple tokens - with chunking for large payloads
async function fetchClobPrices(tokenIds: string[]): Promise<Map<string, { bid: number; ask: number }>> {
  const priceMap = new Map<string, { bid: number; ask: number }>();
  
  if (tokenIds.length === 0) return priceMap;
  
  // Chunk tokens to avoid payload size limits (max 50 tokens per request = 100 price entries)
  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
    chunks.push(tokenIds.slice(i, i + CHUNK_SIZE));
  }
  
  console.log(`[POLY-MONITOR] Fetching CLOB prices in ${chunks.length} chunks (${tokenIds.length} tokens)`);
  
  for (const chunk of chunks) {
    try {
      // Build request body: array of { token_id, side } for both BUY and SELL
      const requestBody = chunk.flatMap(tokenId => [
        { token_id: tokenId, side: 'BUY' },
        { token_id: tokenId, side: 'SELL' },
      ]);
      
      const response = await fetch(`${CLOB_API_BASE}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[POLY-MONITOR] CLOB prices chunk failed: ${response.status} - ${errorText.substring(0, 100)}`);
        continue; // Continue with next chunk
      }
      
      const data = await response.json();
      
      // Response format: { "token_id": { "BUY": "0.55", "SELL": "0.57" }, ... }
      for (const [tokenId, priceData] of Object.entries(data)) {
        if (typeof priceData === 'object' && priceData !== null) {
          const pd = priceData as Record<string, string>;
          priceMap.set(tokenId, {
            bid: parseFloat(pd.BUY || '0'),
            ask: parseFloat(pd.SELL || '0'),
          });
        }
      }
    } catch (error) {
      console.error('[POLY-MONITOR] CLOB chunk price fetch error:', error);
    }
  }
  
  console.log(`[POLY-MONITOR] CLOB prices: got ${priceMap.size} token prices`);
  return priceMap;
}

// Fetch spreads for tokens - with chunking
async function fetchClobSpreads(tokenIds: string[]): Promise<Map<string, number>> {
  const spreadMap = new Map<string, number>();
  
  if (tokenIds.length === 0) return spreadMap;
  
  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
    chunks.push(tokenIds.slice(i, i + CHUNK_SIZE));
  }
  
  for (const chunk of chunks) {
    try {
      const response = await fetch(`${CLOB_API_BASE}/spreads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map(id => ({ token_id: id }))),
      });
      
      if (!response.ok) {
        console.log(`[POLY-MONITOR] CLOB spreads chunk failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      for (const [tokenId, spread] of Object.entries(data)) {
        if (typeof spread === 'string' || typeof spread === 'number') {
          spreadMap.set(tokenId, parseFloat(String(spread)));
        }
      }
    } catch (error) {
      console.error('[POLY-MONITOR] CLOB spreads chunk error:', error);
    }
  }
  
  return spreadMap;
}

// Format time until event
function formatTimeUntil(eventDate: Date): string {
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return hours >= 1 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Send SMS alert - only for ELITE and STRONG signals
async function sendSmsAlert(
  supabase: any,
  event: any,
  polyPrice: number,
  bookmakerFairProb: number,
  rawEdge: number,
  netEdge: number,
  volume: number,
  stakeAmount: number,
  marketType: string,
  teamName: string | null,
  signalTier: string,
  movementVelocity: number,
  betSide: 'YES' | 'NO',
  movementDirection: 'shortening' | 'drifting' | null
): Promise<boolean> {
  // Only send SMS for ELITE and STRONG signals
  if (signalTier !== 'elite' && signalTier !== 'strong') {
    console.log(`[POLY-MONITOR] Skipping SMS for ${signalTier} tier signal`);
    return false;
  }
  
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone_number')
      .not('phone_number', 'is', null)
      .limit(1);
    
    if (!profiles || profiles.length === 0 || !profiles[0].phone_number) {
      console.log('[POLY-MONITOR] No phone number configured');
      return false;
    }
    
    const phoneNumber = profiles[0].phone_number;
    const eventDate = new Date(event.commence_time);
    const timeUntil = formatTimeUntil(eventDate);
    const netEv = (netEdge * stakeAmount).toFixed(2);
    
    // Directional labeling: BUY YES vs BUY NO
    const betDirectionLabel = betSide === 'YES' ? 'BUY YES' : 'BUY NO';
    const polyPriceLabel = betSide === 'YES' ? 'Poly YES' : 'Poly NO';
    const tierEmoji = signalTier === 'elite' ? '🚨' : '🎯';
    
    // Movement direction text
    const movementText = movementDirection === 'shortening' 
      ? `SHORTENING +${(movementVelocity * 100).toFixed(1)}%`
      : movementDirection === 'drifting'
        ? `DRIFTING ${(movementVelocity * 100).toFixed(1)}%`
        : '';
    
    const message = `${tierEmoji} ${signalTier.toUpperCase()}: ${event.event_name}
${betDirectionLabel}: ${teamName}
${polyPriceLabel}: ${(polyPrice * 100).toFixed(0)}¢ ($${(volume / 1000).toFixed(0)}K)
Book: ${(bookmakerFairProb * 100).toFixed(0)}%
Edge: +${(rawEdge * 100).toFixed(1)}% raw, +$${netEv} net EV
Sharp books ${movementText}
⏰ ${timeUntil} - ACT NOW`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to: phoneNumber, message }),
    });
    
    if (!response.ok) {
      console.error('[POLY-MONITOR] SMS failed:', await response.text());
      return false;
    }
    
    console.log(`[POLY-MONITOR] SMS sent for ${signalTier} signal`);
    return true;
  } catch (error) {
    console.error('[POLY-MONITOR] SMS error:', error);
    return false;
  }
}

// Fetch bookmaker odds for a sport
async function fetchBookmakerOdds(sport: string, markets: string, apiKey: string): Promise<any[]> {
  try {
    const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${apiKey}&markets=${markets}&regions=us,uk,eu&oddsFormat=decimal`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`[POLY-MONITOR] Odds API error for ${sport}: ${response.status}`);
      }
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[POLY-MONITOR] Failed to fetch ${sport}:`, error);
    return [];
  }
}

// Match Polymarket event to bookmaker game
function findBookmakerMatch(
  eventName: string,
  question: string,
  marketType: string,
  bookmakerGames: any[]
): { game: any; targetIndex: number; marketKey: string; teamName: string } | null {
  const eventNorm = normalizeName(`${eventName} ${question}`);
  
  for (const game of bookmakerGames) {
    const homeNorm = normalizeName(game.home_team);
    const awayNorm = normalizeName(game.away_team);
    
    const homeWords = homeNorm.split(' ').filter((w: string) => w.length > 2);
    const awayWords = awayNorm.split(' ').filter((w: string) => w.length > 2);
    
    const containsHome = homeWords.some((w: string) => eventNorm.includes(w));
    const containsAway = awayWords.some((w: string) => eventNorm.includes(w));
    
    if (!containsHome && !containsAway) continue;
    
    let targetMarketKey = 'h2h';
    if (marketType === 'total') targetMarketKey = 'totals';
    else if (marketType === 'spread') targetMarketKey = 'spreads';
    
    const bookmaker = game.bookmakers?.[0];
    const market = bookmaker?.markets?.find((m: any) => m.key === targetMarketKey);
    
    if (!market || !market.outcomes) continue;
    
    let targetIndex = 0;
    let teamName = '';
    
    if (targetMarketKey === 'h2h') {
      if (containsHome && !containsAway) {
        targetIndex = market.outcomes.findIndex((o: any) => normalizeName(o.name).includes(homeNorm.split(' ').pop() || ''));
        teamName = game.home_team;
      } else if (containsAway && !containsHome) {
        targetIndex = market.outcomes.findIndex((o: any) => normalizeName(o.name).includes(awayNorm.split(' ').pop() || ''));
        teamName = game.away_team;
      } else {
        const questionNorm = normalizeName(question);
        if (homeWords.some((w: string) => questionNorm.includes(w))) {
          targetIndex = 0;
          teamName = game.home_team;
        } else if (awayWords.some((w: string) => questionNorm.includes(w))) {
          targetIndex = 1;
          teamName = game.away_team;
        } else {
          targetIndex = 0;
          teamName = market.outcomes[0]?.name || game.home_team;
        }
      }
    } else if (targetMarketKey === 'totals') {
      const isOver = /\bover\b/i.test(question);
      targetIndex = market.outcomes.findIndex((o: any) => 
        isOver ? o.name.toLowerCase().includes('over') : o.name.toLowerCase().includes('under')
      );
      teamName = isOver ? 'Over' : 'Under';
    }
    
    if (targetIndex === -1) {
      targetIndex = 0;
      teamName = market.outcomes[0]?.name || '';
    }
    
    if (!teamName && market.outcomes[targetIndex]) {
      teamName = market.outcomes[targetIndex].name;
    }
    
    return { game, targetIndex, marketKey: targetMarketKey, teamName };
  }
  
  return null;
}

// Calculate fair probability from all bookmakers
function calculateConsensusFairProb(game: any, marketKey: string, targetIndex: number): number | null {
  let totalWeight = 0;
  let weightedProb = 0;
  
  for (const bookmaker of game.bookmakers || []) {
    const market = bookmaker.markets?.find((m: any) => m.key === marketKey);
    if (!market?.outcomes || market.outcomes.length < 2) continue;
    
    const odds = market.outcomes.map((o: any) => o.price);
    if (odds.some((o: number) => isNaN(o) || o <= 1)) continue;
    
    const fairProb = calculateFairProb(odds, Math.min(targetIndex, odds.length - 1));
    const weight = SHARP_BOOKS.includes(bookmaker.key) ? 1.5 : 1.0;
    
    weightedProb += fairProb * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedProb / totalWeight : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-MONITOR] Starting multi-sport polling with movement detection...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!oddsApiKey) {
      throw new Error('ODDS_API_KEY not configured');
    }

    const now = new Date();

    // Load markets marked for monitoring - filter to sports with bookmaker coverage
    // This is the "Scan Once, Monitor Continuously" architecture
    // CRITICAL FIX: Include ALL market types (H2H, Totals, Spreads), not just those with extracted_league
    const supportedSports = Object.keys(SPORT_ENDPOINTS); // ['NBA', 'NFL', 'NHL', 'MLB', 'UFC', 'Tennis', 'EPL', 'UCL', 'LaLiga', 'SerieA', 'Bundesliga', 'Boxing']
    
    // First, load markets WITH extracted_league
    const { data: leagueMarkets, error: leagueLoadError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .in('monitoring_status', ['watching', 'triggered'])
      .eq('status', 'active')
      .in('extracted_league', supportedSports)
      .gte('volume', 5000)
      .order('event_date', { ascending: true })
      .limit(150);

    // Then, load markets with NULL extracted_league (Totals/Spreads/Props that need re-detection)
    const { data: nullLeagueMarkets, error: nullLeagueLoadError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .in('monitoring_status', ['watching', 'triggered'])
      .eq('status', 'active')
      .is('extracted_league', null)
      .in('market_type', ['total', 'spread', 'player_prop', 'h2h']) // Skip pure futures
      .gte('volume', 5000)
      .order('event_date', { ascending: true })
      .limit(50);

    // Combine both sets
    const watchedMarkets = [...(leagueMarkets || []), ...(nullLeagueMarkets || [])];
    
    if (leagueLoadError) throw new Error(`Failed to load markets: ${leagueLoadError.message}`);

    console.log(`[POLY-MONITOR] Loaded ${watchedMarkets?.length || 0} watched markets from cache`);

    if (!watchedMarkets || watchedMarkets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events_polled: 0, edges_found: 0, message: 'No markets to monitor - run Full Scan first' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get matching event_watch_state entries for these markets
    const marketConditionIds = watchedMarkets.map(m => m.condition_id).filter(Boolean);
    
    const { data: monitoredEvents } = await supabase
      .from('event_watch_state')
      .select('*')
      .in('polymarket_condition_id', marketConditionIds)
      .gt('commence_time', now.toISOString());

    // Build cache map from watchedMarkets (already have all the data)
    const cacheMap = new Map(watchedMarkets.map(c => [c.condition_id, c]));

    // Build lookup map from event_watch_state for additional data
    const eventStateMap = new Map((monitoredEvents || []).map(e => [e.polymarket_condition_id, e]));
    
    // Transform watchedMarkets into eventsToProcess format
    // This ensures we process ALL watched markets, even those without event_watch_state entries
    const eventsToProcess = watchedMarkets
      .filter(m => new Date(m.event_date) > now) // Only future events
      .map(market => {
        // Use existing event_watch_state data if available, otherwise create synthetic entry
        const existingState = eventStateMap.get(market.condition_id);
        return existingState || {
          id: null, // No DB id for synthetic entries
          event_key: `poly_${market.condition_id}`,
          event_name: market.event_title || market.question,
          polymarket_condition_id: market.condition_id,
          polymarket_question: market.question,
          polymarket_yes_price: market.yes_price,
          polymarket_volume: market.volume,
          commence_time: market.event_date,
          last_poly_refresh: market.last_price_update,
          watch_state: 'monitored',
        };
      });

    console.log(`[POLY-MONITOR] Processing ${eventsToProcess.length} markets (${eventStateMap.size} with event_watch_state)`);

    // Group events by detected sport
    // CRITICAL FIX: For markets with null extracted_league, try to detect from event_title
    const sportGroups: Map<string, typeof eventsToProcess> = new Map();
    
    for (const event of eventsToProcess) {
      const cache = cacheMap.get(event.polymarket_condition_id);
      let sport = cache?.extracted_league;
      
      // Fallback: try to detect sport from event_title if extracted_league is null
      if (!sport || sport === 'Sports' || sport === 'Unknown') {
        const eventTitle = cache?.event_title || event.event_name || '';
        const question = cache?.question || event.polymarket_question || '';
        sport = detectSportFromText(eventTitle, question) || 'Unknown';
      }
      
      if (!sportGroups.has(sport)) {
        sportGroups.set(sport, []);
      }
      sportGroups.get(sport)!.push(event);
    }

    console.log(`[POLY-MONITOR] Sport groups: ${[...sportGroups.keys()].join(', ')}`);

    // Collect all token IDs for batch CLOB fetch (limit to 100 per batch to avoid payload errors)
    const allTokenIds: string[] = [];
    for (const market of watchedMarkets) {
      if (market.token_id_yes) allTokenIds.push(market.token_id_yes);
    }

    // Batch fetch CLOB prices and spreads
    console.log(`[POLY-MONITOR] Batch fetching CLOB prices for ${allTokenIds.length} tokens`);
    const [clobPrices, clobSpreads] = await Promise.all([
      fetchClobPrices(allTokenIds),
      fetchClobSpreads(allTokenIds),
    ]);
    console.log(`[POLY-MONITOR] Got ${clobPrices.size} prices, ${clobSpreads.size} spreads from CLOB`);

    // === CRITICAL: Update ALL active signals with fresh price data ===
    // This ensures signals show current timestamps even if they no longer meet edge thresholds
    const { data: activeSignals } = await supabase
      .from('signal_opportunities')
      .select('id, polymarket_condition_id')
      .eq('status', 'active');
    
    if (activeSignals && activeSignals.length > 0) {
      let priceUpdatesCount = 0;
      
      for (const signal of activeSignals) {
        // Find matching cache entry
        const cache = [...cacheMap.values()].find(c => c.condition_id === signal.polymarket_condition_id);
        if (!cache?.token_id_yes) continue;
        
        // Get fresh price from CLOB
        if (clobPrices.has(cache.token_id_yes)) {
          const prices = clobPrices.get(cache.token_id_yes)!;
          const freshPrice = prices.ask > 0 ? prices.ask : prices.bid;
          
          if (freshPrice > 0) {
            await supabase
              .from('signal_opportunities')
              .update({
                polymarket_yes_price: freshPrice,
                polymarket_price: freshPrice,
                polymarket_volume: cache.volume || 0,
                polymarket_updated_at: now.toISOString(),
              })
              .eq('id', signal.id);
            
            priceUpdatesCount++;
          }
        }
      }
      
      console.log(`[POLY-MONITOR] Refreshed prices for ${priceUpdatesCount}/${activeSignals.length} active signals`);
    }

    // Fetch bookmaker data for each sport group
    const allBookmakerData: Map<string, any[]> = new Map();
    
    for (const [sport] of sportGroups) {
      const endpoint = SPORT_ENDPOINTS[sport];
      if (!endpoint) {
        console.log(`[POLY-MONITOR] No endpoint for sport: ${sport}`);
        continue;
      }
      
      const games = await fetchBookmakerOdds(endpoint.sport, endpoint.markets, oddsApiKey);
      allBookmakerData.set(sport, games);
      console.log(`[POLY-MONITOR] Loaded ${games.length} ${sport} games`);
    }

    // Get stake amount
    const { data: scanConfig } = await supabase
      .from('arbitrage_config')
      .select('default_stake_amount')
      .limit(1)
      .single();

    const stakeAmount = scanConfig?.default_stake_amount || 100;

    // Process each event
    let edgesFound = 0;
    let alertsSent = 0;
    let eventsExpired = 0;
    let eventsMatched = 0;
    let movementConfirmedCount = 0;

    for (const event of eventsToProcess) {
      try {
        // Check if event started
        const eventStart = new Date(event.commence_time);
        if (eventStart <= now) {
          await supabase
            .from('event_watch_state')
            .update({ watch_state: 'expired', updated_at: now.toISOString() })
            .eq('id', event.id);
          eventsExpired++;
          continue;
        }

        // Get cache info
        const cache = cacheMap.get(event.polymarket_condition_id);
        const sport = cache?.extracted_league || 'Unknown';
        const marketType = cache?.market_type || 'h2h';
        const tokenIdYes = cache?.token_id_yes;
        
        // Get bookmaker data for this sport
        const bookmakerGames = allBookmakerData.get(sport) || [];

        // Get price from CLOB batch results (preferred) or fallback to single fetch
        let livePolyPrice = event.polymarket_yes_price || 0.5;
        let liveVolume = event.polymarket_volume || 0;
        let bestBid: number | null = null;
        let bestAsk: number | null = null;
        let spreadPct: number | null = null;
        
        // Try CLOB batch prices first
        if (tokenIdYes && clobPrices.has(tokenIdYes)) {
          const prices = clobPrices.get(tokenIdYes)!;
          bestBid = prices.bid;
          bestAsk = prices.ask;
          livePolyPrice = bestAsk > 0 ? bestAsk : livePolyPrice;
          
          if (clobSpreads.has(tokenIdYes)) {
            spreadPct = clobSpreads.get(tokenIdYes)!;
          } else if (bestBid > 0 && bestAsk > 0) {
            spreadPct = bestAsk - bestBid;
          }
        }
        
        // Fallback to single market fetch if no batch data
        if (!tokenIdYes || !clobPrices.has(tokenIdYes)) {
          if (event.polymarket_condition_id) {
            try {
              const clobUrl = `${CLOB_API_BASE}/markets/${event.polymarket_condition_id}`;
              const clobResponse = await fetch(clobUrl);
              
              if (clobResponse.ok) {
                const marketData = await clobResponse.json();
                livePolyPrice = parseFloat(marketData.tokens?.[0]?.price || livePolyPrice);
                liveVolume = parseFloat(marketData.volume || liveVolume);
              }
            } catch {
              // Use cached price
            }
          }
        }

        // Find bookmaker match
        const match = findBookmakerMatch(
          event.event_name,
          event.polymarket_question || '',
          marketType,
          bookmakerGames
        );

        let bookmakerFairProb: number | null = null;
        let teamName: string | null = null;
        
        if (match) {
          bookmakerFairProb = calculateConsensusFairProb(match.game, match.marketKey, match.targetIndex);
          teamName = match.teamName;
          
          // CRITICAL FIX #1: Team participant validation
          // Validate that matched team is actually in the Polymarket event name
          // This prevents cross-sport mismatches (e.g., "Blackhawks vs. Penguins" matching "Atlanta Hawks")
          if (teamName) {
            const eventNorm = normalizeName(event.event_name);
            const teamNorm = normalizeName(teamName);
            const teamWords = teamNorm.split(' ').filter(w => w.length > 2);
            const lastWord = teamWords[teamWords.length - 1] || '';
            
            // Team's last word (e.g., "Lightning", "Oilers", "Hawks") must appear in event name
            if (lastWord && !eventNorm.includes(lastWord)) {
              console.log(`[POLY-MONITOR] INVALID MATCH: "${teamName}" not found in event "${event.event_name}" - DROPPING`);
              continue;
            }
          }
          
          eventsMatched++;
        }

        // Update event state and cache with CLOB data
        await supabase
          .from('event_watch_state')
          .update({
            polymarket_yes_price: livePolyPrice,
            polymarket_volume: liveVolume,
            last_poly_refresh: now.toISOString(),
            polymarket_matched: bookmakerFairProb !== null,
            current_probability: bookmakerFairProb,
            updated_at: now.toISOString(),
          })
          .eq('id', event.id);
        
        // Update cache with CLOB bid/ask/spread data
        if (bestBid !== null || bestAsk !== null || spreadPct !== null) {
          await supabase
            .from('polymarket_h2h_cache')
            .update({
              best_bid: bestBid,
              best_ask: bestAsk,
              spread_pct: spreadPct,
              last_price_update: now.toISOString(),
            })
            .eq('condition_id', event.polymarket_condition_id);
        }

        // Check for edge
        if (bookmakerFairProb !== null && liveVolume >= 5000) {
          // SKIP if we can't determine the bet side
          if (!teamName) {
            teamName = cache?.extracted_entity || null;
          }
          
          if (!teamName) {
            console.log(`[POLY-MONITOR] SKIPPING signal for ${event.event_name} - no team name could be determined`);
            continue;
          }
          
          // Generate event key for movement detection
          const eventKey = generateEventKey(event.event_name, teamName);
          
          // ========== MOVEMENT DETECTION GATE ==========
          const movement = await detectSharpMovement(supabase, eventKey, teamName);
          
          // ========== DIRECTIONAL EDGE CALCULATION ==========
          // Determine bet side based on movement direction
          let betSide: 'YES' | 'NO' = 'YES';
          let rawEdge = bookmakerFairProb - livePolyPrice;
          
          if (movement.triggered && movement.direction === 'drifting') {
            // Bookies drifted (prob DOWN) - bet NO on Polymarket
            // Edge = (1 - bookmakerFairProb) - (1 - livePolyPrice) = livePolyPrice - bookmakerFairProb
            betSide = 'NO';
            rawEdge = (1 - livePolyPrice) - (1 - bookmakerFairProb);
            // rawEdge simplifies to: livePolyPrice - bookmakerFairProb
          }
          // ========== END DIRECTIONAL CALCULATION ==========
          
          if (rawEdge >= 0.02) {
            // CRITICAL FIX #3: Staleness & high-prob edge gating
            // Gate against artifact edges on high-probability outcomes
            const staleness = now.getTime() - new Date(event.last_poly_refresh || now.toISOString()).getTime();
            const stalenessMinutes = staleness / 60000;
            
            // High probability + stale = likely artifact
            if (bookmakerFairProb >= 0.85 && stalenessMinutes > 3) {
              console.log(`[POLY-MONITOR] Skipping high-prob edge for ${event.event_name} - stale price (${stalenessMinutes.toFixed(0)}m old, ${(bookmakerFairProb * 100).toFixed(0)}% fair prob)`);
              continue;
            }
            
            // Cap extreme edges on very high probability outcomes
            if (bookmakerFairProb >= 0.90 && rawEdge > 0.40) {
              console.log(`[POLY-MONITOR] Capping artifact edge for ${event.event_name} - raw ${(rawEdge * 100).toFixed(1)}% on ${(bookmakerFairProb * 100).toFixed(0)}% prob`);
              rawEdge = 0.40; // Cap at 40%
            }
            
            const { netEdge } = calculateNetEdge(rawEdge, liveVolume, stakeAmount, spreadPct);
            
            // ========== DUAL TRIGGER SYSTEM ==========
            // TRIGGER CONDITIONS (either/or):
            // 1. Edge Trigger: raw_edge >= 5% (high static edge)
            // 2. Movement Trigger: 2+ sharp books moved same direction
            const edgeTriggered = rawEdge >= 0.05;
            const movementTriggered = movement.triggered && movement.booksConfirming >= 2;
            
            let triggerReason: 'edge' | 'movement' | 'both' | null = null;
            if (edgeTriggered && movementTriggered) {
              triggerReason = 'both';
            } else if (edgeTriggered) {
              triggerReason = 'edge';
            } else if (movementTriggered) {
              triggerReason = 'movement';
            }
            
            // Calculate signal tier based on trigger type
            let signalTier: 'elite' | 'strong' | 'static' = 'static';
            if (triggerReason === 'both') {
              signalTier = 'elite';
            } else if (triggerReason === 'edge' || triggerReason === 'movement') {
              signalTier = rawEdge >= 0.05 ? 'elite' : 'strong';
            }
            
            if (movementTriggered) {
              movementConfirmedCount++;
              console.log(`[POLY-MONITOR] Movement CONFIRMED for ${event.event_name}: ${movement.booksConfirming} books, ${movement.direction}, ${(movement.velocity * 100).toFixed(1)}% velocity -> ${betSide}`);
            }
            
            // SKIP if neither trigger fired
            if (!triggerReason) {
              console.log(`[POLY-MONITOR] No trigger for ${event.event_name} (${(rawEdge * 100).toFixed(1)}% edge, ${movement.booksConfirming || 0} books) - waiting`);
              continue;
            }
            
            console.log(`[POLY-MONITOR] TRIGGER: ${triggerReason.toUpperCase()} | ${signalTier.toUpperCase()} (${betSide}): ${event.event_name} - Raw: ${(rawEdge * 100).toFixed(1)}%, Books: ${movement.booksConfirming || 0}`);
            // ========== END DUAL TRIGGER SYSTEM ==========
            
            edgesFound++;

            // Check for existing active/executed signal for this event+outcome
            const { data: existingSignals } = await supabase
              .from('signal_opportunities')
              .select('id, status')
              .eq('event_name', event.event_name)
              .eq('recommended_outcome', teamName)
              .in('status', ['active', 'executed']);

            const existingSignal = existingSignals?.[0];

            if (existingSignal?.status === 'executed') {
              console.log(`[POLY-MONITOR] Skipping ${event.event_name} - already executed`);
              continue;
            }

            let signal = null;
            let signalError = null;

            const signalData = {
              polymarket_price: livePolyPrice,
              bookmaker_probability: bookmakerFairProb,
              bookmaker_prob_fair: bookmakerFairProb,
              edge_percent: rawEdge * 100,
              confidence_score: Math.min(85, 50 + Math.floor(netEdge * 500)),
              urgency: eventStart.getTime() - now.getTime() < 3600000 ? 'critical' : 
                      eventStart.getTime() - now.getTime() < 14400000 ? 'high' : 'normal',
              polymarket_yes_price: livePolyPrice,
              polymarket_volume: liveVolume,
              polymarket_updated_at: now.toISOString(),
              signal_strength: netEdge * 100,
              expires_at: event.commence_time,
              // NEW: Movement detection fields
              movement_confirmed: movementTriggered,
              movement_velocity: movement.velocity,
              signal_tier: signalTier,
              signal_factors: {
                raw_edge: rawEdge * 100,
                net_edge: netEdge * 100,
                market_type: marketType,
                sport: sport,
                volume: liveVolume,
                team_name: teamName,
                hours_until_event: Math.floor((eventStart.getTime() - now.getTime()) / 3600000),
                time_label: `${Math.floor((eventStart.getTime() - now.getTime()) / 3600000)}h`,
                // Dual trigger system data
                trigger_reason: triggerReason,
                edge_triggered: edgeTriggered,
                movement_triggered: movementTriggered,
                movement_confirmed: movementTriggered,
                movement_velocity: movement.velocity * 100,
                movement_direction: movement.direction,
                books_confirming_movement: movement.booksConfirming,
                signal_tier: signalTier,
                // Directional labeling
                bet_direction: betSide === 'YES' ? 'BUY_YES' : 'BUY_NO',
              },
            };
            
            // Update polymarket_h2h_cache monitoring_status to 'triggered'
            await supabase
              .from('polymarket_h2h_cache')
              .update({ monitoring_status: 'triggered' })
              .eq('condition_id', event.polymarket_condition_id);

            // CRITICAL FIX #2: One-signal-per-event exclusivity
            // Before creating/updating signal, expire any opposing signal for this event
            await supabase
              .from('signal_opportunities')
              .update({ status: 'expired' })
              .eq('event_name', event.event_name)
              .eq('status', 'active')
              .neq('recommended_outcome', teamName);

            if (existingSignal) {
              // UPDATE existing active signal with fresh data
              const { data, error } = await supabase
                .from('signal_opportunities')
                .update({
                  ...signalData,
                  side: betSide, // Update side based on movement direction
                })
                .eq('id', existingSignal.id)
                .select()
                .single();

              signal = data;
              signalError = error;
              console.log(`[POLY-MONITOR] Updated ${signalTier} ${betSide} signal for ${event.event_name}`);
            } else {
              // INSERT new signal
              const { data, error } = await supabase
                .from('signal_opportunities')
                .insert({
                  event_name: event.event_name,
                  recommended_outcome: teamName,
                  side: betSide, // NEW: Use calculated bet side
                  is_true_arbitrage: true,
                  status: 'active',
                  polymarket_condition_id: event.polymarket_condition_id,
                  ...signalData,
                })
                .select()
                .single();

              signal = data;
              signalError = error;
              console.log(`[POLY-MONITOR] Created new ${signalTier} ${betSide} signal for ${event.event_name}`);
            }

            // Only send SMS for NEW ELITE/STRONG signals (not updates)
            if (!signalError && signal && !existingSignal && (signalTier === 'elite' || signalTier === 'strong')) {
              const alertSent = await sendSmsAlert(
                supabase, event, livePolyPrice, bookmakerFairProb,
                rawEdge, netEdge, liveVolume, stakeAmount, marketType, teamName,
                signalTier, movement.velocity, betSide, movement.direction
              );
              
              if (alertSent) {
                alertsSent++;
                await supabase
                  .from('event_watch_state')
                  .update({ watch_state: 'alerted', updated_at: now.toISOString() })
                  .eq('id', event.id);
              }
            }
          }
        }
      } catch (eventError) {
        console.error(`[POLY-MONITOR] Error processing ${event.event_key}:`, eventError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[POLY-MONITOR] Complete: ${eventsToProcess.length} polled, ${eventsMatched} matched, ${edgesFound} edges (${movementConfirmedCount} movement-confirmed), ${alertsSent} alerts in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        events_polled: eventsToProcess.length,
        events_matched: eventsMatched,
        events_expired: eventsExpired,
        edges_found: edgesFound,
        movement_confirmed: movementConfirmedCount,
        alerts_sent: alertsSent,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POLY-MONITOR] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
