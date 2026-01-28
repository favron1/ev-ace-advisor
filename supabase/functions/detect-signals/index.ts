// ========================================
// SIGNAL DETECTION WITH LIVE POLYMARKET MATCHING
// ========================================
// This function detects bookmaker signals and matches them against Polymarket.
// 
// FLOW:
// 1. Check cached polymarket_markets table for quick matches
// 2. If no cache match found for H2H events, make LIVE Polymarket API call
// 3. Calculate true edge when match found, otherwise create signal-only
//
// This ensures H2H game markets (NBA games, etc.) are matched even when
// not in the cache (which primarily contains high-volume/politics markets).
// ========================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FocusMode = 'h2h_only' | 'all' | 'futures_only';

interface RequestBody {
  eventHorizonHours?: number;
  minEventHorizonHours?: number;
  minEdgeThreshold?: number;
  focusMode?: FocusMode;  // NEW: default 'h2h_only'
  stalenessHoursOverride?: number;  // NEW: for spike mode (1h during spike)
  minEdgeOverride?: number;  // NEW: for spike mode (1.5% during spike)
}

interface BookmakerSignal {
  id: string;
  event_name: string;
  market_type: string;
  outcome: string;
  implied_probability: number;
  confirming_books: number;
  odds: number;
  is_sharp_book: boolean;
  commence_time: string | null;
  captured_at: string;
}

interface PolymarketMarket {
  id: string;
  market_id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume: number;
  last_updated: string;
  category?: string;
}

// Configuration constants
const MATCH_THRESHOLD = 0.85;
const CHAMPIONSHIP_MATCH_THRESHOLD = 0.70; // Lower threshold for championship matching
const AMBIGUITY_MARGIN = 0.03;
// Default staleness (can be overridden during spike mode)
const DEFAULT_STALENESS_HOURS_H2H = 2; // Strict for H2H (real-time matters)
const STALENESS_HOURS_FUTURES = 24; // Relaxed for futures (prices move slowly)
const MIN_VOLUME_FLAG = 10000;
const MIN_VOLUME_REJECT = 2000;
const MIN_EDGE_THRESHOLD = 2.0;

// Team name alias mapping for better matching
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
  
  // Premier League & European Football
  'manchester united': ['man united', 'man utd', 'mufc', 'united'],
  'manchester city': ['man city', 'mcfc', 'city'],
  'liverpool': ['liverpool fc', 'lfc'],
  'arsenal': ['arsenal fc', 'gunners'],
  'chelsea': ['chelsea fc', 'cfc'],
  'tottenham': ['tottenham hotspur', 'spurs', 'thfc'],
  'real madrid': ['real', 'madrid', 'rmcf'],
  'barcelona': ['barca', 'fcb', 'fc barcelona'],
  'bayern munich': ['bayern', 'fcb', 'fc bayern'],
  'leeds': ['leeds united', 'lufc'],
  'newcastle': ['newcastle united', 'nufc', 'magpies'],
  'west ham': ['west ham united', 'hammers'],
  'aston villa': ['villa', 'avfc'],
  'everton': ['everton fc', 'toffees'],
  'brighton': ['brighton & hove albion', 'seagulls'],
  'crystal palace': ['palace', 'cpfc'],
  'wolverhampton': ['wolves', 'wolverhampton wanderers'],
  'nottingham forest': ['forest', 'nffc'],
  'bournemouth': ['afc bournemouth', 'cherries'],
  'fulham': ['fulham fc', 'cottagers'],
  'brentford': ['brentford fc', 'bees'],
  
  // MLB Teams
  'los angeles dodgers': ['la dodgers', 'dodgers'],
  'new york yankees': ['ny yankees', 'yankees', 'nyy'],
  'chicago cubs': ['cubs', 'chicago'],
  
  // NFL Teams
  'kansas city chiefs': ['chiefs', 'kc chiefs'],
  'san francisco 49ers': ['49ers', 'niners', 'sf 49ers'],
  'dallas cowboys': ['cowboys', 'dallas'],
  'new england patriots': ['patriots', 'pats', 'new england'],
  'green bay packers': ['packers', 'green bay'],
  
  // ATP Tour - Men's Top 20
  'jannik sinner': ['sinner', 'jannik'],
  'carlos alcaraz': ['alcaraz', 'carlos'],
  'novak djokovic': ['djokovic', 'novak', 'nole'],
  'alexander zverev': ['zverev', 'sascha', 'a zverev'],
  'daniil medvedev': ['medvedev', 'daniil'],
  'andrey rublev': ['rublev', 'andrey'],
  'casper ruud': ['ruud', 'casper'],
  'alex de minaur': ['de minaur', 'demon', 'alex de minaur'],
  'taylor fritz': ['fritz', 'taylor'],
  'grigor dimitrov': ['dimitrov', 'grigor'],
  'stefanos tsitsipas': ['tsitsipas', 'stefanos', 'stef'],
  'tommy paul': ['tommy paul', 't paul'],
  'holger rune': ['rune', 'holger'],
  'hubert hurkacz': ['hurkacz', 'hubi', 'hubert'],
  'ben shelton': ['shelton', 'ben'],
  'felix auger-aliassime': ['faa', 'felix', 'auger aliassime'],
  'frances tiafoe': ['tiafoe', 'frances', 'foe'],
  'jack draper': ['draper', 'jack'],
  'lorenzo musetti': ['musetti', 'lorenzo'],
  'ugo humbert': ['humbert', 'ugo'],
  
  // WTA Tour - Women's Top 20
  'aryna sabalenka': ['sabalenka', 'aryna'],
  'iga swiatek': ['swiatek', 'iga', 'świątek'],
  'coco gauff': ['gauff', 'coco'],
  'jessica pegula': ['pegula', 'jessica', 'jess'],
  'elena rybakina': ['rybakina', 'elena'],
  'qinwen zheng': ['zheng', 'qinwen', 'zheng qinwen'],
  'jasmine paolini': ['paolini', 'jasmine'],
  'emma navarro': ['navarro', 'emma'],
  'daria kasatkina': ['kasatkina', 'dasha', 'daria'],
  'maria sakkari': ['sakkari', 'maria'],
  'barbora krejcikova': ['krejcikova', 'barbora'],
  'anna kalinskaya': ['kalinskaya', 'anna'],
  'mirra andreeva': ['andreeva', 'mirra'],
  'madison keys': ['keys', 'madison', 'maddie'],
  'beatriz haddad maia': ['haddad maia', 'bia'],
  'paula badosa': ['badosa', 'paula'],
  'danielle collins': ['collins', 'danielle'],
  'leylah fernandez': ['fernandez', 'leylah'],
  'karolina muchova': ['muchova', 'karolina'],
  'donna vekic': ['vekic', 'donna'],
  
  // Euroleague Basketball Teams
  'real madrid baloncesto': ['real madrid basket', 'real madrid', 'rmb'],
  'fc barcelona basket': ['barcelona basket', 'barca basket', 'fcb basket'],
  'fenerbahce beko': ['fenerbahce', 'fener', 'fenerbahce sk'],
  'olympiacos piraeus': ['olympiacos', 'olympiakos', 'olympiacos bc'],
  'panathinaikos aktor': ['panathinaikos', 'pao'],
  'partizan mozzart bet': ['partizan', 'partizan belgrade', 'kk partizan nis'],
  'ea7 emporio armani milano': ['olimpia milano', 'milano', 'ax armani', 'pallacanestro olimpia milano'],
  'anadolu efes': ['efes', 'anadolu'],
  'maccabi playtika tel aviv': ['maccabi tel aviv', 'maccabi', 'mtav'],
  'baskonia': ['baskonia vitoria', 'saski baskonia'],
  'ldlc asvel villeurbanne': ['asvel', 'villeurbanne'],
  'alba berlin': ['alba', 'berlin'],
  'monaco basket': ['as monaco', 'monaco'],
  'crvena zvezda': ['red star', 'red star belgrade', 'zvezda'],
  'zalgiris kaunas': ['zalgiris', 'kaunas'],
  'virtus segafredo bologna': ['virtus bologna', 'virtus'],
  'hapoel tel aviv': ['hapoel', 'hapoel bc'],
  'valencia basket': ['valencia', 'valencia bc'],
  
  // UFC Fighters - Champions + Top P4P
  'islam makhachev': ['makhachev', 'islam'],
  'jon jones': ['bones', 'jon jones', 'bones jones'],
  'alex pereira': ['pereira', 'poatan'],
  'leon edwards': ['rocky', 'leon', 'edwards'],
  'ilia topuria': ['topuria', 'el matador', 'ilia'],
  'dricus du plessis': ['dricus', 'du plessis', 'dpm'],
  'sean omalley': ['suga', 'omalley', 'sean omalley'],
  'merab dvalishvili': ['merab', 'dvalishvili'],
  'tom aspinall': ['aspinall', 'tom'],
  'alexander volkanovski': ['volkanovski', 'volk', 'alexander'],
  'max holloway': ['blessed', 'holloway', 'max'],
  'charles oliveira': ['do bronx', 'oliveira', 'charles'],
  'dustin poirier': ['the diamond', 'poirier', 'dustin'],
  'belal muhammad': ['remember the name', 'belal', 'muhammad'],
  'sean strickland': ['strickland', 'sean'],
  'jiri prochazka': ['prochazka', 'jiri', 'denisa'],
  'magomed ankalaev': ['ankalaev', 'magomed'],
  'khamzat chimaev': ['borz', 'chimaev', 'khamzat'],
  'valentina shevchenko': ['bullet', 'shevchenko', 'valentina'],
  'zhang weili': ['weili', 'zhang', 'magnum'],
};

// Normalize team/player names for fuzzy matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Expand name with aliases
function expandWithAliases(name: string): string[] {
  const normalized = normalizeName(name);
  const aliases = [normalized];
  
  for (const [canonical, alts] of Object.entries(TEAM_ALIASES)) {
    if (normalized.includes(canonical) || alts.some(a => normalized.includes(a))) {
      aliases.push(canonical, ...alts);
    }
  }
  
  return [...new Set(aliases)];
}

// Tokenize text for Jaccard similarity
function tokenize(text: string): Set<string> {
  return new Set(
    normalizeName(text)
      .split(' ')
      .filter(t => t.length > 2)
  );
}

// Jaccard similarity between two sets
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// Calculate similarity score (0-1)
function levenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / maxLen;
}

// Extract team names from event string
function extractTeams(eventName: string): string[] {
  const separators = [' vs ', ' vs. ', ' v ', ' @ ', ' at '];
  for (const sep of separators) {
    if (eventName.toLowerCase().includes(sep.toLowerCase())) {
      return eventName.split(new RegExp(sep, 'i')).map(t => t.trim());
    }
  }
  return [eventName];
}

// Extract league from bookmaker event name
// e.g., "NBA Championship Winner: Denver Nuggets" → "nba"
// e.g., "NHL Championship Winner: Dallas Stars" → "nhl"
function extractLeagueFromOutright(eventName: string): string | null {
  const lowerName = eventName.toLowerCase();
  
  if (lowerName.includes('nba') || lowerName.includes('basketball')) return 'nba';
  if (lowerName.includes('nhl') || lowerName.includes('hockey') || lowerName.includes('stanley cup')) return 'nhl';
  if (lowerName.includes('nfl') || lowerName.includes('super bowl')) return 'nfl';
  if (lowerName.includes('mlb') || lowerName.includes('world series') || lowerName.includes('baseball')) return 'mlb';
  if (lowerName.includes('epl') || lowerName.includes('premier league') || lowerName.includes('english premier')) return 'epl';
  if (lowerName.includes('champions league') || lowerName.includes('ucl')) return 'ucl';
  if (lowerName.includes('la liga') || lowerName.includes('laliga')) return 'laliga';
  if (lowerName.includes('bundesliga')) return 'bundesliga';
  if (lowerName.includes('serie a')) return 'seriea';
  if (lowerName.includes('ligue 1')) return 'ligue1';
  
  return null;
}

// Extract league from Polymarket question
// e.g., "Will the Denver Nuggets win the 2026 NBA Finals?" → "nba"
// e.g., "Will the Dallas Stars win the 2026 NHL Stanley Cup?" → "nhl"
function extractLeagueFromQuestion(question: string): string | null {
  const lowerQ = question.toLowerCase();
  
  if (lowerQ.includes('nba finals') || lowerQ.includes('nba championship')) return 'nba';
  if (lowerQ.includes('stanley cup') || lowerQ.includes('nhl')) return 'nhl';
  if (lowerQ.includes('super bowl') || lowerQ.includes('nfl')) return 'nfl';
  if (lowerQ.includes('world series') || lowerQ.includes('mlb')) return 'mlb';
  if (lowerQ.includes('english premier league') || lowerQ.includes('epl') || lowerQ.includes('premier league')) return 'epl';
  if (lowerQ.includes('champions league') || lowerQ.includes('ucl')) return 'ucl';
  if (lowerQ.includes('la liga') || lowerQ.includes('laliga')) return 'laliga';
  if (lowerQ.includes('bundesliga')) return 'bundesliga';
  if (lowerQ.includes('serie a')) return 'seriea';
  if (lowerQ.includes('ligue 1')) return 'ligue1';
  
  return null;
}

// Check if two leagues are compatible for matching
function leaguesCompatible(league1: string | null, league2: string | null): boolean {
  // If either is null, we can't be sure - allow match but with lower confidence
  if (!league1 || !league2) return true;
  // Direct match
  if (league1 === league2) return true;
  // Incompatible
  return false;
}

// Extract team name from outright event name
// e.g., "NBA Championship Winner: Denver Nuggets" → "Denver Nuggets"
// e.g., "EPL Winner: Manchester City" → "Manchester City"
function extractTeamFromOutright(eventName: string): string | null {
  const patterns = [
    /championship winner:\s*(.+)/i,
    /winner:\s*(.+)/i,
    /champion:\s*(.+)/i,
    /to win:\s*(.+)/i,
    /:\s*(.+)$/i, // Fallback: anything after colon
  ];
  
  for (const pattern of patterns) {
    const match = eventName.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

// Extract team name from Polymarket championship question
// e.g., "Will the Denver Nuggets win the 2026 NBA Finals?" → "Denver Nuggets"
// e.g., "Will Leeds win 2025-26 EPL?" → "Leeds"
function extractTeamFromChampionshipQuestion(question: string): string | null {
  const patterns = [
    /will\s+(?:the\s+)?(.+?)\s+win\s+(?:the\s+)?(\d{4}(?:-\d{2,4})?)/i,
    /will\s+(?:the\s+)?(.+?)\s+win\s+/i,
    /(.+?)\s+to\s+win\s+/i,
  ];
  
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

// Check if a Polymarket question is a championship/winner question
function isChampionshipQuestion(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  const championshipKeywords = [
    'win the',
    'win 20', // win 2025, win 2026, etc.
    'championship',
    'finals',
    'premier league',
    'epl',
    'nba',
    'nfl',
    'super bowl',
    'world series',
    'stanley cup',
    'champions league',
  ];
  
  return championshipKeywords.some(kw => lowerQuestion.includes(kw));
}

// Calculate combined match confidence using Jaccard + Levenshtein
function calculateMatchConfidence(
  bookmakerEvent: string,
  bookmakerOutcome: string,
  polymarketQuestion: string
): number {
  const bookTokens = tokenize(bookmakerEvent);
  const outcomeTokens = tokenize(bookmakerOutcome);
  const polyTokens = tokenize(polymarketQuestion);
  
  // Expand with aliases
  const expandedBookTokens = new Set<string>();
  for (const token of bookTokens) {
    expandWithAliases(token).forEach(t => expandedBookTokens.add(t));
  }
  
  const expandedOutcomeTokens = new Set<string>();
  for (const token of outcomeTokens) {
    expandWithAliases(token).forEach(t => expandedOutcomeTokens.add(t));
  }
  
  // Jaccard overlap (0-1)
  const eventJaccard = jaccardSimilarity(expandedBookTokens, polyTokens);
  const outcomeJaccard = jaccardSimilarity(expandedOutcomeTokens, polyTokens);
  
  // Levenshtein similarity (0-1)
  const levenSimilarity = levenshteinSimilarity(bookmakerEvent, polymarketQuestion);
  
  // Combined score with weights
  const confidence = (eventJaccard * 0.4) + (outcomeJaccard * 0.35) + (levenSimilarity * 0.25);
  
  return confidence;
}

// Calculate match confidence for championship/futures markets
function calculateChampionshipMatchConfidence(
  bookmakerTeam: string,
  polymarketTeam: string
): number {
  const normBook = normalizeName(bookmakerTeam);
  const normPoly = normalizeName(polymarketTeam);
  
  // Expand both with aliases
  const bookAliases = expandWithAliases(normBook);
  const polyAliases = expandWithAliases(normPoly);
  
  // Check for exact match (including aliases)
  for (const bookAlias of bookAliases) {
    for (const polyAlias of polyAliases) {
      if (bookAlias === polyAlias) {
        return 1.0; // Perfect match
      }
      // Check if one contains the other
      if (bookAlias.includes(polyAlias) || polyAlias.includes(bookAlias)) {
        return 0.95;
      }
    }
  }
  
  // Fall back to Levenshtein similarity
  return levenshteinSimilarity(normBook, normPoly);
}

interface MatchCandidate {
  market: PolymarketMarket;
  confidence: number;
  matchedPrice: number;
}

interface MatchResult {
  market: PolymarketMarket;
  confidence: number;
  matchedPrice: number;
  isAmbiguous: boolean;
}

// Find best Polymarket match using enhanced scoring (for H2H)
function findEnhancedPolymarketMatch(
  eventName: string, 
  outcome: string,
  polymarkets: PolymarketMarket[]
): MatchResult | null {
  const candidates: MatchCandidate[] = [];
  const teams = extractTeams(eventName);
  const normalizedOutcome = normalizeName(outcome);
  
  for (const market of polymarkets) {
    const confidence = calculateMatchConfidence(eventName, outcome, market.question);
    
    if (confidence > 0.3) { // Pre-filter low confidence
      // Determine which price to use
      const questionNorm = normalizeName(market.question);
      const outcomeInQuestion = questionNorm.includes(normalizedOutcome) || 
        teams.some(t => questionNorm.includes(normalizeName(t)));
      
      candidates.push({
        market,
        confidence,
        matchedPrice: outcomeInQuestion ? market.yes_price : market.no_price,
      });
    }
  }
  
  if (candidates.length === 0) return null;
  
  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  
  // Check threshold
  if (best.confidence < MATCH_THRESHOLD) {
    return null;
  }
  
  // Check for ambiguity
  const isAmbiguous = candidates.length > 1 && 
    (candidates[1].confidence >= best.confidence - AMBIGUITY_MARGIN);
  
  return {
    market: best.market,
    confidence: best.confidence,
    matchedPrice: best.matchedPrice,
    isAmbiguous,
  };
}

// Find best Polymarket match for championship/futures markets
function findChampionshipPolymarketMatch(
  bookmakerTeam: string,
  bookmakerEventName: string,
  polymarkets: PolymarketMarket[]
): MatchResult | null {
  const candidates: MatchCandidate[] = [];
  
  // Extract league from bookmaker event for filtering
  const bookmakerLeague = extractLeagueFromOutright(bookmakerEventName);
  
  // Filter to only championship questions
  const championshipMarkets = polymarkets.filter(m => isChampionshipQuestion(m.question));
  
  for (const market of championshipMarkets) {
    // Check league compatibility first
    const polyLeague = extractLeagueFromQuestion(market.question);
    if (!leaguesCompatible(bookmakerLeague, polyLeague)) {
      continue; // Skip mismatched leagues (e.g., NHL team vs NBA question)
    }
    
    const polyTeam = extractTeamFromChampionshipQuestion(market.question);
    if (!polyTeam) continue;
    
    const confidence = calculateChampionshipMatchConfidence(bookmakerTeam, polyTeam);
    
    // Boost confidence if leagues match exactly
    const leagueBoost = (bookmakerLeague && polyLeague && bookmakerLeague === polyLeague) ? 0.1 : 0;
    const adjustedConfidence = Math.min(confidence + leagueBoost, 1.0);
    
    if (adjustedConfidence > 0.5) { // Pre-filter low confidence
      candidates.push({
        market,
        confidence: adjustedConfidence,
        matchedPrice: market.yes_price, // For championship questions, always use YES price
      });
    }
  }
  
  if (candidates.length === 0) return null;
  
  // Sort by confidence first, then by volume for tie-breaking
  candidates.sort((a, b) => {
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > AMBIGUITY_MARGIN) return confDiff;
    // If confidence is similar, prefer higher volume market
    return b.market.volume - a.market.volume;
  });
  const best = candidates[0];
  
  // Check threshold (lower for championships due to simpler matching)
  if (best.confidence < CHAMPIONSHIP_MATCH_THRESHOLD) {
    return null;
  }
  
  // For championship markets, if multiple matches exist but best has high confidence,
  // don't mark as ambiguous - just pick the highest volume one
  const isAmbiguous = candidates.length > 1 && 
    (candidates[1].confidence >= best.confidence - AMBIGUITY_MARGIN) &&
    best.confidence < 0.95; // Only ambiguous if not a near-perfect match
  
  return {
    market: best.market,
    confidence: best.confidence,
    matchedPrice: best.matchedPrice,
    isAmbiguous,
  };
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  lowLiquidity?: boolean;
}

// Validate Polymarket data freshness and liquidity
function validatePolymarketData(market: PolymarketMarket, isFutures: boolean = false, stalenessOverride?: number): ValidationResult {
  const hoursSinceUpdate = (Date.now() - new Date(market.last_updated).getTime()) / (1000 * 60 * 60);
  const stalenessThreshold = isFutures ? STALENESS_HOURS_FUTURES : (stalenessOverride || DEFAULT_STALENESS_HOURS_H2H);
  
  if (hoursSinceUpdate > stalenessThreshold) {
    return { valid: false, reason: 'stale_price' };
  }
  
  if (market.volume < MIN_VOLUME_REJECT) {
    return { valid: false, reason: 'insufficient_liquidity' };
  }
  
  const lowLiquidity = market.volume < MIN_VOLUME_FLAG;
  
  // Spread sanity check - reject if YES stuck near extremes with low liquidity
  // For futures, be more lenient since low prices are normal for long-shots
  if (!isFutures && (market.yes_price < 0.05 || market.yes_price > 0.95) && lowLiquidity) {
    return { valid: false, reason: 'extreme_price_low_liquidity' };
  }
  
  return { valid: true, lowLiquidity };
}

// Calculate hours until event
function hoursUntilEvent(commenceTime: string | null): number | null {
  if (!commenceTime) return null;
  const now = new Date();
  const eventTime = new Date(commenceTime);
  return (eventTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

// Format time remaining
function formatTimeRemaining(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// Determine urgency
function calculateUrgency(hoursLeft: number | null, edge: number, isSharp: boolean, isTrueArb: boolean): 'low' | 'normal' | 'high' | 'critical' {
  // True arbitrage gets priority
  if (isTrueArb && edge >= 5) {
    if (hoursLeft !== null && hoursLeft <= 6) return 'critical';
    if (hoursLeft !== null && hoursLeft <= 12) return 'high';
    return 'normal';
  }
  
  if (hoursLeft !== null && hoursLeft <= 6) {
    if (edge >= 8 || (isTrueArb && edge >= 3)) return 'critical';
    if (edge >= 5) return 'high';
    return 'normal';
  }
  
  if (hoursLeft !== null && hoursLeft <= 12) {
    if (edge >= 10 || (edge >= 6 && isSharp)) return 'high';
    if (edge >= 4) return 'normal';
    return 'low';
  }
  
  if (edge >= 15) return 'high';
  if (edge >= 8) return 'normal';
  return 'low';
}

// ============================================================================
// POLYMARKET LIVE FETCH - Targeted per-event API calls for unmatched H2H
// ============================================================================

interface LivePolymarketMatch {
  market_id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume: number;
  confidence: number;
  last_updated: string;
}

async function fetchPolymarketForEvent(eventName: string, outcome: string, maxStalenessHours: number): Promise<LivePolymarketMatch | null> {
  console.log(`[POLY-LIVE] Searching for: ${eventName} / ${outcome}`);
  
  try {
    // Extract search terms from event name
    const searchTerms = extractLiveSearchTerms(eventName);
    
    for (const searchTerm of searchTerms) {
      const encodedSearch = encodeURIComponent(searchTerm);
      const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&title_contains=${encodedSearch}`;
      
      console.log(`[POLY-LIVE] Trying search: ${searchTerm}`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        console.error(`[POLY-LIVE] API error ${response.status} for: ${searchTerm}`);
        continue;
      }
      
      const events = await response.json();
      if (!Array.isArray(events) || events.length === 0) {
        continue;
      }
      
      // Find best matching market
      const match = findBestLiveMatch(eventName, outcome, events, maxStalenessHours);
      if (match && match.confidence >= MATCH_THRESHOLD) {
        console.log(`[POLY-LIVE] Found: ${match.question.slice(0, 60)}... (conf: ${(match.confidence * 100).toFixed(0)}%, vol: $${match.volume.toFixed(0)})`);
        return match;
      }
    }
    
    console.log(`[POLY-LIVE] No match found for: ${eventName}`);
    return null;
    
  } catch (error) {
    console.error('[POLY-LIVE] Error:', error);
    return null;
  }
}

function extractLiveSearchTerms(eventName: string): string[] {
  const terms: string[] = [];
  
  // Full event name
  terms.push(eventName);
  
  // Extract team names from "Team A vs Team B" format
  const vsMatch = eventName.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) {
    terms.push(vsMatch[1].trim());
    terms.push(vsMatch[2].trim());
    
    // Try last word of each team (often most distinctive - Timberwolves, Lakers, etc.)
    const team1Parts = vsMatch[1].trim().split(' ');
    const team2Parts = vsMatch[2].trim().split(' ');
    if (team1Parts.length > 1) terms.push(team1Parts[team1Parts.length - 1]);
    if (team2Parts.length > 1) terms.push(team2Parts[team2Parts.length - 1]);
  }
  
  return [...new Set(terms)]; // Remove duplicates
}

function findBestLiveMatch(eventName: string, outcome: string, events: any[], maxStalenessHours: number): LivePolymarketMatch | null {
  const eventNorm = normalizeName(eventName);
  const outcomeNorm = normalizeName(outcome);
  
  const eventTokens = new Set<string>();
  for (const token of tokenize(eventNorm)) {
    expandWithAliases(token).forEach(t => eventTokens.add(t));
  }
  
  const outcomeTokens = new Set<string>();
  for (const token of tokenize(outcomeNorm)) {
    expandWithAliases(token).forEach(t => outcomeTokens.add(t));
  }
  
  let bestMatch: LivePolymarketMatch | null = null;
  
  for (const event of events) {
    const eventMarkets = event.markets || [];
    
    for (const market of eventMarkets) {
      // Skip closed or inactive markets
      if (market.closed || !market.active) continue;
      
      // Check volume - minimum $2K for H2H
      const volume = parseFloat(market.volume) || 0;
      if (volume < MIN_VOLUME_REJECT) continue;
      
      // Check staleness
      const lastUpdated = market.lastUpdateTimestamp || market.updatedAt || market.lastTradeTimestamp;
      if (lastUpdated) {
        const hoursSinceUpdate = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate > maxStalenessHours) {
          continue;
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
        } catch {
          // Use defaults
        }
      }
      
      // Skip markets with no real price data
      if (yesPrice === 0.5 && noPrice === 0.5) continue;
      
      const questionNorm = normalizeName(market.question || event.title || '');
      const questionTokens = tokenize(questionNorm);
      
      // Calculate similarity scores
      const eventJaccard = jaccardSimilarity(eventTokens, questionTokens);
      const outcomeJaccard = jaccardSimilarity(outcomeTokens, questionTokens);
      const levenSim = levenshteinSimilarity(eventNorm, questionNorm);
      
      // Combined confidence score
      const confidence = (eventJaccard * 0.4) + (outcomeJaccard * 0.35) + (levenSim * 0.25);
      
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          market_id: market.conditionId || market.id,
          question: market.question || event.title || 'Unknown',
          yes_price: yesPrice,
          no_price: noPrice,
          volume: volume,
          confidence: confidence,
          last_updated: lastUpdated || new Date().toISOString(),
        };
      }
    }
  }
  
  return bestMatch;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running signal detection (H2H Focus Mode available)...');
    
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // Default values
    }
    
    const eventHorizonHours = body.eventHorizonHours || 24;
    const minEventHorizonHours = body.minEventHorizonHours || 2;
    const focusMode: FocusMode = body.focusMode || 'h2h_only';  // NEW: default h2h_only
    
    // Apply overrides for spike mode, otherwise use defaults
    const stalenessHoursH2H = body.stalenessHoursOverride || DEFAULT_STALENESS_HOURS_H2H;
    const minEdgeThreshold = body.minEdgeOverride || body.minEdgeThreshold || MIN_EDGE_THRESHOLD;
    
    console.log(`Focus mode: ${focusMode}, Event horizon: ${minEventHorizonHours}h - ${eventHorizonHours}h, min edge: ${minEdgeThreshold}%, staleness: ${stalenessHoursH2H}h`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now = new Date();

    const minHorizon = new Date(now.getTime() + minEventHorizonHours * 60 * 60 * 1000).toISOString();
    const maxHorizon = new Date(now.getTime() + eventHorizonHours * 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch H2H signals, outright signals, and Polymarket markets in parallel
    const [h2hResponse, outrightsResponse, polymarketResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${twoHoursAgo}&market_type=eq.h2h&commence_time=gte.${minHorizon}&commence_time=lte.${maxHorizon}&order=implied_probability.desc&limit=500`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }),
      fetch(`${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${twoHoursAgo}&market_type=eq.outrights&order=implied_probability.desc&limit=500`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }),
      // Use 24h window for Polymarket to catch markets even if fetch-polymarket hasn't run recently
      fetch(`${supabaseUrl}/rest/v1/polymarket_markets?status=eq.active&last_updated=gte.${twentyFourHoursAgo}&order=volume.desc&limit=500`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }),
    ]);

    const h2hSignals: BookmakerSignal[] = await h2hResponse.json();
    const outrightSignals: BookmakerSignal[] = await outrightsResponse.json();
    const polymarkets: PolymarketMarket[] = await polymarketResponse.json();
    
    console.log(`Found ${h2hSignals.length} H2H signals, ${outrightSignals.length} outright signals, ${polymarkets.length} active Polymarket markets`);

    const opportunities: any[] = [];
    const processedEvents = new Set<string>();

    // ============================================
    // PART 1: Process H2H signals (existing logic)
    // ============================================
    
    // Group H2H signals by event
    const eventGroups = new Map<string, BookmakerSignal[]>();
    for (const signal of h2hSignals) {
      const existing = eventGroups.get(signal.event_name) || [];
      existing.push(signal);
      eventGroups.set(signal.event_name, existing);
    }

    console.log(`Processing ${eventGroups.size} unique H2H events`);

    let h2hMatchedCount = 0;
    let h2hUnmatchedCount = 0;
    let h2hRejectedCount = 0;

    for (const [eventName, signals] of eventGroups) {
      if (processedEvents.has(eventName)) continue;
      processedEvents.add(eventName);

      // Skip 3-way markets (soccer with Draw)
      if (signals.some(s => normalizeName(s.outcome) === 'draw')) {
        console.log(`Skipping 3-way market: ${eventName}`);
        continue;
      }

      // Find best signal (prefer sharp books)
      const sortedSignals = signals.sort((a, b) => {
        if (a.is_sharp_book !== b.is_sharp_book) return a.is_sharp_book ? -1 : 1;
        return b.confirming_books - a.confirming_books;
      });

      const bestSignal = sortedSignals[0];
      const hoursLeft = hoursUntilEvent(bestSignal.commence_time);
      
      if (hoursLeft === null || hoursLeft < minEventHorizonHours || hoursLeft > eventHorizonHours) {
        continue;
      }

      // This is now vig-removed fair probability from ingest-odds
      const bookmakerProbFair = bestSignal.implied_probability;
      const recommendedOutcome = bestSignal.outcome;
      
      // Try to find matching Polymarket market with enhanced matching
      const polyMatch = findEnhancedPolymarketMatch(eventName, recommendedOutcome, polymarkets);
      
      let edgePct: number;
      let polyPrice: number;
      let isTrueArbitrage: boolean;
      let matchConfidence: number | null = null;
      let signalStrength: number | null = null;
      let polyVolume: number | null = null;
      let polyUpdatedAt: string | null = null;
      
      if (polyMatch && !polyMatch.isAmbiguous) {
        // Validate Polymarket data
        const validation = validatePolymarketData(polyMatch.market, false, stalenessHoursH2H);
        
        if (validation.valid) {
          // TRUE ARBITRAGE: Compare bookmaker fair prob vs Polymarket price
          polyPrice = polyMatch.matchedPrice;
          edgePct = (bookmakerProbFair - polyPrice) * 100;
          isTrueArbitrage = true;
          matchConfidence = polyMatch.confidence;
          polyVolume = polyMatch.market.volume;
          polyUpdatedAt = polyMatch.market.last_updated;
          h2hMatchedCount++;
          
          console.log(`H2H Matched: ${eventName} -> ${polyMatch.market.question.slice(0, 50)}... (conf: ${matchConfidence.toFixed(2)}, edge: ${edgePct.toFixed(1)}%)`);
          
          // Must meet minimum edge threshold
          if (edgePct < minEdgeThreshold) {
            console.log(`Edge too low: ${edgePct.toFixed(1)}% < ${minEdgeThreshold}%`);
            h2hRejectedCount++;
            continue;
          }
        } else {
          console.log(`Rejected Polymarket match: ${validation.reason}`);
          h2hRejectedCount++;
          // Fall through to signal-only
          polyPrice = 0.5;
          signalStrength = Math.abs(bookmakerProbFair - 0.5) * 100;
          edgePct = 0; // No edge without valid match
          isTrueArbitrage = false;
          h2hUnmatchedCount++;
        }
      } else if (polyMatch?.isAmbiguous) {
        console.log(`Ambiguous match for ${eventName}, treating as signal only`);
        polyPrice = 0.5;
        signalStrength = Math.abs(bookmakerProbFair - 0.5) * 100;
        edgePct = 0;
        isTrueArbitrage = false;
        h2hUnmatchedCount++;
      } else {
        // NO CACHE MATCH: Try LIVE Polymarket API search before giving up
        console.log(`No cache match for ${eventName}, trying live Polymarket API...`);
        
        const liveMatch = await fetchPolymarketForEvent(eventName, recommendedOutcome, stalenessHoursH2H);
        
        if (liveMatch && liveMatch.confidence >= MATCH_THRESHOLD) {
          // LIVE MATCH FOUND: Calculate true edge
          polyPrice = liveMatch.yes_price;
          edgePct = (bookmakerProbFair - polyPrice) * 100;
          isTrueArbitrage = true;
          matchConfidence = liveMatch.confidence;
          polyVolume = liveMatch.volume;
          polyUpdatedAt = liveMatch.last_updated;
          h2hMatchedCount++;
          
          console.log(`LIVE MATCH: ${eventName} -> ${liveMatch.question.slice(0, 50)}... (conf: ${liveMatch.confidence.toFixed(2)}, edge: ${edgePct.toFixed(1)}%)`);
          
          // Must meet minimum edge threshold
          if (edgePct < minEdgeThreshold) {
            console.log(`Live match edge too low: ${edgePct.toFixed(1)}% < ${minEdgeThreshold}%`);
            h2hRejectedCount++;
            continue;
          }
        } else {
          // No match even from live API - signal only
          polyPrice = 0.5;
          signalStrength = Math.abs(bookmakerProbFair - 0.5) * 100;
          edgePct = 0; // No edge without match
          isTrueArbitrage = false;
          h2hUnmatchedCount++;
          
          if (liveMatch) {
            console.log(`Live match confidence too low: ${(liveMatch.confidence * 100).toFixed(0)}% < ${MATCH_THRESHOLD * 100}%`);
          }
        }
      }
      
      // Skip signals with low strength if not true arbitrage
      if (!isTrueArbitrage && (signalStrength === null || signalStrength < 5)) {
        continue;
      }

      // Calculate confidence score
      let confidence = 30; // Base

      if (isTrueArbitrage) {
        // True arbitrage scoring
        if (edgePct >= 10) confidence += 35;
        else if (edgePct >= 5) confidence += 25;
        else if (edgePct >= 3) confidence += 15;
        else if (edgePct >= 2) confidence += 10;
        
        // Match confidence bonus
        if (matchConfidence) {
          confidence += Math.round(matchConfidence * 15);
        }
      } else {
        // Signal strength scoring
        if (signalStrength && signalStrength >= 30) confidence += 20;
        else if (signalStrength && signalStrength >= 20) confidence += 15;
        else if (signalStrength && signalStrength >= 10) confidence += 10;
      }

      // Sharp book presence
      if (bestSignal.is_sharp_book) confidence += 15;

      // Confirming books
      const confirmingCount = bestSignal.confirming_books || 1;
      if (confirmingCount >= 10) confidence += 15;
      else if (confirmingCount >= 6) confidence += 10;
      else if (confirmingCount >= 3) confidence += 5;

      // Time factor
      if (hoursLeft && hoursLeft <= 6) confidence += 5;
      else if (hoursLeft && hoursLeft <= 12) confidence += 3;

      confidence = Math.min(Math.round(confidence), 95);

      const displayEdge = isTrueArbitrage ? edgePct : (signalStrength || 0);
      const urgency = calculateUrgency(hoursLeft, displayEdge, bestSignal.is_sharp_book, isTrueArbitrage);
      const timeLabel = formatTimeRemaining(hoursLeft);

      opportunities.push({
        polymarket_market_id: polyMatch?.market.id || null,
        event_name: eventName,
        recommended_outcome: recommendedOutcome,
        side: 'YES',
        polymarket_price: polyPrice,
        bookmaker_probability: bookmakerProbFair,
        edge_percent: isTrueArbitrage ? Math.round(edgePct * 10) / 10 : 0,
        confidence_score: confidence,
        urgency,
        is_true_arbitrage: isTrueArbitrage,
        polymarket_match_confidence: matchConfidence,
        polymarket_yes_price: isTrueArbitrage ? polyPrice : null,
        polymarket_volume: polyVolume,
        polymarket_updated_at: polyUpdatedAt,
        bookmaker_prob_fair: bookmakerProbFair,
        signal_strength: signalStrength,
        signal_factors: {
          hours_until_event: Math.round(hoursLeft * 10) / 10,
          time_label: timeLabel,
          confirming_books: bestSignal.confirming_books,
          is_sharp_book: bestSignal.is_sharp_book,
          market_type: 'h2h',
          matched_polymarket: isTrueArbitrage,
          match_confidence: matchConfidence,
          edge_type: isTrueArbitrage ? 'true_arbitrage' : 'signal_strength',
        },
        status: 'active',
        expires_at: bestSignal.commence_time || new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // ============================================
    // PART 2: Process Championship/Futures signals
    // (SKIP if focusMode is 'h2h_only')
    // ============================================
    
    let futuresMatchedCount = 0;
    let futuresUnmatchedCount = 0;
    let futuresRejectedCount = 0;
    const outrightGroups = new Map<string, BookmakerSignal[]>();

    if (focusMode === 'h2h_only') {
      console.log(`\nSkipping futures processing (focusMode: ${focusMode})`);
    } else {
      console.log(`\nProcessing ${outrightSignals.length} outright/futures signals`);
    for (const signal of outrightSignals) {
      const teamName = extractTeamFromOutright(signal.event_name);
      if (!teamName) continue;
      
      const key = `${signal.event_name}::${teamName}`;
      const existing = outrightGroups.get(key) || [];
      existing.push(signal);
      outrightGroups.set(key, existing);
    }

    console.log(`Found ${outrightGroups.size} unique championship futures`);

    for (const [key, signals] of outrightGroups) {
      const [eventName] = key.split('::');
      const teamName = extractTeamFromOutright(eventName);
      if (!teamName) continue;
      
      // Skip if already processed
      if (processedEvents.has(key)) continue;
      processedEvents.add(key);

      // Find best signal (prefer sharp books)
      const sortedSignals = signals.sort((a, b) => {
        if (a.is_sharp_book !== b.is_sharp_book) return a.is_sharp_book ? -1 : 1;
        return b.confirming_books - a.confirming_books;
      });

      const bestSignal = sortedSignals[0];
      const bookmakerProbFair = bestSignal.implied_probability;
      
      // Try to find matching Polymarket championship market (with league filtering)
      const polyMatch = findChampionshipPolymarketMatch(teamName, eventName, polymarkets);
      
      let edgePct: number;
      let polyPrice: number;
      let isTrueArbitrage: boolean;
      let matchConfidence: number | null = null;
      let signalStrength: number | null = null;
      let polyVolume: number | null = null;
      let polyUpdatedAt: string | null = null;
      
      if (polyMatch && !polyMatch.isAmbiguous) {
        // Validate Polymarket data (relaxed staleness for futures)
        const validation = validatePolymarketData(polyMatch.market, true);
        
        if (validation.valid) {
          // TRUE ARBITRAGE: Compare bookmaker fair prob vs Polymarket YES price
          polyPrice = polyMatch.matchedPrice;
          edgePct = (bookmakerProbFair - polyPrice) * 100;
          isTrueArbitrage = true;
          matchConfidence = polyMatch.confidence;
          polyVolume = polyMatch.market.volume;
          polyUpdatedAt = polyMatch.market.last_updated;
          futuresMatchedCount++;
          
          console.log(`FUTURES Matched: ${teamName} -> "${polyMatch.market.question.slice(0, 60)}..." (conf: ${matchConfidence.toFixed(2)}, edge: ${edgePct.toFixed(1)}%)`);
          
          // Must meet minimum edge threshold
          if (edgePct < minEdgeThreshold) {
            console.log(`Futures edge too low: ${edgePct.toFixed(1)}% < ${minEdgeThreshold}%`);
            futuresRejectedCount++;
            continue;
          }
        } else {
          console.log(`Rejected futures Polymarket match: ${validation.reason}`);
          futuresRejectedCount++;
          continue; // Skip futures without valid Polymarket match
        }
      } else if (polyMatch?.isAmbiguous) {
        console.log(`Ambiguous futures match for ${teamName}`);
        futuresUnmatchedCount++;
        continue; // Skip ambiguous futures
      } else {
        // No match - skip futures without Polymarket equivalent
        futuresUnmatchedCount++;
        continue;
      }

      // Calculate confidence score for futures
      let confidence = 35; // Base (slightly higher for futures due to simpler matching)

      // Edge-based scoring
      if (edgePct >= 10) confidence += 35;
      else if (edgePct >= 5) confidence += 25;
      else if (edgePct >= 3) confidence += 15;
      else if (edgePct >= 2) confidence += 10;
      
      // Match confidence bonus
      if (matchConfidence) {
        confidence += Math.round(matchConfidence * 15);
      }

      // Sharp book presence
      if (bestSignal.is_sharp_book) confidence += 15;

      // Volume bonus for futures (important for liquidity)
      if (polyVolume && polyVolume >= 100000) confidence += 10;
      else if (polyVolume && polyVolume >= 50000) confidence += 5;

      confidence = Math.min(Math.round(confidence), 95);

      // Futures don't have specific end times, use a default horizon
      const urgency = calculateUrgency(null, edgePct, bestSignal.is_sharp_book, true);

      opportunities.push({
        polymarket_market_id: polyMatch.market.id,
        event_name: eventName,
        recommended_outcome: teamName,
        side: 'YES',
        polymarket_price: polyPrice,
        bookmaker_probability: bookmakerProbFair,
        edge_percent: Math.round(edgePct * 10) / 10,
        confidence_score: confidence,
        urgency,
        is_true_arbitrage: true,
        polymarket_match_confidence: matchConfidence,
        polymarket_yes_price: polyPrice,
        polymarket_volume: polyVolume,
        polymarket_updated_at: polyUpdatedAt,
        bookmaker_prob_fair: bookmakerProbFair,
        signal_strength: null,
        signal_factors: {
          confirming_books: bestSignal.confirming_books,
          is_sharp_book: bestSignal.is_sharp_book,
          market_type: 'futures',
          matched_polymarket: true,
          match_confidence: matchConfidence,
          edge_type: 'true_arbitrage',
          polymarket_question: polyMatch.market.question,
        },
        status: 'active',
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days for futures
      });
    }
    } // End of focusMode !== 'h2h_only' block

    const totalMatched = h2hMatchedCount + futuresMatchedCount;
    const totalUnmatched = h2hUnmatchedCount + futuresUnmatchedCount;
    const totalRejected = h2hRejectedCount + futuresRejectedCount;

    console.log(`\n=== Summary ===`);
    console.log(`H2H: ${h2hMatchedCount} matched, ${h2hUnmatchedCount} unmatched, ${h2hRejectedCount} rejected`);
    console.log(`Futures: ${futuresMatchedCount} matched, ${futuresUnmatchedCount} unmatched, ${futuresRejectedCount} rejected`);
    console.log(`Total opportunities: ${opportunities.length}`);

    // Sort: true arbitrage first, then urgency, then edge/strength
    const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    opportunities.sort((a, b) => {
      if (a.is_true_arbitrage !== b.is_true_arbitrage) return a.is_true_arbitrage ? -1 : 1;
      const urgencyDiff = urgencyOrder[a.urgency as keyof typeof urgencyOrder] - urgencyOrder[b.urgency as keyof typeof urgencyOrder];
      if (urgencyDiff !== 0) return urgencyDiff;
      const aValue = a.is_true_arbitrage ? a.edge_percent : (a.signal_strength || 0);
      const bValue = b.is_true_arbitrage ? b.edge_percent : (b.signal_strength || 0);
      return bValue - aValue;
    });

    const topOpportunities = opportunities.slice(0, 50);

    // Clear and insert
    await fetch(`${supabaseUrl}/rest/v1/signal_opportunities?status=eq.active`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (topOpportunities.length > 0) {
      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/signal_opportunities`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(topOpportunities),
      });

      if (!insertResponse.ok) {
        const error = await insertResponse.text();
        console.error('Insert error:', error);
      }
    }

    const trueArbCount = topOpportunities.filter(o => o.is_true_arbitrage).length;
    const futuresCount = topOpportunities.filter(o => o.signal_factors?.market_type === 'futures').length;

    return new Response(
      JSON.stringify({
        success: true,
        opportunities: topOpportunities.slice(0, 10),
        h2h_signals: h2hSignals.length,
        outright_signals: outrightSignals.length,
        polymarket_markets: polymarkets.length,
        unique_h2h_events: eventGroups.size,
        unique_futures: outrightGroups.size,
        signals_surfaced: topOpportunities.length,
        true_arbitrage_count: trueArbCount,
        futures_arbitrage_count: futuresCount,
        signal_only_count: topOpportunities.length - trueArbCount,
        h2h_matched: h2hMatchedCount,
        futures_matched: futuresMatchedCount,
        total_matched: totalMatched,
        total_unmatched: totalUnmatched,
        total_rejected: totalRejected,
        event_horizon: `${minEventHorizonHours}h - ${eventHorizonHours}h`,
        min_edge_threshold: minEdgeThreshold,
        match_threshold: MATCH_THRESHOLD,
        championship_match_threshold: CHAMPIONSHIP_MATCH_THRESHOLD,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
