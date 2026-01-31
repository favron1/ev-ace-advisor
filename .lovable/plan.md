

# Fix: Sharp Book Probability Display Mismatch

## Problem Summary

The signal card shows **"Sharp books value Blackhawks at 60.1% to win"** but the actual bookmaker data shows Blackhawks at **~40%** (odds of 2.67). This causes user confusion about which team is actually favored.

## Root Cause

There's a **semantic mismatch** between how the backend stores `bookmaker_probability` and how the frontend interprets it:

| Component | What it thinks `bookmaker_probability` represents |
|-----------|--------------------------------------------------|
| **Backend** | Fair probability for the **matched team** (the team we're recommending to bet ON) |
| **Frontend** | Fair probability for the **YES side** (home team in Polymarket H2H format) |

### Example (Blue Jackets vs. Blackhawks)

```
Polymarket: "Blue Jackets vs. Blackhawks"
  - YES = Blue Jackets win
  - NO = Blackhawks win

Actual bookmaker odds:
  - Blue Jackets: $1.77 → ~60% fair (FAVORITE)
  - Blackhawks: $2.67 → ~40% fair (UNDERDOG)

Signal created:
  - recommended_outcome: "Chicago Blackhawks"
  - side: "NO" 
  - bookmaker_probability: 0.399 (Blackhawks' fair prob - CORRECT!)

Frontend display bug:
  - Sees side="NO", assumes bookmaker_probability is for YES side
  - Flips it: 1 - 0.399 = 0.601 = 60.1%
  - Shows "Sharp books value Blackhawks at 60.1%" ← WRONG!
```

The backend edge calculation is **CORRECT** (19.1% edge for BUY NO), but the display is **INVERTED**.

---

## Solution

Fix the frontend display logic in `SignalCard.tsx` to correctly interpret `bookmakerProbFair`:

### Current Logic (WRONG)
```typescript
// Lines 440-443 in SignalCard.tsx
const displayFairProb = isAwayTeamBet 
  ? (1 - bookmakerProbFair) * 100  // Flips for NO side
  : bookmakerProbFair * 100;
```

### Fixed Logic
```typescript
// bookmakerProbFair already represents the MATCHED TEAM's probability
// (i.e., the team we're betting ON), so no flipping needed
const displayFairProb = bookmakerProbFair * 100;
```

### Similar fix for the odds comparison section (lines 520-521)
```typescript
// Current (WRONG):
const displayPolyPrice = isNoBet ? (1 - polyYesPrice) : polyYesPrice;
const displayFairProb = isNoBet ? (1 - bookmakerProbFair) : bookmakerProbFair;

// Fixed:
const displayPolyPrice = isNoBet ? (1 - polyYesPrice) : polyYesPrice;
const displayFairProb = bookmakerProbFair; // Already for the bet side
```

---

## Technical Details

### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `src/components/terminal/SignalCard.tsx` | 440-443 | Remove flip logic for `displayFairProb` in bet recommendation text |
| `src/components/terminal/SignalCard.tsx` | 520-521 | Remove flip logic for `displayFairProb` in odds comparison section |

### Why the Edge Calculation is Correct

The backend edge calculation in `polymarket-monitor/index.ts` (lines 1305-1326) correctly calculates bidirectional edges:

```typescript
// If betting NO:
const noEdge = (1 - bookmakerFairProb) - (1 - livePolyPrice);
// = (1 - 0.399) - (1 - 0.59)
// = 0.601 - 0.41 = 0.191 = 19.1% ← CORRECT
```

Wait - this math is also wrong! Let me recalculate:
- Polymarket YES price = 0.59 (for Blue Jackets)
- Polymarket NO price = 0.41 (for Blackhawks)
- Bookmaker fair prob for Blackhawks = 0.399

Edge = Fair prob - Market price = 0.399 - 0.41 = **-0.011 = -1.1%** (NEGATIVE edge!)

This reveals a **second bug**: The edge is being calculated incorrectly in the backend too.

---

## Updated Root Cause Analysis

There are actually **TWO bugs**:

### Bug 1: Frontend Display Flip (confirmed)
The frontend incorrectly flips `bookmakerProbFair` when displaying for NO side bets.

### Bug 2: Backend Edge Calculation Uses Wrong Polymarket Price
Looking at the edge calculation:
```typescript
const yesEdge = bookmakerFairProb - livePolyPrice;  // YES edge
const noEdge = (1 - bookmakerFairProb) - (1 - livePolyPrice);  // NO edge
```

For Blackhawks:
- `bookmakerFairProb` = 0.399 (Blackhawks fair prob)
- `livePolyPrice` = 0.59 (Blue Jackets YES price!)

The calculation uses the **YES price** for both sides, but when betting NO, we should compare:
- What we pay: Polymarket NO price = 1 - 0.59 = 0.41
- What it's worth: Bookmaker NO fair prob

Since `bookmakerFairProb` is already for Blackhawks (the NO side), the NO edge should be:
```typescript
noEdge = bookmakerFairProb - (1 - livePolyPrice)
       = 0.399 - 0.41 = -0.011 (negative edge!)
```

But the code calculates:
```typescript
noEdge = (1 - bookmakerFairProb) - (1 - livePolyPrice)
       = 0.601 - 0.41 = 0.191 (19.1% - WRONG!)
```

The bug is that the code assumes `bookmakerFairProb` is for the YES side, but it's actually for the **matched team** (which could be either side).

---

## Complete Fix

### Fix 1: Frontend Display (simple)
Remove the flip logic since `bookmakerProbFair` is already for the matched team.

### Fix 2: Backend Edge Calculation (critical)
The backend needs to track which team `bookmakerFairProb` represents and calculate edges accordingly.

**Option A: Store the YES-side probability always**
Modify `calculateConsensusFairProb` to always return the probability for the YES side (home team), regardless of which team was matched. Then flip when needed.

**Option B: Store both probabilities**
Add `bookmaker_yes_prob` and `bookmaker_no_prob` fields to avoid ambiguity.

### Recommended: Option A
In `polymarket-monitor/index.ts`, after matching:

```typescript
// Get fair prob for the matched team
let matchedTeamFairProb = calculateConsensusFairProb(match.game, match.marketKey, match.targetIndex, sport);

// Convert to YES-side probability for consistent storage
// If matched team is the YES side (home team), use as-is
// If matched team is the NO side (away team), flip it
const isMatchedTeamYesSide = determineIfMatchedTeamIsYesSide(match, event);
const yesSideFairProb = isMatchedTeamYesSide ? matchedTeamFairProb : (1 - matchedTeamFairProb);

// Now edge calculations work correctly
const yesEdge = yesSideFairProb - livePolyPrice;
const noEdge = (1 - yesSideFairProb) - (1 - livePolyPrice);
```

---

## Impact

- **Fixes incorrect probability display** on signal cards
- **Fixes incorrect edge calculation** that may be surfacing false signals
- **Prevents user confusion** about which team is favored

## Testing

1. Run a poll and check a signal where `side = 'NO'`
2. Verify the displayed sharp book probability matches actual bookmaker odds
3. Cross-reference with Sportsbet/bookmaker site to confirm accuracy

