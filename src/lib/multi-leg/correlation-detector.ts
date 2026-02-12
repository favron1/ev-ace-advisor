/**
 * Correlation Detector - Multi-Leg Opportunity Detection
 * Implements whale strategy: stack correlated positions on same event for amplified returns
 * Based on kch123's Super Bowl strategy: Spread + ML + Futures all on same team
 */

export interface LegDetails {
  signal_id: string;
  condition_id: string;
  market_type: 'h2h' | 'spread' | 'total' | 'futures';
  outcome: string; // Team name
  side: 'YES' | 'NO';
  polymarket_price: number;
  fair_probability: number;
  individual_edge: number;
  stake_recommended: number;
  line?: number; // For spread markets (e.g., -4.5)
  total?: number; // For total markets (e.g., 215.5)
}

export interface CorrelatedOpportunity {
  event_name: string;
  primary_team: string; // The team we're backing across multiple legs
  legs: LegDetails[];
  correlation_coefficient: number; // How correlated the outcomes are (0-1)
  combined_edge: number; // Expected edge of the combination
  combined_probability: number; // Probability all legs hit
  max_loss: number; // Worst case scenario
  expected_value: number; // Expected dollar return
  kelly_fraction: number; // Recommended % of bankroll
  risk_tier: 'conservative' | 'moderate' | 'aggressive';
  correlation_type: 'perfect' | 'high' | 'medium' | 'low';
}

export interface MultiLegSignal {
  id: string;
  event_name: string;
  legs: LegDetails[];
  total_stake_recommended: number;
  combined_edge: number;
  expected_payout: number;
  correlation_risk_adjusted: number;
  confidence_score: number;
  whale_pattern_match: string; // e.g., 'kch123_super_bowl_stack'
}

// Correlation coefficients between market types (based on historical data)
const CORRELATION_MATRIX = {
  'h2h': {
    'h2h': 1.0,      // Perfect correlation with itself
    'spread': 0.85,   // High correlation - if team wins, likely covers spread
    'total': 0.15,    // Low correlation - total points independent of winner
    'futures': 0.90   // Very high correlation - team win helps future odds
  },
  'spread': {
    'h2h': 0.85,
    'spread': 1.0,
    'total': 0.20,
    'futures': 0.75
  },
  'total': {
    'h2h': 0.15,
    'spread': 0.20,
    'total': 1.0,
    'futures': 0.10
  },
  'futures': {
    'h2h': 0.90,
    'spread': 0.75,
    'total': 0.10,
    'futures': 1.0
  }
} as const;

// Whale patterns observed in research
const WHALE_PATTERNS = {
  'kch123_super_bowl_stack': {
    markets: ['spread', 'h2h', 'futures'],
    same_team: true,
    min_edge_each: 0.03,
    description: 'Spread + ML + Futures on same team (kch123\'s $1.8M day pattern)'
  },
  'heavy_favorite_stack': {
    markets: ['h2h', 'spread'],
    same_team: true,
    min_probability: 0.70,
    description: 'Stack H2H + Spread on heavy favorite'
  },
  'contrarian_value_stack': {
    markets: ['h2h', 'futures'],
    same_team: true,
    max_probability: 0.40,
    min_edge_each: 0.08,
    description: 'Underdog ML + futures stack when high edge'
  }
} as const;

export class CorrelationDetector {
  
  /**
   * Detect correlated opportunities from active signals
   * Groups by event and finds multiple +EV legs on same team
   */
  async detectCorrelatedLegs(signals: any[]): Promise<CorrelatedOpportunity[]> {
    const opportunities: CorrelatedOpportunity[] = [];
    
    // Group signals by event
    const eventGroups = this.groupSignalsByEvent(signals);
    
    for (const [eventName, eventSignals] of Object.entries(eventGroups)) {
      if (eventSignals.length < 2) continue; // Need at least 2 legs
      
      // Group by team within the event
      const teamGroups = this.groupSignalsByTeam(eventSignals);
      
      for (const [teamName, teamSignals] of Object.entries(teamGroups)) {
        if (teamSignals.length < 2) continue;
        
        const opportunity = await this.analyzeCorrelatedOpportunity(
          eventName,
          teamName,
          teamSignals
        );
        
        if (opportunity && this.meetsCombinationThresholds(opportunity)) {
          opportunities.push(opportunity);
        }
      }
    }
    
    return opportunities.sort((a, b) => b.combined_edge - a.combined_edge);
  }

  /**
   * Analyze a potential correlated opportunity for a team
   */
  private async analyzeCorrelatedOpportunity(
    eventName: string,
    teamName: string,
    signals: any[]
  ): Promise<CorrelatedOpportunity | null> {
    // Convert signals to leg details
    const legs: LegDetails[] = signals.map(signal => ({
      signal_id: signal.id,
      condition_id: signal.polymarket_condition_id || '',
      market_type: this.inferMarketType(signal),
      outcome: teamName,
      side: signal.side,
      polymarket_price: signal.polymarket_price,
      fair_probability: signal.bookmaker_probability,
      individual_edge: signal.edge_percent / 100,
      stake_recommended: signal.recommended_stake || 100,
      line: signal.spread_line,
      total: signal.total_line
    }));

    // Calculate correlation coefficient
    const correlationCoeff = this.calculateAverageCorrelation(legs);
    
    // Calculate combined probability (accounting for correlation)
    const combinedProb = this.calculateCombinedProbability(legs, correlationCoeff);
    
    // Calculate combined edge (risk-adjusted for correlation)
    const combinedEdge = this.calculateCombinedEdge(legs, correlationCoeff);
    
    // Calculate risk metrics
    const maxLoss = legs.reduce((sum, leg) => sum + leg.stake_recommended, 0);
    const expectedValue = maxLoss * combinedEdge;
    
    // Kelly fraction calculation (conservative for correlated bets)
    const kellyFraction = this.calculateCorrelatedKelly(legs, correlationCoeff);
    
    // Determine risk tier
    const riskTier = this.determineRiskTier(correlationCoeff, combinedEdge, legs.length);
    
    // Classify correlation strength
    const correlationType = this.classifyCorrelationType(correlationCoeff);

    return {
      event_name: eventName,
      primary_team: teamName,
      legs,
      correlation_coefficient: correlationCoeff,
      combined_edge: combinedEdge,
      combined_probability: combinedProb,
      max_loss: maxLoss,
      expected_value: expectedValue,
      kelly_fraction: kellyFraction,
      risk_tier: riskTier,
      correlation_type: correlationType
    };
  }

  /**
   * Calculate average correlation between all leg pairs
   */
  private calculateAverageCorrelation(legs: LegDetails[]): number {
    if (legs.length < 2) return 0;
    
    let totalCorr = 0;
    let pairCount = 0;
    
    for (let i = 0; i < legs.length; i++) {
      for (let j = i + 1; j < legs.length; j++) {
        const corr = CORRELATION_MATRIX[legs[i].market_type]?.[legs[j].market_type] || 0.5;
        totalCorr += corr;
        pairCount++;
      }
    }
    
    return pairCount > 0 ? totalCorr / pairCount : 0;
  }

  /**
   * Calculate combined probability accounting for correlation
   * Higher correlation = lower combined probability than independent events
   */
  private calculateCombinedProbability(legs: LegDetails[], correlation: number): number {
    if (legs.length === 1) return legs[0].fair_probability;
    
    // For independent events: P(A and B) = P(A) * P(B)
    // For correlated events: adjust using correlation coefficient
    const independentProb = legs.reduce((prob, leg) => prob * leg.fair_probability, 1);
    
    // Correlation adjustment factor (higher correlation = higher combined probability)
    const correlationAdjustment = 1 + (correlation - 0.5) * 0.3;
    
    return Math.min(0.95, independentProb * correlationAdjustment);
  }

  /**
   * Calculate combined edge with correlation risk adjustment
   */
  private calculateCombinedEdge(legs: LegDetails[], correlation: number): number {
    // Base combined edge (sum of individual edges)
    const baseCombinedEdge = legs.reduce((sum, leg) => sum + leg.individual_edge, 0);
    
    // Correlation penalty: high correlation reduces diversification benefit
    const correlationPenalty = correlation * 0.15; // Reduce edge by up to 15% for perfect correlation
    
    // Complexity penalty: more legs = more things that can go wrong
    const complexityPenalty = (legs.length - 1) * 0.02; // 2% penalty per additional leg
    
    const adjustedEdge = baseCombinedEdge - correlationPenalty - complexityPenalty;
    
    return Math.max(0, adjustedEdge);
  }

  /**
   * Calculate Kelly fraction for correlated bets (more conservative)
   */
  private calculateCorrelatedKelly(legs: LegDetails[], correlation: number): number {
    const combinedProb = this.calculateCombinedProbability(legs, correlation);
    const combinedEdge = this.calculateCombinedEdge(legs, correlation);
    
    if (combinedProb <= 0 || combinedEdge <= 0) return 0;
    
    // Simplified Kelly for multi-leg: f = edge / variance
    const baseKelly = combinedEdge / (1 - combinedProb);
    
    // Correlation adjustment: high correlation = higher risk = lower Kelly
    const correlationAdjustment = 1 - (correlation * 0.4);
    
    // Multi-leg complexity adjustment
    const complexityAdjustment = 1 / Math.sqrt(legs.length);
    
    const adjustedKelly = baseKelly * correlationAdjustment * complexityAdjustment;
    
    // Cap at 8% for multi-leg bets (vs 12% for single bets)
    return Math.min(0.08, Math.max(0.01, adjustedKelly));
  }

  /**
   * Determine risk tier based on correlation and edge
   */
  private determineRiskTier(correlation: number, combinedEdge: number, legCount: number): 'conservative' | 'moderate' | 'aggressive' {
    if (correlation > 0.8 && legCount >= 3) return 'aggressive';
    if (correlation > 0.6 && combinedEdge > 0.08) return 'moderate';
    return 'conservative';
  }

  /**
   * Classify correlation strength
   */
  private classifyCorrelationType(correlation: number): 'perfect' | 'high' | 'medium' | 'low' {
    if (correlation >= 0.9) return 'perfect';
    if (correlation >= 0.7) return 'high';
    if (correlation >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Check if opportunity meets minimum thresholds
   */
  private meetsCombinationThresholds(opportunity: CorrelatedOpportunity): boolean {
    // Minimum combined edge threshold
    if (opportunity.combined_edge < 0.05) return false; // 5% minimum
    
    // Minimum individual leg edge (avoid including weak signals)
    const minIndividualEdge = Math.min(...opportunity.legs.map(leg => leg.individual_edge));
    if (minIndividualEdge < 0.02) return false; // 2% minimum per leg
    
    // Maximum risk per opportunity
    if (opportunity.max_loss > 5000) return false; // $5K maximum exposure
    
    // Kelly fraction check
    if (opportunity.kelly_fraction < 0.01) return false; // Below 1% not worth it
    
    return true;
  }

  /**
   * Detect specific whale patterns in the legs
   */
  detectWhalePattern(legs: LegDetails[]): string | null {
    const marketTypes = legs.map(leg => leg.market_type).sort();
    const sameTeam = new Set(legs.map(leg => leg.outcome)).size === 1;
    
    // kch123's Super Bowl stack pattern
    if (sameTeam && marketTypes.includes('spread') && marketTypes.includes('h2h')) {
      const minEdge = Math.min(...legs.map(leg => leg.individual_edge));
      if (minEdge >= 0.03) {
        return 'kch123_super_bowl_stack';
      }
    }
    
    // Heavy favorite stack
    if (sameTeam && marketTypes.includes('h2h') && marketTypes.includes('spread')) {
      const avgProb = legs.reduce((sum, leg) => sum + leg.fair_probability, 0) / legs.length;
      if (avgProb >= 0.70) {
        return 'heavy_favorite_stack';
      }
    }
    
    // Contrarian value stack
    if (sameTeam && marketTypes.includes('h2h') && marketTypes.includes('futures')) {
      const avgProb = legs.reduce((sum, leg) => sum + leg.fair_probability, 0) / legs.length;
      const minEdge = Math.min(...legs.map(leg => leg.individual_edge));
      if (avgProb <= 0.40 && minEdge >= 0.08) {
        return 'contrarian_value_stack';
      }
    }
    
    return null;
  }

  /**
   * Helper methods
   */
  private groupSignalsByEvent(signals: any[]): Record<string, any[]> {
    return signals.reduce((groups, signal) => {
      const eventName = signal.event_name;
      if (!groups[eventName]) groups[eventName] = [];
      groups[eventName].push(signal);
      return groups;
    }, {});
  }

  private groupSignalsByTeam(signals: any[]): Record<string, any[]> {
    return signals.reduce((groups, signal) => {
      const teamName = signal.recommended_outcome || signal.outcome || 'Unknown';
      if (!groups[teamName]) groups[teamName] = [];
      groups[teamName].push(signal);
      return groups;
    }, {});
  }

  private inferMarketType(signal: any): 'h2h' | 'spread' | 'total' | 'futures' {
    const question = (signal.polymarket_question || '').toLowerCase();
    
    if (question.includes('championship') || question.includes('winner') || question.includes('mvp')) {
      return 'futures';
    }
    if (question.includes('over') || question.includes('under') || question.includes('total')) {
      return 'total';
    }
    if (question.includes('spread') || question.includes('cover') || /[+-]\d+\.?\d*/.test(question)) {
      return 'spread';
    }
    
    return 'h2h'; // Default
  }

  /**
   * Generate user-friendly description of the combination
   */
  generateCombinationDescription(opportunity: CorrelatedOpportunity): string {
    const team = opportunity.primary_team;
    const legDescriptions = opportunity.legs.map(leg => {
      switch (leg.market_type) {
        case 'h2h': return `${team} to win`;
        case 'spread': return `${team} ${leg.line ? (leg.line > 0 ? `+${leg.line}` : leg.line) : 'spread'}`;
        case 'total': return leg.side === 'YES' ? `Over ${leg.total}` : `Under ${leg.total}`;
        case 'futures': return `${team} future`;
        default: return leg.outcome;
      }
    });
    
    const pattern = this.detectWhalePattern(opportunity.legs);
    const patternNote = pattern ? ` (${WHALE_PATTERNS[pattern as keyof typeof WHALE_PATTERNS]?.description})` : '';
    
    return `${legDescriptions.join(' + ')}${patternNote}`;
  }
}

export default CorrelationDetector;