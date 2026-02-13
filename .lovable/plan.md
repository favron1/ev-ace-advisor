

## Fix: Token Resolution for Firecrawl-Sourced Markets

### Problem

51 out of 58 firecrawl-sourced markets in the cache are missing token IDs. All 15 NBA and 36 of 43 NHL markets have `token_id_yes = null`, making them untradeable.

### Root Cause

The sync function fetches Gamma API events in two phases:
- **Phase 1**: Sports-specific series_id queries (fetches hundreds of NBA/NHL events)
- **Phase 2**: `tag_slug=sports` fallback

But when enriching Firecrawl-scraped games with token IDs, the code only searches a **separate** `tag_slug=sports&limit=200` fetch stored in `gammaEventsForVolume`. This small 200-event pool often misses the NHL/NBA games that were already fetched in Phase 1.

The Phase 1 events (stored in `allEvents`) contain `clobTokenIds` but are never used for Firecrawl token enrichment.

Additionally, the CLOB Search fallback (Part 2) only fetches 200 markets, which is insufficient to cover all active sports markets.

### Solution

**1. Use `allEvents` as the token enrichment source** (lines ~777-789)

Replace the separate `tag_slug=sports&limit=200` fetch for `gammaEventsForVolume` with the already-fetched `allEvents` array from Phase 1 + Phase 2. This immediately gives the `lookupClobVolumeFromCache` function access to all discovered events (potentially 300-500+) instead of just 200.

```text
Before:
  gammaEventsForVolume = fetch("tag_slug=sports&limit=200")  // 200 events
  lookupClobVolumeFromCache() searches gammaEventsForVolume

After:
  gammaEventsForVolume = allEvents  // 300-500+ events from Phase 1+2
  lookupClobVolumeFromCache() searches allEvents
```

This eliminates a redundant API call and dramatically increases match coverage.

**2. Increase CLOB Search limit in Part 2** (line ~1041)

Change the CLOB API search from `limit=200` to `limit=500` for the token resolution fallback, increasing the chance of finding matching markets for any remaining gaps.

**3. Add next_cursor pagination to CLOB Search** (lines ~1038-1131)

The CLOB API supports cursor-based pagination. Add a second page fetch if the first 500 results don't resolve all missing tokens, ensuring comprehensive coverage.

### Technical Details

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

**Change 1** - Remove redundant Gamma fetch, reuse `allEvents` (around line 777):
- Delete the separate `fetch(gamma-api...tag_slug=sports&limit=200)` block
- Set `gammaEventsForVolume = allEvents` directly
- This saves one API call and provides 2-3x more events for matching

**Change 2** - Increase CLOB search coverage (around line 1041):
- Change `limit=200` to `limit=500`
- Add `next_cursor` pagination to fetch a second page if needed

**Change 3** - Improve nickname matching in `lookupClobVolumeFromCache` (around line 793):
- Add case-insensitive full-name matching alongside the current nickname-only matching
- Handle cases like "St. Louis Blues" where the last word "blues" may collide with other teams

### Expected Impact

- Token resolution should jump from 12% (7/58) to 80%+ for firecrawl markets
- NBA markets (currently 0/15 tokens) should get tokens from the Phase 1 NBA series fetch
- NHL markets (currently 7/43 tokens) should improve significantly
- One fewer API call per sync (removing the redundant 200-event fetch)

