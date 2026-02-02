
# Remove Futures from Pipeline Display

## Problem
The Pipeline page is showing futures markets (e.g., "Where will Giannis be traded?", "NBA Win Totals") that shouldn't be there. These are non-H2H markets that entered through the `polymarket-first-scan` edge function or Polymarket sync.

## Solution
Filter the Pipeline UI to only display H2H (head-to-head) game markets and clean up existing futures entries from the database.

---

## Implementation

### 1. Update Pipeline Page Query
**File: `src/pages/Pipeline.tsx`**

Add a client-side filter to exclude futures markets. H2H games can be identified by:
- Having a valid `bookmaker_source` (e.g., `basketball_nba`, `icehockey_nhl`)
- Event names containing "vs." or "beat" patterns
- Excluding patterns like "traded", "win totals", "trophy", "championship"

```typescript
const isFuturesMarket = (event: WatchEvent) => {
  const name = event.event_name.toLowerCase();
  const futuresPatterns = [
    'traded', 'trade', 'win totals', 'over or under',
    'trophy', 'championship', 'mvp', 'winner', 'playoffs',
    'division', 'conference', 'which', 'where will'
  ];
  return futuresPatterns.some(p => name.includes(p));
};

// Apply filter when grouping events
const filteredEvents = watchEvents.filter(e => 
  !isPastOrStale(e) && 
  !isFuturesMarket(e)
);
```

### 2. Database Cleanup
Run a one-time cleanup to remove futures from `event_watch_state`:

```sql
-- Mark futures as expired so they don't show in Pipeline
UPDATE event_watch_state 
SET watch_state = 'expired'
WHERE event_name ILIKE '%traded%'
   OR event_name ILIKE '%win totals%'
   OR event_name ILIKE '%over or under%'
   OR event_name ILIKE '%trophy%'
   OR event_name ILIKE '%championship%'
   OR event_name ILIKE '%mvp%'
   OR event_name ILIKE '%which%will%'
   OR event_name ILIKE '%where will%';

-- Optionally delete them entirely
DELETE FROM event_watch_state 
WHERE watch_state = 'expired';
```

### 3. Update State Summary Cards
Remove expired/dropped from the summary grid since they're now filtered out:

```typescript
// Only show active pipeline states
const stateOrder = ['signal', 'confirmed', 'active', 'monitored', 'watching'];
```

---

## Technical Details

### Futures Detection Patterns
Markets are identified as futures if the event name contains:
- Trade-related: "traded", "trade"
- Season-long: "win totals", "over or under"
- Awards: "trophy", "mvp"
- Postseason: "championship", "playoffs", "division", "conference"
- Question format: "which", "where will"

### Files to Modify
| File | Changes |
|------|---------|
| `src/pages/Pipeline.tsx` | Add `isFuturesMarket` filter, update event grouping, remove expired/dropped from summary |

### Database Changes
One-time SQL execution to clean up existing futures entries.
