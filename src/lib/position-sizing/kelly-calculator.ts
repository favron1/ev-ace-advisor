/**
 * Kelly Criterion Calculator - Optimal Position Sizing
 * Implements whale strategy insight: size positions for maximum growth rate
 * Based on research showing whales achieve superior returns through proper sizing, not just prediction accuracy
 */

export interface KellyResult {
  recommended_fraction: number; // % of bankroll (0-1)
  recommended_amount: number;   // $ amount
  max_loss: number;            // worst case loss
  expected_value: number;      // expected $ return
  growth_rate: number;         // expected bankroll growth rate per bet
  risk_of_ruin: number;        // probability of losing 50%+ of bankroll
  kelly_fraction_raw: number;  // Raw Kelly before safety adjustments
  safety_adjustments: string[]; // List of applied safety measures
}

export interface PositionSizingInput {
  win_probability: number;     // Fair probability of winning
  win_odds: number;           // Payout odds if win (e.g., 2.5 for +150)
  lose_odds: number;          // Loss amount if lose (usually 1.0)
  bankroll: number;           // Current bankroll in dollars
  edge: number;               // Expected edge (win_prob * win_odds - lose_prob * lose_odds)
  market_type?: 'h2h' | 'spread' | 'total' | 'futures'; // Market type for risk adjustment
  correlation_factor?: number; // 0-1, reduces size for correlated bets
  confidence_level?: number;   // 0-100, adjusts for uncertainty in edge estimate
  max_risk_per_bet?: number;   // Maximum % of bankroll to risk on single bet
}

export interface PortfolioSizing {
  total_recommended: number;   // Total $ across all positions
  individual_positions: Array<{
    signal_id: string;
    recommended_amount: number;
    kelly_fraction: number;
    risk_contribution: number;
  }>;
  portfolio_kelly: number;     // Effective Kelly for entire portfolio
  max_drawdown_estimate: number; // Expected worst-case scenario
  diversification_benefit: number; // Reduction in risk from multiple positions
}

// Kelly safety constants based on whale research and academic studies
const KELLY_SAFETY = {
  MAX_SINGLE_BET: 0.08,        // Never risk more than 8% on single bet
  MAX_CORRELATED_EXPOSURE: 0.15, // Max 15% in correlated positions  
  MIN_BANKROLL: 1000,          // Minimum bankroll for Kelly sizing
  CONFIDENCE_MULTIPLIER: 0.01,  // Reduce size by 1% for each point of confidence below 100
  MARKET_RISK_ADJUSTMENTS: {
    'h2h': 1.0,      // Base case
    'spread': 1.1,   // Slightly more predictable
    'total': 0.9,    // More random/harder to predict
    'futures': 0.8   // Long-term uncertainty
  },
  FRACTIONAL_KELLY: 0.5,       // Use half-Kelly for safety (common practice)
  MIN_EDGE_FOR_KELLY: 0.02     // Minimum 2% edge required for Kelly sizing
} as const;

export class KellyCalculator {
  
  /**
   * Calculate optimal position size using Kelly Criterion
   * Incorporates multiple safety adjustments based on whale research
   */
  calculateKellyPosition(input: PositionSizingInput): KellyResult {
    const {
      win_probability: p,
      win_odds: b,
      lose_odds: a = 1.0,
      bankroll,
      edge,
      market_type = 'h2h',
      correlation_factor = 0,
      confidence_level = 85,
      max_risk_per_bet = KELLY_SAFETY.MAX_SINGLE_BET
    } = input;

    const safetyAdjustments: string[] = [];

    // Validate inputs
    if (p <= 0 || p >= 1) {
      throw new Error('Win probability must be between 0 and 1');
    }
    
    if (bankroll < KELLY_SAFETY.MIN_BANKROLL) {
      throw new Error(`Minimum bankroll is $${KELLY_SAFETY.MIN_BANKROLL}`);
    }
    
    if (edge < KELLY_SAFETY.MIN_EDGE_FOR_KELLY) {
      return this.createZeroResult(bankroll, 'Edge too small for Kelly sizing');
    }

    // Raw Kelly calculation: f = (bp - q) / b
    // where f = fraction of bankroll, b = odds received, p = win prob, q = lose prob
    const q = 1 - p;
    const rawKelly = (b * p - q) / b;

    if (rawKelly <= 0) {
      return this.createZeroResult(bankroll, 'Negative expected value');
    }

    // Apply safety adjustments
    let adjustedKelly = rawKelly;
    
    // 1. Fractional Kelly (most important adjustment)
    adjustedKelly *= KELLY_SAFETY.FRACTIONAL_KELLY;
    safetyAdjustments.push(`Half-Kelly (-${((1-KELLY_SAFETY.FRACTIONAL_KELLY)*100).toFixed(0)}%)`);

    // 2. Confidence adjustment
    if (confidence_level < 100) {
      const confidenceAdjustment = 1 - (100 - confidence_level) * KELLY_SAFETY.CONFIDENCE_MULTIPLIER;
      adjustedKelly *= confidenceAdjustment;
      safetyAdjustments.push(`Confidence (-${((1-confidenceAdjustment)*100).toFixed(1)}%)`);
    }

    // 3. Market type adjustment
    const marketAdjustment = KELLY_SAFETY.MARKET_RISK_ADJUSTMENTS[market_type];
    adjustedKelly *= marketAdjustment;
    if (marketAdjustment !== 1.0) {
      const adjPct = ((marketAdjustment - 1) * 100).toFixed(1);
      safetyAdjustments.push(`${market_type} market (${adjPct > '0' ? '+' : ''}${adjPct}%)`);
    }

    // 4. Correlation adjustment (reduces size for correlated bets)
    if (correlation_factor > 0) {
      const correlationAdjustment = 1 - (correlation_factor * 0.4); // Up to 40% reduction
      adjustedKelly *= correlationAdjustment;
      safetyAdjustments.push(`Correlation (-${((1-correlationAdjustment)*100).toFixed(1)}%)`);
    }

    // 5. Hard cap at maximum risk per bet
    if (adjustedKelly > max_risk_per_bet) {
      adjustedKelly = max_risk_per_bet;
      safetyAdjustments.push(`Hard cap (${(max_risk_per_bet*100).toFixed(0)}% max)`);
    }

    // Calculate derived metrics
    const recommendedAmount = bankroll * adjustedKelly;
    const maxLoss = recommendedAmount; // Worst case: lose entire bet
    const expectedValue = recommendedAmount * edge;
    
    // Growth rate calculation: g = p * log(1 + f*b) + q * log(1 - f*a)
    const growthRate = p * Math.log(1 + adjustedKelly * b) + q * Math.log(1 - adjustedKelly * a);
    
    // Risk of ruin approximation (simplified)
    const riskOfRuin = this.calculateRiskOfRuin(adjustedKelly, p, b, a);

    return {
      recommended_fraction: adjustedKelly,
      recommended_amount: Math.round(recommendedAmount),
      max_loss: Math.round(maxLoss),
      expected_value: Math.round(expectedValue),
      growth_rate: growthRate,
      risk_of_ruin: riskOfRuin,
      kelly_fraction_raw: rawKelly,
      safety_adjustments: safetyAdjustments
    };
  }

  /**
   * Calculate portfolio-level position sizing
   * Accounts for correlation between multiple positions
   */
  calculatePortfolioSizing(
    positions: Array<PositionSizingInput & { signal_id: string }>,
    bankroll: number
  ): PortfolioSizing {
    const individualResults = positions.map(pos => ({
      signal_id: pos.signal_id,
      kelly_result: this.calculateKellyPosition(pos)
    }));

    // Calculate total recommended before correlation adjustment
    const totalRecommended = individualResults.reduce((sum, result) => 
      sum + result.kelly_result.recommended_amount, 0
    );

    // If total exceeds safe portfolio limit, scale down proportionally
    const portfolioLimit = bankroll * KELLY_SAFETY.MAX_CORRELATED_EXPOSURE;
    let scalingFactor = 1.0;
    
    if (totalRecommended > portfolioLimit) {
      scalingFactor = portfolioLimit / totalRecommended;
    }

    const adjustedPositions = individualResults.map(result => ({
      signal_id: result.signal_id,
      recommended_amount: Math.round(result.kelly_result.recommended_amount * scalingFactor),
      kelly_fraction: result.kelly_result.recommended_fraction * scalingFactor,
      risk_contribution: (result.kelly_result.recommended_amount * scalingFactor) / bankroll
    }));

    const adjustedTotal = adjustedPositions.reduce((sum, pos) => sum + pos.recommended_amount, 0);
    const portfolioKelly = adjustedTotal / bankroll;
    
    // Estimate maximum drawdown (simplified)
    const maxDrawdownEstimate = adjustedTotal * 0.4; // Assume 40% worst-case scenario
    
    // Diversification benefit (reduction in volatility from multiple positions)
    const diversificationBenefit = positions.length > 1 ? 
      Math.min(0.25, (positions.length - 1) * 0.05) : 0; // Up to 25% benefit

    return {
      total_recommended: adjustedTotal,
      individual_positions: adjustedPositions,
      portfolio_kelly: portfolioKelly,
      max_drawdown_estimate: Math.round(maxDrawdownEstimate),
      diversification_benefit: diversificationBenefit
    };
  }

  /**
   * Calculate Kelly sizing for multi-leg correlated bets (whale strategy)
   * Reduces position size based on correlation between legs
   */
  calculateCorrelatedKelly(
    legs: Array<{
      win_probability: number;
      payout_odds: number;
      correlation_coefficient: number;
    }>,
    bankroll: number,
    combined_edge: number
  ): KellyResult {
    if (legs.length === 1) {
      // Single leg, use normal Kelly
      return this.calculateKellyPosition({
        win_probability: legs[0].win_probability,
        win_odds: legs[0].payout_odds,
        bankroll,
        edge: combined_edge
      });
    }

    // Multi-leg correlation adjustment
    const avgCorrelation = this.calculateAverageCorrelation(legs);
    
    // Estimate combined probability (simplified approach)
    const combinedProbability = legs.reduce((prob, leg, i) => {
      if (i === 0) return leg.win_probability;
      // Correlation adjustment for subsequent legs
      const correlationFactor = 1 + (avgCorrelation - 0.5) * 0.3;
      return prob * leg.win_probability * correlationFactor;
    }, 1);

    // Estimate combined payout odds
    const combinedPayoutOdds = legs.reduce((odds, leg) => odds * leg.payout_odds, 1);

    // Apply additional correlation penalty for multi-leg bets
    const correlationPenalty = avgCorrelation * 0.3; // Up to 30% reduction
    const adjustedEdge = combined_edge * (1 - correlationPenalty);

    return this.calculateKellyPosition({
      win_probability: Math.max(0.01, Math.min(0.99, combinedProbability)),
      win_odds: combinedPayoutOdds,
      bankroll,
      edge: adjustedEdge,
      correlation_factor: avgCorrelation,
      max_risk_per_bet: 0.05 // More conservative for multi-leg
    });
  }

  /**
   * Adjust position size based on whale behavior patterns
   * Research shows whales size up on high-conviction plays in their specialties
   */
  applyWhaleBehaviorAdjustments(
    baseKelly: KellyResult,
    factors: {
      whaleSpecialty?: boolean;     // This sport is whale's specialty
      sharpBookConfirmation?: boolean; // Sharp books confirm the edge
      largeWhalePosition?: boolean;  // Large whale took similar position
      marketType?: string;          // Market type preference
    }
  ): KellyResult {
    let adjustmentFactor = 1.0;
    const adjustments: string[] = [...baseKelly.safety_adjustments];

    // Whale specialty bonus (kch123 in NHL, DrPufferfish in soccer futures)
    if (factors.whaleSpecialty) {
      adjustmentFactor *= 1.2; // 20% increase
      adjustments.push('Whale specialty (+20%)');
    }

    // Sharp book confirmation (when Polymarket beats Pinnacle)
    if (factors.sharpBookConfirmation) {
      adjustmentFactor *= 1.3; // 30% increase
      adjustments.push('Sharp book edge (+30%)');
    }

    // Large whale position (copy high-conviction whale bets)
    if (factors.largeWhalePosition) {
      adjustmentFactor *= 1.15; // 15% increase
      adjustments.push('Whale conviction (+15%)');
    }

    // Market type preferences (whales prefer spreads over ML)
    if (factors.marketType === 'spread') {
      adjustmentFactor *= 1.1; // 10% increase for spread bets
      adjustments.push('Spread market (+10%)');
    }

    // Apply adjustment but respect absolute maximum
    const adjustedFraction = Math.min(
      KELLY_SAFETY.MAX_SINGLE_BET,
      baseKelly.recommended_fraction * adjustmentFactor
    );

    const adjustedAmount = baseKelly.recommended_amount * adjustmentFactor;

    return {
      ...baseKelly,
      recommended_fraction: adjustedFraction,
      recommended_amount: Math.round(adjustedAmount),
      max_loss: Math.round(adjustedAmount),
      expected_value: Math.round(baseKelly.expected_value * adjustmentFactor),
      safety_adjustments: adjustments
    };
  }

  /**
   * Helper methods
   */
  private calculateAverageCorrelation(legs: Array<{ correlation_coefficient: number }>): number {
    if (legs.length <= 1) return 0;
    
    const totalCorrelation = legs.reduce((sum, leg) => sum + leg.correlation_coefficient, 0);
    return totalCorrelation / legs.length;
  }

  private calculateRiskOfRuin(
    kellyFraction: number,
    winProb: number,
    winOdds: number,
    loseOdds: number
  ): number {
    // Simplified risk of ruin calculation
    // This is an approximation - real calculation is more complex
    const advantage = winProb * winOdds - (1 - winProb) * loseOdds;
    const variance = winProb * (winOdds ** 2) + (1 - winProb) * (loseOdds ** 2) - (advantage ** 2);
    
    if (advantage <= 0) return 1.0; // Certain ruin with negative expectation
    
    // Approximate risk of 50% drawdown
    const riskLevel = Math.exp(-2 * advantage * 0.5 / variance);
    return Math.max(0, Math.min(1, riskLevel));
  }

  private createZeroResult(bankroll: number, reason: string): KellyResult {
    return {
      recommended_fraction: 0,
      recommended_amount: 0,
      max_loss: 0,
      expected_value: 0,
      growth_rate: 0,
      risk_of_ruin: 0,
      kelly_fraction_raw: 0,
      safety_adjustments: [reason]
    };
  }

  /**
   * Validate Kelly calculation with sanity checks
   */
  validateKellyResult(result: KellyResult, bankroll: number): {
    isValid: boolean;
    warnings: string[];
    criticalIssues: string[];
  } {
    const warnings: string[] = [];
    const criticalIssues: string[] = [];
    
    // Sanity checks
    if (result.recommended_amount > bankroll) {
      criticalIssues.push('Recommended amount exceeds bankroll');
    }
    
    if (result.recommended_fraction > 0.15) {
      warnings.push('High risk per bet (>15% of bankroll)');
    }
    
    if (result.risk_of_ruin > 0.2) {
      warnings.push('High risk of significant drawdown (>20%)');
    }
    
    if (result.kelly_fraction_raw > 0.25) {
      warnings.push('Raw Kelly suggests very large position - ensure edge estimate is accurate');
    }

    return {
      isValid: criticalIssues.length === 0,
      warnings,
      criticalIssues
    };
  }

  /**
   * Get recommended position size for different risk tolerance levels
   */
  getRiskToleranceAdjustments(baseKelly: KellyResult): {
    conservative: number; // 50% of Kelly
    moderate: number;     // 75% of Kelly  
    aggressive: number;   // 100% of Kelly
    whale: number;        // 125% of Kelly (capped at max)
  } {
    return {
      conservative: Math.round(baseKelly.recommended_amount * 0.5),
      moderate: Math.round(baseKelly.recommended_amount * 0.75),
      aggressive: baseKelly.recommended_amount,
      whale: Math.round(Math.min(
        baseKelly.recommended_amount * 1.25,
        baseKelly.recommended_amount // Already capped at max
      ))
    };
  }
}

export default KellyCalculator;