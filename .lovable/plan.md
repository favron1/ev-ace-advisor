

# Align System with Core Logic Document v1.0

## Overview

The current implementation **does NOT** fully match the Core Logic document. This plan brings the system into compliance with the 5-Stage Flow specification.

## Gap Analysis Summary

| Requirement | Doc Spec | Current Status | Action |
|-------------|----------|----------------|--------|
| Secondary Polymarket Analytics | Required for redundancy | ❌ Missing | Add secondary provider option |
| Movement Trigger | ≥6.0% absolute | Uses relative threshold | Update to fixed 6.0% |
| Velocity Trigger | ≥0.4%/min | Not checked explicitly | Add velocity calculation |
| Signal State Machine | S1/S2/WATCH/REJECT | Uses tier system | Implement full state machine |
| Per-Event Cooldown | 30-60 min | Not implemented | Add cooldown tracking |
| Rate Limiting | 12 S2/hour, 4/sport/hour | Not implemented | Add throttle logic |
| Degradation Mode | Gamma down → books-only | Not implemented | Add fallback handling |
| Auto-Promotion | S1 → S2 over time | Not implemented | Add promotion logic |

---

## Implementation Plan

### Phase 1: Movement Engine Alignment (Stage 2)

**File:** `supabase/functions/polymarket-monitor/index.ts`

Update movement detection to match Core Logic thresholds:

```text
Current (polymarket-monitor):
  threshold = max(0.02, 0.12 * baselineProb)

Core Logic Doc requires:
  absolute_move >= 6.0% (0.06)
  velocity >= 0.4%/min (0.004)
  consensus >= 2 sharp books
```

Changes:
1. Replace `getMovementThreshold()` to use fixed 6.0% minimum
2. Add explicit velocity calculation (change / time_minutes)
3. Ensure velocity check ≥0.4%/min is enforced

### Phase 2: Signal State Machine (Stage 3.5)

**Files to modify:**
- `supabase/functions/polymarket-monitor/index.ts`
- `src/types/arbitrage.ts`
- Database migration for `signal_state` column

Add new signal states:

```typescript
type SignalState = 'REJECT' | 'WATCH' | 'S1_PROMOTE' | 'S2_EXECUTION_ELIGIBLE';
```

**S2_EXECUTION_ELIGIBLE gates:**
- confidence ≥ 60
- sharp consensus ≥ 2 books
- book implied probability ≥ 52%
- time to start ≥ 10 minutes
- Polymarket data available

**S1_PROMOTE (not execution-eligible):**
- confidence 45-59 OR
- book prob 48-51.9% OR
- time to start 5-9 min

**Hard REJECT:**
- draw-capable markets
- missing teams/league
- no sharp books (0)
- stale/duplicate events

### Phase 3: Rate Limiting & Cooldowns (Stage 3)

**File:** `supabase/functions/polymarket-monitor/index.ts`

Add:
1. Per-event cooldown tracking (30-60 min)
2. Global throttle: max 12 S2 per hour
3. Per-sport throttle: max 4 S2 per sport per hour

Implementation:
```text
-- New table or in-memory tracking
signal_cooldowns: { event_key, last_signal_at }
signal_counts: { hour_bucket, sport, count }
```

### Phase 4: Degradation Mode (Failure Rules)

**File:** `supabase/functions/polymarket-monitor/index.ts`

Add fallback handling:

```text
IF Gamma API fails:
  - Set poly_data_status = 'DEGRADED'
  - Cap confidence at 65
  - Continue with books-only mode

IF <2 sharp books available:
  - Force signal to WATCH state only

IF partial book scrape:
  - Require at least Pinnacle OR Betfair
  - Otherwise WATCH only
```

### Phase 5: Secondary Polymarket Analytics (Stage 1)

**Question for you:** The Core Logic doc specifies a "Secondary Polymarket analytics provider" for redundancy. Options include:

1. **Use a second Polymarket data source** (e.g., alternative API endpoint or web scraping)
2. **Mark as optional** - Continue with Gamma-only but log `poly_data_status = SINGLE_SOURCE`
3. **Defer** - Implement later when a suitable secondary source is identified

Which approach would you prefer?

### Phase 6: Auto-Promotion Logic (Stage 3.6)

**File:** New edge function or cron job

Create `auto-promote-signals` function that:
1. Scans S1_PROMOTE signals every 5 minutes
2. Checks if any now qualify for S2:
   - Confidence rose to ≥60
   - Polymarket liquidity rose to ≥$10K
   - 3rd sharp book joined same direction
3. Promotes with logged reason and timestamp

---

## Database Changes Required

```sql
-- Add signal_state enum/column
ALTER TABLE signal_opportunities 
ADD COLUMN signal_state TEXT 
CHECK (signal_state IN ('REJECT', 'WATCH', 'S1_PROMOTE', 'S2_EXECUTION_ELIGIBLE'));

-- Add cooldown tracking
CREATE TABLE IF NOT EXISTS signal_cooldowns (
  event_key TEXT PRIMARY KEY,
  last_signal_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sport TEXT
);

-- Add rate limit tracking
CREATE TABLE IF NOT EXISTS signal_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_bucket TIMESTAMPTZ NOT NULL,
  sport TEXT,
  s2_count INT DEFAULT 0,
  UNIQUE(hour_bucket, sport)
);
```

---

## UI Impact

The frontend already filters by `is_true_arbitrage = true` and shows `signal_tier`. After implementation:

1. **New filter option:** "S2 Only" (execution-eligible signals)
2. **Visual badge:** Show S1/S2 state alongside tier
3. **WATCH signals:** Could be shown in a separate "Watching" tab (optional)

---

## Implementation Order

1. Database migration (add columns)
2. Update `polymarket-monitor` with:
   - Fixed 6.0% movement threshold
   - Velocity ≥0.4%/min check
   - Signal state machine (S1/S2/WATCH/REJECT)
   - Rate limiting
3. Add degradation handling
4. Update types in `src/types/arbitrage.ts`
5. Update UI to display signal_state
6. Add auto-promotion cron job

---

## Technical Notes

### Why the current thresholds differ

The existing `max(0.02, 0.12 * baseline)` logic was designed to be probability-relative:
- A 3% move from 20% is huge (15% relative change)
- A 3% move from 75% is smaller (4% relative change)

The Core Logic doc uses a fixed 6.0% absolute threshold which is simpler but may miss some edges on high-probability favorites.

**Recommendation:** Implement the Core Logic spec exactly (6.0% fixed), then tune later if signal volume drops.

---

## Expected Outcome

After implementation:
- S1_PROMOTE: 8-25 signals per day (monitored, not executed)
- S2_EXECUTION_ELIGIBLE: 2-8 signals per day (execution-ready)
- Clear state machine preventing over-firing
- Rate limits preventing signal spam
- Graceful degradation when APIs fail

