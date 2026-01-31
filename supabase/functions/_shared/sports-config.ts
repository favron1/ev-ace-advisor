// ============================================================================
// LAYER 1: CORE ALGORITHM - PROTECTED
// ============================================================================
// This file is part of the signal detection engine.
// DO NOT MODIFY unless explicitly requested.
// Changes here affect signal detection, edge calculation, and data accuracy.
// ============================================================================

// ============================================================================
// UNIFIED SPORTS CONFIGURATION
// ============================================================================
// Single source of truth for all sport configurations.
// To add a new sport, just add an entry here - all functions pick it up automatically.
// ============================================================================

export interface SportConfig {
  name: string;
  polymarketUrl: string;
  oddsApiSport: string;
  oddsApiMarkets: string;
  oddsApiOutright: string;
  teamMap: Record<string, string>;
  detectionPatterns: RegExp[];
}

export const SPORTS_CONFIG: Record<string, SportConfig> = {
  // NHL - MUST come first in detection order (Blackhawks before Hawks)
  nhl: {
    name: 'NHL',
    polymarketUrl: 'https://polymarket.com/sports/nhl/games',
    oddsApiSport: 'icehockey_nhl',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'icehockey_nhl_championship_winner',
    teamMap: {
      'ana': 'Anaheim Ducks', 'ari': 'Arizona Coyotes', 'bos': 'Boston Bruins',
      'buf': 'Buffalo Sabres', 'cgy': 'Calgary Flames', 'car': 'Carolina Hurricanes',
      'chi': 'Chicago Blackhawks', 'col': 'Colorado Avalanche', 'cbj': 'Columbus Blue Jackets',
      'dal': 'Dallas Stars', 'det': 'Detroit Red Wings', 'edm': 'Edmonton Oilers',
      'fla': 'Florida Panthers', 'la': 'Los Angeles Kings', 'lak': 'Los Angeles Kings',
      'min': 'Minnesota Wild', 'mtl': 'Montreal Canadiens', 'nsh': 'Nashville Predators',
      'njd': 'New Jersey Devils', 'nyi': 'New York Islanders', 'nyr': 'New York Rangers',
      'ott': 'Ottawa Senators', 'phi': 'Philadelphia Flyers', 'pit': 'Pittsburgh Penguins',
      'sjs': 'San Jose Sharks', 'sea': 'Seattle Kraken', 'stl': 'St. Louis Blues',
      'tb': 'Tampa Bay Lightning', 'tbl': 'Tampa Bay Lightning', 'tor': 'Toronto Maple Leafs',
      'van': 'Vancouver Canucks', 'vgk': 'Vegas Golden Knights', 'wsh': 'Washington Capitals',
      'wpg': 'Winnipeg Jets', 'uta': 'Utah Hockey Club',
    },
    detectionPatterns: [
      /\bnhl\b/i,
      // Use multi-word patterns to prevent false positives (e.g., "Rangers" matching QPR)
      /blackhawks|maple leafs|canadiens|habs|bruins|new york rangers|ny rangers|nyr|islanders|devils|flyers|penguins|capitals|caps|hurricanes|canes|florida panthers|lightning|bolts|red wings|senators|sens|sabres|blue jackets|blues|wild|avalanche|avs|dallas stars|predators|preds|winnipeg jets|flames|oilers|canucks|kraken|golden knights|vegas knights|coyotes|sharks|ducks|la kings|los angeles kings/i,
    ],
  },

  // NBA - H2H and Totals
  nba: {
    name: 'NBA',
    polymarketUrl: 'https://polymarket.com/sports/nba/games',
    oddsApiSport: 'basketball_nba',
    oddsApiMarkets: 'h2h,totals', // Added totals for over/under
    oddsApiOutright: 'basketball_nba_championship_winner',
    teamMap: {
      'atl': 'Atlanta Hawks', 'bos': 'Boston Celtics', 'bkn': 'Brooklyn Nets',
      'cha': 'Charlotte Hornets', 'chi': 'Chicago Bulls', 'cle': 'Cleveland Cavaliers',
      'dal': 'Dallas Mavericks', 'den': 'Denver Nuggets', 'det': 'Detroit Pistons',
      'gsw': 'Golden State Warriors', 'hou': 'Houston Rockets', 'ind': 'Indiana Pacers',
      'lac': 'LA Clippers', 'lal': 'Los Angeles Lakers', 'mem': 'Memphis Grizzlies',
      'mia': 'Miami Heat', 'mil': 'Milwaukee Bucks', 'min': 'Minnesota Timberwolves',
      'nop': 'New Orleans Pelicans', 'nyk': 'New York Knicks', 'okc': 'Oklahoma City Thunder',
      'orl': 'Orlando Magic', 'phi': 'Philadelphia 76ers', 'phx': 'Phoenix Suns',
      'por': 'Portland Trail Blazers', 'sac': 'Sacramento Kings', 'sas': 'San Antonio Spurs',
      'tor': 'Toronto Raptors', 'uta': 'Utah Jazz', 'was': 'Washington Wizards',
    },
    detectionPatterns: [
      /\bnba\b/i,
      /lakers|celtics|warriors|heat|bulls|knicks|nets|bucks|76ers|sixers|suns|nuggets|clippers|mavericks|rockets|grizzlies|timberwolves|pelicans|spurs|thunder|jazz|blazers|trail blazers|hornets|atlanta hawks|wizards|magic|pistons|cavaliers|raptors|pacers/i,
    ],
  },

  // NFL
  nfl: {
    name: 'NFL',
    polymarketUrl: 'https://polymarket.com/sports/nfl/games',
    oddsApiSport: 'americanfootball_nfl',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'americanfootball_nfl_super_bowl_winner',
    teamMap: {
      'ari': 'Arizona Cardinals', 'atl': 'Atlanta Falcons', 'bal': 'Baltimore Ravens',
      'buf': 'Buffalo Bills', 'car': 'Carolina Panthers', 'chi': 'Chicago Bears',
      'cin': 'Cincinnati Bengals', 'cle': 'Cleveland Browns', 'dal': 'Dallas Cowboys',
      'den': 'Denver Broncos', 'det': 'Detroit Lions', 'gb': 'Green Bay Packers',
      'hou': 'Houston Texans', 'ind': 'Indianapolis Colts', 'jax': 'Jacksonville Jaguars',
      'kc': 'Kansas City Chiefs', 'lac': 'LA Chargers', 'lar': 'LA Rams',
      'lv': 'Las Vegas Raiders', 'mia': 'Miami Dolphins', 'min': 'Minnesota Vikings',
      'ne': 'New England Patriots', 'no': 'New Orleans Saints', 'nyg': 'New York Giants',
      'nyj': 'New York Jets', 'phi': 'Philadelphia Eagles', 'pit': 'Pittsburgh Steelers',
      'sf': 'San Francisco 49ers', 'sea': 'Seattle Seahawks', 'tb': 'Tampa Bay Buccaneers',
      'ten': 'Tennessee Titans', 'was': 'Washington Commanders',
    },
    detectionPatterns: [
      /\bnfl\b/i,
      /chiefs|eagles|49ers|niners|cowboys|bills|ravens|bengals|dolphins|lions|packers|patriots|broncos|chargers|raiders|steelers|browns|texans|colts|jaguars|titans|commanders|giants|saints|panthers|falcons|buccaneers|bucs|seahawks|rams|cardinals|bears|vikings/i,
    ],
  },

  // EPL - English Premier League
  epl: {
    name: 'EPL',
    polymarketUrl: 'https://polymarket.com/sports/soccer/epl/games',
    oddsApiSport: 'soccer_epl',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_epl_winner',
    teamMap: {
      'ars': 'Arsenal', 'avl': 'Aston Villa', 'bou': 'Bournemouth', 'bre': 'Brentford',
      'bha': 'Brighton', 'che': 'Chelsea', 'cry': 'Crystal Palace', 'eve': 'Everton',
      'ful': 'Fulham', 'ips': 'Ipswich', 'lei': 'Leicester', 'liv': 'Liverpool',
      'mci': 'Man City', 'mun': 'Man United', 'new': 'Newcastle', 'nfo': 'Nottm Forest',
      'sou': 'Southampton', 'tot': 'Tottenham', 'whu': 'West Ham', 'wol': 'Wolves',
    },
    detectionPatterns: [
      /\bepl\b/i,
      /\bpremier league\b/i,
      /arsenal|aston villa|bournemouth|brentford|brighton|chelsea|crystal palace|everton|fulham|ipswich|leicester|liverpool|man city|manchester city|man united|manchester united|newcastle|nottingham forest|southampton|tottenham|spurs|west ham|wolves/i,
    ],
  },

  // La Liga
  laliga: {
    name: 'La Liga',
    polymarketUrl: 'https://polymarket.com/sports/soccer/laliga/games',
    oddsApiSport: 'soccer_spain_la_liga',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_spain_la_liga_winner',
    teamMap: {
      'rma': 'Real Madrid', 'bar': 'Barcelona', 'atm': 'Atletico Madrid',
      'sev': 'Sevilla', 'vil': 'Villarreal', 'bet': 'Real Betis', 'soc': 'Real Sociedad',
      'ath': 'Athletic Bilbao', 'val': 'Valencia', 'get': 'Getafe', 'osa': 'Osasuna',
      'cel': 'Celta Vigo', 'ray': 'Rayo Vallecano', 'mal': 'Mallorca', 'ala': 'Alaves',
      'las': 'Las Palmas', 'gir': 'Girona', 'esp': 'Espanyol', 'leg': 'Leganes', 'vld': 'Valladolid',
    },
    detectionPatterns: [
      /\bla liga\b/i,
      /\blaliga\b/i,
      /real madrid|barcelona|barca|atletico madrid|sevilla|villarreal|real betis|real sociedad|athletic bilbao|valencia|getafe|osasuna|celta vigo|rayo vallecano|mallorca|alaves|las palmas|girona|espanyol|leganes|valladolid/i,
    ],
  },

  // Serie A
  seriea: {
    name: 'Serie A',
    polymarketUrl: 'https://polymarket.com/sports/soccer/serie-a/games',
    oddsApiSport: 'soccer_italy_serie_a',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_italy_serie_a_winner',
    teamMap: {
      'juv': 'Juventus', 'int': 'Inter Milan', 'mil': 'AC Milan', 'nap': 'Napoli',
      'rom': 'Roma', 'laz': 'Lazio', 'fio': 'Fiorentina', 'ata': 'Atalanta',
      'bol': 'Bologna', 'tor': 'Torino', 'udi': 'Udinese', 'sas': 'Sassuolo',
      'emp': 'Empoli', 'ver': 'Verona', 'lec': 'Lecce', 'mon': 'Monza',
      'gen': 'Genoa', 'cal': 'Cagliari', 'com': 'Como', 'par': 'Parma', 'ven': 'Venezia',
    },
    detectionPatterns: [
      /\bserie a\b/i,
      /\bseriea\b/i,
      /juventus|juve|inter milan|ac milan|napoli|roma|lazio|fiorentina|atalanta|bologna|torino|udinese|sassuolo|empoli|verona|lecce|monza|genoa|cagliari|como|parma|venezia/i,
    ],
  },

  // Bundesliga
  bundesliga: {
    name: 'Bundesliga',
    polymarketUrl: 'https://polymarket.com/sports/soccer/bundesliga/games',
    oddsApiSport: 'soccer_germany_bundesliga',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_germany_bundesliga_winner',
    teamMap: {
      'bay': 'Bayern Munich', 'bvb': 'Dortmund', 'rbl': 'RB Leipzig', 'lev': 'Leverkusen',
      'fra': 'Frankfurt', 'wob': 'Wolfsburg', 'bmg': 'Gladbach', 'fre': 'Freiburg',
      'hof': 'Hoffenheim', 'mai': 'Mainz', 'aug': 'Augsburg', 'uni': 'Union Berlin',
      'koe': 'Koln', 'wer': 'Werder Bremen', 'boc': 'Bochum', 'hei': 'Heidenheim',
      'stg': 'Stuttgart', 'hol': 'Holstein Kiel', 'stm': 'St. Pauli',
    },
    detectionPatterns: [
      /\bbundesliga\b/i,
      /bayern munich|bayern|dortmund|rb leipzig|leverkusen|bayer leverkusen|frankfurt|eintracht|wolfsburg|gladbach|monchengladbach|freiburg|hoffenheim|mainz|augsburg|union berlin|koln|cologne|werder bremen|bremen|bochum|heidenheim|stuttgart|holstein kiel|st pauli/i,
    ],
  },

  // UCL - UEFA Champions League
  ucl: {
    name: 'UCL',
    polymarketUrl: 'https://polymarket.com/sports/soccer/ucl/games',
    oddsApiSport: 'soccer_uefa_champs_league',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_uefa_champs_league_winner',
    teamMap: {
      'rma': 'Real Madrid', 'bar': 'Barcelona', 'bay': 'Bayern Munich', 'mci': 'Man City',
      'liv': 'Liverpool', 'che': 'Chelsea', 'psg': 'PSG', 'juv': 'Juventus',
      'int': 'Inter Milan', 'mil': 'AC Milan', 'bvb': 'Dortmund', 'ars': 'Arsenal',
      'atm': 'Atletico Madrid', 'ben': 'Benfica', 'por': 'Porto', 'aja': 'Ajax',
      'cel': 'Celtic', 'spo': 'Sporting CP', 'nap': 'Napoli', 'lev': 'Leverkusen',
      'ata': 'Atalanta', 'fey': 'Feyenoord', 'psv': 'PSV', 'gal': 'Galatasaray',
      'fen': 'Fenerbahce', 'bru': 'Club Brugge', 'sal': 'RB Salzburg', 'sha': 'Shakhtar',
    },
    detectionPatterns: [
      /\bucl\b/i,
      /\bchampions league\b/i,
      /\buefa champions\b/i,
    ],
  },

  // NCAA CBB - EXPANDED with Firecrawl abbreviations
  cbb: {
    name: 'NCAA',
    polymarketUrl: 'https://polymarket.com/sports/cbb/games',
    oddsApiSport: 'basketball_ncaab',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'basketball_ncaab_championship_winner',
    teamMap: {
      // Original mappings
      'duke': 'Duke Blue Devils', 'unc': 'North Carolina Tar Heels',
      'uk': 'Kentucky Wildcats', 'ku': 'Kansas Jayhawks',
      'ucla': 'UCLA Bruins', 'usc': 'USC Trojans',
      'bama': 'Alabama Crimson Tide', 'aub': 'Auburn Tigers',
      'gonz': 'Gonzaga Bulldogs', 'purdue': 'Purdue Boilermakers',
      'uconn': 'UConn Huskies', 'hou': 'Houston Cougars',
      'tenn': 'Tennessee Volunteers', 'arz': 'Arizona Wildcats',
      'msu': 'Michigan State Spartans', 'mich': 'Michigan Wolverines',
      'osu': 'Ohio State Buckeyes', 'wisc': 'Wisconsin Badgers',
      'iowa': 'Iowa Hawkeyes', 'ill': 'Illinois Fighting Illini',
      'ark': 'Arkansas Razorbacks', 'fla': 'Florida Gators',
      'lsu': 'LSU Tigers', 'tex': 'Texas Longhorns',
      'bay': 'Baylor Bears', 'tcu': 'TCU Horned Frogs',
      // NEW: Common Firecrawl abbreviations (from logs)
      'vtech': 'Virginia Tech Hokies', 'vt': 'Virginia Tech Hokies',
      'mst': 'Michigan State Spartans', 'michst': 'Michigan State Spartans',
      'hiost': 'Ohio State Buckeyes', 'ohst': 'Ohio State Buckeyes',
      'kst': 'Kansas State Wildcats', 'kstate': 'Kansas State Wildcats',
      'okst': 'Oklahoma State Cowboys', 'okstate': 'Oklahoma State Cowboys',
      'wvu': 'West Virginia Mountaineers',
      'sc': 'South Carolina Gamecocks',
      'gt': 'Georgia Tech Yellow Jackets',
      'clem': 'Clemson Tigers',
      'cuse': 'Syracuse Orange', 'syr': 'Syracuse Orange',
      'nd': 'Notre Dame Fighting Irish',
      'pitt': 'Pittsburgh Panthers',
      'nc': 'North Carolina Tar Heels', 'carolina': 'North Carolina Tar Heels',
      'wake': 'Wake Forest Demon Deacons',
      'lou': 'Louisville Cardinals', 'louisville': 'Louisville Cardinals',
      'md': 'Maryland Terrapins', 'umd': 'Maryland Terrapins',
      'ind': 'Indiana Hoosiers',
      'neb': 'Nebraska Cornhuskers',
      'minn': 'Minnesota Golden Gophers',
      'nw': 'Northwestern Wildcats',
      'psu': 'Penn State Nittany Lions',
      'rut': 'Rutgers Scarlet Knights',
      'ore': 'Oregon Ducks', 'uoregon': 'Oregon Ducks',
      'uw': 'Washington Huskies', 'wash': 'Washington Huskies',
      'wsu': 'Washington State Cougars',
      'colo': 'Colorado Buffaloes',
      'utah': 'Utah Utes',
      'ariz': 'Arizona Wildcats', 'zona': 'Arizona Wildcats',
      'asu': 'Arizona State Sun Devils',
      'stan': 'Stanford Cardinal',
      'cal': 'California Golden Bears',
      // Big 12 additions
      'cin': 'Cincinnati Bearcats',
      'ucf': 'UCF Knights',
      'byu': 'BYU Cougars',
      'isu': 'Iowa State Cyclones',
      'ttu': 'Texas Tech Red Raiders',
    },
    detectionPatterns: [
      /\bncaa\b/i,
      /\bcbb\b/i,
      /march madness|college basketball|final four/i,
    ],
  },
};

// ============================================================================
// DERIVED VALUES (computed once from config)
// ============================================================================

// All sport codes: ['nhl', 'nba', 'nfl', 'cbb']
export const SPORT_CODES = Object.keys(SPORTS_CONFIG) as SportCode[];

// All sport names: ['NHL', 'NBA', 'NFL', 'NCAA']
export const SPORT_NAMES = SPORT_CODES.map(code => SPORTS_CONFIG[code].name);

// Allowed sports for filtering (uppercase): ['NHL', 'NBA', 'NCAA', 'NFL']
export const ALLOWED_SPORTS = SPORT_NAMES;

// Type for sport codes
export type SportCode = keyof typeof SPORTS_CONFIG;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build SPORT_ENDPOINTS dynamically from config
 * Format: { 'NHL': { sport: 'icehockey_nhl', markets: 'h2h' }, ... }
 */
export function buildSportEndpoints(): Record<string, { sport: string; markets: string }> {
  return Object.fromEntries(
    SPORT_CODES.map(code => [
      SPORTS_CONFIG[code].name,
      {
        sport: SPORTS_CONFIG[code].oddsApiSport,
        markets: SPORTS_CONFIG[code].oddsApiMarkets,
      },
    ])
  );
}

/**
 * Build outright endpoints for futures
 * Format: { 'basketball_nba': 'basketball_nba_championship_winner', ... }
 */
export function buildOutrightEndpoints(): Record<string, string> {
  return Object.fromEntries(
    SPORT_CODES.map(code => [
      SPORTS_CONFIG[code].oddsApiSport,
      SPORTS_CONFIG[code].oddsApiOutright,
    ])
  );
}

/**
 * Get team map for a sport code
 */
export function getTeamMap(sportCode: SportCode): Record<string, string> {
  return SPORTS_CONFIG[sportCode]?.teamMap || {};
}

/**
 * Get sport code from league name (e.g., 'NBA' -> 'nba', 'NHL' -> 'nhl')
 */
export function getSportCodeFromLeague(league: string | null): SportCode | null {
  if (!league) return null;
  const l = league.toUpperCase();
  
  for (const code of SPORT_CODES) {
    if (SPORTS_CONFIG[code].name.toUpperCase() === l) {
      return code;
    }
  }
  
  // Special case for CBB/NCAA
  if (l === 'CBB') return 'cbb';
  
  return null;
}

/**
 * Detect sport from text using config patterns
 * Returns sport name (e.g., 'NHL', 'NBA') or null
 */
export function detectSportFromText(text: string): string | null {
  const t = text.toLowerCase();
  
  // Check in order (NHL first to catch Blackhawks before Hawks)
  for (const code of SPORT_CODES) {
    const config = SPORTS_CONFIG[code];
    if (config.detectionPatterns.some(p => p.test(t))) {
      return config.name;
    }
  }
  
  return null;
}

/**
 * Get sport code from detected sport name
 */
export function getSportCodeFromName(name: string): SportCode | null {
  for (const code of SPORT_CODES) {
    if (SPORTS_CONFIG[code].name === name) {
      return code;
    }
  }
  return null;
}
