
# Implementing Enhanced Logging + Movement Tier-Only Upgrade

## Overview

Two targeted refinements to eliminate the last inversion vector and make debugging instant:

1. **Enhanced Logging** - Full context on every blocked/skipped signal
2. **Movement Logic Refactor** - Movement upgrades tier, never overrides side

---

## Change #1: Enhanced Logging for MAPPING_INVERSION_DETECTED

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1556-1558

### Current Code
```typescript
if (bestB > bestA + MAPPING_MARGIN) {
  console.log(`[POLY-MONITOR] MAPPING_INVERSION_DETECTED: "${event.event_name}" | bestA=${...} - SKIPPING`);
  continue;
}
```

### New Code
```typescript
if (bestB > bestA + MAPPING_MARGIN) {
  console.log(`[POLY-MONITOR] MAPPING_INVERSION_DETECTED`, {
    event: event.event_name,
    polyPrice: livePolyPrice,
    yesFairProb,
    noFairProb,
    bestA,
    bestB,
    margin: MAPPING_MARGIN,
    tokenIdYes,
    yesTeamName,
    noTeamName,
    spreadPct,
    volume: liveVolume,
    bestBid,
    bestAsk,
  });
  continue;
}
```

---

## Change #2: Enhanced Logging for No TokenIdYes Skip

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1336-1339

### Current Code
```typescript
if (!tokenIdYes) {
  console.log(`[POLY-MONITOR] No tokenIdYes for "${event.event_name}" - SKIPPING`);
  continue;
}
```

### New Code
```typescript
if (!tokenIdYes) {
  console.log(`[POLY-MONITOR] NO_TOKEN_ID_SKIP`, {
    event: event.event_name,
    conditionId: event.polymarket_condition_id,
    cachedPrice: event.polymarket_yes_price,
    cachedVolume: event.polymarket_volume,
  });
  continue;
}
```

---

## Change #3: Movement Never Overrides Side - Only Upgrades Tier

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1586-1603

### Current Code (Dangerous - can force wrong side)
```typescript
// Movement direction can OVERRIDE if strong directional signal
if (movement.triggered) {
  if (movement.direction === 'shortening' && yesEdge > 0.03) {
    betSide = 'YES';
    rawEdge = yesEdge;
    recommendedOutcome = yesTeamName;
    recommendedFairProb = yesFairProb;
  } else if (movement.direction === 'drifting' && noEdge > 0.03) {
    betSide = 'NO';
    rawEdge = noEdge;
    recommendedOutcome = noTeamName;
    recommendedFairProb = noFairProb;
  }
}
```

### New Code (Safe - tier boost only)
```typescript
// SAFETY RAIL #3: Movement NEVER overrides side selection
// It only boosts tier/confidence when there's already meaningful edge on chosen side
let movementBoost = 0;

if (movement.triggered) {
  // Only boost if there's already meaningful edge on the chosen side
  if (rawEdge >= 0.05) {
    movementBoost = 2;
  } else if (rawEdge >= 0.03) {
    movementBoost = 1;
  }
  
  console.log(`[POLY-MONITOR] MOVEMENT_CONFIRMED`, {
    event: event.event_name,
    direction: movement.direction,
    chosenSide: betSide,
    rawEdge,
    movementBoost,
    booksConfirming: movement.booksConfirming,
  });
}
```

---

## Change #4: Apply Movement Boost to Tier Calculation

**File:** `supabase/functions/polymarket-monitor/index.ts`
**Location:** Lines 1644-1645

### Current Code
```typescript
const signalTier = calculateSignalTier(movementTriggered, netEdge);
```

### New Code
```typescript
// Calculate base tier, then apply movement boost
let signalTier = calculateSignalTier(movementTriggered, netEdge);

// Movement boost can upgrade tier: STATIC -> STRONG -> ELITE
if (movementBoost >= 2 && signalTier === 'static') {
  signalTier = 'strong';
} else if (movementBoost >= 2 && signalTier === 'strong') {
  signalTier = 'elite';
} else if (movementBoost >= 1 && signalTier === 'static') {
  signalTier = 'strong';
}
```

---

## Summary of Changes

| Location | Change | Purpose |
|----------|--------|---------|
| Lines 1336-1339 | Enhanced NO_TOKEN_ID_SKIP log | Debugging oracle for missing tokens |
| Lines 1556-1558 | Enhanced MAPPING_INVERSION_DETECTED log | Full context on every blocked inversion |
| Lines 1586-1603 | Remove side override, add movementBoost | Eliminate last "force wrong side" risk |
| Lines 1644-1645 | Apply movementBoost to tier | Movement upgrades tier instead of overriding side |

---

## Why This Matters

- **Logging**: Every skipped signal becomes self-explaining in one log line
- **Movement Safety**: Side selection is now purely based on edge calculation, making it mathematically impossible for movement to force an inverted signal
- **Tier Upgrade**: Movement still matters - it boosts confidence/tier, just doesn't touch side selection

---

## Testing Plan

After deployment:
1. Run `polymarket-monitor` 
2. Check logs for structured JSON output on `MAPPING_INVERSION_DETECTED` and `NO_TOKEN_ID_SKIP`
3. Verify `MOVEMENT_CONFIRMED` logs show boost without side changes
4. Confirm no inverted signals appear in `signal_opportunities`
