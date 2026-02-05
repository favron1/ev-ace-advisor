 // ============================================================================
 // BATCH IMPORT PARSER
 // ============================================================================
 // Parses structured morning market data from Polymarket UI text.
 // Format: Sport headers, times, "Team A vs Team B", and "Team: XXc" prices
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
  * Parse the batch import text into structured market data
  */
 export function parseBatchImport(text: string): ParseResult {
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