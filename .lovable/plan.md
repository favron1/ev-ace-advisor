

# Plan: Fix Inverted Edge Calculations for H2H Signals

## Problem Summary

The Avalanche vs. Red Wings and Hurricanes vs. Capitals signals are showing **inverted fair probabilities**:

| Signal | DB Shows | Bookmaker Reality |
|--------|----------|-------------------|
| Red Wings | 58.2% fair | **33.3%** fair (should be the underdog) |
| Capitals | 60.2% fair | **31.6%** fair (should be the underdog) |

This causes the system to recommend betting on underdogs as if they were favorites, creating false "high-edge" signals.

---

## Root Cause Analysis

I traced through the entire matching and calculation pipeline. The bug is in `findBookmakerMatch()` (lines 812-831).

### The Fallback Bug

When **BOTH teams are found** in the Polymarket event name (common for H2H markets), the code falls into a fallback:

```javascript
} else {
  // Both teams found - try question, then fallback
  if (homeWords.some(w => questionNorm.includes(w))) {
    targetIndex = 0;
    teamName = game.home_team;
  } else if (awayWords.some(w => questionNorm.includes(w))) {
    targetIndex = 1;
    teamName = game.away_team;
  } else {
    // BUG: Always picks index 0 (first bookmaker outcome)
    targetIndex = 0;
    teamName = market.outcomes[0]?.name || game.home_team;
  }
}
```

**Why this fails:**
- Bookmaker data: "Detroit Red Wings vs Colorado Avalanche" → Index 0 = Colorado (46.6%)
- Polymarket title: "Avalanche vs. Red Wings" (different order)
- System sets `targetIndex = 0` and gets **Colorado's probability (46.6%)**
- After 3-way to 2-way conversion: 46.6% / 79.9% = **58.3%**
- System **thinks** this is Detroit's probability (because `teamName = Detroit`)
- Edge calculation uses wrong probability → **inverted recommendation**

---

## Solution

### Fix 1: Use Polymarket Title Order to Determine Target Team

Instead of relying on bookmaker outcome order, determine which team to track based on **which Polymarket side** we're calculating:

```javascript
// When both teams are found in event name:
// Parse Polymarket title to get YES/NO teams
const titleParts = eventName.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
const polyYesTeamNorm = normalizeName(titleParts?.[1] || '');
const polyNoTeamNorm = normalizeName(titleParts?.[2] || '');

// Match each Polymarket team to bookmaker outcomes
const yesOutcomeIndex = market.outcomes.findIndex(o => {
  const outcomeNorm = normalizeName(o.name);
  const yesNickname = polyYesTeamNorm.split(' ').pop();
  return outcomeNorm.includes(yesNickname);
});

const noOutcomeIndex = market.outcomes.findIndex(o => {
  const outcomeNorm = normalizeName(o.name);
  const noNickname = polyNoTeamNorm.split(' ').pop();
  return outcomeNorm.includes(noNickname);
});

// Calculate fair probability for BOTH sides directly
const yesFairProb = calculateConsensusFairProb(..., yesOutcomeIndex, ...);
const noFairProb = calculateConsensusFairProb(..., noOutcomeIndex, ...);

// Now edge calculation uses correct probabilities
```

### Fix 2: Simplify Edge Calculation

Since we can calculate both YES and NO fair probabilities directly:

```javascript
// Direct comparison - no inversions needed
const yesEdge = yesFairProb - livePolyPrice;
const noEdge = noFairProb - (1 - livePolyPrice);

// Pick the positive edge side
if (yesEdge > 0 && yesEdge >= noEdge) {
  betSide = 'YES';
  recommendedOutcome = polyYesTeam;
  recommendedFairProb = yesFairProb;
  rawEdge = yesEdge;
} else if (noEdge > 0) {
  betSide = 'NO';
  recommendedOutcome = polyNoTeam;
  recommendedFairProb = noFairProb;
  rawEdge = noEdge;
}
```

### Fix 3: Add Validation Logging

Add explicit probability sanity checks:

```javascript
// Sanity check: Fair prob should match roughly with bookmaker consensus
console.log(`[POLY-MONITOR] Fair probs: YES=${polyYesTeam}=${(yesFairProb*100).toFixed(1)}%, NO=${polyNoTeam}=${(noFairProb*100).toFixed(1)}%`);

// Block if probabilities don't sum to ~100%
if (Math.abs(yesFairProb + noFairProb - 1.0) > 0.05) {
  console.log(`[POLY-MONITOR] PROBABILITY MISMATCH: ${yesFairProb + noFairProb} - skipping`);
  continue;
}
```

---

## Technical Changes

### Files to Modify

1. **`supabase/functions/polymarket-monitor/index.ts`**
   - Refactor `findBookmakerMatch()` to return both YES and NO team mappings
   - Modify edge calculation section (lines 1375-1436) to use direct team-to-probability mapping
   - Add probability validation logging
   - Remove the fragile `isMatchedTeamYesSide` inversion logic

### Changes Summary

```
Current flow:
1. Match ONE team → get its probability
2. Determine if matched team is YES or NO side
3. Invert probability if needed
4. Calculate edge with inverted values

New flow:
1. Parse Polymarket title → get YES team and NO team names
2. Find bookmaker probability for YES team directly
3. Find bookmaker probability for NO team directly  
4. Calculate yesEdge = yesFairProb - polyYesPrice
5. Calculate noEdge = noFairProb - polyNoPrice
6. Pick the side with positive edge
```

---

## Immediate Action

Before implementing the full fix, I can **expire the current bad signals** and they won't resurface until the code is fixed (because the edge calculation would produce the same wrong result).

Should I proceed with:
1. Expiring the Avalanche/Red Wings and Hurricanes/Capitals signals now
2. Implementing the fix to prevent future inversions

