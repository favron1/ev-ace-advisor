

# Implementation Plan: Complete Event-Driven Alignment

## Current State Assessment

After thorough code review, the system is **85% aligned** with your architecture spec:

| Component | Status | Notes |
|-----------|--------|-------|
| Watch Poll (Clock 1) | ✅ Complete | Bookmaker-only, no Polymarket calls |
| Active Poll (Clock 2) | ✅ Complete | Live `fetchPolymarketForEvent()` per ACTIVE event |
| pg_cron jobs | ✅ Correct | Only watch-mode-poll + active-mode-poll scheduled |
| fetch-polymarket cron | ✅ None exists | No scheduled global polling |
| detect-signals | ❌ Violation | Still reads from cached `polymarket_markets` table |
| fetch-polymarket function | ⚠️ Orphaned | Code exists but not scheduled |

## Required Changes

### 1. Update `detect-signals` to Remove DB Dependency

The `detect-signals` function (lines 618-625) still queries the `polymarket_markets` table for cached data:

```typescript
// CURRENT (violates spec)
fetch(`${supabaseUrl}/rest/v1/polymarket_markets?status=eq.active&...`)
```

This function is used for:
- Generating signal opportunities for H2H and futures markets
- Matching bookmaker signals to Polymarket markets

**Action**: Modify `detect-signals` to use the same live `fetchPolymarketForEvent()` approach as `active-mode-poll`, OR mark it as a legacy/analytics-only function that does NOT affect trading decisions.

Given the system architecture, `detect-signals` appears to be a **legacy function** from before the two-clock architecture was implemented. The active-mode-poll now handles all confirmation + edge calculation with live Polymarket data.

**Recommended approach**: Keep `detect-signals` for analytics/debugging but ensure it's NOT used for trading decisions. The active-mode-poll is now the authoritative source.

### 2. Clean Up Orphaned `fetch-polymarket` Function

The function file exists but is NOT scheduled. Options:
- **Option A**: Delete the function entirely (clean removal)
- **Option B**: Keep for manual debugging (invoke manually when needed)

**Recommended**: Option B - Keep for manual debugging but add clear documentation that it's NOT part of the trading workflow.

### 3. Document Architecture in Code Comments

Add explicit comments in both polling functions clarifying the event-driven architecture.

---

## Technical Implementation

### File: `supabase/functions/detect-signals/index.ts`

Add warning comment and ensure it's not authoritative for trading:

```typescript
// WARNING: This function uses cached Polymarket data for analytics only.
// For trading decisions, active-mode-poll uses live Polymarket API calls.
// Do NOT use signals from this function for trade execution without
// cross-referencing with active-mode-poll confirmed edges.
```

Alternatively, modify to use live fetching (larger refactor):
- Extract the `fetchPolymarketForEvent()` helper to a shared module
- Replace DB queries with live API calls
- This would increase API usage but ensure consistency

### File: `supabase/functions/fetch-polymarket/index.ts`

Add header comment:

```typescript
// ========================================
// DEPRECATED: This function is NOT scheduled.
// Polymarket data is now fetched per-event by active-mode-poll.
// This function exists for manual debugging only.
// DO NOT schedule this via pg_cron.
// ========================================
```

### File: `supabase/config.toml`

Optionally remove the function config (or leave for manual invocation):

```toml
# Remove this section if deleting the function:
[functions.fetch-polymarket]
verify_jwt = false
```

---

## Summary of Changes

| File | Action |
|------|--------|
| `supabase/functions/detect-signals/index.ts` | Add deprecation warning, clarify it's analytics-only |
| `supabase/functions/fetch-polymarket/index.ts` | Add deprecation header, mark as debug-only |
| `supabase/config.toml` | Keep as-is (for manual debugging) OR remove fetch-polymarket |
| `src/lib/api/arbitrage.ts` | No changes needed |
| `src/hooks/usePolymarket.ts` | No changes needed (reads from DB for UI display only) |

---

## Expected Behavior After Implementation

1. **Watch Poll (every 5 min)**: Bookmaker scans only. Zero Polymarket API calls.

2. **Active Poll (every 60s)**: For each ACTIVE event:
   - Live Polymarket API call
   - Real-time edge calculation
   - SMS on confirmed edge

3. **detect-signals**: Runs on-demand for analytics. Uses cached data. NOT authoritative for trading.

4. **fetch-polymarket**: Orphaned. Manual invocation only for debugging.

5. **Polymarket API usage**: 0 calls when no ACTIVE events. Max 5 calls/min during peak.

---

## Verification Steps

After implementation:

1. Check edge function logs for `[POLY-FETCH]` entries only appearing during active-mode-poll
2. Verify no scheduled cron jobs for fetch-polymarket: `SELECT * FROM cron.job`
3. Manually escalate a test event to ACTIVE and confirm live Polymarket fetch occurs
4. Verify SMS alerts fire on confirmed edges with live Polymarket prices

