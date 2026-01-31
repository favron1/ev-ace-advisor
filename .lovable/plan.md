

# Critical Bug Fix: Recommended Outcome Mismatch

## Problem Identified

The system is showing **"BET: New England Patriots"** with a claimed +17% edge, but the Patriots are actually a 33% underdog (3.02 odds). This is completely wrong!

### Root Cause

There are **two separate misaligned values**:

| Field | Current Value | Should Be |
|-------|---------------|-----------|
| `recommended_outcome` | New England Patriots (matched team) | Seattle Seahawks (the team with +EV) |
| `bookmaker_prob_fair` | 0.33 (Patriots' fair prob) | 0.67 (Seahawks' fair prob - the recommended team) |
| `betSide` | NO | YES |

### The Logic Error

1. **Matching phase** finds "Patriots" in the Polymarket event → sets `teamName = "New England Patriots"`
2. **Edge calculation** correctly determines:
   - Patriots (NO side) has -17% edge (underdog at 33% vs 50% Poly price)
   - Seahawks (YES side) has +17% edge (favorite at 67% vs 50% Poly price)
3. **Signal creation** uses `teamName` as `recommended_outcome` → "Patriots"
4. **But `betSide`** was set to YES (Seahawks) because that's where the positive edge is

**The signal says "bet Patriots (NO shares)" but the edge is on Seahawks (YES shares)!**

This is why you're seeing a Patriots recommendation with sharp odds of 3.02 (33%) - the recommendation doesn't match the edge calculation.

---

## Why the Signals are Wrong

| Signal | Matched Team | Edge Calc Says | Signal Shows | Correct? |
|--------|-------------|----------------|--------------|----------|
| Seahawks vs Patriots | Patriots | Seahawks YES +17% | Patriots NO +17% | **NO** |
| Michigan vs Michigan St | Michigan St | Michigan YES ~13% | Michigan St NO +13% | **NO** |

The `recommended_outcome` stores the **matched team** (used for bookmaker lookup), not the **bet recommendation** (the team with positive edge).

---

## The Fix

### Step 1: Update Signal Creation Logic

When `betSide = YES`, the recommendation should be the **home team** (first in "A vs B").  
When `betSide = NO`, the recommendation should be the **away team** (second in "A vs B").

```typescript
// After edge calculation determines betSide...
const eventParts = event.event_name.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
const homeTeam = eventParts?.[1]?.trim();
const awayTeam = eventParts?.[2]?.trim();

// CRITICAL: recommended_outcome should match betSide, not the matched team
const recommendedOutcome = betSide === 'YES' ? homeTeam : awayTeam;

// CRITICAL: bookmaker_prob_fair should be for the RECOMMENDED team, not matched team
const recommendedFairProb = betSide === 'YES' ? yesSideFairProb : (1 - yesSideFairProb);
```

### Step 2: Use Correct Probability

The `bookmaker_prob_fair` field must store the fair probability of the **recommended team**, not the matched team.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Fix signal creation to use correct `recommended_outcome` and `bookmaker_prob_fair` based on `betSide` |

---

## Immediate Action: Dismiss Current Bad Signals

These NO-side signals with mismatched recommendations need to be dismissed:

1. **Seattle Seahawks vs New England Patriots** (ID: 050d7945...) - Claims Patriots but edge is on Seahawks
2. **Michigan Wolverines vs Michigan State Spartans** (ID: b0ce9b5a...) - Claims Michigan St but edge may be on Michigan

---

## Technical Details

### Current Flow (BROKEN)
```
1. Match "Patriots" → teamName = "Patriots"
2. Get Patriots fair prob = 33%
3. Flip to YES-side: 67%
4. yesEdge = 67% - 50% = +17% (Seahawks edge!)
5. noEdge = 33% - 50% = -17% (Patriots negative edge)
6. betSide = YES (positive edge)
7. BUT signal uses: recommended_outcome = teamName = "Patriots" ← WRONG!
```

### Fixed Flow
```
1. Match "Patriots" → bookmakerFairProb = 33% for matched team
2. Flip to YES-side: yesSideFairProb = 67%
3. yesEdge = +17%, noEdge = -17%
4. betSide = YES
5. Parse event: home = "Seattle Seahawks", away = "New England Patriots"
6. recommended_outcome = homeTeam = "Seattle Seahawks" ← CORRECT!
7. bookmaker_prob_fair = 67% (Seahawks fair prob) ← CORRECT!
```

---

## Summary

The system correctly calculates which side has positive edge, but then stores the wrong team as the recommendation. This is a critical bug that makes ALL signals potentially backwards.

After fixing, the Patriots signal would become:
- **BET: Seattle Seahawks TO WIN**  
- **Sharp books value Seahawks at 67% to win**
- **Edge: +17% (67% fair vs 50% Poly)**

This matches reality: Seahawks are 1.49 favorites (~67%), Polymarket has them at 50%, so buying YES is +EV.

