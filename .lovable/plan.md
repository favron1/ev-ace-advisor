

# Implementation Plan: Complete Bookmaker-First Architecture

## Current Status

**Database migration**: ✅ Complete - `bookmaker_commence_time` column exists

**Sync function (polymarket-sync-24h)**: ✅ Already writes `bookmaker_commence_time` on lines 758 and 927

**BUT: Two critical issues remain in the monitor function that prevent bookmaker truth from being used**

---

## Remaining Issues to Fix

### Issue 1: Signal `expires_at` Still Uses Polymarket Time

**Location**: `supabase/functions/polymarket-monitor/index.ts` line 2360

**Current code**:
```typescript
expires_at: event.commence_time,
```

**Problem**: `event.commence_time` comes from `event_watch_state` which stores Polymarket's placeholder times (23:59:59 or 00:00:00 UTC)

**Fix**: Use bookmaker time from cache, falling back to event time only if unavailable:
```typescript
expires_at: cache?.bookmaker_commence_time || event.commence_time,
```

### Issue 2: Stale 50¢ Price Fallback Still Present

**Location**: `supabase/functions/polymarket-monitor/index.ts` line 1578

**Current code**:
```typescript
let livePolyPrice = cache?.yes_price || event.polymarket_yes_price || 0.5;
```

**Problem**: When CLOB returns no data, system falls back to stale cached 50¢ price creating false edges

**Fix**: Skip market entirely if no valid price is available:
```typescript
let livePolyPrice: number | null = cache?.yes_price || event.polymarket_yes_price || null;
// (later in the code, skip if livePolyPrice is null)
```

---

## Technical Implementation

### Step 1: Fix signal expiry time (line 2360)
Replace Polymarket's placeholder `event.commence_time` with bookmaker-authoritative time from cache

### Step 2: Remove stale price fallback (line 1578)
- Change default from `0.5` to `null`
- Add explicit skip logic for markets with no valid price

### Step 3: Add skip logic for null prices (after line 1650)
- If CLOB batch didn't provide a price AND cache has no price, log and skip the market
- This prevents false edges from 50¢ placeholder prices

### Step 4: Re-deploy and run sync
- Deploy the updated monitor function
- Run `polymarket-sync-24h` to populate `bookmaker_commence_time` for all cached markets
- Run `polymarket-monitor` to create signals with correct expiration times

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Line 1578: Remove `|| 0.5` fallback |
| `supabase/functions/polymarket-monitor/index.ts` | Line ~1650: Add skip logic for null prices |
| `supabase/functions/polymarket-monitor/index.ts` | Line 2360: Use `cache?.bookmaker_commence_time` |

---

## Expected Outcomes

After implementation:
- **No stale signals**: `expires_at` reflects actual game start from bookmaker data
- **No false edges**: Markets without live CLOB prices are skipped, not filled with 50¢
- **Accurate expiration**: Games that have finished are properly expired based on bookmaker time

---

## Verification Steps

1. Deploy updated monitor function
2. Run `polymarket-sync-24h` → verify `bookmaker_commence_time` populated
3. Run `polymarket-monitor` → verify signals use bookmaker time for `expires_at`
4. Check completed games → verify they're expired/skipped, not signaled
5. Check signal prices → verify no 50¢ placeholder prices in signals

