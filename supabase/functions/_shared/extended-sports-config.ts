// ============================================================================
// EXTENDED SPORTS CONFIGURATION
// ============================================================================
// This file EXTENDS the core sports-config.ts to include ALL leagues that 
// Polymarket whales trade on, including soccer, UFC, tennis, and other sports
// supported by the Odds API.
// 
// DO NOT modify sports-config.ts (Tier 0 FROZEN) - this file supplements it.
// ============================================================================

import { 
  SPORTS_CONFIG as CORE_SPORTS_CONFIG, 
  SportConfig,
  SportCode as CoreSportCode,
  buildSportEndpoints as buildCoreSportEndpoints,
  buildOutrightEndpoints as buildCoreOutrightEndpoints,
} from './sports-config.ts';

// Extended sport configurations for whale-traded leagues
export const EXTENDED_SPORTS_CONFIG: Record<string, SportConfig> = {
  // MLS - Major League Soccer  
  mls: {
    name: 'MLS',
    polymarketUrl: 'https://polymarket.com/sports/soccer/mls/games',
    oddsApiSport: 'soccer_usa_mls',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_usa_mls_winner',
    teamMap: {
      'atl': 'Atlanta United', 'aus': 'Austin FC', 'cha': 'Charlotte FC', 'chi': 'Chicago Fire',
      'cin': 'Cincinnati', 'col': 'Colorado Rapids', 'clb': 'Columbus Crew', 'dal': 'FC Dallas',
      'dc': 'D.C. United', 'hou': 'Houston Dynamo', 'la': 'LAFC', 'lag': 'LA Galaxy',
      'mia': 'Inter Miami', 'min': 'Minnesota United', 'mon': 'Montreal Impact', 'nsh': 'Nashville SC',
      'ne': 'New England Revolution', 'nyc': 'New York City FC', 'ny': 'New York Red Bulls',
      'orl': 'Orlando City', 'phi': 'Philadelphia Union', 'por': 'Portland Timbers',
      'rsl': 'Real Salt Lake', 'sj': 'San Jose Earthquakes', 'sea': 'Seattle Sounders',
      'skc': 'Sporting Kansas City', 'tor': 'Toronto FC', 'van': 'Vancouver Whitecaps',
    },
    detectionPatterns: [
      /\bmls\b/i,
      /major league soccer/i,
      /atlanta united|austin fc|charlotte fc|chicago fire|fc cincinnati|colorado rapids|columbus crew|fc dallas|dc united|houston dynamo|lafc|la galaxy|inter miami|minnesota united|cf montreal|nashville sc|new england revolution|new york city fc|new york red bulls|orlando city|philadelphia union|portland timbers|real salt lake|san jose earthquakes|seattle sounders|sporting kansas city|toronto fc|vancouver whitecaps/i,
    ],
  },

  // FA Cup - English FA Cup
  facup: {
    name: 'FA Cup',
    polymarketUrl: 'https://polymarket.com/sports/soccer/fa-cup/games',
    oddsApiSport: 'soccer_fa_cup',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_fa_cup_winner',
    teamMap: {
      // FA Cup includes Premier League + Championship + lower league teams
      'ars': 'Arsenal', 'che': 'Chelsea', 'liv': 'Liverpool', 'mci': 'Man City',
      'mun': 'Man United', 'tot': 'Tottenham', 'new': 'Newcastle', 'whu': 'West Ham',
      'avl': 'Aston Villa', 'bha': 'Brighton', 'eve': 'Everton', 'ful': 'Fulham',
      'lei': 'Leicester City', 'wol': 'Wolves', 'cry': 'Crystal Palace', 'bou': 'Bournemouth',
      'bre': 'Brentford', 'nfo': 'Nottm Forest', 'sou': 'Southampton', 'ips': 'Ipswich Town',
    },
    detectionPatterns: [
      /\bfa cup\b/i,
      /\benglish fa cup\b/i,
      /\bcup\b.*\benglish\b/i,
    ],
  },

  // UFC/MMA
  ufc: {
    name: 'UFC',
    polymarketUrl: 'https://polymarket.com/sports/ufc/fights',
    oddsApiSport: 'mma_mixed_martial_arts',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'mma_mixed_martial_arts_championship_winner',
    teamMap: {}, // UFC uses fighter names, not team codes
    detectionPatterns: [
      /\bufc\b/i,
      /\bmma\b/i,
      /mixed martial arts/i,
      /ultimate fighting/i,
    ],
  },

  // Tennis ATP
  atp: {
    name: 'ATP',
    polymarketUrl: 'https://polymarket.com/sports/tennis/atp/matches',
    oddsApiSport: 'tennis_atp_australian_open', // Note: Tennis has tournament-specific endpoints
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'tennis_atp_australian_open_winner',
    teamMap: {}, // Tennis uses player names, not team codes
    detectionPatterns: [
      /\batp\b/i,
      /\btennis\b/i,
      /australian open|french open|wimbledon|us open|indian wells|miami open|monte carlo|madrid open|italian open|cincinnati open|shanghai masters|paris masters|rotterdam open|dallas open|argentina open/i,
    ],
  },

  // Tennis WTA
  wta: {
    name: 'WTA',
    polymarketUrl: 'https://polymarket.com/sports/tennis/wta/matches',
    oddsApiSport: 'tennis_wta_australian_open',
    oddsApiMarkets: 'h2h', 
    oddsApiOutright: 'tennis_wta_australian_open_winner',
    teamMap: {},
    detectionPatterns: [
      /\bwta\b/i,
      /womens tennis/i,
      /women.*tennis/i,
    ],
  },

  // Additional European Soccer Leagues that whales might trade
  // Ligue 1 (French)
  ligue1: {
    name: 'Ligue 1',
    polymarketUrl: 'https://polymarket.com/sports/soccer/ligue1/games',
    oddsApiSport: 'soccer_france_ligue_one',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_france_ligue_one_winner',
    teamMap: {
      'psg': 'PSG', 'mar': 'Marseille', 'mon': 'Monaco', 'lyo': 'Lyon',
      'nic': 'Nice', 'ren': 'Rennes', 'lil': 'Lille', 'len': 'Lens',
      'str': 'Strasbourg', 'rei': 'Reims', 'lor': 'Lorient', 'bre': 'Brest',
      'mon': 'Montpelier', 'cle': 'Clermont', 'tro': 'Troyes', 'met': 'Metz',
      'ang': 'Angers', 'bor': 'Bordeaux', 'nan': 'Nantes', 'tou': 'Toulouse',
    },
    detectionPatterns: [
      /\bligue 1\b/i,
      /\bligue1\b/i,
      /french league/i,
      /psg|marseille|monaco|lyon|nice|rennes|lille|lens|strasbourg|reims|lorient|brest|montpellier|clermont|troyes|metz|angers|bordeaux|nantes|toulouse/i,
    ],
  },

  // Eredivisie (Dutch)
  eredivisie: {
    name: 'Eredivisie',
    polymarketUrl: 'https://polymarket.com/sports/soccer/eredivisie/games',
    oddsApiSport: 'soccer_netherlands_eredivisie',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_netherlands_eredivisie_winner',
    teamMap: {
      'aja': 'Ajax', 'psv': 'PSV', 'fey': 'Feyenoord', 'az': 'AZ Alkmaar',
      'vit': 'Vitesse', 'fcg': 'FC Groningen', 'twe': 'Twente', 'her': 'Heracles',
      'spa': 'Sparta Rotterdam', 'for': 'Fortuna Sittard', 'wil': 'Willem II',
      'pec': 'PEC Zwolle', 'ado': 'ADO Den Haag', 'vvv': 'VVV-Venlo',
      'utm': 'Utrecht', 'hee': 'Heerenveen', 'cam': 'Cambuur', 'nme': 'NEC Nijmegen',
    },
    detectionPatterns: [
      /\beredivisie\b/i,
      /dutch league/i,
      /ajax|psv|feyenoord|az alkmaar|vitesse|groningen|twente|heracles|sparta|fortuna|willem|zwolle|utrecht|heerenveen|cambuur|nijmegen/i,
    ],
  },

  // Liga Portugal (Portuguese)
  ligaportugal: {
    name: 'Liga Portugal',
    polymarketUrl: 'https://polymarket.com/sports/soccer/portugal/games',
    oddsApiSport: 'soccer_portugal_primeira_liga',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'soccer_portugal_primeira_liga_winner',
    teamMap: {
      'por': 'Porto', 'ben': 'Benfica', 'spo': 'Sporting CP', 'bra': 'Braga',
      'vit': 'Vitoria Guimaraes', 'boa': 'Boavista', 'mor': 'Moreirense',
      'ave': 'Avs', 'est': 'Estoril', 'far': 'Famalicao', 'rio': 'Rio Ave',
      'aro': 'Arouca', 'cas': 'Casa Pia', 'gil': 'Gil Vicente', 'por': 'Portimonense',
      'cha': 'Chaves', 'viz': 'Vizela', 'ton': 'Tondela', 'mar': 'Maritimo',
    },
    detectionPatterns: [
      /\bliga portugal\b/i,
      /primeira liga/i,
      /portuguese league/i,
      /porto|benfica|sporting|braga|guimaraes|boavista|moreirense|estoril|famalicao|arouca|gil vicente|portimonense|chaves|vizela|tondela|maritimo/i,
    ],
  },
};

// Combined sport codes (core + extended)
export const ALL_SPORT_CODES = [
  ...Object.keys(CORE_SPORTS_CONFIG),
  ...Object.keys(EXTENDED_SPORTS_CONFIG),
] as AllSportCode[];

// Combined sport configurations
export const ALL_SPORTS_CONFIG = {
  ...CORE_SPORTS_CONFIG,
  ...EXTENDED_SPORTS_CONFIG,
};

// All sport names (core + extended)
export const ALL_SPORT_NAMES = ALL_SPORT_CODES.map(code => ALL_SPORTS_CONFIG[code].name);

// Extended type definitions
export type ExtendedSportCode = keyof typeof EXTENDED_SPORTS_CONFIG;
export type AllSportCode = CoreSportCode | ExtendedSportCode;

/**
 * Build SPORT_ENDPOINTS for ALL sports (core + extended)
 * Format: { 'NHL': { sport: 'icehockey_nhl', markets: 'h2h' }, 'EPL': { sport: 'soccer_epl', markets: 'h2h' }, ... }
 */
export function buildAllSportEndpoints(): Record<string, { sport: string; markets: string }> {
  return Object.fromEntries(
    ALL_SPORT_CODES.map(code => [
      ALL_SPORTS_CONFIG[code].name,
      {
        sport: ALL_SPORTS_CONFIG[code].oddsApiSport,
        markets: ALL_SPORTS_CONFIG[code].oddsApiMarkets,
      },
    ])
  );
}

/**
 * Build outright endpoints for ALL sports
 * Format: { 'icehockey_nhl': 'icehockey_nhl_championship_winner', 'soccer_epl': 'soccer_epl_winner', ... }
 */
export function buildAllOutrightEndpoints(): Record<string, string> {
  return Object.fromEntries(
    ALL_SPORT_CODES.map(code => [
      ALL_SPORTS_CONFIG[code].oddsApiSport,
      ALL_SPORTS_CONFIG[code].oddsApiOutright,
    ])
  );
}

/**
 * Get team map for any sport code (core or extended)
 */
export function getAllTeamMap(sportCode: AllSportCode): Record<string, string> {
  return ALL_SPORTS_CONFIG[sportCode]?.teamMap || {};
}

/**
 * Get sport code from league name for ALL sports
 */
export function getAllSportCodeFromLeague(league: string | null): AllSportCode | null {
  if (!league) return null;
  const l = league.toUpperCase();
  
  for (const code of ALL_SPORT_CODES) {
    if (ALL_SPORTS_CONFIG[code].name.toUpperCase() === l) {
      return code;
    }
  }
  
  // Special case mappings
  if (l === 'CBB') return 'cbb' as AllSportCode;
  if (l === 'ATP' || l === 'WTA') return 'atp' as AllSportCode;
  if (l === 'UFC' || l === 'MMA') return 'ufc' as AllSportCode;
  
  return null;
}

/**
 * Detect sport from text using ALL configured patterns (core + extended)
 * Returns sport name (e.g., 'NHL', 'EPL', 'UFC') or null
 */
export function detectAllSportFromText(text: string): string | null {
  const t = text.toLowerCase();
  
  // Check ALL sports in order (core sports first for priority)
  for (const code of ALL_SPORT_CODES) {
    const config = ALL_SPORTS_CONFIG[code];
    if (config.detectionPatterns.some(p => p.test(t))) {
      return config.name;
    }
  }
  
  return null;
}

/**
 * Get sport code from detected sport name (ALL sports)
 */
export function getAllSportCodeFromName(name: string): AllSportCode | null {
  for (const code of ALL_SPORT_CODES) {
    if (ALL_SPORTS_CONFIG[code].name === name) {
      return code;
    }
  }
  return null;
}

// Export for compatibility - functions that work with ALL sports
export {
  // Re-export core functions for backwards compatibility
  SPORTS_CONFIG as CORE_SPORTS_CONFIG,
  SPORT_CODES as CORE_SPORT_CODES,
  SPORT_NAMES as CORE_SPORT_NAMES,
  ALLOWED_SPORTS as CORE_ALLOWED_SPORTS,
  SportCode as CoreSportCode,
} from './sports-config.ts';

/**
 * Check if a sport is a whale-traded sport (in extended config)
 * These are the sports DrPufferfish and other whales specifically trade
 */
export function isWhaleTraded(sportName: string): boolean {
  const whaleSports = [
    'EPL', 'La Liga', 'Serie A', 'Bundesliga', 'UCL', // DrPufferfish soccer specialization
    'MLS', 'FA Cup', 'Ligue 1', 'Eredivisie', 'Liga Portugal', // Additional soccer
    'UFC', 'ATP', 'WTA', // Individual sports whales trade
  ];
  return whaleSports.includes(sportName);
}

/**
 * Get all H2H sports for odds ingestion (includes soccer leagues)
 */
export function getAllH2HSports(): string[] {
  return ALL_SPORT_CODES
    .filter(code => ALL_SPORTS_CONFIG[code].oddsApiMarkets.includes('h2h'))
    .map(code => ALL_SPORTS_CONFIG[code].oddsApiSport);
}

/**
 * Get all outright/futures sports for odds ingestion
 */
export function getAllOutrightSports(): string[] {
  return ALL_SPORT_CODES
    .filter(code => ALL_SPORTS_CONFIG[code].oddsApiOutright)
    .map(code => ALL_SPORTS_CONFIG[code].oddsApiOutright);
}