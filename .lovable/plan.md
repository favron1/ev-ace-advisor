
# Fix: Restore CLOB Price Refresh to polymarket-sync-24h

## Problem Summary

The signal showed **45¢ for OKC** when the real Polymarket price was **23¢**. This happened because the current sync function stores stale/scraped prices instead of live CLOB prices.

## Root Cause Analysis

### What Used to Work (sync-polymarket-h2h)

The original working sync had a **CLOB Price Refresh** step that:

1. Collected all token IDs from cached markets
2. Made a batch POST to `https://clob.polymarket.com/prices`
3. Updated the cache with **real executable prices**

```text
FLOW: Gamma API → Store initial → CLOB API refresh → Update with live prices
```

### What's Broken Now (polymarket-sync-24h)

The new sync stores prices from:

- **Gamma API metadata** (often hours stale)
- **Firecrawl scraper** (regex-parsed markdown, unreliable)

It **never** calls the CLOB API to verify prices.

```text
FLOW: Gamma API / Firecrawl → Store scraped prices → NO REFRESH → Monitor uses stale prices
```

### Why Firecrawl Prices Are Wrong

The regex parser extracts prices like `OKC55¢` from markdown, but:

1. The page format may have changed
2. Multiple price patterns on the page can be mis-paired
3. No validation that extracted prices match actual CLOB orderbook

---

## Implementation Plan

### Phase 1: Add CLOB Price Refresh to polymarket-sync-24h

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

After upserting all markets to the cache, add the same CLOB refresh logic that exists in sync-polymarket-h2h:

```text
1. Query all active H2H markets with token_id_yes from cache
2. Batch-fetch prices from CLOB API: POST /prices with [{ token_id, side: 'BUY' }]
3. Update cache with real CLOB prices (yes_price, no_price, best_bid, best_ask)
4. Mark markets where CLOB returns no data as potentially stale
```

### Phase 2: Validate Firecrawl Prices Against CLOB

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

Before storing Firecrawl-scraped prices:

```text
1. If tokens available, fetch CLOB price first
2. Compare scraped price vs CLOB price
3. If difference > 10%, use CLOB price (more authoritative)
4. Log discrepancy for monitoring
```

### Phase 3: Mark Markets with Stale Prices

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

```text
1. After CLOB refresh, identify markets where price wasn't updated
2. Set a flag: price_source = 'gamma_stale' or 'firecrawl_stale'
3. Monitor can use this to skip or warn on these markets
```

---

## Technical Details

### CLOB Price Refresh Function (copy from sync-polymarket-h2h)

The working version in lines 700-744 of sync-polymarket-h2h:

```text
1. Collect all YES token IDs into a map: tokenId -> conditionId
2. Call fetchClobPrices(allTokenIds) - batch POST to /prices
3. Parse response: BUY = ask price, SELL = bid price
4. Update cache: yes_price = BUY price, no_price = 1 - yes_price
```

### Where to Insert in polymarket-sync-24h

After line ~985 (after the main upsert loop completes), before the "Expire events" section:

```text
// ============= CLOB PRICE REFRESH (CRITICAL) =============
// Fetch real executable prices from Polymarket CLOB API
// This replaces stale Gamma/Firecrawl prices with live orderbook data
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `polymarket-sync-24h/index.ts` | Add CLOB price refresh step after cache upserts |

## Expected Outcome

| Before Fix | After Fix |
|------------|-----------|
| Cache stores Firecrawl scraped price (55¢) | Cache stores CLOB live price (23¢) |
| Monitor uses stale cache price | Monitor uses fresh CLOB price |
| Signal shows wrong edge | Signal shows accurate edge |

---

## Why This Is the Root Fix

The current fixes to polymarket-monitor (orderbook validation, token repair) are band-aids. They try to fix prices at signal-creation time, but by then the cache is already polluted with bad data.

The correct fix is to **refresh prices at sync time** using the authoritative CLOB API, exactly as the original working sync-polymarket-h2h did.
