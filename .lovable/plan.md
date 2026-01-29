

## Unified "Scan Once, Monitor Continuously" Architecture

### Current Problem

The system has multiple overlapping functions with different time windows:
- `polymarket-sync-24h` only captures events ending within 24 hours
- `watch-mode-poll` monitors a separate `event_watch_state` table
- `polymarket-monitor` runs independently every 5 minutes

This creates gaps where markets are discovered too late (missing early sharp moves) and complexity in understanding what's being monitored.

---

### Proposed Solution

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         FULL SCAN (Manual)                          │
│  Discover ALL Polymarket sports markets ending within 7 days        │
│  → Upsert into polymarket_h2h_cache with status='watching'          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND MONITOR (pg_cron)                     │
│  Runs every 5 minutes, processes ALL 'watching' markets             │
│                                                                     │
│  For each market:                                                   │
│  1. Get latest bookmaker H2H odds from bookmaker_signals            │
│  2. Calculate edge vs Polymarket price                              │
│  3. Check sharp_book_snapshots for coordinated movement             │
│                                                                     │
│  TRIGGER CONDITIONS:                                                │
│  ├── Edge Trigger: raw_edge >= 5%                                   │
│  └── Movement Trigger: 2+ sharp books moved same direction          │
│                                                                     │
│  Either trigger → Surface signal → SMS if ELITE/STRONG              │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Implementation Details

#### Step 1: Expand polymarket-sync-24h to 7-Day Window

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

```typescript
// Change from 24 hours to 7 days
const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

// Add status='watching' for continuous monitoring
status: 'watching',
```

This ensures ALL upcoming sports events are captured when you run a Full Scan.

#### Step 2: Consolidate into Single Background Monitor

**File: `supabase/functions/polymarket-monitor/index.ts`**

Update to process ALL markets with `status='watching'`:

```typescript
// Query ALL watched markets (not just 24h window)
const { data: watchedMarkets } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .in('status', ['active', 'watching'])
  .gte('volume', 5000)
  .order('event_date', { ascending: true });

// For each market:
// 1. Match to bookmaker_signals (H2H data)
// 2. Calculate edge
// 3. Query sharp_book_snapshots for movement
// 4. Apply trigger logic
```

#### Step 3: Dual Trigger System

```typescript
interface TriggerResult {
  triggered: boolean;
  reason: 'edge' | 'movement' | 'both' | null;
  edge_pct: number;
  movement_velocity: number;
  books_confirming: number;
}

function checkTriggers(
  polyPrice: number,
  bookmakerFairProb: number,
  movementData: MovementResult
): TriggerResult {
  const rawEdge = (bookmakerFairProb - polyPrice) * 100;
  
  // Edge trigger: >= 5% raw edge
  const edgeTriggered = rawEdge >= 5.0;
  
  // Movement trigger: coordinated sharp book move
  const movementTriggered = movementData.triggered && movementData.booksConfirming >= 2;
  
  if (edgeTriggered && movementTriggered) {
    return { triggered: true, reason: 'both', ... };
  } else if (edgeTriggered) {
    return { triggered: true, reason: 'edge', ... };
  } else if (movementTriggered) {
    return { triggered: true, reason: 'movement', ... };
  }
  
  return { triggered: false, reason: null, ... };
}
```

#### Step 4: Alert Prioritization

```text
PRIORITY MATRIX:
┌──────────────────────┬───────────────┬──────────────┐
│ Trigger Type         │ Time to Start │ Alert Level  │
├──────────────────────┼───────────────┼──────────────┤
│ Edge + Movement      │ < 24h         │ SMS + Sound  │
│ Edge + Movement      │ > 24h         │ UI Only      │
│ Edge Only (>5%)      │ < 12h         │ SMS          │
│ Edge Only (>5%)      │ > 12h         │ UI Only      │
│ Movement Only        │ < 6h          │ SMS          │
│ Movement Only        │ > 6h          │ UI Badge     │
└──────────────────────┴───────────────┴──────────────┘
```

---

### Database Changes

Add a `monitoring_status` column to track each market's state:

```sql
ALTER TABLE polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS monitoring_status text DEFAULT 'idle';

-- Possible values:
-- 'idle' - Not actively monitored
-- 'watching' - In watchlist, checking for triggers
-- 'triggered' - Edge or movement detected, signal active
-- 'executed' - User placed bet
```

---

### pg_cron Schedule Update

Simplify to a single consolidated job:

| Job | Schedule | Function |
|-----|----------|----------|
| `unified-monitor` | Every 5 min | `polymarket-monitor` (processes all watched markets) |
| `ingest-odds` | Every 5 min | Captures bookmaker H2H + sharp book snapshots |

Remove redundant jobs:
- `watch-mode-poll` → merged into unified monitor
- `active-mode-poll` → merged into unified monitor

---

### User Flow After Implementation

1. **You click "Full Scan"** → System fetches ALL Polymarket sports events (7-day window)
2. **~500+ markets added to watchlist** → Stored with `status='watching'`
3. **Every 5 minutes (background)**:
   - `ingest-odds` captures fresh bookmaker prices + sharp book snapshots
   - `polymarket-monitor` scans all watched markets for triggers
4. **When trigger fires** (edge OR movement):
   - Signal created in `signal_opportunities`
   - If near-term + high conviction → SMS sent
5. **You get SMS** → Review in terminal → Execute or dismiss

---

### Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Markets monitored | ~25 (24h only) | 500+ (7-day window) |
| Movement detection coverage | Limited | Full |
| Time to detect sharp move | Varies | < 5 minutes |
| Duplicate polling functions | 3 | 1 |

---

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Expand to 7-day window, set `status='watching'` |
| `supabase/functions/polymarket-monitor/index.ts` | Query all watched markets, add dual trigger logic |
| `supabase/functions/watch-mode-poll/index.ts` | Can be deprecated after merge |
| `supabase/functions/active-mode-poll/index.ts` | Can be deprecated after merge |
| Database migration | Add `monitoring_status` column |

