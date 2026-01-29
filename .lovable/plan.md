
# Signal Deduplication & Lifecycle Fix

## Problem Analysis

The signal feed is accumulating duplicate signals because:

1. **polymarket-monitor creates new signals every poll cycle** - Each 5-minute poll inserts a fresh signal row instead of updating existing ones
2. **Current state**: 72 active signals for only 13 unique events (66 duplicates!)
3. **No automatic cleanup** - Signals only expire when their `expires_at` timestamp passes (event start time)

## Solution Overview

Implement proper signal deduplication and lifecycle management:

### Changes Required

**1. Add Deduplication to polymarket-monitor**

Before inserting a new signal, check if an active signal already exists for the same event + outcome:

```text
+-- Check for existing active signal
|   SELECT id, status FROM signal_opportunities
|   WHERE event_name = event.event_name
|     AND recommended_outcome = teamName
|     AND status IN ('active', 'executed')
|
+-- If exists and NOT executed:
|   UPDATE existing signal with fresh prices/edge
|
+-- If executed:
|   Skip (user already placed the bet)
|
+-- If not exists:
    INSERT new signal
```

**2. Clean Up Existing Duplicates**

Run a one-time cleanup to remove duplicate signals, keeping only the most recent per event:

- Delete older duplicates, retaining the newest signal per unique event
- This immediately reduces 72 signals to ~13 unique ones

**3. Add Database Unique Constraint (Recommended)**

Add a partial unique index to prevent future duplicates at the database level:

```sql
CREATE UNIQUE INDEX idx_unique_active_signal 
ON signal_opportunities (event_name, recommended_outcome) 
WHERE status = 'active';
```

This provides a safety net even if application logic fails.

### Technical Details

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Add deduplication check before signal insertion (lines ~593-625) |
| Database migration | Add partial unique index + cleanup query |

### Expected Outcome

- Signal feed shows ONE signal per betting opportunity
- Fresh price/edge data updates existing signals instead of creating duplicates
- Signals automatically removed when:
  - Event starts (expires_at reached)
  - Edge drops below threshold (new: update to 'expired' status)
  - User marks as executed
