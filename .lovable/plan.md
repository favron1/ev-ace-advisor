
# Implementation Plan: Smart + Cost-Controlled Signal System

## Executive Summary

This plan transforms the current snapshot-based signal detection into a **time-series movement tracking system** with two-tier polling architecture. The core principle: **track probability movement + persistence, not static prices**.

---

## Current State vs Required State

| Aspect | Current | Required |
|--------|---------|----------|
| Data Model | Single snapshot per signal | Time-series with multiple samples |
| Polling | Global 5-30min intervals | Two-tier: Watch (5min) / Active (60s) |
| Movement Detection | None (static comparison) | 15min lookback, 6%+ threshold |
| Signal Confirmation | Immediate | Requires persistence (3min hold) |
| Sports Scope | 12+ sports | 1-2 configurable sports |
| API Calls | ~12 per scan | Optimized per-event escalation |
| States | Active/Expired | WATCHING/CONFIRMED/SIGNAL |

---

## Phase 1: Database Schema Changes

### 1.1 New Table: `probability_snapshots` (Time-Series Tracking)

Stores lightweight probability samples for movement detection:

```sql
CREATE TABLE probability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,          -- normalized "home_vs_away_date"
  event_name text NOT NULL,
  outcome text NOT NULL,
  fair_probability numeric NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'sharp',      -- 'sharp' or 'consensus'
  
  -- Indexes for fast lookback queries
  CONSTRAINT unique_snapshot UNIQUE (event_key, outcome, captured_at)
);

CREATE INDEX idx_snapshots_event_time ON probability_snapshots(event_key, captured_at DESC);
CREATE INDEX idx_snapshots_recent ON probability_snapshots(captured_at DESC);
```

### 1.2 New Table: `event_watch_state` (Per-Event Escalation)

Tracks which events are in Watch vs Active mode:

```sql
CREATE TABLE event_watch_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_name text NOT NULL,
  commence_time timestamptz,
  
  -- State tracking
  watch_state text DEFAULT 'watching',  -- 'watching', 'active', 'confirmed', 'dropped'
  escalated_at timestamptz,
  active_until timestamptz,             -- Active mode window expires
  
  -- Movement tracking
  initial_probability numeric,
  peak_probability numeric,
  current_probability numeric,
  movement_pct numeric DEFAULT 0,
  movement_velocity numeric DEFAULT 0,  -- pct per minute
  
  -- Confirmation tracking
  hold_start_at timestamptz,
  samples_since_hold integer DEFAULT 0,
  reverted boolean DEFAULT false,
  
  -- Polymarket matching
  polymarket_matched boolean DEFAULT false,
  polymarket_market_id uuid,
  polymarket_price numeric,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 1.3 Update `scan_config` Table

Add sport scope controls:

```sql
ALTER TABLE scan_config
ADD COLUMN enabled_sports text[] DEFAULT ARRAY['basketball_nba'],
ADD COLUMN max_simultaneous_active integer DEFAULT 5,
ADD COLUMN movement_threshold_pct numeric DEFAULT 6.0,
ADD COLUMN hold_window_minutes integer DEFAULT 3,
ADD COLUMN samples_required integer DEFAULT 2;
```

---

## Phase 2: Two-Tier Polling Architecture

### 2.1 New Edge Function: `watch-mode-poll`

**Purpose**: Cheap baseline polling for all events

**Frequency**: Every 5 minutes (configurable)

**Logic**:
```text
1. Fetch odds for configured sports ONLY (1-2 sports max)
2. Use ONLY sharp books (Pinnacle, Betfair)
3. Calculate vig-removed fair probability
4. Store snapshot in probability_snapshots
5. For each event in event_watch_state:
   - Calculate 15-minute movement
   - If movement >= 6% AND velocity high enough:
     - Escalate to Active Mode
```

**Cost**: ~2-4 API calls per poll

### 2.2 New Edge Function: `active-mode-poll`

**Purpose**: High-frequency monitoring for escalated events only

**Trigger**: Called only for events in Active state

**Frequency**: Every 60 seconds (per-event)

**Logic**:
```text
1. Check if Active window expired (20 min max)
2. If expired: downgrade to Watch or drop
3. Fetch current odds for THIS event only
4. Store snapshot
5. Check movement persistence:
   - Did prob revert >1.5%? If yes: reset hold timer
   - Did hold last 3 minutes? Increment sample counter
6. If 2+ consecutive samples confirmed:
   - Attempt Polymarket match
   - If matched + edge >= 2%: move to CONFIRMED
   - If not matched: move to SIGNAL ONLY
```

**Cost**: ~1 API call per active event per minute

### 2.3 Scheduler Updates

Update `useScanConfig.ts` to manage two-tier polling:

```typescript
interface TieredScanConfig {
  watchPollIntervalMinutes: number;    // 5 min default
  activePollIntervalSeconds: number;   // 60s default
  maxActiveEvents: number;             // 5 default
  activeWindowMinutes: number;         // 20 min max
}
```

---

## Phase 3: Time-Based Signal Confirmation

### 3.1 Movement Detection Algorithm

```text
Input: event_key, current_probability

1. Fetch snapshots from last 15 minutes
2. Calculate:
   - initial_prob = oldest snapshot
   - current_prob = latest snapshot
   - movement_pct = (current_prob - initial_prob) * 100
   - elapsed_minutes = time between oldest and newest
   - velocity = movement_pct / elapsed_minutes

3. Movement criteria:
   - movement_pct >= 6.0 (configurable)
   - velocity >= 0.4 (at least 0.4% per minute)
   - elapsed_minutes <= 10 (move happened recently)

4. Return: { qualified: boolean, movement_pct, velocity }
```

### 3.2 Persistence / Hold Logic

```text
Input: event in Active mode

1. Check last 3 minutes of snapshots
2. Calculate max reversion from peak:
   - peak = MAX(probability) in active window
   - current = latest probability
   - reversion = peak - current

3. Hold criteria:
   - reversion <= 1.5%
   - samples_since_hold >= 2 (2 consecutive 60s samples)

4. If hold broken:
   - Reset hold_start_at
   - Reset samples_since_hold to 0
   - Log reversion event
```

### 3.3 Multi-Sample Confirmation

```text
Condition must hold for 2 consecutive samples:

Sample 1 (T=0): Movement detected, hold started
Sample 2 (T=60s): Hold maintained, samples_since_hold = 1
Sample 3 (T=120s): Hold maintained, samples_since_hold = 2

At samples_since_hold >= 2:
- Attempt Polymarket match
- Compute edge if matched
- Transition to CONFIRMED or SIGNAL state
```

---

## Phase 4: Signal States and Output

### 4.1 State Machine

```text
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
     ┌──────────┐       ┌──────────┐       ┌───────────┐ │
     │ WATCHING │──────▶│  ACTIVE  │──────▶│ CONFIRMED │ │
     └──────────┘       └──────────┘       └───────────┘ │
          │                  │                   │       │
          │                  │                   │       │
          │                  ▼                   │       │
          │             ┌──────────┐             │       │
          │             │  SIGNAL  │◀────────────┘       │
          │             │   ONLY   │ (no poly match)     │
          │             └──────────┘                     │
          │                  │                           │
          ▼                  ▼                           │
     ┌──────────┐       ┌──────────┐                     │
     │ DROPPED  │◀──────│ STAGNANT │◀────────────────────┘
     │ (expired)│       │(reverted)│     (window expired)
     └──────────┘       └──────────┘
```

### 4.2 State Definitions

| State | Description | Actions |
|-------|-------------|---------|
| **WATCHING** | Movement detected but not confirmed | No alerts, continue monitoring |
| **ACTIVE** | In high-frequency polling window | Checking persistence |
| **CONFIRMED** | All criteria met + Polymarket matched | Show EDGE %, allow execution |
| **SIGNAL ONLY** | Criteria met but no Polymarket match | Show Signal Strength only |
| **DROPPED** | Event expired or reverted | Remove from tracking |

---

## Phase 5: Sport Scope Controls

### 5.1 Configurable Sports List

Limit to maximum 1-2 sports per spec. Enforce in `ingest-odds`:

```typescript
const ALLOWED_SPORTS_MAP = {
  basketball_nba: 'basketball_nba',
  football_nfl: 'americanfootball_nfl',
  hockey_nhl: 'icehockey_nhl',
  soccer_epl: 'soccer_epl',
  mma: 'mma_mixed_martial_arts',
};

// User can enable max 2 from settings
```

### 5.2 UI Controls

Add to Settings page:
- Sport toggles (max 2 selectable)
- Movement threshold slider (4-10%)
- Hold window duration (1-5 min)
- Max simultaneous active events (3-10)

---

## Phase 6: Cost Protection Rules

### 6.1 Enforced Limits

```typescript
const COST_LIMITS = {
  maxDailyWatchPolls: 288,       // 24h at 5min intervals
  maxActiveEventsSimultaneous: 5,
  maxActiveWindowMinutes: 20,
  maxDailyAPIRequests: 500,
  maxMonthlyCost: 50,            // USD estimate
};
```

### 6.2 Per-Event Escalation Cap

Only escalate if:
- Current active events < maxActiveEventsSimultaneous
- Daily API budget not exceeded
- Event starts within 24 hours

### 6.3 Drop Stagnant Events

Auto-downgrade if:
- Active window expired (20 min)
- Movement reverted >3%
- No confirmation after 3 sample attempts

---

## Phase 7: UI Updates

### 7.1 Signal State Badges

Update `SignalCard.tsx`:

```typescript
// State badge colors
const stateBadges = {
  watching: { color: 'bg-yellow-500/10', text: 'WATCHING' },
  active: { color: 'bg-blue-500/10', text: 'TRACKING' },
  confirmed: { color: 'bg-green-500/10', text: 'CONFIRMED EDGE' },
  signal: { color: 'bg-muted', text: 'SIGNAL ONLY' },
};
```

### 7.2 Movement Indicators

Add to signal cards:
- Movement % over last 15 min
- Hold duration indicator
- Sample count (1/2, 2/2)
- Time since escalation

### 7.3 Filter Updates

Add filter options:
- "Confirmed Only" toggle
- "Watching Events" view
- Movement threshold filter

---

## Phase 8: Logging for Learning

### 8.1 New Table: `movement_logs`

```sql
CREATE TABLE movement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  event_name text NOT NULL,
  
  -- Movement data
  movement_pct numeric,
  velocity numeric,
  hold_duration_seconds integer,
  samples_captured integer,
  
  -- Outcome
  final_state text,           -- 'confirmed', 'signal', 'dropped'
  polymarket_matched boolean,
  edge_at_confirmation numeric,
  
  -- Result (filled later)
  actual_outcome boolean,
  profit_loss numeric,
  
  created_at timestamptz DEFAULT now()
);
```

Use this data to:
- Tune movement threshold (6% too high/low?)
- Adjust hold window (3 min optimal?)
- Improve escalation criteria

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/watch-mode-poll/index.ts` | Create | Tier 1 polling |
| `supabase/functions/active-mode-poll/index.ts` | Create | Tier 2 polling |
| `supabase/functions/ingest-odds/index.ts` | Modify | Limit sports, store snapshots |
| `supabase/functions/detect-signals/index.ts` | Modify | State machine logic |
| `src/hooks/useScanConfig.ts` | Modify | Two-tier scheduler |
| `src/types/scan-config.ts` | Modify | New config fields |
| `src/components/terminal/SignalCard.tsx` | Modify | State badges, movement UI |
| `src/pages/Settings.tsx` | Modify | Sport scope controls |
| Database migrations | Create | New tables + columns |

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Signals per day | 20-50 | 3-10 (high quality) |
| API calls per day | 300-600 | 100-200 |
| False positive rate | High | Low (movement confirmed) |
| Edge accuracy | Inflated (20-30%) | Realistic (2-10%) |
| Signal latency | 5-30 min | 2-3 min (for active events) |

---

## Technical Considerations

1. **Snapshot Cleanup**: Add scheduled job to purge snapshots older than 24h
2. **Race Conditions**: Use database transactions for state transitions
3. **Timezone Handling**: All times in UTC, convert for display
4. **Backpressure**: Queue active polls if too many simultaneous
5. **Error Recovery**: Retry failed polls with exponential backoff
