
# Root Cause Analysis: Bookmaker Data as Source of Truth

## Executive Summary

The system currently has **three core architectural flaws** causing stale signals, duplicate markets, and signals for completed games:

1. **Trusting Polymarket timestamps** - The system stores Polymarket's placeholder times (23:59:59 or 00:00:00 UTC) as `event_date` and `expires_at` instead of using bookmaker `commence_time`
2. **Trusting Polymarket prices as fallback** - When CLOB data fails, the system falls back to stale cached prices (often 50¢) instead of deriving prices from bookmaker fair probability
3. **No authoritative bookmaker sync** - Bookmaker data is treated as supplementary for matching rather than as the canonical source

---

## Root Cause Deep-Dive

### Issue 1: Placeholder Timestamps Create Stale/Duplicate Signals

**Current Flow:**
```
Polymarket API → event.endDate (often 23:59:59 placeholder)
                    ↓
              polymarket_h2h_cache.event_date = placeholder
                    ↓
              signal_opportunities.expires_at = placeholder
                    ↓
              Signal shows as "valid" even after game finished
```

**Evidence from database:**
```sql
-- Multiple games have 23:59:59 placeholder times
event_date:2026-01-31 23:59:59+00  (Rangers vs. Penguins - FINISHED)
event_date:2026-01-31 23:59:59+00  (Jets vs. Panthers - FINISHED)
event_date:2026-01-31 23:59:59+00  (Ipswich vs Preston - duplicated)
```

**Code Location (polymarket-sync-24h):**
Line 468: `const eventDate = resolvedDate || new Date(event.endDate || event.startDate);`
- Falls back to Polymarket's placeholder when no better date found
- Odds API cross-reference happens but result isn't always persisted

### Issue 2: Stale 50¢ Cache Prices Create False Edges

**Current Flow:**
```
CLOB API → returns 99¢ (game resolved)
              ↓
        Price rejected as "resolved" (good!)
              ↓
        BUT: Fallback to cache.yes_price (0.5)
              ↓
        Signal created with 50¢ vs 60% fair = false edge!
```

**Evidence from database:**
```sql
-- Cache shows stale 0.5 prices despite active CLOB data
yes_price:0.5, no_price:0.5  (Jets vs. Panthers - best_ask: 0.999!)
yes_price:0.5, no_price:0.5  (Rangers vs. Penguins - best_ask: 0.999!)
```

**Code Location (polymarket-monitor):**
Line 1578: `let livePolyPrice = cache?.yes_price || event.polymarket_yes_price || 0.5;`
- When CLOB fails or returns resolved prices, system uses cached 50¢

### Issue 3: No Bookmaker-Authoritative Date Override

**What Should Happen:**
Bookmaker data from Odds API (Pinnacle, Betfair) has accurate `commence_time` for every game. This should be the **canonical source** for:
- When the game starts (for expiration)
- Whether the game has already started (for signal blocking)
- General consensus scheduling

**What Currently Happens:**
- `findOddsApiCommenceTime()` in sync-24h finds the correct time
- But it's only used as a fallback, not persisted to cache
- Monitor function has partial fix (lines 1470-1510) but doesn't update cache

---

## The Solution: Bookmaker-First Architecture

### Principle: "Sharp Books Are Truth"

When syncing and monitoring, always:
1. Use bookmaker `commence_time` as authoritative event start
2. Derive Polymarket edge from CLOB ask price vs bookmaker fair probability
3. When CLOB fails, skip the market entirely (no stale fallback)

### Implementation Changes

#### Change 1: Persist Bookmaker Commence Time to Cache

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Add `bookmaker_commence_time` column to track accurate start time:
- When matching Polymarket event to Odds API game, store `game.commence_time`
- Update existing helper `findOddsApiCommenceTime()` to return both team match AND time
- Persist to `polymarket_h2h_cache.bookmaker_commence_time`

#### Change 2: Update Cache Prices from CLOB During Sync

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

After upsert to cache, batch-fetch CLOB prices and write `yes_price`/`no_price`:
- Add CLOB batch price fetch after cache upsert
- Update `yes_price`, `no_price`, `best_bid`, `best_ask` columns
- Skip updating if CLOB returns resolved prices (< 2¢ or > 98¢)

#### Change 3: Use Bookmaker Time as Signal Expiry

**File: `supabase/functions/polymarket-monitor/index.ts`**

Replace `event.commence_time` (Polymarket) with `bookmaker_commence_time`:
- Line 2360: `expires_at: event.commence_time` → `expires_at: match.game.commence_time`
- SMS block gate (line 711-723): Already uses `event.commence_time`, update to use matched bookmaker time

#### Change 4: Eliminate Stale Price Fallback

**File: `supabase/functions/polymarket-monitor/index.ts`**

When CLOB returns no price or resolved price, skip the market entirely:
- Line 1578: Remove `|| 0.5` fallback
- Add explicit skip if `livePolyPrice` is undefined after CLOB fetch
- Log `SKIPPED_NO_CLOB_PRICE` for debugging

#### Change 5: Add Bookmaker Fair Probability as Price Reference

When CLOB data is unavailable but bookmaker data exists:
- Use `yesFairProb` from bookmaker consensus as reference
- Signal creation blocked unless live CLOB price is available
- Display bookmaker fair % in UI as secondary reference

### Database Schema Changes

```sql
-- Add bookmaker-authoritative time to cache
ALTER TABLE polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS bookmaker_commence_time TIMESTAMPTZ;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_cache_bookmaker_time 
ON polymarket_h2h_cache(bookmaker_commence_time);
```

---

## Technical Implementation Summary

| File | Change | Lines Affected |
|------|--------|----------------|
| `polymarket-sync-24h/index.ts` | Persist `bookmaker_commence_time` from Odds API match | ~550-600 |
| `polymarket-sync-24h/index.ts` | Batch CLOB price fetch + cache update | ~750-850 |
| `polymarket-monitor/index.ts` | Use bookmaker time for `expires_at` | ~2360 |
| `polymarket-monitor/index.ts` | Remove 0.5 fallback, skip if no CLOB | ~1578 |
| `polymarket-monitor/index.ts` | Skip market if CLOB returns resolved price | ~1600-1624 |
| Database migration | Add `bookmaker_commence_time` column | New migration |

---

## Expected Outcomes

After implementation:
- **No stale signals**: Games that have finished will be detected immediately via bookmaker commence_time
- **No false edges**: Markets without live CLOB prices will be skipped, not filled with 50¢
- **Accurate expiration**: `expires_at` will reflect actual game start, not placeholder midnight
- **Duplicate prevention**: Each game will have one canonical start time, preventing duplicate detection

---

## Verification Steps

1. Run sync → Verify `bookmaker_commence_time` populated for NHL games
2. Run monitor → Verify signals use bookmaker time, not placeholder
3. Check for completed games → Verify they're expired/skipped, not signaled
4. Check for 50¢ prices → Verify no signals created with stale cache prices
