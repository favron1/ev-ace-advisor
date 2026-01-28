

# Comprehensive Plan: Fix Edge Calculation + Polymarket Matching

## Overview

This plan implements a rigorous edge calculation system that replaces the current flawed approach with proper arbitrage detection. The key changes ensure **only matched markets show "Edge"** while unmatched events display "Signal Strength" as an informational metric.

---

## Current State vs Required State

| Component | Current | Required |
|-----------|---------|----------|
| Bookmaker Probability | Raw `1/odds` (includes vig) | Vig-removed fair probability |
| Match Threshold | 0.5 (too loose) | 0.85 (strict matching) |
| Matching Algorithm | Basic Levenshtein only | Levenshtein + Jaccard + alias expansion |
| Edge Formula | `bookmakerProb - polyPrice` | Same but with fair prob |
| Staleness Filter | 2h on Polymarket | 2h + liquidity validation |
| DB Tracking | Basic columns | Extended with volume/freshness |
| UI Filters | Edge/confidence only | + "True edges only" toggle |

---

## Phase 1: Database Migration

Add new tracking columns to `signal_opportunities`:

```sql
ALTER TABLE signal_opportunities
ADD COLUMN IF NOT EXISTS polymarket_yes_price numeric,
ADD COLUMN IF NOT EXISTS polymarket_volume numeric,
ADD COLUMN IF NOT EXISTS polymarket_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS bookmaker_prob_fair numeric,
ADD COLUMN IF NOT EXISTS signal_strength numeric;
```

---

## Phase 2: Fix Bookmaker Probability (Vig Removal)

### Update `ingest-odds/index.ts`

Current code calculates raw implied probability:
```typescript
// CURRENT (includes vig)
const impliedProb = 1 / avgOdds;
```

New calculation removes vig for 2-way H2H markets:
```typescript
// NEW (vig-removed fair probability)
// For each outcome pair in an event:
const p_raw_home = 1 / homeOdds;
const p_raw_away = 1 / awayOdds;
const total = p_raw_home + p_raw_away; // Sum > 1 due to vig

// Normalize to remove vig
const p_fair_home = p_raw_home / total;
const p_fair_away = p_raw_away / total;
```

Store both `odds` and `implied_probability_fair` for each signal.

---

## Phase 3: Enhanced Polymarket Matching Engine

### Update `detect-signals/index.ts`

#### 3.1 Team Name Alias Mapping

```typescript
const TEAM_ALIASES: Record<string, string[]> = {
  'los angeles lakers': ['la lakers', 'lakers'],
  'golden state warriors': ['gsw', 'warriors', 'gs warriors'],
  'manchester united': ['man united', 'man utd', 'mufc'],
  'manchester city': ['man city', 'mcfc'],
  'los angeles dodgers': ['la dodgers', 'dodgers'],
  'new york yankees': ['ny yankees', 'yankees', 'nyy'],
  // Expand as needed
};

function expandWithAliases(name: string): string[] {
  const normalized = normalizeName(name);
  const aliases = [normalized];
  for (const [canonical, alts] of Object.entries(TEAM_ALIASES)) {
    if (normalized.includes(canonical) || alts.some(a => normalized.includes(a))) {
      aliases.push(canonical, ...alts);
    }
  }
  return [...new Set(aliases)];
}
```

#### 3.2 Jaccard Token Overlap Scoring

```typescript
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeName(text)
      .split(' ')
      .filter(t => t.length > 2)
  );
}
```

#### 3.3 Combined Match Scoring

```typescript
function calculateMatchConfidence(
  bookmakerEvent: string,
  bookmakerOutcome: string,
  polymarketQuestion: string
): number {
  const bookTokens = tokenize(bookmakerEvent);
  const outcomeTokens = tokenize(bookmakerOutcome);
  const polyTokens = tokenize(polymarketQuestion);
  
  // Jaccard overlap (0-1)
  const eventJaccard = jaccardSimilarity(bookTokens, polyTokens);
  const outcomeJaccard = jaccardSimilarity(outcomeTokens, polyTokens);
  
  // Levenshtein similarity (0-1)
  const levenSimilarity = similarityScore(bookmakerEvent, polymarketQuestion);
  
  // Combined score with weights
  const confidence = (eventJaccard * 0.4) + (outcomeJaccard * 0.35) + (levenSimilarity * 0.25);
  
  return confidence;
}
```

#### 3.4 Match Acceptance Rules

```typescript
// Raise threshold from 0.5 to 0.85
const MATCH_THRESHOLD = 0.85;
const AMBIGUITY_MARGIN = 0.03;

function selectBestMatch(candidates: MatchCandidate[]): MatchResult | null {
  if (candidates.length === 0) return null;
  
  const sorted = candidates.sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];
  
  if (best.confidence < MATCH_THRESHOLD) {
    return null; // No confident match
  }
  
  // Check for ambiguity
  const isAmbiguous = sorted.length > 1 && 
    (sorted[1].confidence >= best.confidence - AMBIGUITY_MARGIN);
  
  return {
    market: best.market,
    confidence: best.confidence,
    isAmbiguous,
  };
}
```

---

## Phase 4: Staleness and Liquidity Filters

### In `detect-signals/index.ts`

```typescript
const STALENESS_HOURS = 2;
const MIN_VOLUME_FLAG = 10000;  // Flag if below
const MIN_VOLUME_REJECT = 2000; // Reject if below

function validatePolymarketData(market: PolymarketMarket): ValidationResult {
  const hoursSinceUpdate = (Date.now() - new Date(market.last_updated).getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceUpdate > STALENESS_HOURS) {
    return { valid: false, reason: 'stale_price' };
  }
  
  if (market.volume < MIN_VOLUME_REJECT) {
    return { valid: false, reason: 'insufficient_liquidity' };
  }
  
  // Flag low liquidity but don't reject
  const lowLiquidity = market.volume < MIN_VOLUME_FLAG;
  
  // Spread sanity check - reject if YES stuck near extremes with low liquidity
  if ((market.yes_price < 0.05 || market.yes_price > 0.95) && lowLiquidity) {
    return { valid: false, reason: 'extreme_price_low_liquidity' };
  }
  
  return { valid: true, lowLiquidity };
}
```

---

## Phase 5: Updated Edge Calculation Logic

### Core Flow in `detect-signals/index.ts`

```typescript
for (const [eventName, signals] of eventGroups) {
  // 1. Calculate vig-removed fair probability
  const bookmakerProbFair = calculateFairProbability(signals);
  
  // 2. Attempt Polymarket match with enhanced scoring
  const match = findEnhancedPolymarketMatch(eventName, bestSignal.outcome, polymarkets);
  
  if (match && !match.isAmbiguous) {
    // 3. Validate Polymarket data freshness/liquidity
    const validation = validatePolymarketData(match.market);
    
    if (validation.valid) {
      // TRUE ARBITRAGE
      const polyProb = match.market.yes_price;
      const edgePct = (bookmakerProbFair - polyProb) * 100;
      
      if (edgePct >= MIN_EDGE_THRESHOLD) {
        opportunities.push({
          is_true_arbitrage: true,
          edge_percent: edgePct,
          polymarket_match_confidence: match.confidence,
          polymarket_yes_price: polyProb,
          polymarket_volume: match.market.volume,
          polymarket_updated_at: match.market.last_updated,
          bookmaker_prob_fair: bookmakerProbFair,
          signal_strength: null,
          // ... other fields
        });
      }
    }
  } else {
    // NO MATCH - Signal strength only
    const signalStrength = Math.abs(bookmakerProbFair - 0.5) * 100;
    
    opportunities.push({
      is_true_arbitrage: false,
      edge_percent: 0, // No edge without match
      signal_strength: signalStrength,
      polymarket_match_confidence: null,
      polymarket_yes_price: null,
      // ... other fields
    });
  }
}
```

---

## Phase 6: UI Updates

### 6.1 Update SignalCard.tsx

Display different information based on arbitrage type:

```typescript
// For true arbitrage - show detailed breakdown
{isTrueArbitrage && (
  <div className="text-xs space-y-1 mt-2 p-2 bg-green-500/10 rounded">
    <div>Bookmaker Fair: {(bookmakerProbFair * 100).toFixed(1)}%</div>
    <div>Polymarket: {(polyPrice * 100).toFixed(0)}¢</div>
    <div>Match Confidence: {(matchConfidence * 100).toFixed(0)}%</div>
    <div>Volume: ${formatVolume(polyVolume)}</div>
    <div>Last Update: {formatTimeAgo(polyUpdatedAt)}</div>
  </div>
)}

// For signal strength only
{!isTrueArbitrage && (
  <Badge variant="outline" className="bg-muted">
    <Activity className="h-3 w-3 mr-1" />
    SIGNAL STRENGTH: +{signalStrength.toFixed(1)}%
  </Badge>
)}
```

### 6.2 Update FiltersBar.tsx

Add "True Edges Only" toggle:

```typescript
interface FiltersBarProps {
  // ... existing props
  showTrueEdgesOnly: boolean;
  onShowTrueEdgesOnlyChange: (value: boolean) => void;
}

// In component
<div className="flex items-center space-x-2">
  <Switch
    id="true-edges-only"
    checked={showTrueEdgesOnly}
    onCheckedChange={onShowTrueEdgesOnlyChange}
  />
  <Label htmlFor="true-edges-only" className="text-xs">
    True Edges Only
  </Label>
</div>
```

### 6.3 Update useSignals Hook

Add filtering capability:

```typescript
getFilteredSignals: (filters) => {
  let filtered = signals;
  
  if (filters.trueEdgesOnly) {
    filtered = filtered.filter(s => s.is_true_arbitrage === true);
  }
  
  // ... other filters
  return filtered;
}
```

---

## Phase 7: Edge Cases

### 7.1 Soccer 3-Way Markets

```typescript
// In detect-signals
if (signals.some(s => s.outcome === 'Draw')) {
  // This is a 3-way market - don't force into YES/NO
  // Mark as non-match, show signal only
  isTrueArbitrage = false;
}
```

### 7.2 Ambiguous Matches

```typescript
if (match.isAmbiguous) {
  console.log(`Ambiguous match for ${eventName}: top candidates within ${AMBIGUITY_MARGIN}`);
  isTrueArbitrage = false; // Play it safe
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/ingest-odds/index.ts` | Add vig removal, store fair probability |
| `supabase/functions/detect-signals/index.ts` | Enhanced matching, proper edge calc, filters |
| `supabase/functions/fetch-polymarket/index.ts` | Add entity extraction for better matching |
| `src/components/terminal/SignalCard.tsx` | Show detailed breakdown, distinguish edge vs strength |
| `src/components/terminal/FiltersBar.tsx` | Add "True Edges Only" toggle |
| `src/hooks/useSignals.ts` | Add trueEdgesOnly filter |
| `src/pages/Terminal.tsx` | Wire up new filter state |
| Database migration | Add tracking columns |

---

## Expected Outcome

After implementation:

| Metric | Before | After |
|--------|--------|-------|
| Typical "Edge" values | 20-35% (fake) | 2-10% (real) |
| Match rate | ~0% real matches | Higher with alias expansion |
| False positives | High | Low (0.85 threshold) |
| UI clarity | Confusing | Clear edge vs signal distinction |

Edge distribution for true arbitrage should compress to realistic 2-10% range, with occasional spikes in early/illiquid markets. Unmatched events show signal strength as informational only.

---

## Fallback: Sharp vs Soft Book Edge

If Polymarket matching proves insufficient, implement conservative mode:

```typescript
// Separate sharp-only consensus from soft-book consensus
const sharpConsensus = calculateWeightedAverage(sharpSignals);
const softConsensus = calculateWeightedAverage(softSignals);

// Edge = inefficiency between sharp and soft books
const sharpVsSoftEdge = (softConsensus - sharpConsensus) * 100;
// Expected range: 1-5%
```

This provides meaningful value detection even without Polymarket matching.

