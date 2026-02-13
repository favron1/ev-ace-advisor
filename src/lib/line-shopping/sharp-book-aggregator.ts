/**
 * Sharp Book Aggregator - Professional Odds Data Processing  
 * Implements whale strategy insight: Pinnacle and Betfair are the sharpest books
 * When Polymarket offers better value than these, it's a premium opportunity
 */

export interface SharpBookLine {
  bookmaker: string;
  team_name: string;
  implied_probability: number;
  decimal_odds: number;
  is_pinnacle: boolean;
  is_betfair: boolean;
  weight: number; // Higher weight for sharper books
  last_updated: string;
}

export interface LineComparisonResult {
  polymarketBetter: boolean;
  edgeOverSharpest: number;
  sharpestBook: string;
  sharpestProb: number;
  confidence: 'high' | 'medium' | 'low';
  allSharpLines: SharpBookLine[];
}

export interface SharpMovementResult {
  movementDetected: boolean;
  direction: 'shortening' | 'drifting' | null;
  booksConfirming: number;
  avgMovement: number;
  pinnacleMovement?: number;
  betfairMovement?: number;
}

// Sharp book weights based on whale research
const SHARP_BOOK_WEIGHTS = {
  'pinnacle': 3.0,    // Sharpest book - whale research shows this is key
  'betfair': 2.5,     // Exchange with sophisticated players
  'circa': 2.0,       // Sharp Vegas book
  'betonline': 1.8,   // Sharp offshore
  'bookmaker': 1.5,   // Decent sharp book
  'default': 1.0      // Standard book weight
} as const;

export class SharpBookAggregator {
  private oddsApiKey: string;
  private cache: Map<string, SharpBookLine[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();

  constructor(oddsApiKey: string) {
    this.oddsApiKey = oddsApiKey;
  }

  /**
   * Fetch sharp book lines for a sport/event
   */
  async fetchSharpLines(sport: string, eventKey?: string): Promise<SharpBookLine[]> {
    const cacheKey = `${sport}-${eventKey || 'all'}`;
    
    // Check cache first (5 minute expiry)
    if (this.isValidCache(cacheKey)) {
      return this.cache.get(cacheKey) || [];
    }

    try {
      // Map sport codes to Odds API endpoints
      const sportMapping: Record<string, string> = {
        'NHL': 'icehockey_nhl',
        'NBA': 'basketball_nba', 
        'NCAA': 'basketball_ncaab',
        'NFL': 'americanfootball_nfl'
      };

      const oddsApiSport = sportMapping[sport] || sport.toLowerCase();
      const url = `https://api.the-odds-api.com/v4/sports/${oddsApiSport}/odds/?apiKey=${this.oddsApiKey}&markets=h2h&regions=us,uk,eu&oddsFormat=decimal`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`[SHARP-AGGREGATOR] API error: ${response.status} for ${sport}`);
        return [];
      }

      const data = await response.json();
      const sharpLines = this.processOddsData(data);
      
      // Cache for 5 minutes
      this.cache.set(cacheKey, sharpLines);
      this.cacheExpiry.set(cacheKey, Date.now() + 5 * 60 * 1000);
      
      console.log(`[SHARP-AGGREGATOR] Fetched ${sharpLines.length} sharp lines for ${sport}`);
      return sharpLines;
      
    } catch (error) {
      console.error('[SHARP-AGGREGATOR] Fetch error:', error);
      return [];
    }
  }

  /**
   * Compare Polymarket price to sharp books
   * Returns whether Polymarket offers better value than sharpest books
   */
  async compareToSharpBooks(
    polymarketPrice: number,
    teamName: string,
    sharpLines: SharpBookLine[]
  ): Promise<LineComparisonResult> {
    
    // Filter lines for this team
    const teamLines = sharpLines.filter(line => 
      this.teamNamesMatch(line.team_name, teamName)
    );

    if (teamLines.length === 0) {
      return {
        polymarketBetter: false,
        edgeOverSharpest: 0,
        sharpestBook: 'none',
        sharpestProb: 0,
        confidence: 'low',
        allSharpLines: []
      };
    }

    // Find the sharpest book's price (highest probability = lowest odds = sharpest)
    const sharpestLine = teamLines.reduce((sharpest, current) => {
      const sharpestWeight = this.getBookWeight(sharpest.bookmaker);
      const currentWeight = this.getBookWeight(current.bookmaker);
      
      // If weights are equal, use higher probability (sharper price)
      if (currentWeight > sharpestWeight) {
        return current;
      } else if (currentWeight === sharpestWeight && current.implied_probability > sharpest.implied_probability) {
        return current;
      }
      return sharpest;
    });

    const edgeOverSharpest = sharpestLine.implied_probability - polymarketPrice;
    const polymarketBetter = edgeOverSharpest > 0.02; // Must beat by at least 2%

    // Calculate confidence based on consensus
    let confidence: 'high' | 'medium' | 'low' = 'low';
    const pinnacleConfirms = teamLines.some(line => 
      line.bookmaker.toLowerCase() === 'pinnacle' && 
      (line.implied_probability - polymarketPrice) > 0.02
    );
    const betfairConfirms = teamLines.some(line => 
      line.bookmaker.toLowerCase() === 'betfair' && 
      (line.implied_probability - polymarketPrice) > 0.02
    );

    if (pinnacleConfirms && betfairConfirms) {
      confidence = 'high';
    } else if (pinnacleConfirms || betfairConfirms) {
      confidence = 'medium';
    }

    return {
      polymarketBetter,
      edgeOverSharpest,
      sharpestBook: sharpestLine.bookmaker,
      sharpestProb: sharpestLine.implied_probability,
      confidence,
      allSharpLines: teamLines
    };
  }

  /**
   * Get sharp book consensus probability for a team
   */
  getSharpConsensusProb(teamName: string, sharpLines: SharpBookLine[]): number {
    const teamLines = sharpLines.filter(line => 
      this.teamNamesMatch(line.team_name, teamName)
    );

    if (teamLines.length === 0) return 0;

    // Weight by book sharpness
    let totalWeight = 0;
    let weightedSum = 0;

    for (const line of teamLines) {
      const weight = this.getBookWeight(line.bookmaker);
      weightedSum += line.implied_probability * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Detect sharp money movement between current and previous lines
   */
  detectSharpMovement(
    currentLines: SharpBookLine[],
    previousLines: SharpBookLine[],
    teamName: string,
    threshold: number = 0.03 // 3% movement threshold
  ): SharpMovementResult {
    
    const currentTeamLines = currentLines.filter(line => 
      this.teamNamesMatch(line.team_name, teamName)
    );
    const previousTeamLines = previousLines.filter(line => 
      this.teamNamesMatch(line.team_name, teamName)
    );

    if (currentTeamLines.length === 0 || previousTeamLines.length === 0) {
      return {
        movementDetected: false,
        direction: null,
        booksConfirming: 0,
        avgMovement: 0
      };
    }

    const movements: number[] = [];
    let pinnacleMovement: number | undefined;
    let betfairMovement: number | undefined;

    // Compare each current line to its previous value
    for (const currentLine of currentTeamLines) {
      const previousLine = previousTeamLines.find(prev => 
        prev.bookmaker === currentLine.bookmaker
      );

      if (previousLine) {
        const movement = currentLine.implied_probability - previousLine.implied_probability;
        
        if (Math.abs(movement) >= threshold) {
          movements.push(movement);
          
          if (currentLine.bookmaker.toLowerCase() === 'pinnacle') {
            pinnacleMovement = movement;
          } else if (currentLine.bookmaker.toLowerCase() === 'betfair') {
            betfairMovement = movement;
          }
        }
      }
    }

    if (movements.length < 2) {
      return {
        movementDetected: false,
        direction: null,
        booksConfirming: movements.length,
        avgMovement: movements.length > 0 ? Math.abs(movements[0]) : 0,
        pinnacleMovement,
        betfairMovement
      };
    }

    // Check if movements are in same direction
    const avgMovement = movements.reduce((sum, m) => sum + m, 0) / movements.length;
    const sameDirection = movements.every(m => Math.sign(m) === Math.sign(avgMovement));

    return {
      movementDetected: sameDirection && Math.abs(avgMovement) >= threshold,
      direction: avgMovement > 0 ? 'shortening' : 'drifting',
      booksConfirming: movements.length,
      avgMovement: Math.abs(avgMovement),
      pinnacleMovement,
      betfairMovement
    };
  }

  /**
   * Process raw odds API data into sharp book lines
   */
  private processOddsData(data: any[]): SharpBookLine[] {
    const lines: SharpBookLine[] = [];

    for (const game of data) {
      const eventName = `${game.home_team} vs ${game.away_team}`;
      
      for (const bookmaker of game.bookmakers || []) {
        // Only process sharp books
        if (!this.isSharpBook(bookmaker.key)) continue;
        
        const h2hMarket = bookmaker.markets?.find((m: any) => m.key === 'h2h');
        if (!h2hMarket?.outcomes) continue;

        // Filter out Draw outcomes for 2-way markets
        const outcomes = h2hMarket.outcomes.filter((o: any) => {
          const name = (o.name || '').toLowerCase();
          return !name.includes('draw') && name !== 'tie';
        });

        for (const outcome of outcomes) {
          if (outcome.price && outcome.price > 1) {
            lines.push({
              bookmaker: bookmaker.key,
              team_name: outcome.name,
              implied_probability: 1 / outcome.price,
              decimal_odds: outcome.price,
              is_pinnacle: bookmaker.key.toLowerCase() === 'pinnacle',
              is_betfair: bookmaker.key.toLowerCase() === 'betfair',
              weight: this.getBookWeight(bookmaker.key),
              last_updated: new Date().toISOString()
            });
          }
        }
      }
    }

    return lines;
  }

  /**
   * Check if a bookmaker is considered "sharp"
   */
  private isSharpBook(bookmakerKey: string): boolean {
    const sharpBooks = ['pinnacle', 'betfair', 'betfair_ex_eu', 'circa', 'betonline', 'bookmaker'];
    return sharpBooks.includes(bookmakerKey.toLowerCase());
  }

  /**
   * Get weight for a bookmaker based on sharpness
   */
  private getBookWeight(bookmakerKey: string): number {
    const key = bookmakerKey.toLowerCase();
    return SHARP_BOOK_WEIGHTS[key as keyof typeof SHARP_BOOK_WEIGHTS] || SHARP_BOOK_WEIGHTS.default;
  }

  /**
   * Check if two team names match (handles variations)
   */
  private teamNamesMatch(name1: string, name2: string): boolean {
    const normalize = (name: string) => 
      name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const norm1 = normalize(name1);
    const norm2 = normalize(name2);

    // Exact match
    if (norm1 === norm2) return true;

    // Check if last words match (team nicknames)
    const words1 = norm1.split(' ').filter(w => w.length > 2);
    const words2 = norm2.split(' ').filter(w => w.length > 2);
    
    if (words1.length > 0 && words2.length > 0) {
      const nickname1 = words1[words1.length - 1];
      const nickname2 = words2[words2.length - 1];
      
      return nickname1 === nickname2;
    }

    return false;
  }

  /**
   * Check if cached data is still valid
   */
  private isValidCache(cacheKey: string): boolean {
    const expiry = this.cacheExpiry.get(cacheKey);
    return expiry !== undefined && Date.now() < expiry;
  }
}

export default SharpBookAggregator;