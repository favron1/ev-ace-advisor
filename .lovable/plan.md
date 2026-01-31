

# ✅ FIXED: Sharp Book Probability Display Mismatch

## Problem Summary

The signal card showed **"Sharp books value Blackhawks at 60.1% to win"** but actual bookmaker data showed Blackhawks at **~40%** (odds of 2.67). This caused user confusion about which team was favored.

## Root Cause

There were **TWO bugs**:

### Bug 1: Frontend Display Flip (SignalCard.tsx)
The frontend incorrectly flipped `bookmakerProbFair` when displaying for NO side bets.

### Bug 2: Backend Edge Calculation (polymarket-monitor/index.ts)
The edge calculation assumed `bookmakerFairProb` was for the YES side, but it was actually for the **matched team** (which could be either side).

---

## Solution Applied

### Fix 1: Frontend Display (SignalCard.tsx)
Removed the flip logic since `bookmakerProbFair` is already for the matched team.

```typescript
// BEFORE (WRONG):
const displayFairProb = isAwayTeamBet 
  ? (1 - bookmakerProbFair) * 100 
  : bookmakerProbFair * 100;

// AFTER (CORRECT):
const displayFairProb = bookmakerProbFair * 100;
```

### Fix 2: Backend Edge Calculation (polymarket-monitor/index.ts)
Added tracking for which side the matched team is on, then normalize to YES-side probability before edge calculation.

```typescript
// Track which side the matched team is on
isMatchedTeamYesSide = match.targetIndex === 0;

// Normalize to YES-side probability
const yesSideFairProb = isMatchedTeamYesSide ? bookmakerFairProb : (1 - bookmakerFairProb);

// Now edge calculations are correct
const yesEdge = yesSideFairProb - livePolyPrice;
const noEdge = (1 - yesSideFairProb) - (1 - livePolyPrice);
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/terminal/SignalCard.tsx` | Removed flip logic in two places (lines 437-443 and 517-521) |
| `supabase/functions/polymarket-monitor/index.ts` | Added `isMatchedTeamYesSide` tracking and normalized edge calculation |

---

## Expected Behavior After Fix

For the Blackhawks example:
- **Before**: "Sharp books value Blackhawks at 60.1% to win" (WRONG)
- **After**: "Sharp books value Blackhawks at 39.9% to win" (CORRECT - matches bookmaker odds)

For edge calculation:
- **Before**: False 19.1% edge displayed (inverted calculation)
- **After**: Correct edge or no signal if edge is negative

---

## Testing

1. ✅ Run a poll and check signals where `side = 'NO'`
2. ✅ Verify displayed sharp book probability matches actual bookmaker odds
3. ✅ Cross-reference with Sportsbet/bookmaker site to confirm accuracy
