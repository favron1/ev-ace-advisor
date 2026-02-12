/**
 * Sharp Book Aggregator - Cross-Platform Line Shopping
 * Implements whale strategy: compare Polymarket odds against sharp sportsbooks
 * When Polymarket offers better value than Pinnacle/Circa, signal high-confidence edge
 */

export interface SharpBookLine {
  bookmaker: 'pinnacle' | 'circa' | 'betcris' | 'betfair';
  sport: string;
  event_key: string;
  home_team: string;
  away_team: string;
  outcome: string; // team name for H2H
  decimal_odds: number;
  implied_probability: number;
  market_type: 'h2h' | 'spread' | 'total';
  timestamp: string;
  ligne?: number; // spread line for spread markets
}

export interface LineComparisonResult {
  polymarketBetter: boolean;
  edgeOverSharpest: number;
  sharpestBook: string;
  sharpestOdds: number;
  sharpestImpliedProb: number;
  allSharpLines: SharpBookLine[];
  confidence: 'high' | 'medium' | 'low';
}

// Sharp book reliability weights (higher = more trusted)
const SHARP_BOOK_WEIGHTS = {
  'pinnacle': 1.0,    // Gold standard
  'betfair': 0.95,    // Exchange, very efficient
  'circa': 0.9,       // Sharp US book
  'betcris': 0.85     // Regional sharp
} as const;

// Minimum edge over sharpest book to signal advantage
const MIN_SHARP_EDGE = 0.03; // 3%

export class SharpBookAggregator {
  private apiKey: string;
  private baseUrl: string = 'https://api.the-odds-api.com/v4';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch lines from multiple sharp books for comparison
   */
  async fetchSharpLines(
    sport: string, 
    eventKey: string
  ): Promise<SharpBookLine[]> {
    const sharpBooks = ['pinnacle', 'betfair', 'circa', 'betcris'];
    const lines: SharpBookLine[] = [];

    try {
      const url = `${this.baseUrl}/sports/${sport}/odds/?apiKey=${this.apiKey}&markets=h2h&bookmakers=${sharpBooks.join(',')}&regions=us,uk,eu&oddsFormat=decimal`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Sharp book API error: ${response.status}`);
        return [];
      }

      const events = await response.json();
      
      for (const event of events) {
        if (event.id !== eventKey && !event.sport_title?.includes(eventKey)) continue;

        for (const bookmaker of event.bookmakers || []) {
          const bookName = bookmaker.key.toLowerCase();
          
          // Only process sharp books
          if (!sharpBooks.includes(bookName)) continue;

          const h2hMarket = bookmaker.markets?.find((m: any) => m.key === 'h2h');
          if (!h2hMarket?.outcomes) continue;

          // Filter out draws for 2-way comparison
          const outcomes = h2hMarket.outcomes.filter((o: any) => {
            const name = (o.name || '').toLowerCase();
            return !name.includes('draw') && name !== 'tie';
          });

          for (const outcome of outcomes) {
            if (!outcome.price || outcome.price <= 1) continue;

            lines.push({
              bookmaker: bookName as any,
              sport,
              event_key: eventKey,
              home_team: event.home_team,
              away_team: event.away_team,
              outcome: outcome.name,
              decimal_odds: outcome.price,
              implied_probability: 1 / outcome.price,
              market_type: 'h2h',
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      console.log(`[SHARP-BOOKS] Fetched ${lines.length} lines for ${eventKey}`);
      return lines;
    } catch (error) {
      console.error('[SHARP-BOOKS] Fetch error:', error);
      return [];
    }
  }

  /**
   * Compare Polymarket price against sharp book consensus
   * Returns true if Polymarket offers better value than the sharpest book
   */
  async compareToSharpBooks(
    polyPrice: number,
    teamName: string,
    sharpLines: SharpBookLine[]
  ): Promise<LineComparisonResult> {
    // Filter sharp lines for the specific team
    const relevantLines = sharpLines.filter(line => 
      this.normalizeTeamName(line.outcome) === this.normalizeTeamName(teamName)
    );

    if (relevantLines.length === 0) {
      return {
        polymarketBetter: false,
        edgeOverSharpest: 0,
        sharpestBook: '',
        sharpestOdds: 0,
        sharpestImpliedProb: 0,
        allSharpLines: [],
        confidence: 'low'
      };
    }

    // Calculate weighted consensus of sharp books
    let totalWeight = 0;
    let weightedProb = 0;
    let sharpestProb = 0;
    let sharpestBook = '';

    for (const line of relevantLines) {
      const weight = SHARP_BOOK_WEIGHTS[line.bookmaker] || 0.5;
      const impliedProb = line.implied_probability;

      // Remove vig by assuming 2-way market
      const vigAdjustment = 1.05; // Assume 5% total vig
      const fairProb = impliedProb / vigAdjustment;

      weightedProb += fairProb * weight;
      totalWeight += weight;

      // Track sharpest (most efficient) book
      if (fairProb > sharpestProb || sharpestBook === '') {
        sharpestProb = fairProb;
        sharpestBook = line.bookmaker;
      }
    }

    const consensusProb = totalWeight > 0 ? weightedProb / totalWeight : 0;
    const polyImpliedProb = polyPrice; // Polymarket price is already implied probability

    // Calculate edge: what we get on Polymarket vs what sharp books think it's worth
    const edgeOverConsensus = polyImpliedProb - consensusProb;
    const edgeOverSharpest = polyImpliedProb - sharpestProb;

    // Determine if Polymarket is offering better value
    const polymarketBetter = edgeOverSharpest > MIN_SHARP_EDGE;

    // Confidence based on number of confirming books and edge size
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (relevantLines.length >= 3 && edgeOverSharpest > 0.05) {
      confidence = 'high';
    } else if (relevantLines.length >= 2 && edgeOverSharpest > 0.03) {
      confidence = 'medium';
    }

    console.log(`[LINE-SHOPPING] ${teamName}: Poly=${(polyImpliedProb*100).toFixed(1)}% vs Sharp=${(consensusProb*100).toFixed(1)}% (edge: ${(edgeOverSharpest*100).toFixed(1)}%)`);

    return {
      polymarketBetter,
      edgeOverSharpest,
      sharpestBook,
      sharpestOdds: sharpestProb > 0 ? 1/sharpestProb : 0,
      sharpestImpliedProb: sharpestProb,
      allSharpLines: relevantLines,
      confidence
    };
  }

  /**
   * Normalize team names for matching
   */
  private normalizeTeamName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if sharp book data is fresh enough to use
   */
  private isDataFresh(timestamp: string): boolean {
    const age = Date.now() - new Date(timestamp).getTime();
    return age < 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get consensus fair probability from multiple sharp books
   */
  getSharpConsensusProb(teamName: string, sharpLines: SharpBookLine[]): number {
    const relevantLines = sharpLines
      .filter(line => this.normalizeTeamName(line.outcome) === this.normalizeTeamName(teamName))
      .filter(line => this.isDataFresh(line.timestamp));

    if (relevantLines.length === 0) return 0;

    let totalWeight = 0;
    let weightedProb = 0;

    for (const line of relevantLines) {
      const weight = SHARP_BOOK_WEIGHTS[line.bookmaker] || 0.5;
      const vigAdjustedProb = line.implied_probability * 0.95; // Approximate vig removal
      
      weightedProb += vigAdjustedProb * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedProb / totalWeight : 0;
  }

  /**
   * Detect when sharp books are moving in same direction (whale strategy insight)
   */
  detectSharpMovement(
    currentLines: SharpBookLine[],
    previousLines: SharpBookLine[],
    teamName: string
  ): {
    movementDetected: boolean;
    direction: 'shortening' | 'drifting' | null;
    booksConfirming: number;
    avgMovement: number;
  } {
    const normalizedTeam = this.normalizeTeamName(teamName);
    
    const currentRelevant = currentLines.filter(l => 
      this.normalizeTeamName(l.outcome) === normalizedTeam
    );
    const previousRelevant = previousLines.filter(l => 
      this.normalizeTeamName(l.outcome) === normalizedTeam
    );

    const movements: Array<{book: string, change: number, direction: number}> = [];

    for (const currentLine of currentRelevant) {
      const previousLine = previousRelevant.find(p => 
        p.bookmaker === currentLine.bookmaker
      );

      if (!previousLine) continue;

      const probChange = currentLine.implied_probability - previousLine.implied_probability;
      
      // Significant movement threshold (2%+ probability change)
      if (Math.abs(probChange) >= 0.02) {
        movements.push({
          book: currentLine.bookmaker,
          change: probChange,
          direction: Math.sign(probChange)
        });
      }
    }

    if (movements.length < 2) {
      return {
        movementDetected: false,
        direction: null,
        booksConfirming: 0,
        avgMovement: 0
      };
    }

    // Check if movement is coordinated (same direction)
    const primaryDirection = movements[0].direction;
    const confirming = movements.filter(m => m.direction === primaryDirection);

    if (confirming.length >= 2) {
      const avgMovement = confirming.reduce((sum, m) => sum + Math.abs(m.change), 0) / confirming.length;
      
      return {
        movementDetected: true,
        direction: primaryDirection > 0 ? 'shortening' : 'drifting',
        booksConfirming: confirming.length,
        avgMovement
      };
    }

    return {
      movementDetected: false,
      direction: null,
      booksConfirming: 0,
      avgMovement: 0
    };
  }
}

export default SharpBookAggregator;