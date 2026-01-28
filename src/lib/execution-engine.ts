// Execution Decision Engine
// Calculates net +EV after fees, spread, and slippage
// Applied AFTER signal detection - does not alter detection logic

import type { SignalOpportunity, ExecutionAnalysis } from '@/types/arbitrage';

// Polymarket platform fee (1% on profits)
const PLATFORM_FEE_RATE = 0.01;

/**
 * Estimate bid/ask spread based on market volume
 * Higher volume = tighter spreads
 */
function estimateSpread(volume: number): number {
  if (volume >= 500000) return 0.5;   // Very liquid
  if (volume >= 100000) return 1.0;   // Liquid
  if (volume >= 50000) return 1.5;    // Moderate
  if (volume >= 10000) return 2.0;    // Thin
  return 3.0;                          // Avoid - wide spreads
}

/**
 * Estimate slippage based on stake size relative to market depth
 * Assumes order book depth scales with volume
 */
function estimateSlippage(stakeAmount: number, volume: number): number {
  if (volume === 0) return 3.0; // No volume = max slippage
  
  const depthRatio = stakeAmount / volume;
  
  if (depthRatio < 0.001) return 0.2;  // <0.1% of volume - negligible
  if (depthRatio < 0.005) return 0.5;  // <0.5% of volume - low
  if (depthRatio < 0.01) return 1.0;   // <1% of volume - moderate
  if (depthRatio < 0.02) return 2.0;   // <2% of volume - high
  return 3.0;                           // >2% - avoid, too large
}

/**
 * Determine liquidity tier from volume
 */
function getLiquidityTier(volume: number): 'high' | 'medium' | 'low' | 'insufficient' {
  if (volume >= 100000) return 'high';
  if (volume >= 50000) return 'medium';
  if (volume >= 10000) return 'low';
  return 'insufficient';
}

/**
 * Main execution analysis function
 * Takes a signal and stake amount, returns full execution analysis
 */
export function analyzeExecution(
  signal: SignalOpportunity,
  stakeAmount: number = 100
): ExecutionAnalysis {
  // Only analyze true arbitrage signals with Polymarket matches
  if (!signal.is_true_arbitrage) {
    return {
      raw_edge_percent: signal.edge_percent,
      platform_fee_percent: 0,
      estimated_spread_percent: 0,
      estimated_slippage_percent: 0,
      total_costs_percent: 0,
      net_edge_percent: 0,
      liquidity_tier: 'insufficient',
      max_stake_without_impact: 0,
      execution_decision: 'NO_BET',
      decision_reason: 'No Polymarket match - signal only',
    };
  }

  const rawEdge = signal.edge_percent;
  const volume = signal.polymarket_volume || 0;
  
  // Calculate individual costs
  const platformFee = rawEdge > 0 ? rawEdge * PLATFORM_FEE_RATE : 0; // Fee only on profits
  const spread = estimateSpread(volume);
  const slippage = estimateSlippage(stakeAmount, volume);
  const totalCosts = platformFee + spread + slippage;
  
  // Net edge after all costs
  const netEdge = rawEdge - totalCosts;
  
  // Assess liquidity
  const liquidityTier = getLiquidityTier(volume);
  
  // Maximum stake that won't significantly impact price (1% of volume)
  const maxStakeWithoutImpact = volume * 0.01;
  
  // Determine execution decision
  let decision: 'STRONG_BET' | 'BET' | 'MARGINAL' | 'NO_BET';
  let reason: string;
  
  if (liquidityTier === 'insufficient') {
    decision = 'NO_BET';
    reason = 'Insufficient liquidity (<$10K volume)';
  } else if (netEdge >= 4) {
    decision = 'STRONG_BET';
    reason = `High conviction: +${netEdge.toFixed(1)}% net edge`;
  } else if (netEdge >= 2) {
    decision = 'BET';
    reason = `Positive EV: +${netEdge.toFixed(1)}% net edge`;
  } else if (netEdge >= 1 && liquidityTier === 'high') {
    decision = 'MARGINAL';
    reason = 'Thin edge (1-2%), proceed with caution';
  } else if (netEdge < 1) {
    decision = 'NO_BET';
    reason = `Net edge too thin: ${netEdge.toFixed(1)}%`;
  } else {
    decision = 'NO_BET';
    reason = 'Costs exceed edge benefit';
  }
  
  return {
    raw_edge_percent: rawEdge,
    platform_fee_percent: Number(platformFee.toFixed(2)),
    estimated_spread_percent: spread,
    estimated_slippage_percent: slippage,
    total_costs_percent: Number(totalCosts.toFixed(2)),
    net_edge_percent: Number(netEdge.toFixed(2)),
    liquidity_tier: liquidityTier,
    max_stake_without_impact: Math.floor(maxStakeWithoutImpact),
    execution_decision: decision,
    decision_reason: reason,
  };
}

/**
 * Helper to format liquidity tier for display
 */
export function formatLiquidityTier(tier: ExecutionAnalysis['liquidity_tier']): string {
  const labels = {
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
    insufficient: 'INSUFFICIENT',
  };
  return labels[tier];
}

/**
 * Get color class for execution decision
 */
export function getDecisionColor(decision: ExecutionAnalysis['execution_decision']): string {
  const colors = {
    STRONG_BET: 'text-green-400',
    BET: 'text-green-500',
    MARGINAL: 'text-yellow-500',
    NO_BET: 'text-red-400',
  };
  return colors[decision];
}

/**
 * Get background color class for execution decision
 */
export function getDecisionBgColor(decision: ExecutionAnalysis['execution_decision']): string {
  const colors = {
    STRONG_BET: 'bg-green-500/20 border-green-500/50',
    BET: 'bg-green-500/10 border-green-500/30',
    MARGINAL: 'bg-yellow-500/10 border-yellow-500/30',
    NO_BET: 'bg-red-500/10 border-red-500/30',
  };
  return colors[decision];
}
