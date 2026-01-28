

# Implementation Plan: Event-Driven Arbitrage Detection Alignment

## Current State Analysis

After reviewing the codebase, I found several **gaps between the current implementation and your system design spec**:

### What's Already Correct
1. **Clock 1 (Watch Mode Poll)** - runs every 5 minutes via pg_cron, detects bookmaker movement
2. **Clock 2 (Active Mode Poll)** - runs every 60 seconds via pg_cron, confirms edges
3. **Event States** - WATCHING, ACTIVE, CONFIRMED, SIGNAL states exist
4. **SMS Alerts** - working for confirmed edges
5. **Movement Detection** - 6% threshold, velocity checks, hold window

### Critical Gap: Polymarket Is Polled Globally
The `fetch-polymarket` function exists but **is NOT integrated into the event-driven architecture**:
- It fetches ALL Polymarket markets globally (100 at a time)
- `active-mode-poll` only queries the `polymarket_markets` table for matching
- **No fresh Polymarket poll happens per-escalated-event**

Per your spec:
> "We ONLY compare Polymarket prices AFTER bookmaker movement is detected."
> "Polymarket comparison ONLY runs for events escalated by Clock 1"

**Current behavior**: Polymarket data is stale (fetched once, stored in DB), not fetched on-demand when events escalate.

---

## Proposed Changes

### 1. Remove Global Polymarket Polling
Delete or disable the `fetch-polymarket` edge function as a scheduled job. Polymarket should NOT be polled continuously.

### 2. Inline Polymarket Fetch in Active-Mode-Poll
Modify `active-mode-poll` to:
- **For each ACTIVE event**: fetch Polymarket prices directly (targeted API call)
- Only call Polymarket API when an event is in ACTIVE state
- Skip events with no detectable Polymarket market

This aligns with:
> "ONLY runs for events escalated by Clock 1"
> "NEVER runs globally"

### 3. Add Targeted Polymarket Search Function
Create a helper that searches Polymarket for a specific event:
```text
Input: event_name, outcome (e.g., "Utah Jazz vs Golden State Warriors", "Golden State Warriors")
Output: matched_market with yes_price, no_price, volume, or null
```

Uses Polymarket's search API or filters from Gamma API.

### 4. Update Active-Mode-Poll Logic Flow
```text
For each ACTIVE event:
  1. Fetch latest bookmaker probability (from snapshots)
  2. Check persistence (hold window + samples)
  3. IF confirmed:
     a. Fetch Polymarket price NOW (targeted API call)
     b. Calculate edge = bookmaker_prob - polymarket_yes
     c. If edge >= 2%: CONFIRMED EDGE → SMS + signal
     d. Else: SIGNAL ONLY
```

### 5. Remove Stale polymarket_markets Table Dependency
Active-mode-poll should NOT rely on pre-cached Polymarket data. Each confirmation check fetches live Polymarket prices.

---

## Technical Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/active-mode-poll/index.ts` | Add inline Polymarket fetch per-event |
| `supabase/functions/fetch-polymarket/index.ts` | Deprecate or remove global polling |
| `supabase/config.toml` | Remove fetch-polymarket if no longer scheduled |
| Database cron jobs | Ensure no scheduled call to `fetch-polymarket` |

---

## Implementation Details

### active-mode-poll Modifications

Add a new function `fetchPolymarketForEvent()`:
```text
async function fetchPolymarketForEvent(eventName: string): Promise<PolyMatch | null>
  - Query Gamma API: /events?active=true&closed=false&search={encoded_event}
  - Match using Jaccard + Levenshtein (existing logic)
  - Return { market_id, yes_price, no_price, volume } or null
```

Replace the current `findPolymarketMatch()` that queries the database with this live-fetch approach.

### Cron Job Review

Verify no cron job calls `fetch-polymarket` on a schedule. If one exists, remove it:
```sql
SELECT * FROM cron.job WHERE command LIKE '%fetch-polymarket%';
-- If found:
SELECT cron.unschedule('fetch-polymarket-job-name');
```

---

## Expected Behavior After Implementation

1. **Watch Poll (every 5 min)**: Detects bookmaker movement only. Zero Polymarket calls.
2. **Active Poll (every 60s for ACTIVE events)**: 
   - Fetches Polymarket LIVE for each escalated event
   - Calculates TRUE edge in real-time
   - SMS alert on confirmed edge
3. **Polymarket API usage**: Only 1 call per ACTIVE event per minute (max 5 simultaneous = max 5 calls/min)
4. **No stale data**: Edge calculation uses live Polymarket prices, not cached values

---

## Estimated API Impact

- Polymarket API: ~0-5 calls/minute (only when ACTIVE events exist)
- Odds API: unchanged (watch poll only)
- No wasted Polymarket polling when no movement detected

