

# Fix Countdown Timer Accuracy + "NO" Terminology

## Summary
Two issues need fixing:

1. **Countdown times are wrong** - The Odds API is returning incorrect commence times (midnight UTC instead of actual game times), causing 8h games to show as 20h away
2. **"NO" terminology is confusing** - Signals show "side: NO" which is confusing since Polymarket doesn't support lay bets. Should display the actual team being bet on.

---

## Issue 1: Blue Jackets vs Blues Signal

The signal **IS in the database and active**. It should be visible on the Terminal. Possible reasons it's not showing:

- You may have scrolled past it
- There might be a filter applied
- The page might need a refresh

**Verification step:** Click the "Refresh" button on the signal feed or reload the page.

---

## Issue 2: Wrong Countdown Times

### Root Cause
The Odds API is returning `2026-02-01 00:00:00+00` (midnight UTC on Feb 1st) for the St. Louis Blues vs Columbus Blue Jackets game. This appears to be **incorrect data from the API** - they're returning end-of-day or a placeholder instead of the actual puck drop time.

**Evidence from logs:**
```
[FIRECRAWL] Matched Columbus Blue Jackets vs St. Louis Blues -> Kickoff: 2026-02-01T00:00:00.000Z
```

**Calculation:**
- Current time: ~3:45am UTC (2:45pm AEDT)
- Stored game time: Feb 1, 00:00 UTC (Feb 1, 11:00am AEDT)
- Result: Shows ~20h countdown

But you're saying the game is ~8h 15m away (around 11pm-12am AEDT tonight).

### Technical Solution

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Add fallback logic to detect when Odds API returns suspicious "midnight" times and use a more reasonable estimate:

```typescript
// In findOddsApiCommenceTime function
// If commence_time is exactly midnight UTC, it's likely wrong
const commenceTime = new Date(game.commence_time);
const isExactMidnight = commenceTime.getUTCHours() === 0 && 
                        commenceTime.getUTCMinutes() === 0;

if (isExactMidnight) {
  console.log(`[WARN] Suspicious midnight time for ${game.home_team} vs ${game.away_team} - likely inaccurate`);
  // Don't use this as a match - fall through to next source
  continue;
}
```

Alternatively, **don't trust midnight UTC times from Odds API** and instead:
1. Mark the signal as having uncertain timing
2. Show "Time TBD" instead of a misleading countdown

---

## Issue 3: "NO" Terminology in Signals + Stats

### Problem
- Memphis Grizzlies vs New Orleans Pelicans shows "side: NO" 
- The SMS said "BET ON New Orleans Pelicans TO WIN"
- But the bet history shows "NO" which is confusing

### How It Works
In Polymarket H2H markets:
- **YES = Home team wins** (Team A in "Team A vs Team B")
- **NO = Away team wins** (Team B)

So "side: NO" on Memphis vs New Orleans means: **Bet on New Orleans Pelicans to win** (the away team).

### Solution
The Stats page already has the fix from earlier to display team names instead of YES/NO. We need to ensure:

1. **Signal cards** also show the team name, not YES/NO
2. **SMS alerts** already show the correct team (New Orleans Pelicans) which is correct!

**File: `src/components/terminal/SignalCard.tsx`**

Update the "BUY YES" / "BUY NO" display to show the actual team being bet on:

```typescript
// Parse home/away from event title
const getPickedTeam = (): string => {
  const vsMatch = signal.event_name.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!vsMatch) return signal.side;
  const [, teamA, teamB] = vsMatch;
  return signal.side === 'YES' ? teamA.trim() : teamB.trim();
};

// Display: "BUY Minnesota Wild" instead of "BUY NO"
```

---

## Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Skip midnight UTC times from Odds API as likely inaccurate |
| `src/components/terminal/SignalCard.tsx` | Display team name instead of YES/NO |

---

## Technical Details

### Midnight Time Detection
```typescript
// Add to findOddsApiCommenceTime() function
function findOddsApiCommenceTime(team1Name: string, team2Name: string): Date | null {
  // ... existing matching code ...
  
  for (const game of oddsApiGames) {
    // ... existing matching ...
    
    if ((matches1Home && matches2Away) || (matches1Away && matches2Home)) {
      const commenceTime = new Date(game.commence_time);
      
      // NEW: Skip suspicious midnight times (likely API data quality issue)
      const isExactMidnight = commenceTime.getUTCHours() === 0 && 
                              commenceTime.getUTCMinutes() === 0 &&
                              commenceTime.getUTCSeconds() === 0;
      
      if (isExactMidnight) {
        console.log(`[WARN] Skipping midnight UTC time for ${game.home_team} vs ${game.away_team}`);
        continue; // Try next match
      }
      
      if (!isNaN(commenceTime.getTime())) {
        return commenceTime;
      }
    }
  }
  
  return null;
}
```

### Team Name Display in SignalCard
```typescript
// Add helper function
const getPickedTeam = (): string => {
  const vsMatch = signal.event_name.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!vsMatch) return signal.side === 'YES' ? 'Home' : 'Away';
  const [, teamA, teamB] = vsMatch;
  return signal.side === 'YES' ? teamA.trim() : teamB.trim();
};

// Replace "BUY YES" / "BUY NO" display with:
<span className={`text-xs font-bold ${signal.side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
  BUY {getPickedTeam()}
</span>
```

---

## Expected Results

After these fixes:
1. **Midnight times will be skipped** - Games with suspicious 00:00 UTC times will fall back to "Check time" display instead of showing wrong countdowns
2. **Team names instead of YES/NO** - "BUY Minnesota Wild" instead of "BUY NO"
3. **Consistent terminology** - SMS, terminal, and stats all show team names

