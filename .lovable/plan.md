
# Plan: Add Signal Refresh Button

## Why This Is a Good Idea

A refresh button that re-evaluates existing signals **without calling external APIs** is an excellent optimization:

| Action | API Requests | Database Queries |
|--------|-------------|------------------|
| Full Scan | 15-20 (Odds API + Polymarket) | Many writes |
| Refresh | 0 | Read + conditional updates |

With the 500 requests/month limit on The Odds API, this approach lets users:
- Clean up expired signals (events that have started)
- Remove signals that no longer meet filters
- Update time-based urgency calculations
- All without consuming API quota

---

## Implementation Overview

### 1. Create Refresh Edge Function
A lightweight function that:
- Fetches current active signals from database
- Checks each signal against current criteria:
  - Has the event started? (expire if `commence_time` has passed)
  - Does edge still meet minimum threshold?
  - Recalculate urgency based on updated time-to-event
- Updates or removes signals that no longer qualify

### 2. Update useSignals Hook
Add a `refreshSignals` function that:
- Calls the new edge function
- Updates local state with refreshed data
- Shows toast with refresh results

### 3. Update SignalFeed Component
Add a refresh button in the header area:
- Shows between the title and count
- Displays loading state during refresh
- Disabled during full scans

---

## Technical Details

### New Edge Function: `refresh-signals/index.ts`

```text
Purpose: Re-evaluate existing active signals without external API calls

Input: None (reads from database)

Logic:
1. Fetch all active signals from signal_opportunities
2. For each signal:
   - Check if event has started (expires_at < now)
   - Recalculate hours_until_event
   - Update urgency based on new time
   - Mark expired if event has passed
3. Batch update changed signals
4. Return summary of changes

Output:
{
  refreshed: 13,
  expired: 2,
  updated: 5,
  unchanged: 6
}
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/refresh-signals/index.ts` | New lightweight refresh function |
| `src/lib/api/arbitrage.ts` | Add `refreshSignals()` API method |
| `src/hooks/useSignals.ts` | Add `refreshSignals` function and `refreshing` state |
| `src/components/terminal/SignalFeed.tsx` | Add header with refresh button |
| `src/pages/Terminal.tsx` | Wire up refresh handler |

---

## UI Design

```text
┌─────────────────────────────────────────────────┐
│ Signal Feed              [↻ Refresh]  13 signals│
├─────────────────────────────────────────────────┤
│                                                 │
│  [Signal Card 1]                                │
│  [Signal Card 2]                                │
│  ...                                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

The refresh button:
- Uses `RefreshCw` icon from lucide-react
- Shows spinning animation while refreshing
- Tooltip: "Re-check signals without using API quota"

---

## Refresh Logic Details

The refresh function will:

1. **Expire stale signals**: Events where `commence_time` has passed
2. **Update urgency tiers**: Recalculate based on new time-to-event
3. **Preserve all data**: No external API calls, just database operations

```text
Example transformations:
- Signal with 2h left → urgency changes from "normal" to "high"
- Signal where game started → status changes to "expired"
- Signal still valid → just updates time_label in signal_factors
```

---

## Summary

| Task | Complexity |
|------|------------|
| Create refresh-signals edge function | Low |
| Add API method | Low |
| Update useSignals hook | Low |
| Add refresh button to SignalFeed | Low |
| Wire up in Terminal page | Low |

This feature saves API quota while keeping the signal feed clean and up-to-date.
