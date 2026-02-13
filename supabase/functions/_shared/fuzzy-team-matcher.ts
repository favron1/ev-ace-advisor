// ============================================================================
// FUZZY TEAM MATCHER - Enhanced GAMMA API Matching
// ============================================================================
// Improved team name matching between Polymarket and sportsbooks using:
// - Expanded alias database
// - Fuzzy string matching (Levenshtein distance)
// - Pattern-based matching for common abbreviations
// - Confidence scoring for match quality assessment
// ============================================================================

import { SPORTS_CONFIG, SportCode } from './sports-config.ts';
import { ALL_SPORTS_CONFIG, AllSportCode } from './extended-sports-config.ts';

// Enhanced match result with confidence scoring
export interface FuzzyMatchResult {
  match: string | null;           // Matched team name
  confidence: number;             // Match confidence 0-100
  method: 'exact' | 'alias' | 'fuzzy' | 'pattern' | 'none';
  fuzzy_score: number;           // Levenshtein-based similarity
  alternatives: string[];        // Other possible matches
  original_input: string;        // Original input for debugging
}

// Expanded team aliases database
const TEAM_ALIASES: Record<string, Record<string, string[]>> = {
  nhl: {
    'boston bruins': ['bruins', 'bos', 'boston', "b's", 'bears', 'bruin'],
    'toronto maple leafs': ['leafs', 'maple leafs', 'tor', 'toronto', 'buds', 'leaves', 'leaf'],
    'new york rangers': ['rangers', 'nyr', 'ny rangers', 'broadway blueshirts', 'blueshirts'],
    'new york islanders': ['islanders', 'nyi', 'ny islanders', 'isles'],
    'philadelphia flyers': ['flyers', 'phi', 'philadelphia', 'philly'],
    'pittsburgh penguins': ['penguins', 'pens', 'pit', 'pittsburgh', 'pitt'],
    'washington capitals': ['capitals', 'caps', 'wsh', 'washington', 'dc'],
    'tampa bay lightning': ['lightning', 'tb', 'tbl', 'tampa bay', 'tampa', 'bolts'],
    'florida panthers': ['panthers', 'fla', 'florida', 'cats'],
    'carolina hurricanes': ['hurricanes', 'car', 'carolina', 'canes', 'whalers'],
    'chicago blackhawks': ['blackhawks', 'chi', 'chicago', 'hawks'],
    'detroit red wings': ['red wings', 'det', 'detroit', 'wings'],
    'nashville predators': ['predators', 'nsh', 'nashville', 'preds'],
    'st louis blues': ['blues', 'stl', 'st louis', 'saint louis'],
    'minnesota wild': ['wild', 'min', 'minnesota'],
    'colorado avalanche': ['avalanche', 'col', 'colorado', 'avs'],
    'dallas stars': ['stars', 'dal', 'dallas'],
    'vegas golden knights': ['golden knights', 'vgk', 'vegas', 'knights'],
    'los angeles kings': ['kings', 'la', 'lak', 'los angeles'],
    'san jose sharks': ['sharks', 'sjs', 'san jose'],
    'calgary flames': ['flames', 'cgy', 'calgary'],
    'edmonton oilers': ['oilers', 'edm', 'edmonton'],
    'vancouver canucks': ['canucks', 'van', 'vancouver', 'nucks'],
    'seattle kraken': ['kraken', 'sea', 'seattle'],
    'winnipeg jets': ['jets', 'wpg', 'winnipeg']
  },
  nba: {
    'los angeles lakers': ['lakers', 'lal', 'la lakers', 'l.a. lakers'],
    'boston celtics': ['celtics', 'bos', 'boston', 'cs'],
    'golden state warriors': ['warriors', 'gsw', 'golden state', 'dubs'],
    'miami heat': ['heat', 'mia', 'miami'],
    'chicago bulls': ['bulls', 'chi', 'chicago'],
    'new york knicks': ['knicks', 'nyk', 'ny knicks', 'new york'],
    'brooklyn nets': ['nets', 'bkn', 'brooklyn'],
    'milwaukee bucks': ['bucks', 'mil', 'milwaukee'],
    'philadelphia 76ers': ['76ers', 'phi', 'philadelphia', 'sixers'],
    'phoenix suns': ['suns', 'phx', 'phoenix'],
    'denver nuggets': ['nuggets', 'den', 'denver', 'nugs'],
    'la clippers': ['clippers', 'lac', 'la clippers'],
    'dallas mavericks': ['mavericks', 'dal', 'dallas', 'mavs'],
    'houston rockets': ['rockets', 'hou', 'houston'],
    'memphis grizzlies': ['grizzlies', 'mem', 'memphis', 'grizz'],
    'minnesota timberwolves': ['timberwolves', 'min', 'minnesota', 'wolves', 'twolves'],
    'new orleans pelicans': ['pelicans', 'nop', 'new orleans', 'pels'],
    'san antonio spurs': ['spurs', 'sas', 'san antonio'],
    'oklahoma city thunder': ['thunder', 'okc', 'oklahoma city'],
    'utah jazz': ['jazz', 'uta', 'utah'],
    'portland trail blazers': ['trail blazers', 'por', 'portland', 'blazers'],
    'sacramento kings': ['kings', 'sac', 'sacramento'],
    'atlanta hawks': ['hawks', 'atl', 'atlanta'],
    'charlotte hornets': ['hornets', 'cha', 'charlotte'],
    'cleveland cavaliers': ['cavaliers', 'cle', 'cleveland', 'cavs'],
    'detroit pistons': ['pistons', 'det', 'detroit'],
    'indiana pacers': ['pacers', 'ind', 'indiana'],
    'orlando magic': ['magic', 'orl', 'orlando'],
    'toronto raptors': ['raptors', 'tor', 'toronto', 'raps'],
    'washington wizards': ['wizards', 'was', 'washington']
  },
  nfl: {
    'kansas city chiefs': ['chiefs', 'kc', 'kansas city'],
    'philadelphia eagles': ['eagles', 'phi', 'philadelphia', 'philly'],
    'san francisco 49ers': ['49ers', 'sf', 'san francisco', 'niners'],
    'dallas cowboys': ['cowboys', 'dal', 'dallas'],
    'buffalo bills': ['bills', 'buf', 'buffalo'],
    'baltimore ravens': ['ravens', 'bal', 'baltimore'],
    'cincinnati bengals': ['bengals', 'cin', 'cincinnati'],
    'miami dolphins': ['dolphins', 'mia', 'miami', 'fins'],
    'detroit lions': ['lions', 'det', 'detroit'],
    'green bay packers': ['packers', 'gb', 'green bay'],
    'new england patriots': ['patriots', 'ne', 'new england', 'pats'],
    'denver broncos': ['broncos', 'den', 'denver'],
    'los angeles chargers': ['chargers', 'lac', 'la chargers'],
    'las vegas raiders': ['raiders', 'lv', 'las vegas'],
    'pittsburgh steelers': ['steelers', 'pit', 'pittsburgh'],
    'cleveland browns': ['browns', 'cle', 'cleveland'],
    'houston texans': ['texans', 'hou', 'houston'],
    'indianapolis colts': ['colts', 'ind', 'indianapolis'],
    'jacksonville jaguars': ['jaguars', 'jax', 'jacksonville', 'jags'],
    'tennessee titans': ['titans', 'ten', 'tennessee'],
    'new york giants': ['giants', 'nyg', 'ny giants'],
    'new orleans saints': ['saints', 'no', 'new orleans'],
    'carolina panthers': ['panthers', 'car', 'carolina'],
    'atlanta falcons': ['falcons', 'atl', 'atlanta'],
    'tampa bay buccaneers': ['buccaneers', 'tb', 'tampa bay', 'bucs'],
    'seattle seahawks': ['seahawks', 'sea', 'seattle', 'hawks'],
    'los angeles rams': ['rams', 'lar', 'la rams'],
    'arizona cardinals': ['cardinals', 'ari', 'arizona', 'cards'],
    'chicago bears': ['bears', 'chi', 'chicago'],
    'minnesota vikings': ['vikings', 'min', 'minnesota', 'vikes'],
    'washington commanders': ['commanders', 'was', 'washington']
  },

  // Soccer - English Premier League (EPL)
  epl: {
    'arsenal': ['arsenal', 'ars', 'gunners'],
    'aston villa': ['aston villa', 'avl', 'villa'],
    'bournemouth': ['bournemouth', 'bou', 'cherries'],
    'brentford': ['brentford', 'bre', 'bees'],
    'brighton': ['brighton', 'bha', 'seagulls', 'brighton & hove albion'],
    'chelsea': ['chelsea', 'che', 'blues'],
    'crystal palace': ['crystal palace', 'cry', 'palace', 'eagles'],
    'everton': ['everton', 'eve', 'toffees'],
    'fulham': ['fulham', 'ful', 'cottagers'],
    'ipswich': ['ipswich', 'ips', 'ipswich town', 'tractor boys'],
    'leicester': ['leicester', 'lei', 'leicester city', 'foxes'],
    'liverpool': ['liverpool', 'liv', 'reds'],
    'manchester city': ['manchester city', 'mci', 'man city', 'city', 'citizens'],
    'manchester united': ['manchester united', 'mun', 'man united', 'united', 'red devils'],
    'newcastle': ['newcastle', 'new', 'newcastle united', 'magpies'],
    'nottingham forest': ['nottingham forest', 'nfo', 'forest', 'nottm forest'],
    'southampton': ['southampton', 'sou', 'saints'],
    'tottenham': ['tottenham', 'tot', 'spurs', 'tottenham hotspur'],
    'west ham': ['west ham', 'whu', 'west ham united', 'hammers'],
    'wolverhampton': ['wolverhampton', 'wol', 'wolves', 'wolverhampton wanderers']
  },

  // Soccer - La Liga (Spanish)
  laliga: {
    'real madrid': ['real madrid', 'rma', 'madrid', 'real'],
    'barcelona': ['barcelona', 'bar', 'barca', 'fc barcelona'],
    'atletico madrid': ['atletico madrid', 'atm', 'atletico', 'atleti'],
    'sevilla': ['sevilla', 'sev', 'fc sevilla'],
    'villarreal': ['villarreal', 'vil', 'yellow submarine'],
    'real betis': ['real betis', 'bet', 'betis'],
    'real sociedad': ['real sociedad', 'soc', 'sociedad'],
    'athletic bilbao': ['athletic bilbao', 'ath', 'bilbao', 'athletic'],
    'valencia': ['valencia', 'val', 'cf valencia'],
    'getafe': ['getafe', 'get', 'cf getafe'],
    'osasuna': ['osasuna', 'osa', 'ca osasuna'],
    'celta vigo': ['celta vigo', 'cel', 'celta', 'vigo'],
    'rayo vallecano': ['rayo vallecano', 'ray', 'rayo'],
    'mallorca': ['mallorca', 'mal', 'rcd mallorca'],
    'alaves': ['alaves', 'ala', 'deportivo alaves'],
    'las palmas': ['las palmas', 'las', 'ud las palmas'],
    'girona': ['girona', 'gir', 'girona fc'],
    'espanyol': ['espanyol', 'esp', 'rcd espanyol'],
    'leganes': ['leganes', 'leg', 'cd leganes'],
    'valladolid': ['valladolid', 'vld', 'real valladolid']
  },

  // Soccer - Serie A (Italian)
  seriea: {
    'juventus': ['juventus', 'juv', 'juve', 'bianconeri'],
    'inter milan': ['inter milan', 'int', 'inter', 'internazionale'],
    'ac milan': ['ac milan', 'mil', 'milan', 'rossoneri'],
    'napoli': ['napoli', 'nap', 'ssc napoli'],
    'roma': ['roma', 'rom', 'as roma', 'giallorossi'],
    'lazio': ['lazio', 'laz', 'ss lazio', 'biancocelesti'],
    'fiorentina': ['fiorentina', 'fio', 'acf fiorentina', 'viola'],
    'atalanta': ['atalanta', 'ata', 'atalanta bc'],
    'bologna': ['bologna', 'bol', 'bologna fc'],
    'torino': ['torino', 'tor', 'torino fc'],
    'udinese': ['udinese', 'udi', 'udinese calcio'],
    'sassuolo': ['sassuolo', 'sas', 'us sassuolo'],
    'empoli': ['empoli', 'emp', 'empoli fc'],
    'verona': ['verona', 'ver', 'hellas verona'],
    'lecce': ['lecce', 'lec', 'us lecce'],
    'monza': ['monza', 'mon', 'ac monza'],
    'genoa': ['genoa', 'gen', 'genoa cfc'],
    'cagliari': ['cagliari', 'cal', 'cagliari calcio'],
    'como': ['como', 'com', 'como 1907'],
    'parma': ['parma', 'par', 'parma calcio'],
    'venezia': ['venezia', 'ven', 'venezia fc']
  },

  // Soccer - Bundesliga (German)
  bundesliga: {
    'bayern munich': ['bayern munich', 'bay', 'bayern', 'fc bayern'],
    'borussia dortmund': ['borussia dortmund', 'bvb', 'dortmund'],
    'rb leipzig': ['rb leipzig', 'rbl', 'leipzig'],
    'bayer leverkusen': ['bayer leverkusen', 'lev', 'leverkusen'],
    'eintracht frankfurt': ['eintracht frankfurt', 'fra', 'frankfurt'],
    'vfl wolfsburg': ['vfl wolfsburg', 'wob', 'wolfsburg'],
    'borussia monchengladbach': ['borussia monchengladbach', 'bmg', 'gladbach', 'monchengladbach'],
    'sc freiburg': ['sc freiburg', 'fre', 'freiburg'],
    'tsg hoffenheim': ['tsg hoffenheim', 'hof', 'hoffenheim'],
    'fsv mainz': ['fsv mainz', 'mai', 'mainz', 'mainz 05'],
    'fc augsburg': ['fc augsburg', 'aug', 'augsburg'],
    'union berlin': ['union berlin', 'uni', 'fc union berlin'],
    'fc koln': ['fc koln', 'koe', 'koln', 'cologne'],
    'werder bremen': ['werder bremen', 'wer', 'bremen'],
    'vfl bochum': ['vfl bochum', 'boc', 'bochum'],
    'fc heidenheim': ['fc heidenheim', 'hei', 'heidenheim'],
    'vfb stuttgart': ['vfb stuttgart', 'stg', 'stuttgart'],
    'holstein kiel': ['holstein kiel', 'hol', 'kiel'],
    'fc st pauli': ['fc st pauli', 'stm', 'st pauli']
  },

  // MLS (Major League Soccer)
  mls: {
    'atlanta united': ['atlanta united', 'atl', 'atlanta', 'united'],
    'austin fc': ['austin fc', 'aus', 'austin'],
    'charlotte fc': ['charlotte fc', 'cha', 'charlotte'],
    'chicago fire': ['chicago fire', 'chi', 'fire'],
    'fc cincinnati': ['fc cincinnati', 'cin', 'cincinnati'],
    'colorado rapids': ['colorado rapids', 'col', 'rapids'],
    'columbus crew': ['columbus crew', 'clb', 'crew'],
    'fc dallas': ['fc dallas', 'dal', 'dallas'],
    'dc united': ['dc united', 'dc', 'united'],
    'houston dynamo': ['houston dynamo', 'hou', 'dynamo'],
    'lafc': ['lafc', 'la', 'los angeles fc'],
    'la galaxy': ['la galaxy', 'lag', 'galaxy'],
    'inter miami': ['inter miami', 'mia', 'miami'],
    'minnesota united': ['minnesota united', 'min', 'minnesota', 'loons'],
    'cf montreal': ['cf montreal', 'mon', 'montreal', 'impact'],
    'nashville sc': ['nashville sc', 'nsh', 'nashville'],
    'new england revolution': ['new england revolution', 'ne', 'revolution', 'revs'],
    'new york city fc': ['new york city fc', 'nyc', 'nycfc', 'city'],
    'new york red bulls': ['new york red bulls', 'ny', 'red bulls', 'rbny'],
    'orlando city': ['orlando city', 'orl', 'orlando'],
    'philadelphia union': ['philadelphia union', 'phi', 'union'],
    'portland timbers': ['portland timbers', 'por', 'timbers'],
    'real salt lake': ['real salt lake', 'rsl', 'salt lake'],
    'san jose earthquakes': ['san jose earthquakes', 'sj', 'earthquakes', 'quakes'],
    'seattle sounders': ['seattle sounders', 'sea', 'sounders'],
    'sporting kansas city': ['sporting kansas city', 'skc', 'sporting kc'],
    'toronto fc': ['toronto fc', 'tor', 'toronto'],
    'vancouver whitecaps': ['vancouver whitecaps', 'van', 'whitecaps']
  }
};

// Common pattern replacements
const PATTERN_REPLACEMENTS: Record<string, RegExp[]> = {
  common: [
    { pattern: /\bny\b/gi, replacement: 'new york' },
    { pattern: /\bla\b/gi, replacement: 'los angeles' },
    { pattern: /\btb\b/gi, replacement: 'tampa bay' },
    { pattern: /\bsf\b/gi, replacement: 'san francisco' },
    { pattern: /\bno\b/gi, replacement: 'new orleans' },
    { pattern: /\bgb\b/gi, replacement: 'green bay' },
    { pattern: /\bne\b/gi, replacement: 'new england' },
    { pattern: /\blv\b/gi, replacement: 'las vegas' }
  ],
  nhl: [
    { pattern: /\btbl\b/gi, replacement: 'tampa bay lightning' },
    { pattern: /\bvgk\b/gi, replacement: 'vegas golden knights' },
    { pattern: /\blak\b/gi, replacement: 'los angeles kings' }
  ],
  nba: [
    { pattern: /\bgsw\b/gi, replacement: 'golden state warriors' },
    { pattern: /\bloc\b/gi, replacement: 'la clippers' },
    { pattern: /76ers/gi, replacement: 'philadelphia 76ers' }
  ],
  // Soccer-specific patterns for common abbreviations
  soccer: [
    { pattern: /\bfc\b/gi, replacement: '' },       // Remove FC
    { pattern: /\bcf\b/gi, replacement: '' },       // Remove CF  
    { pattern: /\bafc\b/gi, replacement: '' },      // Remove AFC
    { pattern: /\bsc\b/gi, replacement: '' },       // Remove SC
    { pattern: /\bus\b/gi, replacement: '' },       // Remove US
    { pattern: /\bac\b/gi, replacement: '' },       // Remove AC
    { pattern: /\bcd\b/gi, replacement: '' },       // Remove CD
    { pattern: /\brcd\b/gi, replacement: '' },      // Remove RCD
    { pattern: /\bssc\b/gi, replacement: '' },      // Remove SSC
    { pattern: /\breal\s+madrid/gi, replacement: 'real madrid' },
    { pattern: /\bman\s+city/gi, replacement: 'manchester city' },
    { pattern: /\bman\s+united/gi, replacement: 'manchester united' }
  ]
};

/**
 * Main fuzzy matching function with confidence scoring (supports all sport codes)
 */
export function fuzzyMatchTeam(
  input: string, 
  sportCode: SportCode | AllSportCode,
  threshold: number = 0.7
): FuzzyMatchResult {
  
  const normalizedInput = normalizeTeamName(input);
  const sport = sportCode.toLowerCase();
  
  // 1. Try exact match from existing teamMap
  const exactMatch = tryExactMatch(normalizedInput, sportCode);
  if (exactMatch) {
    return {
      match: exactMatch,
      confidence: 100,
      method: 'exact',
      fuzzy_score: 1.0,
      alternatives: [],
      original_input: input
    };
  }
  
  // 2. Try alias matching
  const aliasMatch = tryAliasMatch(normalizedInput, sport);
  if (aliasMatch.match) {
    return aliasMatch;
  }
  
  // 3. Try pattern-based matching
  const patternMatch = tryPatternMatch(normalizedInput, sport);
  if (patternMatch.match) {
    return patternMatch;
  }
  
  // 4. Try fuzzy matching
  const fuzzyMatch = tryFuzzyMatch(normalizedInput, sportCode, threshold);
  if (fuzzyMatch.match) {
    return fuzzyMatch;
  }
  
  // 5. No match found
  return {
    match: null,
    confidence: 0,
    method: 'none',
    fuzzy_score: 0,
    alternatives: getSimilarTeams(normalizedInput, sportCode, 3),
    original_input: input
  };
}

/**
 * Try exact match using ALL sports config (core + extended)
 */
function tryExactMatch(input: string, sportCode: SportCode | AllSportCode): string | null {
  const config = ALL_SPORTS_CONFIG[sportCode];
  if (!config?.teamMap) return null;
  
  // Try abbreviation lookup
  const fullName = config.teamMap[input.toLowerCase()];
  if (fullName) return fullName;
  
  // Try reverse lookup (full name to abbreviation)
  for (const [abbr, fullName] of Object.entries(config.teamMap)) {
    if (fullName.toLowerCase() === input.toLowerCase()) {
      return fullName;
    }
  }
  
  return null;
}

/**
 * Try alias matching using expanded alias database
 */
function tryAliasMatch(input: string, sport: string): FuzzyMatchResult {
  const aliases = TEAM_ALIASES[sport] || {};
  
  for (const [fullName, teamAliases] of Object.entries(aliases)) {
    for (const alias of teamAliases) {
      if (alias.toLowerCase() === input.toLowerCase()) {
        return {
          match: fullName,
          confidence: 95,
          method: 'alias',
          fuzzy_score: 1.0,
          alternatives: [],
          original_input: input
        };
      }
      
      // Partial alias match
      if (input.length >= 3 && alias.toLowerCase().includes(input.toLowerCase())) {
        return {
          match: fullName,
          confidence: 85,
          method: 'alias',
          fuzzy_score: input.length / alias.length,
          alternatives: [],
          original_input: input
        };
      }
    }
  }
  
  return { match: null, confidence: 0, method: 'none', fuzzy_score: 0, alternatives: [], original_input: input };
}

/**
 * Try pattern-based matching for common abbreviations
 */
function tryPatternMatch(input: string, sport: string): FuzzyMatchResult {
  let transformedInput = input;
  
  // Apply common patterns
  if (PATTERN_REPLACEMENTS.common) {
    for (const { pattern, replacement } of PATTERN_REPLACEMENTS.common) {
      transformedInput = transformedInput.replace(pattern, replacement);
    }
  }
  
  // Apply sport-specific patterns
  if (PATTERN_REPLACEMENTS[sport]) {
    for (const { pattern, replacement } of PATTERN_REPLACEMENTS[sport]) {
      transformedInput = transformedInput.replace(pattern, replacement);
    }
  }
  
  if (transformedInput !== input) {
    // Try alias match with transformed input
    const aliasMatch = tryAliasMatch(transformedInput, sport);
    if (aliasMatch.match) {
      return {
        ...aliasMatch,
        method: 'pattern',
        confidence: Math.max(75, aliasMatch.confidence - 10)
      };
    }
  }
  
  return { match: null, confidence: 0, method: 'none', fuzzy_score: 0, alternatives: [], original_input: input };
}

/**
 * Try fuzzy matching using Levenshtein distance
 */
function tryFuzzyMatch(input: string, sportCode: SportCode, threshold: number): FuzzyMatchResult {
  const config = SPORTS_CONFIG[sportCode];
  const sport = sportCode.toLowerCase();
  const aliases = TEAM_ALIASES[sport] || {};
  
  let bestMatch: string | null = null;
  let bestScore = 0;
  const alternatives: string[] = [];
  
  // Check against all known team names and aliases
  const allTeamNames = new Set<string>();
  
  // Add from sports config
  if (config?.teamMap) {
    Object.values(config.teamMap).forEach(name => allTeamNames.add(name));
  }
  
  // Add from alias database
  Object.keys(aliases).forEach(name => allTeamNames.add(name));
  Object.values(aliases).forEach(aliasArray => 
    aliasArray.forEach(alias => allTeamNames.add(alias))
  );
  
  // Calculate fuzzy similarity for each team
  for (const teamName of allTeamNames) {
    const similarity = calculateSimilarity(input.toLowerCase(), teamName.toLowerCase());
    
    if (similarity >= threshold && similarity > bestScore) {
      if (bestMatch) alternatives.push(bestMatch);
      bestMatch = teamName;
      bestScore = similarity;
    } else if (similarity >= threshold * 0.8) {
      alternatives.push(teamName);
    }
  }
  
  if (bestMatch) {
    // Find the canonical name (full team name)
    const canonicalName = findCanonicalName(bestMatch, config, aliases);
    
    return {
      match: canonicalName || bestMatch,
      confidence: Math.floor(bestScore * 100),
      method: 'fuzzy',
      fuzzy_score: bestScore,
      alternatives: alternatives.slice(0, 3),
      original_input: input
    };
  }
  
  return { match: null, confidence: 0, method: 'none', fuzzy_score: 0, alternatives: [], original_input: input };
}

/**
 * Calculate string similarity using normalized Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Calculate distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - (distance / maxLen);
}

/**
 * Find the canonical (full) name for a team
 */
function findCanonicalName(
  matchedName: string, 
  config: any, 
  aliases: Record<string, string[]>
): string | null {
  
  // Check if matched name is already a full team name
  if (config?.teamMap && Object.values(config.teamMap).includes(matchedName)) {
    return matchedName;
  }
  
  // Find full name from alias database
  for (const [fullName, teamAliases] of Object.entries(aliases)) {
    if (teamAliases.includes(matchedName.toLowerCase()) || fullName === matchedName.toLowerCase()) {
      return fullName;
    }
  }
  
  // Check sports config abbreviations
  if (config?.teamMap) {
    const fullName = config.teamMap[matchedName.toLowerCase()];
    if (fullName) return fullName;
  }
  
  return null;
}

/**
 * Get similar team names for suggestions
 */
function getSimilarTeams(input: string, sportCode: SportCode, limit: number = 3): string[] {
  const config = SPORTS_CONFIG[sportCode];
  const sport = sportCode.toLowerCase();
  const aliases = TEAM_ALIASES[sport] || {};
  
  const allTeamNames = new Set<string>();
  
  if (config?.teamMap) {
    Object.values(config.teamMap).forEach(name => allTeamNames.add(name));
  }
  
  Object.keys(aliases).forEach(name => allTeamNames.add(name));
  
  const similarities = Array.from(allTeamNames)
    .map(name => ({
      name,
      similarity: calculateSimilarity(input.toLowerCase(), name.toLowerCase())
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  
  return similarities.map(s => s.name);
}

/**
 * Normalize team name for consistent matching
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Batch match multiple team names
 */
export function batchFuzzyMatch(
  inputs: string[], 
  sportCode: SportCode,
  threshold: number = 0.7
): FuzzyMatchResult[] {
  return inputs.map(input => fuzzyMatchTeam(input, sportCode, threshold));
}

/**
 * Get match quality statistics for monitoring
 */
export function getMatchQualityStats(results: FuzzyMatchResult[]) {
  const stats = {
    total: results.length,
    successful: results.filter(r => r.match !== null).length,
    by_method: {
      exact: results.filter(r => r.method === 'exact').length,
      alias: results.filter(r => r.method === 'alias').length,
      pattern: results.filter(r => r.method === 'pattern').length,
      fuzzy: results.filter(r => r.method === 'fuzzy').length,
      none: results.filter(r => r.method === 'none').length
    },
    avg_confidence: results
      .filter(r => r.confidence > 0)
      .reduce((sum, r) => sum + r.confidence, 0) / Math.max(1, results.filter(r => r.confidence > 0).length),
    low_confidence: results.filter(r => r.confidence > 0 && r.confidence < 80).length
  };
  
  stats.success_rate = (stats.successful / stats.total) * 100;
  
  return stats;
}