
# Fix NBA/Multi-Sport Market Discovery

## The Problem

The Polymarket sync function uses `endDate` to filter markets within a 24-hour window. This works for NHL (where `endDate` = game day) but fails for NBA and some other sports where Polymarket sets `endDate` to the end of the season/playoffs rather than the individual game date.

**Result**: All those NBA games you see on Polymarket (Spurs vs Hornets, Hawks vs Pacers, etc.) are being skipped because their `endDate` is April 2026 or July 2026.

---

## The Solution

Modify the sync logic to check BOTH `endDate` AND `startDate`, and also parse the game date from the market question when available (many markets include "on 2026-01-31" in the question text).

---

## Technical Changes

### File: supabase/functions/polymarket-sync-24h/index.ts

**Change the date filtering logic (around lines 300-311):**

```typescript
// BEFORE: Only checks endDate
const endDate = new Date(event.endDate);
if (endDate > in24Hours || endDate < now) {
  statsOutsideWindow++;
  continue;
}

// AFTER: Check startDate, endDate, AND parsed date from question
function isWithin24HourWindow(event: any, now: Date, in24Hours: Date): boolean {
  // 1. Try startDate first (most accurate for game time)
  if (event.startDate) {
    const startDate = new Date(event.startDate);
    if (startDate >= now && startDate <= in24Hours) {
      return true;
    }
  }
  
  // 2. Try endDate
  if (event.endDate) {
    const endDate = new Date(event.endDate);
    if (endDate >= now && endDate <= in24Hours) {
      return true;
    }
  }
  
  // 3. Parse date from question text (e.g., "on 2026-01-31?")
  const question = event.markets?.[0]?.question || '';
  const dateMatch = question.match(/on\s+(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const parsedDate = new Date(dateMatch[1] + 'T23:59:59Z');
    if (parsedDate >= now && parsedDate <= in24Hours) {
      return true;
    }
  }
  
  return false;
}
```

**Add logging to track which date source was used:**

```typescript
console.log(`[DATE] Using ${dateSource} for ${event.title}`);
```

---

## Expected Results After Fix

| Metric | Before | After |
|--------|--------|-------|
| NHL H2H captured | ~50 | ~50 (no change) |
| NBA H2H captured | 0 | ~20-40 games |
| Tennis H2H captured | Futures only | Individual matches |
| Total actionable markets | ~35 | ~100+ |

---

## Database Considerations

No schema changes required. The `polymarket_h2h_cache` table already has the right structure - we just need to populate it with more markets.

---

## Testing

After deploying, run a manual sync and verify:
1. NBA games for Jan 31 (Spurs vs Hornets, Hawks vs Pacers, etc.) appear in cache
2. The `polymarket-monitor` picks up these markets for edge detection
3. Signal generation increases for NBA

---

## Timeline

Single edge function modification - can be implemented in one change.
