
## Fix: Side Inversion Bug in polymarket-monitor

### Root Cause Confirmed

Your intuition is correct - **YES is always the first team in the Polymarket event title**. The bug is:

1. `findBookmakerMatch()` returns `targetIndex = 0` when both teams appear in the event name (lines 819-830)
2. But `targetIndex = 0` refers to the **bookmaker API's outcome order**, not Polymarket's
3. Bookmaker APIs often list the **away team first** (e.g., "Edmonton Oilers" is outcomes[0] even though Wild is home)
4. The code then assumes `targetIndex === 0` means "YES side" in Polymarket — **wrong!**

**Data Evidence (Wild vs. Oilers):**

| Field | Value | Problem |
|-------|-------|---------|
| Polymarket title | "Wild vs. Oilers" | Wild = YES, Oilers = NO |
| Bookmaker outcomes[0] | Edmonton Oilers | Oilers listed first in API |
| `targetIndex` | 0 | System thinks "matched team is YES" |
| `isMatchedTeamYesSide` | TRUE | **WRONG** - Oilers are NO side |
| `bookmakerFairProb` | 55.6% (Oilers) | Correctly calculated |
| `yesSideFairProb` | 55.6% | **WRONG** - should be 44.4% (Wild) |
| Stored `recommended_outcome` | Wild | Looks right but... |
| Stored `edge_percent` | 10.6% | **WRONG** - comparing Oilers' 55.6% to Wild's 45¢ |

### Solution

Replace the flawed `targetIndex === 0` logic with explicit team-to-title matching.

**File:** `supabase/functions/polymarket-monitor/index.ts`

**Location:** Lines 1281-1284

**Current Code:**
```typescript
// Determine if matched team is the YES side (home) or NO side (away)
// In Polymarket H2H, YES = home team = first team in "Team A vs. Team B"
// match.targetIndex: 0 = first outcome (typically home), 1 = second outcome (typically away)
isMatchedTeamYesSide = match.targetIndex === 0;
```

**Fixed Code:**
```typescript
// FIXED: Determine YES/NO by comparing matched team to the POLYMARKET title order
// Parse the Polymarket event name to get the YES team (first team in "Team A vs. Team B")
const titleParts = event.event_name.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*-\s*.*)?$/i);
const polyYesTeam = titleParts?.[1]?.trim()?.toLowerCase() || '';
const polyNoTeam = titleParts?.[2]?.trim()?.toLowerCase() || '';
const matchedTeamNorm = normalizeName(teamName || '');

// Get last word of each team (the nickname: "Wild", "Oilers", "Kings", etc.)
const matchedNickname = matchedTeamNorm.split(' ').pop() || '';
const yesNickname = polyYesTeam.split(' ').pop() || '';
const noNickname = polyNoTeam.split(' ').pop() || '';

// Check if matched team's nickname appears in the YES team name
const matchesYes = yesNickname && matchedNickname && 
  (matchedNickname.includes(yesNickname) || yesNickname.includes(matchedNickname));
const matchesNo = noNickname && matchedNickname && 
  (matchedNickname.includes(noNickname) || noNickname.includes(matchedNickname));

// Assign based on which side matched
if (matchesYes && !matchesNo) {
  isMatchedTeamYesSide = true;
} else if (matchesNo && !matchesYes) {
  isMatchedTeamYesSide = false;
} else {
  // Fallback: Log ambiguity and skip this event
  console.log(`[POLY-MONITOR] AMBIGUOUS SIDE: "${teamName}" unclear in "${event.event_name}" - skipping`);
  continue;
}

console.log(`[POLY-MONITOR] Side mapping: matched="${teamName}" → ${isMatchedTeamYesSide ? 'YES' : 'NO'} side (polyYes="${polyYesTeam}", polyNo="${polyNoTeam}")`);
```

### Impact

| Before Fix | After Fix |
|------------|-----------|
| Compares favorite's probability to underdog's price | Compares same team's probability to same team's price |
| Creates phantom 10%+ edges | Only surfaces real edges |
| Recommends wrong team | Recommends correct team |
| Side inversion on 50%+ of signals | Correct side mapping |

### Files Modified

1. `supabase/functions/polymarket-monitor/index.ts` — Lines 1281-1284 replaced with explicit title-based side mapping

### Testing

After deployment, run a scan and verify:
1. New signals have `bookmaker_prob_fair` matching the `recommended_outcome` team
2. Edge calculations compare apples-to-apples (same team's fair prob vs same team's Poly price)
3. No more "Bet on underdog at 45¢ because favorite is 55% fair" signals

### Note on Speaking in Team Names

This fix aligns with your preference to **use team names instead of YES/NO** in the data model. The signal already stores `recommended_outcome` (team name), and the UI should display this rather than "BUY YES". The underlying YES/NO mapping becomes an internal implementation detail, not user-facing language.
