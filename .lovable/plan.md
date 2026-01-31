

# Implementation Plan: DATE MISMATCH Fix for Placeholder Times

## Problem Summary

The system is skipping valid matches because Polymarket uses placeholder times (`23:59:59` or `00:00:00`) when exact game times are unknown. The current strict `>24h` validation between Polymarket and bookmaker dates causes false rejections.

**Example from logs:**
```
DATE MISMATCH: "Wild vs. Oilers" poly=2026-01-31T23:59:59.000Z vs book=2026-02-02T02:30:00.000Z (27h diff) - SKIPPING
```

This blocks a valid game because the placeholder time creates an artificial 27-hour gap.

## Solution Overview

Add placeholder time detection and use a relaxed day-level check (same day or next day) instead of the strict 24-hour validation for placeholder times. The existing "game within 24h of NOW" check (lines 831-843) continues to provide the real gating.

## Technical Changes

### File: `supabase/functions/polymarket-monitor/index.ts`

### Change 1: Add Helper Functions (after line 36)

Add three utility functions for placeholder detection and date handling:

```typescript
// ============= PLACEHOLDER TIME DETECTION =============
// Polymarket sometimes stores placeholder times when exact game time is unknown

function isPlaceholderPolymarketTime(d: Date): boolean {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  return (
    (h === 23 && m === 59 && s === 59) || // end-of-day placeholder
    (h === 0 && m === 0 && s === 0)       // midnight placeholder
  );
}

function dateOnlyUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function daysDiffUTC(a: Date, b: Date): number {
  const ad = dateOnlyUTC(a).getTime();
  const bd = dateOnlyUTC(b).getTime();
  return Math.abs(ad - bd) / (1000 * 60 * 60 * 24);
}
```

### Change 2: Update DATE MISMATCH Logic (lines 817-827)

Replace the strict date validation with placeholder-aware logic:

**Before:**
```typescript
// DATE VALIDATION: Prevent cross-game matching
if (polymarketEventDate && game.commence_time) {
  const bookmakerDate = new Date(game.commence_time);
  const hoursDiff = Math.abs(polymarketEventDate.getTime() - bookmakerDate.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff > 24) {
    console.log(`[POLY-MONITOR] DATE MISMATCH: ...`);
    continue;
  }
}
```

**After:**
```typescript
// DATE VALIDATION: Prevent cross-game matching
// NOTE: Polymarket sometimes stores placeholder times (23:59:59 or 00:00:00).
// For placeholder times, skip strict hours-based comparison and use day-level check instead.
if (polymarketEventDate && game.commence_time) {
  const bookmakerDate = new Date(game.commence_time);
  const isPlaceholder = isPlaceholderPolymarketTime(polymarketEventDate);

  if (!isPlaceholder) {
    // Strict check: dates must be within 24h
    const hoursDiff = Math.abs(polymarketEventDate.getTime() - bookmakerDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      console.log(`[POLY-MONITOR] DATE MISMATCH: "${eventName}" poly=${polymarketEventDate.toISOString()} vs book=${bookmakerDate.toISOString()} (${hoursDiff.toFixed(0)}h diff) - SKIPPING`);
      continue;
    }
  } else {
    // Placeholder time detected - use softer day-level check
    console.log(`[POLY-MONITOR] PLACEHOLDER_TIME: "${eventName}" poly=${polymarketEventDate.toISOString()} - using day-level + NOW-based validation`);
    
    // Only allow same day or next day to prevent far-future mismatches
    const dd = daysDiffUTC(polymarketEventDate, bookmakerDate);
    if (dd > 1) {
      console.log(`[POLY-MONITOR] DATE_DAY_MISMATCH: "${eventName}" poly=${dateOnlyUTC(polymarketEventDate).toISOString()} vs book=${dateOnlyUTC(bookmakerDate).toISOString()} (${dd.toFixed(0)} days) - SKIPPING`);
      continue;
    }
  }
}
```

### Change 3: Add Placeholder Stats Logging (after line 1336)

Add summary logging to track how many events have placeholder times:

```typescript
// Log placeholder time stats for debugging
try {
  let placeholderCount = 0;
  for (const e of eventsToProcess) {
    const cache = cacheMap.get(e.polymarket_condition_id);
    const rawDate = cache?.event_date || e.commence_time;
    if (!rawDate) continue;
    const d = new Date(rawDate);
    if (!isNaN(d.getTime()) && isPlaceholderPolymarketTime(d)) {
      placeholderCount++;
    }
  }
  console.log(`[POLY-MONITOR] Events with placeholder times: ${placeholderCount}/${eventsToProcess.length}`);
} catch (err) {
  console.log(`[POLY-MONITOR] Placeholder stats error: ${(err as Error)?.message || err}`);
}
```

## Summary of Changes

| Location | Description |
|----------|-------------|
| After line 36 | Add 3 helper functions: `isPlaceholderPolymarketTime`, `dateOnlyUTC`, `daysDiffUTC` |
| Lines 817-827 | Replace strict 24h check with placeholder-aware logic |
| After line 1336 | Add placeholder stats logging for debugging |

## Expected Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Poly `23:59:59` + Book tomorrow 2:30 AM | SKIPPED (27h > 24h) | ALLOWED (same/next day) |
| Poly `23:59:59` + Book Feb 15 | N/A | SKIPPED (day diff > 1) |
| Poly real time + Book 30h apart | SKIPPED | SKIPPED (unchanged) |
| Game within 24h of NOW | Allowed | Allowed (unchanged) |

## Testing After Deployment

1. Deploy the updated `polymarket-monitor` function
2. Run a fresh monitor scan
3. Check logs for `PLACEHOLDER_TIME:` messages
4. Verify `DATE MISMATCH` count decreases
5. Confirm new signals are created for previously-blocked games

