
# Fix: Align Recommended Outcome with Bet Direction

## Problem Confirmed

The system is showing "BUY NO" with `recommended_outcome` set to the matched team name, which creates confusion. When `side = 'NO'`, the user should bet on the **away team** (second in "A vs B"), but the signal might be showing the home team as the recommendation.

## Root Cause

Line 1507 in `polymarket-monitor/index.ts`:
```typescript
recommended_outcome: teamName,  // <-- Always uses matched team, not bet direction
```

The `teamName` variable stores whichever team was found during bookmaker matching (could be home OR away), but the `betSide` determines which team to actually bet on.

## The Fix

### Step 1: Parse Home/Away Teams from Event Name

After determining `betSide`, parse the event title to get both team names:

```typescript
// Parse "Team A vs Team B" to get home (YES) and away (NO) teams
const eventParts = event.event_name.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*-\s*.*)?$/i);
const homeTeamFromEvent = eventParts?.[1]?.trim() || teamName;
const awayTeamFromEvent = eventParts?.[2]?.trim() || teamName;
```

### Step 2: Set Recommended Outcome Based on Bet Side

```typescript
// CRITICAL: recommended_outcome must match betSide
// YES = home team (first), NO = away team (second)
const recommendedOutcome = betSide === 'YES' ? homeTeamFromEvent : awayTeamFromEvent;
```

### Step 3: Set Correct Fair Probability

The `bookmaker_prob_fair` field should reflect the probability of the **recommended team**, not the matched team:

```typescript
// Fair prob for the team we're recommending to bet on
const recommendedFairProb = betSide === 'YES' 
  ? yesSideFairProb 
  : (1 - yesSideFairProb);
```

### Step 4: Update Signal Creation

Replace line 1507:
```typescript
// OLD:
recommended_outcome: teamName,

// NEW:
recommended_outcome: recommendedOutcome,
```

And update `signalData` at line 1434:
```typescript
// OLD:
bookmaker_prob_fair: bookmakerFairProb,

// NEW:
bookmaker_prob_fair: recommendedFairProb,
```

## File Changes

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Add event parsing after `betSide` determination (~line 1355), update signal creation to use `recommendedOutcome` and `recommendedFairProb` |

## After This Fix

For "Seattle Seahawks vs New England Patriots" where sharp books have Patriots at 33%:

**Before (BROKEN)**:
- `recommended_outcome`: "New England Patriots"
- `bookmaker_prob_fair`: 0.33
- `side`: "YES"
- Display: "BET: Patriots" with 33% fair prob ← Confusing!

**After (FIXED)**:
- `recommended_outcome`: "Seattle Seahawks" (home team = YES side)
- `bookmaker_prob_fair`: 0.67 (Seahawks' fair probability)
- `side`: "YES"
- Display: "BET: Seattle Seahawks TO WIN" with 67% fair prob ← Clear!

## Immediate Cleanup

The current Patriots signal needs to be dismissed since it was created with the wrong `recommended_outcome`. After deploying the fix, a fresh scan will create the correct signal.
