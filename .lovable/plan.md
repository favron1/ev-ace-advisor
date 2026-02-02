

# Fix Missing Bookmaker Prices in Pipeline

## Root Cause Analysis

The Pipeline shows "Book: -" because:

1. **Multiple market types in `polymarket_h2h_cache`**: For the same game (Senators vs Penguins), there are 5 entries:
   - 1 H2H market (condition_id: `0x38030030...`) - **this one has bookmaker data**
   - 2 Spread markets (`-1.5` for each team) - cannot match to H2H bookmaker data
   - 2 Total markets (O/U 5.5, O/U 6.5) - cannot match to H2H bookmaker data

2. **`watch-mode-poll` creates `event_watch_state` entries** for ALL market types, but only H2H markets can successfully match to bookmaker odds

3. **Spread/Total markets will NEVER have bookmaker percentages** because they compare apples to oranges (H2H bookmaker odds vs spread market questions)

## Solution: Multi-Layer Fix

### Layer 1: UI Filtering (Immediate)
**File: `src/pages/Pipeline.tsx`**

Add filter to exclude non-H2H markets from display:

```typescript
const isNonH2HMarket = (event: WatchEvent) => {
  const name = event.event_name.toLowerCase();
  const nonH2HPatterns = [
    'spread:', 'spread ', 'o/u ', 'over/under', 
    '(-1.5)', '(+1.5)', '(-2.5)', '(+2.5)', '(-3.5)', '(+3.5)',
    ': o/u'
  ];
  return nonH2HPatterns.some(p => name.includes(p));
};

// Apply in the filter chain
const filteredEvents = watchEvents.filter(e => 
  !isPastOrStale(e) && 
  !isFuturesMarket(e) && 
  !isNonH2HMarket(e)
);
```

### Layer 2: Database Cleanup (One-time)
Mark existing spread/total entries as expired:

```sql
UPDATE event_watch_state 
SET watch_state = 'expired'
WHERE event_name ILIKE '%spread:%'
   OR event_name ILIKE '%o/u %'
   OR event_name ILIKE '%: o/u%'
   OR event_name LIKE '%(-1.5)%'
   OR event_name LIKE '%(+1.5)%'
   OR event_name LIKE '%(-2.5)%'
   OR event_name LIKE '%(+2.5)%';
```

### Layer 3: Fix Edge Function (Prevents recurrence)
**File: `supabase/functions/watch-mode-poll/index.ts`**

Add H2H filter when querying `polymarket_h2h_cache`:

```typescript
// Current (problematic):
.in('market_type', enabledTypes)

// Fixed:
.eq('market_type', 'h2h')  // Force H2H only
```

This aligns with the documented architecture: "Monitoring and signal generation are strictly restricted to Head-to-Head (H2H/Moneyline) markets."

---

## Technical Details

### Why Spread/Total Markets Can't Match
| Market Type | Polymarket Question | Bookmaker Data | Match Result |
|-------------|---------------------|----------------|--------------|
| H2H | "Senators vs. Penguins" | "Pittsburgh Penguins vs Ottawa Senators" H2H odds | Match |
| Spread | "Spread: Senators (-1.5)" | No spread odds in `bookmaker_signals` | No Match |
| Total | "O/U 5.5" | No totals in `bookmaker_signals` | No Match |

### Files to Modify
| File | Change |
|------|--------|
| `src/pages/Pipeline.tsx` | Add `isNonH2HMarket` filter |
| `supabase/functions/watch-mode-poll/index.ts` | Force `market_type = 'h2h'` filter |

### Database
One-time SQL to expire non-H2H entries from `event_watch_state`.

