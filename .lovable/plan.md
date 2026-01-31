

# Fix: Signal Created for Wrong Game Date

## Problem Identified

The "Red Wings vs. Avalanche" signal showing 41.8% fair probability is mixing data from **two different games**:

| Data Source | Game Date | Details |
|-------------|-----------|---------|
| Polymarket market | **Feb 2, 2026** | Condition `0x91194...`, slug `nhl-det-col-2026-02-02` |
| Bookmaker odds | **Jan 31, 2026** | Colorado @ Detroit TODAY |
| Cache `event_date` | Jan 31 (WRONG) | Should be Feb 2 |

**Result**: System calculates bookmaker fair probability for **today's game** but applies it to **Feb 2nd's Polymarket market**, creating a phantom signal.

---

## Root Cause

The cache entry for `0x91194...` has `event_date: 2026-01-31 18:00:00` but the CLOB data says `game_start_time: 2026-02-03T02:00:00Z` (Feb 2nd 9PM ET).

This date mismatch causes the bookmaker matching to find "Avalanche vs Red Wings" (the Jan 31 game) and use those odds for the Feb 2nd Polymarket market.

---

## Solution

### Fix 1: Parse Game Date from CLOB `game_start_time`

When syncing markets to the cache, use the CLOB `game_start_time` field (not inferred from question text) as the authoritative event date:

```typescript
// In sync function
const gameStartTime = clobMarket.game_start_time;
if (gameStartTime) {
  eventDate = new Date(gameStartTime);
}
```

### Fix 2: Add Date Validation to Bookmaker Matching

Before matching a Polymarket market to bookmaker odds, validate the dates are within 24 hours:

```typescript
// In findBookmakerMatch()
const polyDate = new Date(event.event_date);
const bookDate = new Date(game.commence_time);
const hoursDiff = Math.abs(polyDate.getTime() - bookDate.getTime()) / 36e5;

if (hoursDiff > 24) {
  console.log(`[POLY-MONITOR] DATE MISMATCH: Poly=${polyDate.toISOString()}, Book=${bookDate.toISOString()} - skipping`);
  continue;
}
```

### Fix 3: Expire the Current Bad Signal

The active "Red Wings vs. Avalanche" signal (ID `1a2329a0...`) is based on wrong data and should be expired immediately.

---

## Technical Changes

### Files to Modify

1. **`supabase/functions/polymarket-sync-24h/index.ts`** (or similar sync function)
   - Update event_date parsing to use CLOB `game_start_time` field

2. **`supabase/functions/polymarket-monitor/index.ts`**
   - Add date validation in `findBookmakerMatch()` to prevent cross-game matching
   - Log warning when Polymarket and bookmaker event dates don't align

3. **Database**: Fix the cache entry for `0x91194...` to have correct event_date

---

## Immediate Actions

1. Expire the bad signal (`1a2329a0...`)
2. Update cache entry for `0x91194...` to correct event_date (Feb 2nd)
3. Implement date validation in matching logic

