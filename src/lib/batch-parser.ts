 // ============================================================================
 // BATCH IMPORT PARSER
 // ============================================================================
// Parses structured market data from JSON or Polymarket UI text.
// JSON format preferred for reliability.
 // ============================================================================
 
 export interface ParsedMarket {
   sport: string;              // 'NHL', 'NBA', 'NFL', etc.
   gameTime: string;           // "10:30 AM"
   awayTeam: string;           // First team listed (Team A vs Team B = A is away)
   homeTeam: string;           // Second team listed
   awayPrice: number;          // Decimal price (0.67)
   homePrice: number;          // Decimal price (0.34)
   rawText: string;            // Original match line for debugging
   parseError?: string;        // If parsing failed
 }
 
 export interface ParseResult {
   markets: ParsedMarket[];
   errors: string[];
   summary: {
     total: number;
     parsed: number;
     failed: number;
   };
 }
 
// JSON input: supports multiple field naming conventions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonMarketInput = Record<string, any>;

// Nested JSON format (league wrapper with markets array)
interface NestedJsonInput {
  league: string;
  date?: string;
  markets: Array<{
    start_time?: string;
    away_team: string;
    home_team: string;
    prices: { away: number; home: number };
    volume_usd?: number;
  }>;
}

 // Patterns for parsing
 const SPORT_HEADER_PATTERN = /^[^a-z]*(?:🏒|🏀|🏈|⚽)?\s*(NHL|NBA|NFL|NCAA|EPL|UCL|La Liga|Serie A|Bundesliga)\s*[-–—]?\s*Head-to-Head/i;
 const TIME_PATTERN = /^(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
 const TEAMS_PATTERN = /^(.+?)\s+vs\s+(.+)$/i;
 const PRICE_PATTERN = /^(.+?):\s*(\d+)(?:c|¢|cents?)?$/i;
 
 /**
  * Normalize price from various formats to decimal
  * "67c" | "67¢" | "67" | "0.67" -> 0.67
  */
 function normalizePrice(priceStr: string): number {
   // Remove any non-numeric characters except decimal point
   const cleaned = priceStr.replace(/[^\d.]/g, '');
   const num = parseFloat(cleaned);
   
   if (isNaN(num)) return 0;
   
   // If it's already a decimal (< 1), return as-is
   if (num < 1) return num;
   
   // Otherwise, it's in cents - convert to decimal
   return num / 100;
 }
 
 /**
 * Try to parse as JSON (array or single object)
 * Returns null if not valid JSON
 */
function tryParseJson(text: string): { type: 'flat'; data: JsonMarketInput[] } | { type: 'nested'; data: NestedJsonInput } | null {
  const trimmed = text.trim();
  
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return null;
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    
    // Check for nested format (has "league" + "markets" array)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.markets && Array.isArray(parsed.markets)) {
      return { type: 'nested', data: parsed as NestedJsonInput };
    }
    
    // Handle single flat object
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { type: 'flat', data: [parsed as JsonMarketInput] };
    }
    
    // Handle array of flat objects
    if (Array.isArray(parsed)) {
      return { type: 'flat', data: parsed as JsonMarketInput[] };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse JSON format input from pre-parsed data
 */
function parseJsonData(data: Record<string, unknown>[]): ParseResult {
  const markets: ParsedMarket[] = [];
  const errors: string[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    
    // Support multiple field naming conventions
    const sport = String(item.sport || item.league || item.tournament || '').toUpperCase();
    const homeTeam = String(item.homeTeam || item.home_team || item.player_2 || item.team_2 || '');
    const awayTeam = String(item.awayTeam || item.away_team || item.player_1 || item.team_1 || '');
    const gameTime = String(item.gameTime || item.time || item.start_time || '');
    
    if (!sport || !homeTeam || !awayTeam) {
      errors.push(`Item ${i + 1}: Missing required fields (sport/league, homeTeam/home_team/player_1, awayTeam/away_team/player_2)`);
      continue;
    }
    
    // Support: homePriceCents, home_price_cents, homePrice, home_price, player_2_price_cents, etc.
    let homePrice = 0;
    let awayPrice = 0;
    
    if (typeof item.homePriceCents === 'number') homePrice = item.homePriceCents / 100;
    else if (typeof item.home_price_cents === 'number') homePrice = (item.home_price_cents as number) / 100;
    else if (typeof item.player_2_price_cents === 'number') homePrice = (item.player_2_price_cents as number) / 100;
    else if (typeof item.team_2_price_cents === 'number') homePrice = (item.team_2_price_cents as number) / 100;
    else if (typeof item.homePrice === 'number') homePrice = item.homePrice > 1 ? item.homePrice / 100 : item.homePrice;
    else if (typeof item.home_price === 'number') homePrice = (item.home_price as number) > 1 ? (item.home_price as number) / 100 : (item.home_price as number);
    
    if (typeof item.awayPriceCents === 'number') awayPrice = item.awayPriceCents / 100;
    else if (typeof item.away_price_cents === 'number') awayPrice = (item.away_price_cents as number) / 100;
    else if (typeof item.player_1_price_cents === 'number') awayPrice = (item.player_1_price_cents as number) / 100;
    else if (typeof item.team_1_price_cents === 'number') awayPrice = (item.team_1_price_cents as number) / 100;
    else if (typeof item.awayPrice === 'number') awayPrice = item.awayPrice > 1 ? item.awayPrice / 100 : item.awayPrice;
    else if (typeof item.away_price === 'number') awayPrice = (item.away_price as number) > 1 ? (item.away_price as number) / 100 : (item.away_price as number);
    
    markets.push({
      sport,
      gameTime,
      homeTeam,
      awayTeam,
      homePrice,
      awayPrice,
      rawText: `${awayTeam} @ ${homeTeam}`,
    });
  }
  
  return { markets, errors, summary: { total: markets.length + errors.length, parsed: markets.length, failed: errors.length } };
}
/**
 * Parse nested JSON format (league wrapper with markets array)
 */
function parseNestedJson(data: NestedJsonInput): ParseResult {
  const markets: ParsedMarket[] = [];
  const errors: string[] = [];
  const sport = data.league?.toUpperCase() || '';
  
  if (!sport) {
    return { markets: [], errors: ['Missing "league" field'], summary: { total: 0, parsed: 0, failed: 1 } };
  }
  
  for (let i = 0; i < data.markets.length; i++) {
    const m = data.markets[i];
    
    if (!m.home_team || !m.away_team) {
      errors.push(`Market ${i + 1}: Missing home_team or away_team`);
      continue;
    }
    
    markets.push({
      sport,
      gameTime: m.start_time || '',
      homeTeam: m.home_team,
      awayTeam: m.away_team,
      homePrice: m.prices?.home ?? 0,
      awayPrice: m.prices?.away ?? 0,
      rawText: `${m.away_team} @ ${m.home_team}`,
    });
  }
  
  return { markets, errors, summary: { total: markets.length + errors.length, parsed: markets.length, failed: errors.length } };
}

/**
 * Parse the batch import text into structured market data (JSON or text format)
  */
 export function parseBatchImport(text: string): ParseResult {
  const jsonData = tryParseJson(text);
  if (jsonData !== null) {
    if (jsonData.type === 'nested') return parseNestedJson(jsonData.data);
    return parseJsonData(jsonData.data);
  }
  
  // Fall back to text format parsing
   const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
   const markets: ParsedMarket[] = [];
   const errors: string[] = [];
   
   let currentSport: string | null = null;
   let currentTime: string | null = null;
   let pendingMatch: { away: string; home: string; rawText: string } | null = null;
   let pendingPrices: { team: string; price: number }[] = [];
   
   for (let i = 0; i < lines.length; i++) {
     const line = lines[i];
     
     // Check for sport header
     const sportMatch = line.match(SPORT_HEADER_PATTERN);
     if (sportMatch) {
       currentSport = sportMatch[1].toUpperCase();
       // Normalize sport names
       if (currentSport === 'LA LIGA') currentSport = 'La Liga';
       if (currentSport === 'SERIE A') currentSport = 'Serie A';
       pendingMatch = null;
       pendingPrices = [];
       continue;
     }
     
     // Check for time
     const timeMatch = line.match(TIME_PATTERN);
     if (timeMatch) {
       currentTime = timeMatch[1].toUpperCase();
       continue;
     }
     
     // Check for teams line (Team A vs Team B)
     const teamsMatch = line.match(TEAMS_PATTERN);
     if (teamsMatch) {
       // If we had a pending match without prices, log error
       if (pendingMatch && pendingPrices.length < 2) {
         errors.push(`Missing prices for: ${pendingMatch.rawText}`);
       }
       
       pendingMatch = {
         away: teamsMatch[1].trim(),
         home: teamsMatch[2].trim(),
         rawText: line,
       };
       pendingPrices = [];
       continue;
     }
     
     // Check for price line (Team: XXc)
     const priceMatch = line.match(PRICE_PATTERN);
     if (priceMatch && pendingMatch) {
       const teamName = priceMatch[1].trim();
       const price = normalizePrice(priceMatch[2]);
       pendingPrices.push({ team: teamName, price });
       
       // When we have both prices, create the market
       if (pendingPrices.length >= 2) {
         if (!currentSport) {
           errors.push(`No sport detected for: ${pendingMatch.rawText}`);
         } else if (!currentTime) {
           errors.push(`No time detected for: ${pendingMatch.rawText}`);
         } else {
           // Map prices to home/away based on team names
           let homePrice = 0;
           let awayPrice = 0;
           
           for (const p of pendingPrices) {
             // Fuzzy match team names to home/away
             const pNorm = p.team.toLowerCase();
             const homeNorm = pendingMatch.home.toLowerCase();
             const awayNorm = pendingMatch.away.toLowerCase();
             
             // Check if this price is for home or away team
             if (homeNorm.includes(pNorm) || pNorm.includes(homeNorm) || 
                 isTeamMatch(p.team, pendingMatch.home)) {
               homePrice = p.price;
             } else if (awayNorm.includes(pNorm) || pNorm.includes(awayNorm) ||
                        isTeamMatch(p.team, pendingMatch.away)) {
               awayPrice = p.price;
             }
           }
           
           // If we couldn't match, use order (first price = away, second = home)
           if (homePrice === 0 && awayPrice === 0) {
             awayPrice = pendingPrices[0].price;
             homePrice = pendingPrices[1].price;
           }
           
           markets.push({
             sport: currentSport,
             gameTime: currentTime,
             awayTeam: pendingMatch.away,
             homeTeam: pendingMatch.home,
             awayPrice,
             homePrice,
             rawText: pendingMatch.rawText,
           });
         }
         
         pendingMatch = null;
         pendingPrices = [];
       }
       continue;
     }
   }
   
   // Check for any remaining pending match
   if (pendingMatch && pendingPrices.length < 2) {
     errors.push(`Incomplete market at end: ${pendingMatch.rawText}`);
   }
   
   return {
     markets,
     errors,
     summary: {
       total: markets.length + errors.length,
       parsed: markets.length,
       failed: errors.length,
     },
   };
 }
 
 /**
  * Check if two team names refer to the same team
  * Handles abbreviations like "NY Islanders" vs "New York Islanders"
  */
 function isTeamMatch(name1: string, name2: string): boolean {
   const n1 = name1.toLowerCase().replace(/[^a-z0-9\s]/g, '');
   const n2 = name2.toLowerCase().replace(/[^a-z0-9\s]/g, '');
   
   // Direct match
   if (n1 === n2) return true;
   
   // Common abbreviation mappings
   const abbrevMap: Record<string, string[]> = {
     'ny': ['new york'],
     'nj': ['new jersey'],
     'la': ['los angeles'],
     'tb': ['tampa bay'],
     'stl': ['st louis', 'saint louis'],
   };
   
   // Expand abbreviations and check
   let expanded1 = n1;
   let expanded2 = n2;
   
   for (const [abbr, fulls] of Object.entries(abbrevMap)) {
     for (const full of fulls) {
       if (n1.startsWith(abbr + ' ')) {
         expanded1 = n1.replace(abbr + ' ', full + ' ');
       }
       if (n2.startsWith(abbr + ' ')) {
         expanded2 = n2.replace(abbr + ' ', full + ' ');
       }
     }
   }
   
   return expanded1 === expanded2 || expanded1.includes(expanded2) || expanded2.includes(expanded1);
 }
 
 /**
  * Validate a parsed market for completeness
  */
 export function validateMarket(market: ParsedMarket): string | null {
   if (!market.sport) return 'Missing sport';
   if (!market.gameTime) return 'Missing game time';
   if (!market.homeTeam) return 'Missing home team';
   if (!market.awayTeam) return 'Missing away team';
   if (market.homePrice < 0 || market.homePrice > 1) return 'Invalid home price';
   if (market.awayPrice < 0 || market.awayPrice > 1) return 'Invalid away price';
   return null;
 }