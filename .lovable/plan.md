

# Implementation Plan: Signal Side Inversion Bug Fix

## Problem Confirmed

The database shows the bug clearly:
- **Event**: "Canadiens vs. Sabres" 
- **Signal stored**: `side: YES`, `recommended_outcome: Buffalo Sabres`, `polymarket_price: 0.46`
- **Reality**: In "Canadiens vs. Sabres", YES = Canadiens (46¢), NO = Sabres (54¢)
- **Result**: The signal is recommending Sabres but storing the Canadiens price

The existing side consistency guard (lines 1624-1643) should have caught this, but failed because the `yesTeamName` and `noTeamName` from `findBookmakerMatch()` were not matching the `recommendedOutcome` string exactly (likely due to normalization differences like "Buffalo Sabres" vs bookmaker's name format).

---

## Technical Changes

### File 1: `supabase/functions/polymarket-monitor/index.ts`

#### Change 1A: Strengthen the Side Consistency Guard (lines 1624-1643)

**Current code** does a simple string equality check which can fail due to normalization differences:
```typescript
const expectedSide: 'YES' | 'NO' = recommendedOutcome === yesTeamName ? 'YES' : 'NO';
```

**Replace with** normalized comparison using the same `normalizeName()` function used elsewhere:
```typescript
// SAFETY RAIL #4: Outcome-side consistency guard with normalized matching
// Uses same normalization as team matching to prevent false mismatches
const recOutcomeNorm = normalizeName(recommendedOutcome);
const yesTeamNorm = normalizeName(yesTeamName);
const noTeamNorm = normalizeName(noTeamName);

// Check which team the recommended outcome matches using word overlap
const recWords = new Set(recOutcomeNorm.split(' ').filter(w => w.length > 2));
const yesWords = new Set(yesTeamNorm.split(' ').filter(w => w.length > 2));
const noWords = new Set(noTeamNorm.split(' ').filter(w => w.length > 2));

const yesOverlap = [...recWords].filter(w => yesWords.has(w)).length;
const noOverlap = [...recWords].filter(w => noWords.has(w)).length;

let expectedSide: 'YES' | 'NO';
if (yesOverlap > noOverlap) {
  expectedSide = 'YES';
} else if (noOverlap > yesOverlap) {
  expectedSide = 'NO';
} else {
  // Equal overlap or zero - use exact match as fallback
  expectedSide = recOutcomeNorm === yesTeamNorm ? 'YES' : 'NO';
}

if (expectedSide !== betSide) {
  console.error(`[POLY-MONITOR] SIDE_INVERSION_BLOCKED: ${recommendedOutcome} mapped to ${expectedSide} but betSide=${betSide}. Forcing side=${expectedSide}.`, {
    event: event.event_name,
    yesTeamName,
    noTeamName,
    recommendedOutcome,
    yesOverlap,
    noOverlap,
    originalBetSide: betSide,
    yesEdge,
    noEdge,
  });

  betSide = expectedSide;
  rawEdge = expectedSide === 'YES' ? yesEdge : noEdge;
  recommendedFairProb = expectedSide === 'YES' ? yesFairProb : noFairProb;
}
```

#### Change 1B: Add Final Validation Gate Before Signal Insert (~line 1769)

Add a hard gate immediately before storing the signal that validates side/outcome alignment:

```typescript
// =========================
// CRITICAL: FINAL SIDE/OUTCOME VALIDATION (last-resort gate)
// =========================
// This catches any edge cases where team mapping produced a mismatch
// If recommending NO team but side=YES (or vice versa), BLOCK the signal

const finalRecNorm = normalizeName(recommendedOutcome);
const finalYesNorm = normalizeName(yesTeamName);
const finalNoNorm = normalizeName(noTeamName);

// Extract nicknames for validation
const recNickname = finalRecNorm.split(' ').pop() || '';
const yesNickname = finalYesNorm.split(' ').pop() || '';
const noNickname = finalNoNorm.split(' ').pop() || '';

const matchesYes = recNickname === yesNickname || finalRecNorm.includes(yesNickname);
const matchesNo = recNickname === noNickname || finalRecNorm.includes(noNickname);

if (matchesNo && !matchesYes && betSide === 'YES') {
  console.error(`[POLY-MONITOR] FINAL_GATE_BLOCKED: ${recommendedOutcome} matches NO team but betSide=YES`, {
    event: event.event_name,
    yesTeamName,
    noTeamName,
    recommendedOutcome,
    betSide,
  });
  continue; // Skip this signal entirely rather than risk inversion
}

if (matchesYes && !matchesNo && betSide === 'NO') {
  console.error(`[POLY-MONITOR] FINAL_GATE_BLOCKED: ${recommendedOutcome} matches YES team but betSide=NO`, {
    event: event.event_name,
    yesTeamName,
    noTeamName,
    recommendedOutcome,
    betSide,
  });
  continue; // Skip this signal entirely rather than risk inversion
}
```

#### Change 1C: Enhanced Debug Logging (line 1771)

Update the signal creation log to include full team mapping context:
```typescript
console.log(`[POLY-MONITOR] SIGNAL CREATE: ${betSide} ${recommendedOutcome} @ ${(signalPolyPrice * 100).toFixed(1)}c | YES=${yesTeamName} @ ${(livePolyPrice * 100).toFixed(1)}c, NO=${noTeamName} @ ${((1-livePolyPrice) * 100).toFixed(1)}c`);
```

---

### File 2: `supabase/functions/refresh-signals/index.ts`

#### Change 2A: Add Both-Sides Price Fetch with Validation (lines 408-423)

Currently refresh fetches only the signal's stored side. Add validation logging that shows both sides:

```typescript
// Get live price from CLOB based on signal side
// ENHANCED: Also fetch the opposite side for validation logging
let livePrice: number | null = null;
let oppositePrice: number | null = null;

if (cache) {
  const tokenId = signal.side === 'YES' ? cache.token_id_yes : cache.token_id_no;
  const oppositeTokenId = signal.side === 'YES' ? cache.token_id_no : cache.token_id_yes;
  
  if (tokenId && clobPrices[tokenId]) {
    livePrice = parseFloat(clobPrices[tokenId]);
  } else {
    // Fallback to cached price
    livePrice = signal.side === 'YES' ? cache.yes_price : cache.no_price;
  }
  
  if (oppositeTokenId && clobPrices[oppositeTokenId]) {
    oppositePrice = parseFloat(clobPrices[oppositeTokenId]);
  } else {
    oppositePrice = signal.side === 'YES' ? cache.no_price : cache.yes_price;
  }
  
  if (livePrice !== null) {
    console.log(`[REFRESH] PRICE_FETCH: signal=${signal.id.slice(0,8)} side=${signal.side} price=${(livePrice * 100).toFixed(1)}c opposite=${oppositePrice !== null ? (oppositePrice * 100).toFixed(1) + 'c' : 'null'}`);
  }
}
```

---

### Database Cleanup

Expire the incorrectly-mapped Sabres signal:

```sql
UPDATE signal_opportunities
SET status = 'expired'
WHERE id = '86537ab7-57bd-4e02-944c-0da3a389cf6d';
```

---

## Summary of Changes

| File | Location | Change |
|------|----------|--------|
| `polymarket-monitor/index.ts` | Lines 1624-1643 | Strengthen side consistency guard with normalized word-overlap matching |
| `polymarket-monitor/index.ts` | Before line 1773 | Add final validation gate that blocks mismatched side/outcome signals |
| `polymarket-monitor/index.ts` | Line 1771 | Enhanced logging showing both team prices |
| `refresh-signals/index.ts` | Lines 408-423 | Fetch and log both YES and NO prices for validation |
| Database | N/A | Expire buggy signal ID `86537ab7-57bd-4e02-944c-0da3a389cf6d` |

---

## Verification Checklist

After deployment:
1. Check logs for `SIDE_INVERSION_BLOCKED` or `FINAL_GATE_BLOCKED` entries
2. Any new signals must have:
   - `side: YES` only when `recommended_outcome` matches the first team in the title
   - `side: NO` only when `recommended_outcome` matches the second team in the title
3. `polymarket_price` should match the side being recommended (not always the YES price)
4. Refresh should correctly update prices for both YES and NO side signals

