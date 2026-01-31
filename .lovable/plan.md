

# Patching Remaining Safety Issues in polymarket-monitor

## Overview

Three targeted fixes to close the remaining inversion/accuracy gaps:

1. **Cached Price Fallback → Skip** - If CLOB fallback can't find `tokenIdYes`, skip the market instead of using stale cached price
2. **Spread Calculation Consistency** - Convert absolute spread to percentage-of-mid for accurate `netEdge` calculation
3. **Movement Detection for Both Teams** - Detect movement on both YES and NO teams, then use the one matching the chosen side

---

## Fix #1: Fallback CLOB Missing Token → Skip (Not Cached Price)

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1360-1362

### Problem
If the fallback CLOB fetch succeeds but doesn't contain the `tokenIdYes`, the code falls back to cached price. This reintroduces inversion risk if the cached price was stored under an inverted assumption.

### Current Code
```typescript
} else {
  console.log(`[POLY-MONITOR] Fallback CLOB: Could not find token_id=${tokenIdYes} in response for "${event.event_name}" - using cached price`);
}
```

### New Code
```typescript
} else {
  console.log(`[POLY-MONITOR] FALLBACK_TOKEN_MISSING`, {
    event: event.event_name,
    conditionId: event.polymarket_condition_id,
    tokenIdYes,
    tokensInResponse: marketData.tokens?.map((t: any) => t.token_id) || [],
  });
  continue; // Cannot safely price trade without confirmed YES token
}
```

---

## Fix #2: Spread Calculation Consistency (Absolute → Percentage of Mid)

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1328-1330

### Problem
Currently `spreadPct` is calculated as `bestAsk - bestBid` (absolute price gap), but the name and `calculateNetEdge()` logic treat it as a percentage. This unit mismatch affects `netEdge` and tier calculations.

### Current Code
```typescript
} else if (bestBid > 0 && bestAsk > 0) {
  spreadPct = bestAsk - bestBid;
}
```

### New Code
```typescript
} else if (bestBid > 0 && bestAsk > 0) {
  // Convert to percentage-of-mid for consistent units with calculateNetEdge()
  const mid = (bestAsk + bestBid) / 2;
  spreadPct = mid > 0 ? (bestAsk - bestBid) / mid : null;
}
```

**Technical Detail:** This ensures that when `spreadPct` is passed to `calculateNetEdge()`, it represents a proportional cost (e.g., 0.03 = 3% of price), not an absolute gap (e.g., 0.03 = 3 cent difference).

---

## Fix #3: Movement Detection for Both Teams

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1535-1539

### Problem
Movement detection only runs for the YES team (`yesTeamName`). This means:
- If the edge is on the NO side, movement confirmation may be missed entirely
- Movement could be attributed to the wrong outcome record

### Current Code
```typescript
// Generate event key for movement detection (use YES team)
const eventKey = generateEventKey(event.event_name, yesTeamName);

// ========== MOVEMENT DETECTION GATE ==========
const movement = await detectSharpMovement(supabase, eventKey, yesTeamName);
```

### New Code
```typescript
// ========== MOVEMENT DETECTION FOR BOTH TEAMS ==========
// Generate keys for both outcomes to ensure movement is captured regardless of final side
const eventKeyYes = generateEventKey(event.event_name, yesTeamName);
const eventKeyNo = generateEventKey(event.event_name, noTeamName);

// Run movement detection in parallel for both teams
const [moveYes, moveNo] = await Promise.all([
  detectSharpMovement(supabase, eventKeyYes, yesTeamName),
  detectSharpMovement(supabase, eventKeyNo, noTeamName),
]);
```

**Additional Change (Lines ~1620-1630):** After side selection, use the correct movement:
```typescript
// Use movement from the side we're actually betting on
const movement = betSide === 'YES' ? moveYes : moveNo;
const movementTriggered = movement.triggered;
```

---

## Summary of Changes

| Location | Change | Purpose |
|----------|--------|---------|
| Lines 1360-1362 | Skip if fallback can't find token | Prevent stale/inverted cached prices |
| Lines 1328-1330 | Convert spread to %-of-mid | Accurate netEdge calculation |
| Lines 1535-1539 | Detect movement for both teams | Correct movement attribution for NO-side bets |
| Lines ~1620-1630 | Select movement based on betSide | Use movement data from the actual recommended side |

---

## Optional Polish: Confidence Score Enhancement

**Current (Lines 1730):**
```typescript
confidence_score: Math.min(85, 50 + Math.floor(netEdge * 500)),
```

**Enhanced:**
```typescript
// Allow ELITE signals with movement boost to reach higher confidence
const baseConfidence = 50 + Math.floor(netEdge * 500) + (movementBoost * 10);
confidence_score: Math.min(95, baseConfidence),
```

This allows movement-confirmed signals to express higher confidence (up to 95 instead of capped at 85).

---

## Why This Matters

- **Fix #1**: Eliminates the last path for stale/inverted cached prices to generate signals
- **Fix #2**: Ensures cost calculations are accurate across all market conditions
- **Fix #3**: Makes movement confirmation consistent regardless of which side has edge

---

## Testing Plan

After deployment:
1. Run `polymarket-monitor`
2. Check logs for `FALLBACK_TOKEN_MISSING` to verify skip behavior
3. Verify `spreadPct` values in cache are reasonable percentages (0.01-0.10 range, not 0.30+)
4. Confirm `MOVEMENT_CONFIRMED` logs show correct `chosenSide` matching the signal's `betSide`

