
# Implementation Plan: Fix Bookmaker-First Architecture + Token Resolution

## Current State Analysis

### Critical Issues Discovered

| Issue | Location | Current State | Impact |
|-------|----------|---------------|--------|
| `bookmaker_commence_time` never written | `polymarket-sync-24h` | Column exists but code never populates it | All signals use Polymarket placeholder times (23:59 UTC) |
| `expires_at` uses wrong time | `polymarket-monitor` line 2360 | `expires_at: event.commence_time` | Games show wrong expiration |
| `0.5` price fallback active | `polymarket-monitor` line 1578 | `\|\| 0.5` still present | Creates false 50% edges |
| Token IDs missing | 46 of 49 markets blocked | Gamma API token extraction failing | 94% of markets untradeable |

### Funnel Analysis (from monitor logs)
```
49 watching → 3 tokenized (46 blocked) → 3 matched → 0 edges → 0 signals
```

The **tokenization gate** is the primary blocker - 94% of markets fail before reaching edge calculation.

---

## Solution Architecture

### Phase 1: Fix Bookmaker Time Population (Sync Function)

**File:** `supabase/functions/polymarket-sync-24h/index.ts`

**Change 1a:** Write `bookmaker_commence_time` when upserting Firecrawl games (after line 753)
- The sync already calls `findOddsApiCommenceTime()` to get accurate start times
- Currently stores result in `event_date` but NOT in `bookmaker_commence_time`
- Add: `bookmaker_commence_time: actualCommenceTime?.toISOString() || null`

**Change 1b:** Write `bookmaker_commence_time` when upserting Gamma events (after line 916)
- For Gamma-sourced markets, look up bookmaker time using same team matching
- Add helper to match Gamma event to Odds API game
- Add: `bookmaker_commence_time: matchedBookmakerTime || null`

### Phase 2: Use Bookmaker Time in Monitor (Monitor Function)

**File:** `supabase/functions/polymarket-monitor/index.ts`

**Change 2a:** Fix `expires_at` at line 2360
```typescript
// BEFORE
expires_at: event.commence_time,

// AFTER  
expires_at: cache?.bookmaker_commence_time || event.commence_time,
```

**Change 2b:** Remove stale 0.5 fallback at line 1578
```typescript
// BEFORE
let livePolyPrice = cache?.yes_price || event.polymarket_yes_price || 0.5;

// AFTER
let livePolyPrice: number | null = cache?.yes_price || event.polymarket_yes_price || null;
```

**Change 2c:** Add explicit skip for null prices (after line 1650)
```typescript
// If no valid price from any source, skip market
if (livePolyPrice === null) {
  console.log(`[POLY-MONITOR] NO_VALID_PRICE_SKIP`, {
    event: event.event_name,
    reason: 'no_clob_or_cache_price'
  });
  funnelStats.skipped_no_price++;
  continue;
}
```

### Phase 3: Fix Token Resolution (Sync Function)

**File:** `supabase/functions/polymarket-sync-24h/index.ts`

The current token extraction paths are failing for most markets. Need to add:

**Change 3a:** Add CLOB markets lookup fallback for Firecrawl games
- After failing to find tokens in Gamma event metadata
- Query CLOB API `/markets` endpoint with team names
- Extract `clobTokenIds` from response

**Change 3b:** Mark markets as untradeable when tokens unavailable
- Set `tradeable = false`
- Set `untradeable_reason = 'MISSING_TOKENS'`
- Already partially implemented but needs to propagate correctly

---

## Technical Implementation Details

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Lines ~730-760: Add `bookmaker_commence_time` to Firecrawl upsert |
| `supabase/functions/polymarket-sync-24h/index.ts` | Lines ~893-920: Add `bookmaker_commence_time` to Gamma upsert |
| `supabase/functions/polymarket-sync-24h/index.ts` | Add CLOB token fallback function after line 680 |
| `supabase/functions/polymarket-monitor/index.ts` | Line 1578: Remove `\|\| 0.5` fallback |
| `supabase/functions/polymarket-monitor/index.ts` | Line ~1655: Add null price skip logic |
| `supabase/functions/polymarket-monitor/index.ts` | Line 2360: Use `cache?.bookmaker_commence_time` |

### Expected Outcomes After Implementation

| Metric | Before | After |
|--------|--------|-------|
| Markets with `bookmaker_commence_time` | 0% | 80%+ |
| Signals with correct expiry | 0% | 100% |
| False 50¢ edges | Possible | Eliminated |
| Tokenization success rate | 6% | 60%+ (with CLOB fallback) |

---

## Verification Steps

1. **Deploy sync function** → Run `polymarket-sync-24h`
2. **Query database** → Verify `bookmaker_commence_time` populated for active markets
3. **Deploy monitor function** → Run `polymarket-monitor`
4. **Check signals** → Verify `expires_at` uses bookmaker times
5. **Check funnel stats** → Verify tokenization rate improved
6. **Check for 50¢ signals** → Confirm none created

---

## Future Enhancement: Shadow Flow Integration

Once the base system is working correctly, the Shadow Flow module can be added as a separate signal type:

1. **New table:** `shadow_flow_signals` for observe-only logging
2. **New function:** `polymarket-orderbook-monitor` for CLOB depth analysis
3. **Integration point:** Use shared token resolver from Phase 3
4. **Execution gate:** `SHADOW_FLOW_OBSERVE_ONLY = true` initially

This is Phase 2 work - first we need the core system working.
