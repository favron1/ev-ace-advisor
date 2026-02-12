// ============================================================================
// KELLY CRITERION POSITION SIZING - Smart Stake Management
// ============================================================================
// Implements Kelly Criterion for optimal position sizing based on edge magnitude
// and confidence. Replaces fixed stake amounts with mathematically optimal sizing.
// f* = (bp - q) / b where b = odds, p = win probability, q = loss probability
// ============================================================================

import type { SignalOpportunity, ExecutionAnalysis } from '@/types/arbitrage';

// Default bankroll settings (configurable per user)
export interface BankrollConfig {
  total_bankroll: number;           // Total capital available
  max_position_pct: number;         // Max % of bankroll per position (default 10%)
  max_total_exposure_pct: number;   // Max total exposure across all positions (default 25%)
  kelly_multiplier: number;         // Conservative multiplier (default 0.5 for half-Kelly)
  min_edge_for_kelly: number;       // Minimum edge required for Kelly sizing (default 3%)
  correlation_reduction: number;    // Reduce sizing for correlated positions (default 0.5)
}

export interface KellyResult {
  kelly_fraction: number;           // Raw Kelly fraction (0-1)
  suggested_stake: number;          // Recommended dollar amount
  max_kelly_stake: number;          // Full Kelly stake (usually too aggressive)
  half_kelly_stake: number;         // Conservative half-Kelly stake
  bankroll_percentage: number;      // Percentage of bankroll
  risk_of_ruin: number;            // Estimated probability of losing 50%+ bankroll
  sizing_tier: 'micro' | 'small' | 'medium' | 'large' | 'max'; // Sizing category
  warnings: string[];              // Risk warnings
}

export interface PortfolioRisk {
  current_exposure: number;         // Total current exposure
  exposure_percentage: number;      // % of bankroll currently at risk
  open_positions: number;          // Number of active positions
  correlation_risk: number;        // Estimated correlation between positions
  recommended_reduction: number;   // Suggested reduction factor for new positions
}

const DEFAULT_BANKROLL_CONFIG: BankrollConfig = {
  total_bankroll: 10000,           // $10k default
  max_position_pct: 0.10,          // 10% max per position
  max_total_exposure_pct: 0.25,    // 25% max total exposure
  kelly_multiplier: 0.5,           // Half-Kelly for safety
  min_edge_for_kelly: 0.03,        // 3% minimum edge
  correlation_reduction: 0.5        // 50% reduction for correlated bets
};

/**
 * Calculate Kelly Criterion position sizing for a signal
 */
export function calculateKellySizing(
  signal: SignalOpportunity,
  bankrollConfig: BankrollConfig = DEFAULT_BANKROLL_CONFIG
): KellyResult {
  
  const edge = signal.edge_percent / 100; // Convert to decimal
  const price = signal.polymarket_price;
  const confidence = signal.confidence_score / 100;
  
  // Kelly formula: f* = (bp - q) / b
  // Where: b = odds received (price / (1-price))
  //        p = probability of winning (our estimate)
  //        q = probability of losing (1-p)
  
  // Convert Polymarket price to traditional odds
  const odds = price / (1 - price);
  
  // Estimate our win probability (Polymarket price + edge)
  const winProbability = Math.min(0.95, price + edge); // Cap at 95%
  const lossProbability = 1 - winProbability;
  
  // Raw Kelly fraction
  const kellyFraction = (odds * winProbability - lossProbability) / odds;
  
  // Apply confidence adjustment (reduce sizing for low confidence)
  const confidenceAdjustedKelly = Math.max(0, kellyFraction * confidence);
  
  // Apply Kelly multiplier for conservative sizing
  const adjustedKelly = confidenceAdjustedKelly * bankrollConfig.kelly_multiplier;
  
  // Calculate stake amounts
  const fullKellyStake = Math.max(0, kellyFraction * bankrollConfig.total_bankroll);
  const halfKellyStake = fullKellyStake * 0.5;
  const suggestedStake = Math.max(0, adjustedKelly * bankrollConfig.total_bankroll);
  
  // Apply position limits
  const maxPositionStake = bankrollConfig.total_bankroll * bankrollConfig.max_position_pct;
  const limitedStake = Math.min(suggestedStake, maxPositionStake);
  
  // Calculate risk metrics
  const bankrollPercentage = (limitedStake / bankrollConfig.total_bankroll) * 100;
  const riskOfRuin = calculateRiskOfRuin(winProbability, odds, kellyFraction);
  
  // Determine sizing tier
  const sizingTier = getSizingTier(edge, limitedStake, bankrollConfig);
  
  // Generate warnings
  const warnings = generateSizingWarnings(
    edge, kellyFraction, confidence, limitedStake, bankrollConfig
  );
  
  return {
    kelly_fraction: Number(kellyFraction.toFixed(6)),
    suggested_stake: Math.floor(limitedStake),
    max_kelly_stake: Math.floor(fullKellyStake),
    half_kelly_stake: Math.floor(halfKellyStake),
    bankroll_percentage: Number(bankrollPercentage.toFixed(2)),
    risk_of_ruin: Number(riskOfRuin.toFixed(4)),
    sizing_tier,
    warnings
  };
}

/**
 * Assess current portfolio risk and recommend position sizing adjustments
 */
export async function assessPortfolioRisk(
  existingPositions: SignalOpportunity[],
  bankrollConfig: BankrollConfig = DEFAULT_BANKROLL_CONFIG
): Promise<PortfolioRisk> {
  
  // Calculate current exposure
  let totalExposure = 0;
  let correlatedExposure = 0;
  
  for (const position of existingPositions) {
    if (position.status === 'active' || position.status === 'executed') {
      // Estimate position size (would need actual bet amounts in production)
      const estimatedStake = bankrollConfig.total_bankroll * 0.05; // Assume 5% avg
      totalExposure += estimatedStake;
      
      // Check for correlated positions (same event, similar timing)
      const correlatedPositions = existingPositions.filter(other => 
        other.id !== position.id && 
        isCorrelatedEvent(position.event_name, other.event_name)
      );
      
      if (correlatedPositions.length > 0) {
        correlatedExposure += estimatedStake;
      }
    }
  }
  
  const exposurePercentage = (totalExposure / bankrollConfig.total_bankroll) * 100;
  const correlationRisk = correlatedExposure / Math.max(totalExposure, 1);
  
  // Recommend position size reduction if over-exposed
  let recommendedReduction = 1.0; // No reduction
  
  if (exposurePercentage > bankrollConfig.max_total_exposure_pct * 100) {
    recommendedReduction = (bankrollConfig.max_total_exposure_pct * 100) / exposurePercentage;
  }
  
  if (correlationRisk > 0.3) { // High correlation
    recommendedReduction *= bankrollConfig.correlation_reduction;
  }
  
  return {
    current_exposure: totalExposure,
    exposure_percentage: Number(exposurePercentage.toFixed(2)),
    open_positions: existingPositions.filter(p => p.status === 'active').length,
    correlation_risk: Number(correlationRisk.toFixed(3)),
    recommended_reduction: Number(recommendedReduction.toFixed(3))
  };
}

/**
 * Enhanced execution analysis with Kelly sizing
 */
export function enhanceExecutionWithKelly(
  executionAnalysis: ExecutionAnalysis,
  signal: SignalOpportunity,
  bankrollConfig?: BankrollConfig
): ExecutionAnalysis & { kelly: KellyResult } {
  
  const kelly = calculateKellySizing(signal, bankrollConfig);
  
  return {
    ...executionAnalysis,
    kelly
  };
}

/**
 * Calculate approximate risk of ruin using Kelly criterion
 */
function calculateRiskOfRuin(
  winProb: number, 
  odds: number, 
  kellyFraction: number
): number {
  
  if (kellyFraction <= 0) return 0;
  
  // Simplified risk of ruin calculation for binary outcomes
  // RoR ≈ ((1-p)/p)^(B/q) where B = bankroll, q = avg loss amount
  
  const lossProb = 1 - winProb;
  const avgWin = odds; // Payout ratio
  const avgLoss = 1;   // Always lose 1x stake
  
  // If Kelly fraction is too high, risk increases exponentially  
  if (kellyFraction > 0.2) {
    return Math.min(0.5, kellyFraction * 2); // Crude approximation
  }
  
  // For reasonable Kelly fractions, risk is low
  return Math.max(0.001, kellyFraction * 0.1);
}

/**
 * Determine sizing tier based on edge and stake amount
 */
function getSizingTier(
  edge: number, 
  stakeAmount: number, 
  bankrollConfig: BankrollConfig
): 'micro' | 'small' | 'medium' | 'large' | 'max' {
  
  const percentage = (stakeAmount / bankrollConfig.total_bankroll) * 100;
  
  if (percentage <= 1) return 'micro';      // ≤1% of bankroll
  if (percentage <= 3) return 'small';      // 1-3% of bankroll  
  if (percentage <= 6) return 'medium';     // 3-6% of bankroll
  if (percentage <= 10) return 'large';     // 6-10% of bankroll
  return 'max';                             // >10% (at limit)
}

/**
 * Generate warnings for position sizing
 */
function generateSizingWarnings(
  edge: number,
  kellyFraction: number,
  confidence: number,
  stakeAmount: number,
  bankrollConfig: BankrollConfig
): string[] {
  
  const warnings: string[] = [];
  
  if (edge < bankrollConfig.min_edge_for_kelly) {
    warnings.push(`Edge below minimum threshold (${(bankrollConfig.min_edge_for_kelly*100).toFixed(1)}%)`);
  }
  
  if (kellyFraction > 0.2) {
    warnings.push('High Kelly fraction - consider smaller position');
  }
  
  if (confidence < 0.6) {
    warnings.push('Low confidence signal - reduced position size');
  }
  
  if (stakeAmount >= bankrollConfig.total_bankroll * bankrollConfig.max_position_pct) {
    warnings.push('Position at maximum size limit');
  }
  
  if (kellyFraction <= 0) {
    warnings.push('Negative edge - no position recommended');
  }
  
  return warnings;
}

/**
 * Check if two events are correlated (same teams, similar timing)
 */
function isCorrelatedEvent(event1: string, event2: string): boolean {
  const e1 = event1.toLowerCase();
  const e2 = event2.toLowerCase();
  
  // Extract team names (simple approach)
  const teams1 = e1.split(/\s+vs?\s+|\s+@\s+|\s+-\s+/);
  const teams2 = e2.split(/\s+vs?\s+|\s+@\s+|\s+-\s+/);
  
  // Check for shared teams
  for (const team1 of teams1) {
    for (const team2 of teams2) {
      if (team1.includes(team2) || team2.includes(team1)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get Kelly sizing recommendation text for UI
 */
export function getKellySizingRecommendation(kelly: KellyResult): string {
  if (kelly.kelly_fraction <= 0) {
    return 'No position recommended (negative edge)';
  }
  
  const percentage = kelly.bankroll_percentage;
  
  if (percentage <= 1) {
    return `Micro position: ${percentage.toFixed(1)}% of bankroll`;
  } else if (percentage <= 3) {
    return `Small position: ${percentage.toFixed(1)}% of bankroll`;
  } else if (percentage <= 6) {
    return `Medium position: ${percentage.toFixed(1)}% of bankroll`;
  } else if (percentage <= 10) {
    return `Large position: ${percentage.toFixed(1)}% of bankroll`;
  } else {
    return `Maximum position: ${percentage.toFixed(1)}% of bankroll`;
  }
}

/**
 * Get color class for sizing tier (for UI)
 */
export function getKellyColorClass(kelly: KellyResult): string {
  switch (kelly.sizing_tier) {
    case 'micro': return 'text-gray-400';
    case 'small': return 'text-blue-400';
    case 'medium': return 'text-yellow-500';
    case 'large': return 'text-orange-500';
    case 'max': return 'text-red-400';
    default: return 'text-gray-400';
  }
}