# Flip Architecture: Polymarket-First Signal Detection

## Status: Phase 1 & 2 Complete ✅

---

## Implementation Progress

### ✅ Phase 1: Database Table Created
- Created `polymarket_h2h_cache` table with team extraction columns
- Added indexes for fast matching on teams, event date, sport, and status
- RLS policies configured for public read and service write

### ✅ Phase 2: Sync Function Deployed
- `sync-polymarket-h2h` edge function created and tested
- Successfully fetches all Polymarket events (paginated)
- Filters for sports H2H markets
- Extracts team names using regex patterns
- First sync found **75 sports H2H markets** from 1100 events

### 🔄 Phase 3: Watch Mode Integration (Next)
- Modify `watch-mode-poll` to check cache before fetching bookmaker odds
- Only fetch odds for events with matching Polymarket markets

### 📋 Phase 4: Active Mode Integration
- Use `condition_id` for direct price lookups (no search needed)
- Update prices in cache during active polling

### 📋 Phase 5: Detect Signals Integration
- Match bookmaker signals against cache using team names
- Calculate edge for all matched pairs

---

## Current Problem (Why We Flipped)

The old system followed **Bookmakers Lead, Polymarket Reacts**:
1. Scanned bookmaker odds every 5 minutes for movement
2. Tried to find matching Polymarket markets per-event via live API calls
3. Failed frequently because:
   - Polymarket's `title_contains` API search returns political markets
   - Market titles don't match (e.g., "Timberwolves vs. Mavericks" vs "Dallas Mavericks vs Minnesota Timberwolves")
   - Rate limits exhausted on failed lookups

---

## New Flow: Polymarket-First

```text
+---------------------+     +--------------------+     +------------------+
|  1. Fetch ALL      |---->| 2. Store in       |---->| 3. For each     |
|  Polymarket Sports |     | polymarket_h2h_   |     | Polymarket      |
|  H2H Markets Daily |     | cache table       |     | event, fetch    |
|                    |     |                    |     | bookmaker odds  |
+---------------------+     +--------------------+     +------------------+
                                                              |
                                                              v
                                                      +------------------+
                                                      | 4. Compare       |
                                                      | Poly price vs    |
                                                      | Bookmaker fair   |
                                                      | probability      |
                                                      +------------------+
                                                              |
                                                              v
                                                      +------------------+
                                                      | 5. Surface       |
                                                      | actionable       |
                                                      | edges (>2%)      |
                                                      +------------------+
```

---

## Benefits

| Current System | Flipped System |
|---------------|----------------|
| Search-based matching (unreliable) | Pre-cached markets (guaranteed match) |
| Rate-limited per-event lookups | Bulk fetch once daily + live price refresh |
| Missing most NBA games | Every Polymarket sports market captured |
| Manual price entry workaround | Automated end-to-end |

---

## Files Created

| File | Status | Purpose |
|------|--------|---------|
| `supabase/functions/sync-polymarket-h2h/index.ts` | ✅ | Bulk sync Polymarket sports markets |
| `src/hooks/usePolymarketCache.ts` | ✅ | React hook for cache access |
| `src/lib/api/polymarket-cache.ts` | ✅ | API functions for cache operations |

## Files to Modify

| File | Status | Changes |
|------|--------|---------|
| `supabase/functions/watch-mode-poll/index.ts` | 📋 | Check cache first before fetching odds |
| `supabase/functions/detect-signals/index.ts` | 📋 | Use cache for matching |
| `supabase/functions/active-mode-poll/index.ts` | 📋 | Use condition_id for direct price lookup |

---

## Scheduling (To Be Configured)

| Function | Schedule | Purpose |
|----------|----------|---------|
| `sync-polymarket-h2h` | Daily at 6 AM | Bulk refresh all sports markets |
| `watch-mode-poll` | Every 5 min | Check bookmaker odds for cached Poly markets |
| `active-mode-poll` | Every 60 sec | Refresh Poly price + confirm edges |

---

## Known Issues & Improvements Needed

### 1. Sport Category Detection
Current sync found 75 markets but `sport_category` is NULL for most. Need to improve detection logic for NBA, NFL, NHL specifically.

### 2. NBA Game Coverage
First sync didn't find NBA games - may be categorized as "futures" or not available on Polymarket. Need to investigate Polymarket's actual NBA H2H coverage.

### 3. Pagination Limit
Currently stops at 1000 events. May need to increase for comprehensive coverage.

---

## First Sync Results (Jan 28, 2026)

```json
{
  "total_events_fetched": 1100,
  "sports_h2h_markets": 75,
  "skipped": {
    "non_sports": 908,
    "futures": 2603,
    "no_teams": 13
  },
  "duration_ms": 2997
}
```

Most markets found are soccer matches (Premier League, La Liga, etc.). NBA H2H markets may not be available on Polymarket or need different detection.
