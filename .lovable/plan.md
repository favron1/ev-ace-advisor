

# Add Bet History Entries + Fix Countdown Timers

## Summary
Add 3 bets to your history with correct outcomes, and fix the kickoff countdown timers that are showing incorrect times because the system isn't receiving accurate game start times from data sources.

---

## Part 1: Add Bets to History

### Bet 1: Lakers vs Wizards - WIN
- **Event**: Los Angeles Lakers vs Washington Wizards
- **Pick**: Los Angeles Lakers (YES)
- **Entry**: ~50¢ (based on screenshot showing $2.00 payout = 50%)
- **Stake**: $12 (based on your typical stake)
- **Outcome**: WIN

### Bet 2: Toronto Raptors vs Orlando Magic - LOSS
- **Event**: Toronto Raptors vs Orlando Magic
- **Pick**: Unknown (need to confirm - was it Raptors or Magic?)
- **Entry**: Price TBD
- **Stake**: TBD
- **Outcome**: LOSS

### Bet 3: Memphis Grizzlies vs New Orleans Pelicans - WIN
- **Event**: Memphis Grizzlies vs New Orleans Pelicans
- **Pick**: New Orleans Pelicans (NO side, since they're away team)
- **Entry**: ~50¢
- **Stake**: $12
- **Outcome**: WIN

**I need you to confirm:**
- For Toronto vs Magic: Which team did you bet on, entry price, and stake?
- For Lakers and Pelicans: Are my assumptions on stake ($12) correct?

---

## Part 2: Fix Countdown Timer Issue

### Problem
The countdown shows "10h 7m" for games that have already finished because:

1. The Odds API matching is failing to find actual game times
2. The system falls back to "now + 12 hours" as a default
3. Games coming from Firecrawl scraping don't have accurate commence times

### Root Cause
Looking at the data:
- `event_watch_state.commence_time` is **NULL** for all these events
- `polymarket_h2h_cache.event_date` shows `2026-01-31 15:00:11.38+00` (the +12h fallback)

### Solution

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Improve the Odds API game matching to correctly find commence times:

1. Fix the team name matching algorithm to handle more variations
2. Add logging to identify when matches fail
3. Use a more aggressive matching strategy for NBA/NHL game names

**File: `src/components/terminal/SignalCard.tsx`**

Add a safety check: if the `expires_at` looks like a fallback (exactly 12h from creation time), show "Time TBD" instead of a misleading countdown.

### Technical Changes

```typescript
// In SignalCard.tsx - Add fallback detection
const isFallbackTime = signal.expires_at && signal.created_at 
  ? Math.abs(
      new Date(signal.expires_at).getTime() - 
      new Date(signal.created_at).getTime() - 
      (12 * 60 * 60 * 1000)
    ) < 60000  // Within 1 minute of exactly 12h = likely fallback
  : false;

const countdown = isFallbackTime 
  ? { text: 'Check time', urgent: false, isLive: false }
  : formatCountdown(hoursUntilEvent, hasStarted);
```

### Also Consider
- The backend sync function needs improved matching logic against the Odds API
- May need to add additional sports API sources for more accurate times

---

## Part 3: Display Times in Your Timezone

The times in the database are stored in UTC (which is correct), but the countdown calculation uses your browser's local time via JavaScript's `Date.now()`. This should automatically show correct countdowns in AEDT.

The problem isn't timezone conversion - it's that the source times are wrong (fallback values), not actual game times.

---

## Questions Before Proceeding

1. **Toronto vs Magic bet**: Which team did you bet on, at what price, and stake amount?
2. **Should I proceed with the timer fix** along with adding the bets?

