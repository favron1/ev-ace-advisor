

# Fix: Restore 24-Hour H2H-Only Pipeline + Hard Cleanup

## Problem Summary

The sync function is caching markets WAY outside the approved 24-hour window, flooding the system with untradeable data:

| Current State | Count | Impact |
|---------------|-------|--------|
| Total active markets | 2,778 | Overwhelming |
| Outside 24h window | 2,569 (93%) | Untradeable |
| Within 24h window | 207 (7%) | Actionable |
| Default 50c price | 1,700 (61%) | No real pricing |
| Non-H2H markets | 1,384 (50%) | Wrong market type |
| event_watch_state with book price | 14 (0.8%) | Pipeline broken |

### Root Cause

Despite your explicit approval of "24 hours" for market horizon, the sync function was changed to "cache ALL - don't reject based on date", filling the database with future games that have no active orderbooks (hence 50c prices) and no Odds API coverage (hence no book prices).

---

## Solution: Three-Part Fix

### Part 1: Hard Cleanup (Database)

Run cleanup queries to expire and remove:
- Markets with event_date > 24h from now
- Non-H2H market types (futures, totals, spreads, props)
- event_watch_state entries for expired/cleaned markets

```text
-- Expire markets outside 24h window
UPDATE polymarket_h2h_cache 
SET status = 'expired', monitoring_status = 'idle'
WHERE event_date > NOW() + INTERVAL '26 hours'
  AND status = 'active';

-- Expire non-H2H market types
UPDATE polymarket_h2h_cache 
SET status = 'expired', monitoring_status = 'idle'
WHERE market_type != 'h2h'
  AND status = 'active';

-- Expire matching event_watch_state entries
UPDATE event_watch_state 
SET watch_state = 'expired'
WHERE polymarket_condition_id IN (
  SELECT condition_id FROM polymarket_h2h_cache 
  WHERE status = 'expired'
);
```

### Part 2: Restore 24h Filter in Sync Function

File: `supabase/functions/polymarket-sync-24h/index.ts`

#### Change 1: Restore rejection in parseEventDate()

Around line 476, change from:

```text
// CACHE ALL - don't reject based on date
return { resolvedDate: slugDate, dateSource: 'slug', priority, hoursUntilEvent: hoursUntil };
```

To:

```text
// ENFORCE 24h WINDOW: Only cache imminent H2H games
if (hoursUntil > 24) {
  return { resolvedDate: null, dateSource: 'rejected-future', priority: 'distant', hoursUntilEvent: hoursUntil };
}
return { resolvedDate: slugDate, dateSource: 'slug', priority, hoursUntilEvent: hoursUntil };
```

Apply same pattern to lines ~487, ~497, ~511, ~541, ~568 (all date extraction paths).

#### Change 2: Add explicit 24h check in qualifying loop

After line 603 (after past events check), add:

```text
// RESTORE: Reject events more than 24 hours away
if (hoursUntilEvent > 24) {
  continue;
}
```

#### Change 3: Filter to H2H only in qualifying loop

Around line 639-641, change from:

```text
// Skip futures markets (championship, MVP, etc.)
if (marketType === 'futures') {
  continue;
}
```

To:

```text
// H2H ONLY: Skip all non-H2H market types
if (marketType !== 'h2h') {
  continue;
}
```

#### Change 4: Reduce event cap

Line 415-416, change from:

```text
if (allEvents.length >= 2000)
```

To:

```text
if (allEvents.length >= 500)
```

With proper 24h+H2H filtering, we should only have ~50-150 markets.

#### Change 5: Restrict CLOB refresh to 24h window

Lines 1161-1165, add date filter:

```text
.eq('status', 'active')
.eq('market_type', 'h2h')  // ADD: H2H only
.not('token_id_yes', 'is', null)
.gte('event_date', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())  // ADD: Started in last 2h (live)
.lte('event_date', new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()); // ADD: Within 26h
```

### Part 3: Update Console Logs

Change line 239 from:

```text
console.log('[POLY-SYNC-24H] FIX v2: FULL discovery mode - caching ALL markets, no date rejection');
```

To:

```text
console.log('[POLY-SYNC-24H] STRICT MODE: 24h window, H2H markets only');
```

---

## Expected Results After Fix

| Metric | Current | After Fix |
|--------|---------|-----------|
| Cached markets | 2,778 | ~100-200 |
| Within 24h window | 7% | 100% |
| Markets with real CLOB prices | 39% | 90%+ |
| event_watch_state with book price | 0.8% | 60%+ |
| Non-H2H markets in cache | 1,384 | 0 |
| Sync execution time | 45s+ (timeout) | ~15s |
| Signal generation | Broken | Restored |

---

## Technical Details

### Why 50c Prices Everywhere

The Gamma API returns prices from market metadata, but:
1. Future games (3-7 days out) don't have active trading yet
2. Without active orderbooks, Gamma returns no price data
3. The sync defaults to 0.5 when no price found
4. CLOB refresh fails for these markets (no active orderbook)

Result: 61% of markets stuck at 50c placeholder.

### Why No Book Prices

The Odds API only provides data for games starting within 24-48 hours. Markets 5+ days out:
1. Don't exist in Odds API response
2. Can't be matched to bookmaker fair probabilities
3. Show `null` for `current_probability` in `event_watch_state`

Result: 99.2% of watched events have no bookmaker price to compare against.

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Restore 24h rejection, H2H filter, reduce cap |
| Database | Hard cleanup of existing bad data |

### Cleanup Scope

This will expire ~2,600 markets currently in the database:
- 2,569 outside 24h window
- ~1,384 non-H2H (some overlap with above)

Remaining: ~150-200 H2H markets within 24h - all tradeable with real pricing.

