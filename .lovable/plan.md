

# Implementation Plan: Complete Event-Driven Alignment

## ✅ IMPLEMENTATION COMPLETE

All changes have been applied. The system is now fully aligned with the event-driven architecture spec.

---

## Final State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Watch Poll (Clock 1) | ✅ Complete | Bookmaker-only, no Polymarket calls |
| Active Poll (Clock 2) | ✅ Complete | Live `fetchPolymarketForEvent()` per ACTIVE event |
| pg_cron jobs | ✅ Correct | Only watch-mode-poll + active-mode-poll scheduled |
| fetch-polymarket cron | ✅ None exists | No scheduled global polling |
| detect-signals | ✅ DEPRECATED | Analytics-only, marked with header warning |
| fetch-polymarket function | ✅ DEPRECATED | Debug-only, marked with header warning |

---

## Changes Applied

### 1. `supabase/functions/detect-signals/index.ts`
Added deprecation header (lines 1-17):
- Marked as ANALYTICS & DEBUGGING ONLY
- Clarifies it uses CACHED Polymarket data
- Points to active-mode-poll as authoritative source

### 2. `supabase/functions/fetch-polymarket/index.ts`
Added deprecation header (lines 1-17):
- Marked as MANUAL DEBUGGING ONLY
- Clarifies it is NOT scheduled
- Points to active-mode-poll as authoritative source

### 3. `supabase/functions/active-mode-poll/index.ts`
Already contains:
- `fetchPolymarketForEvent()` helper for live API calls
- `[POLY-FETCH]` logging prefix for tracing
- Real-time edge calculation with live prices

---

## Expected System Behavior

1. **Watch Poll (every 5 min)**: Bookmaker scans only. Zero Polymarket API calls.

2. **Active Poll (every 60s)**: For each ACTIVE event:
   - Live Polymarket API call via `fetchPolymarketForEvent()`
   - Real-time edge calculation
   - SMS on confirmed edge

3. **detect-signals**: Runs on-demand for analytics. Uses cached data. NOT authoritative for trading.

4. **fetch-polymarket**: Orphaned. Manual invocation only for debugging.

5. **Polymarket API usage**: 0 calls when no ACTIVE events. Max 5 calls/min during peak.

---

## Verification Commands

```sql
-- Verify no fetch-polymarket cron jobs exist
SELECT * FROM cron.job WHERE command LIKE '%fetch-polymarket%';

-- Check active cron jobs (should only be watch-mode-poll + active-mode-poll)
SELECT * FROM cron.job;
```

Check edge function logs for `[POLY-FETCH]` entries only appearing during active-mode-poll.
