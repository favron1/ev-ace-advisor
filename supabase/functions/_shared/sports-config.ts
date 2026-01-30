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
      /blackhawks|maple leafs|canadiens|habs|bruins|rangers|islanders|devils|flyers|penguins|capitals|caps|hurricanes|canes|panthers|lightning|bolts|red wings|senators|sens|sabres|blue jackets|blues|wild|avalanche|avs|stars|predators|preds|jets|flames|oilers|canucks|kraken|golden knights|knights|coyotes|sharks|ducks|kings/i,
    ],
  },

  // NBA
  nba: {
    name: 'NBA',
    polymarketUrl: 'https://polymarket.com/sports/nba/games',
    oddsApiSport: 'basketball_nba',
    oddsApiMarkets: 'h2h',
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

  // NCAA CBB
  cbb: {
    name: 'NCAA',
    polymarketUrl: 'https://polymarket.com/sports/cbb/games',
    oddsApiSport: 'basketball_ncaab',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'basketball_ncaab_championship_winner',
    teamMap: {
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
