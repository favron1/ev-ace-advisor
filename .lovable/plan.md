

# Fix Polymarket Prices & Missing Book Data in Pipeline

## Problem Summary
The Pipeline shows incorrect data because:
1. **Multiple duplicate market entries** exist in `polymarket_h2h_cache` for the same game (different market types like spreads/totals/h2h)
2. **Stale 50¢ prices** persist in many cache entries that never got CLOB price updates
3. **`watch-mode-poll`** uses these stale cache prices instead of fresh CLOB data

## Solution Overview
Fix the data flow so Pipeline always shows the correct, most recent prices.

---

## Part 1: Clean Up Duplicate Cache Entries (Database)
Delete duplicate `polymarket_h2h_cache` entries that have stale 50¢ prices when a better entry exists:

```sql
-- Remove duplicate cache entries with stale 50/50 prices 
-- when a fresher entry exists for the same event
DELETE FROM polymarket_h2h_cache 
WHERE id IN (
  SELECT older.id 
  FROM polymarket_h2h_cache older
  WHERE older.yes_price = 0.5 
    AND older.no_price = 0.5
    AND older.status = 'active'
    AND EXISTS (
      SELECT 1 FROM polymarket_h2h_cache better
      WHERE better.event_title = older.event_title
        AND better.status = 'active'
        AND better.id != older.id
        AND (better.yes_price != 0.5 OR better.no_price != 0.5)
        AND better.last_price_update > older.last_price_update
    )
);
```

---

## Part 2: Update `watch-mode-poll` to Prioritize Fresh Prices
**File: `supabase/functions/watch-mode-poll/index.ts`**

When selecting markets from the cache, filter out duplicate entries and prioritize those with non-50¢ prices:

**Change 1**: Modify the cache query to exclude 50/50 placeholder prices when fresher data exists

```typescript
// Around line 487-497: Add filter to exclude stale 50/50 entries
const { data: apiMarkets, error: apiError } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .eq('status', 'active')
  .eq('market_type', 'h2h')
  .gte('volume', minVolume)
  .not('event_date', 'is', null)
  .lte('event_date', maxEventDate)
  .or('source.is.null,source.neq.firecrawl')
  // NEW: Exclude stale 50/50 placeholder prices
  .not('yes_price', 'eq', 0.5)
  .order('last_price_update', { ascending: false }) // Prioritize freshest
  .order('volume', { ascending: false })
  .limit(MAX_MARKETS_PER_SCAN);
```

**Change 2**: Add deduplication logic after loading markets

```typescript
// After line 535 where markets are combined:
const polyMarkets = [...(apiMarkets || []), ...(firecrawlMarkets || []), ...(manualMarkets || [])];

// NEW: Deduplicate by event_title, keeping the one with most recent price update
const seenEvents = new Map<string, typeof polyMarkets[0]>();
for (const market of polyMarkets) {
  const existing = seenEvents.get(market.event_title);
  if (!existing || 
      (market.last_price_update && 
       (!existing.last_price_update || 
        new Date(market.last_price_update) > new Date(existing.last_price_update)))) {
    // Prefer markets with non-50/50 prices
    if (market.yes_price !== 0.5 || !existing || existing.yes_price === 0.5) {
      seenEvents.set(market.event_title, market);
    }
  }
}
const uniqueMarkets = Array.from(seenEvents.values());
```

---

## Part 3: Fix Stale `event_watch_state` Prices
**File: `supabase/functions/watch-mode-poll/index.ts`**

The function stores `polymarket_yes_price: polyMarket.yes_price` from cache, but should refresh from CLOB or at minimum use the deduped market.

Update lines 968-970 and 985-986 to use fresh prices from the best available cache entry.

---

## Part 4: Database Cleanup - Remove Stale Watch State Entries
Remove old `event_watch_state` entries that have null book data and 50¢ poly prices:

```sql
-- Clean stale event_watch_state entries with placeholder data
DELETE FROM event_watch_state 
WHERE polymarket_yes_price = 0.5
  AND current_probability IS NULL
  AND updated_at < NOW() - INTERVAL '2 days';
```

---

## Summary of Changes

| Change | Location | Description |
|--------|----------|-------------|
| Remove duplicate cache entries | SQL migration | Delete 50/50 entries when better data exists |
| Filter stale prices in query | watch-mode-poll | Exclude `yes_price = 0.5` placeholder entries |
| Deduplicate by event name | watch-mode-poll | Keep only freshest price per game |
| Clean old watch state | SQL migration | Remove entries with null book data |

---

## Expected Result
After these changes:
- Pipeline will show correct Polymarket prices (28¢, 46¢, etc.) instead of 50¢
- All events with book coverage will display book percentages
- No more duplicate events in the Pipeline view
- Fresh data prioritized over stale placeholder data

