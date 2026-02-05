

# Fix: Restore Market Discovery Volume + Multi-Source Data Reliability

## Problem Analysis

### The Core Issue: Market Discovery Dropped 90%

| Date | Total Markets | Active | With Tokens |
|------|---------------|--------|-------------|
| Jan 31 | **1,073** | 250 | 1,017 |
| Feb 1 | 22 | 7 | 15 |
| Feb 4 | 97 | 38 | 66 |
| Feb 5 | 25 | 25 | 25 |

The drop from 1,073 to ~25-97 markets correlates directly with the performance decline. Your winning streak happened when the sync was discovering 10x more markets.

### Root Cause 1: Aggressive 24-Hour Window Filtering

The `polymarket-sync-24h` function restricts market discovery to only events occurring within 24 hours:

```text
// Current behavior:
1. Event has slug date like "nhl-det-col-2026-02-02"
2. If date is >24h away → IMMEDIATELY REJECTED
3. If no date in slug → Falls through to complex multi-source matching
4. Many valid markets get dropped because their dates are 2-7 days out
```

The original `sync-polymarket-h2h` function fetched ALL active sports events without date filtering, then let the monitor decide which were actionable. This preserved 1000+ markets in the cache for opportunity scanning.

### Root Cause 2: 500-Event Cap Is Too Low

```typescript
// Safety cap at 500 sports events (line 281)
if (allEvents.length >= 500) {
  hasMore = false;
}
```

Polymarket has 1000+ active sports events. The cap prevents full discovery.

### Root Cause 3: Missing Sports-Specific API Endpoints

The Polymarket documentation reveals a better approach:

```text
# Get all supported sports leagues
curl "https://gamma-api.polymarket.com/sports"

# Get events for a specific league (e.g., NBA series_id=10345)
curl "https://gamma-api.polymarket.com/events?series_id=10345&active=true"

# Filter to just game bets (not futures) using tag_id=100639
curl "https://gamma-api.polymarket.com/events?series_id=10345&tag_id=100639"
```

Currently we use `tag_slug=sports` which is less reliable than the dedicated `/sports` endpoint with `series_id` filtering.

---

## Implementation Plan

### Phase 1: Remove 24-Hour Window Restriction

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

Remove the aggressive date filtering that rejects events >24h away. Instead:

1. Cache ALL active sports H2H markets regardless of date
2. Add a `days_until_event` field to help downstream filtering
3. Let the monitor decide what's actionable (it already has the 24h logic)

```text
BEFORE:
  if (slugDate > 24h away) → REJECT IMMEDIATELY

AFTER:
  if (slugDate parseable) → Store with calculated days_until_event
  Mark as "future" if >7 days away (still cache, just flag it)
```

### Phase 2: Increase Event Cap + Add Pagination Improvements

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

```text
1. Increase safety cap from 500 to 2000 events
2. Add per-page logging to debug API responses
3. Add retry logic for failed pages
```

### Phase 3: Use Sports-Specific API Endpoints

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

Add a new discovery strategy that queries the `/sports` endpoint first:

```text
1. Fetch https://gamma-api.polymarket.com/sports
2. For each sport (NBA, NHL, NFL, CBB):
   - Get series_id from /sports response
   - Query /events?series_id=X&active=true&closed=false
3. Merge results with existing tag_slug=sports approach
4. Deduplicate by condition_id
```

This provides redundant discovery paths - if one fails, the other still works.

### Phase 4: Add CLOB Price Verification to All Cached Markets

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

The CLOB price refresh (lines 988-1070) only runs on `market_type='h2h'` markets. Extend to all cached markets to ensure price accuracy across the board.

### Phase 5: Add Discovery Health Monitoring

**File**: New column in `polymarket_h2h_cache` or log output

Track sync health metrics:

```text
- Total events fetched vs expected
- Markets per sport discovered
- Token extraction success rate
- CLOB price match rate
```

This enables quick detection of future API changes.

---

## Technical Details

### Recommended API Strategy

```text
PRIMARY: /sports endpoint + series_id queries
  - More targeted, returns only game markets
  - Avoids futures/outrights that pollute discovery
  - Polymarket maintains this for automated sports

SECONDARY: tag_slug=sports (current approach)
  - Broader but includes more noise
  - Good fallback if /sports endpoint changes

TERTIARY: Firecrawl scraping
  - Already implemented for NBA/CBB
  - Useful for markets not yet in API
```

### Date Handling Strategy

```text
Instead of rejecting events, categorize them:

1. "imminent" - Game within 24 hours (highest priority)
2. "upcoming" - Game in 1-3 days (monitor for line movement)
3. "future" - Game in 3-7 days (cache for reference)
4. "distant" - Game >7 days (cache but don't poll frequently)

This allows the pipeline to prioritize without losing discovery.
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `polymarket-sync-24h/index.ts` | Remove 24h window rejection, add /sports discovery, increase cap |

## Expected Outcome

| Metric | Current | After Fix |
|--------|---------|-----------|
| Markets discovered | ~25-100 | 500-1500 |
| Sports covered | 4 spotty | 4 comprehensive |
| Cache freshness | Stale | CLOB-verified |
| Signal opportunity pool | Low | 10x larger |

## Why This Fixes the Win Rate

The winning streak wasn't about v1.0 thresholds - it was about having 1,073 markets to scan versus 25. More markets = more opportunities = more high-quality edges found. The logic thresholds filter from the pool; if the pool is 90% smaller, the output drops proportionally.

