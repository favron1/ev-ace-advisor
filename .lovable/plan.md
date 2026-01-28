

# Execution Decision Layer Implementation

## Overview

Add a professional execution decision layer that separates **signal detection** (current functionality) from **execution recommendation** (new layer). This applies AFTER market matching and calculates **net +EV** after accounting for fees, spread, and slippage.

## Core Problem

Currently the system displays raw edge:
```
edge_percent = (bookmaker_fair_prob - polymarket_price) * 100
```

This does NOT account for:
- Polymarket platform fees (1% on profits)
- Bid/ask spread (typically 1-3% on sports markets)
- Slippage (varies with stake size vs liquidity)
- Fill risk

A 3% raw edge might actually be 0.5% net edge (NO BET).

## Solution Architecture

```text
+------------------+      +-------------------+      +------------------+
| Signal Detection |  →   | Execution Engine  |  →   | UI Display       |
| (existing)       |      | (new layer)       |      | (enhanced)       |
+------------------+      +-------------------+      +------------------+
                          |                   |
                          | • Calculate fees  |
                          | • Estimate spread |
                          | • Assess slippage |
                          | • Net EV calc     |
                          | • BET/NO BET      |
                          +-------------------+
```

## Implementation Details

### 1. Add Execution Types (`src/types/arbitrage.ts`)

New interfaces for execution analysis:

```typescript
export interface ExecutionAnalysis {
  // Raw edge (what we calculate now)
  raw_edge_percent: number;
  
  // Estimated costs
  platform_fee_percent: number;      // 1% on profits
  estimated_spread_percent: number;  // Based on market liquidity
  estimated_slippage_percent: number; // Based on stake vs order book
  total_costs_percent: number;        // Sum of all costs
  
  // Net edge after costs
  net_edge_percent: number;
  
  // Liquidity assessment
  liquidity_tier: 'high' | 'medium' | 'low' | 'insufficient';
  max_stake_without_impact: number;  // $ amount
  
  // Final decision
  execution_decision: 'STRONG_BET' | 'BET' | 'MARGINAL' | 'NO_BET';
  decision_reason: string;
}
```

### 2. Create Execution Engine (`src/lib/execution-engine.ts`)

Calculate net edge with all costs:

| Raw Edge | Fee (1%) | Spread | Slippage | Net Edge | Decision |
|----------|----------|--------|----------|----------|----------|
| 5.0%     | -0.5%    | -1.0%  | -0.5%    | 3.0%     | BET |
| 3.0%     | -0.3%    | -1.0%  | -0.5%    | 1.2%     | MARGINAL |
| 2.0%     | -0.2%    | -1.0%  | -0.5%    | 0.3%     | NO BET |

Decision thresholds:
- **STRONG_BET**: Net edge ≥ 4%
- **BET**: Net edge ≥ 2%
- **MARGINAL**: Net edge 1-2% AND high liquidity
- **NO_BET**: Net edge < 1% OR insufficient liquidity

### 3. Spread Estimation Logic

Estimate spread based on volume:

| Volume | Estimated Spread |
|--------|------------------|
| > $500K | 0.5% |
| $100K-$500K | 1.0% |
| $50K-$100K | 1.5% |
| $10K-$50K | 2.0% |
| < $10K | 3.0%+ (avoid) |

### 4. Slippage Estimation

Estimate slippage based on stake size relative to market depth:

```typescript
function estimateSlippage(stakeAmount: number, volume: number): number {
  const depthRatio = stakeAmount / volume;
  
  if (depthRatio < 0.001) return 0.2;  // Negligible impact
  if (depthRatio < 0.005) return 0.5;  // Low impact
  if (depthRatio < 0.01) return 1.0;   // Moderate impact
  if (depthRatio < 0.02) return 2.0;   // High impact
  return 3.0;                           // Avoid - too large
}
```

### 5. Enhance SignalCard Display

Show execution decision prominently:

```text
┌─────────────────────────────────────────────┐
│ Timberwolves vs Mavericks                   │
│                                             │
│ BET: Minnesota Timberwolves                 │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │  70¢         71%         +1.0%          │ │
│ │  POLY YES    FAIR VALUE  RAW EDGE       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Cost Breakdown:                         │ │
│ │   Platform fee: -0.10%                  │ │
│ │   Spread: -0.50%                        │ │
│ │   Slippage: -0.20%                      │ │
│ │   ─────────────────                     │ │
│ │   NET EDGE: +0.20%                      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [     ❌ NO BET - Edge below threshold    ] │
│                                             │
│ Volume: $125K • Liquidity: HIGH            │
└─────────────────────────────────────────────┘
```

For actionable bets:

```text
│ [     ✅ BET - Net +2.3% edge             ] │
```

### 6. Add User Config for Default Stake

The execution engine needs to know intended stake size for slippage calculation. Add to `arbitrage_config`:

```sql
ALTER TABLE arbitrage_config 
ADD COLUMN IF NOT EXISTS default_stake_amount numeric DEFAULT 100;
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/types/arbitrage.ts` | Modify | Add `ExecutionAnalysis` interface |
| `src/lib/execution-engine.ts` | Create | Core execution decision logic |
| `src/components/terminal/SignalCard.tsx` | Modify | Display net edge, costs, and BET/NO BET |
| `src/hooks/useSignals.ts` | Modify | Enrich signals with execution analysis |

## Technical Details

### Execution Engine Core Function

```typescript
// src/lib/execution-engine.ts

const PLATFORM_FEE_RATE = 0.01; // 1% on profits

// Volume-based spread estimation
function estimateSpread(volume: number): number {
  if (volume >= 500000) return 0.5;
  if (volume >= 100000) return 1.0;
  if (volume >= 50000) return 1.5;
  if (volume >= 10000) return 2.0;
  return 3.0;
}

// Slippage based on stake relative to volume
function estimateSlippage(stakeAmount: number, volume: number): number {
  const ratio = stakeAmount / volume;
  if (ratio < 0.001) return 0.2;
  if (ratio < 0.005) return 0.5;
  if (ratio < 0.01) return 1.0;
  if (ratio < 0.02) return 2.0;
  return 3.0;
}

export function analyzeExecution(
  signal: SignalOpportunity,
  stakeAmount: number = 100
): ExecutionAnalysis {
  const rawEdge = signal.edge_percent;
  const volume = signal.polymarket_volume || 0;
  
  // Calculate costs
  const platformFee = rawEdge * PLATFORM_FEE_RATE; // Fee on profits
  const spread = estimateSpread(volume);
  const slippage = estimateSlippage(stakeAmount, volume);
  const totalCosts = platformFee + spread + slippage;
  
  // Net edge
  const netEdge = rawEdge - totalCosts;
  
  // Liquidity tier
  let liquidityTier: 'high' | 'medium' | 'low' | 'insufficient';
  if (volume >= 100000) liquidityTier = 'high';
  else if (volume >= 50000) liquidityTier = 'medium';
  else if (volume >= 10000) liquidityTier = 'low';
  else liquidityTier = 'insufficient';
  
  // Execution decision
  let decision: 'STRONG_BET' | 'BET' | 'MARGINAL' | 'NO_BET';
  let reason: string;
  
  if (liquidityTier === 'insufficient') {
    decision = 'NO_BET';
    reason = 'Insufficient liquidity';
  } else if (netEdge >= 4) {
    decision = 'STRONG_BET';
    reason = `High conviction (+${netEdge.toFixed(1)}% net)`;
  } else if (netEdge >= 2) {
    decision = 'BET';
    reason = `Positive EV (+${netEdge.toFixed(1)}% net)`;
  } else if (netEdge >= 1 && liquidityTier === 'high') {
    decision = 'MARGINAL';
    reason = 'Thin edge, high liquidity only';
  } else {
    decision = 'NO_BET';
    reason = netEdge < 1 
      ? `Edge too thin (${netEdge.toFixed(1)}%)` 
      : 'Costs exceed edge';
  }
  
  return {
    raw_edge_percent: rawEdge,
    platform_fee_percent: platformFee,
    estimated_spread_percent: spread,
    estimated_slippage_percent: slippage,
    total_costs_percent: totalCosts,
    net_edge_percent: netEdge,
    liquidity_tier: liquidityTier,
    max_stake_without_impact: volume * 0.01, // 1% of volume
    execution_decision: decision,
    decision_reason: reason,
  };
}
```

### SignalCard Enhancement

The card will show:

1. **Raw edge** (current) - "What the numbers say"
2. **Cost breakdown** - Fees, spread, slippage
3. **Net edge** - What you actually keep
4. **Decision badge** - BET / MARGINAL / NO BET

Color coding:
- STRONG_BET: Green background, "Execute" button
- BET: Green border, "Execute" button
- MARGINAL: Yellow border, "Caution" label
- NO_BET: Red/gray, button disabled, clear "NO BET" label

## Expected Outcome

Before (current):
- All signals with ≥2% raw edge shown as actionable
- User must mentally calculate costs
- Easy to bet on marginal opportunities

After:
- Only signals with ≥2% NET edge marked as BET
- Cost breakdown visible for transparency
- Clear NO BET label prevents marginal bets
- Conservative, disciplined, edge-focused system

