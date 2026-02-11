

# 5-Stage Pipeline Rebuild

## What We're Doing

Restructuring the existing monolithic pipeline into 5 separate pages. Each stage filters bets -- good ones flow forward, bad ones get dropped. This isolates each step so when something breaks, you know exactly where.

## The 5 Stages

```text
Stage 1           Stage 2          Stage 3          Stage 4          Stage 5
DISCOVERY    -->  ANALYSIS    -->  WATCHING    -->  EXECUTION   -->  HISTORY
/discover         /analyze         /watch           /execute         /history

Source markets    Calculate edges   Poll every 5m    Final go/no-go   Settled bets
Match to books    Highlight best    Track movement   Cost breakdown   Win/Loss/P&L
Paste imports     Promote winners   Flag stale data  Mark as placed   Performance
```

## Stage-by-Stage Breakdown

### Stage 1: Discovery (`/pipeline/discover`)
- "Sync Polymarket" button pulls upcoming H2H markets
- Batch paste input (absorbs current `/batch-import` page)
- Table showing all discovered markets with match status (Matched / Unmatched / Partial)
- Unmatched teams highlighted in red/amber with inline mapping resolution
- "Retry Matching" button to re-run fallback chain
- Summary bar: "42 discovered, 35 matched, 7 unmatched"
- Only matched markets become visible in Stage 2

### Stage 2: Analysis (`/pipeline/analyze`)
- Shows only markets with both Poly price AND Book fair probability
- Calculates Edge % (color-coded: green > 3%, yellow 1-3%, grey < 1%)
- Shows confidence, volume, liquidity per event
- Checkbox selection on high-edge rows
- "Send to Watching" button promotes selected events to Stage 3
- Sort/filter by edge, sport, confidence, game time

### Stage 3: Watching (`/pipeline/watch`)
- Only promoted events from Stage 2
- Auto-polls every 5 minutes via existing `watch-mode-poll` function
- Shows price deltas since last poll, edge movement (growing/stable/shrinking)
- Freshness badges: FRESH (green, < 10min) / STALE (amber, > 10min) / DEAD (red, > 30min)
- Manual price override on stale rows
- "Poll Now" button for immediate refresh
- "Ready to Execute" button sends selected events to Stage 4

### Stage 4: Execution (`/pipeline/execute`)
- Full cost breakdown per event (raw edge, platform fee, spread, slippage, net edge)
- Execution decision: STRONG BET / BET / MARGINAL / NO BET (reuses existing ExecutionDecision component)
- Liquidity tier, max stake, stake input field
- "Mark as Placed" button records bet to `signal_logs` and moves to History
- "Dismiss" removes from pipeline
- Game-started lock prevents late execution

### Stage 5: History (`/pipeline/history`)
- All placed bets with outcomes: PENDING / IN PLAY / WIN / LOSS / VOID
- P/L tracking per bet and cumulative
- Summary stats: total bets, win rate, total P/L, ROI %
- Auto-settlement via existing `settle-bets` function
- Inline edit and export capabilities (reuses existing Stats components)
- Absorbs current `/stats` bet history functionality

## Shared Navigation

A stepper bar at the top of every pipeline page:

```text
[1. Discovery (42)] -> [2. Analysis (35)] -> [3. Watching (8)] -> [4. Execute (3)] -> [5. History (127)]
```

Each step shows event count. Current stage highlighted. Click to navigate.

## Technical Details

### Database Change
Add `pipeline_stage` column to `event_watch_state`:
- Values: `discovered`, `matched`, `analyzing`, `watching`, `executing`, `settled`
- Separate from existing `watch_state` column so polling logic stays untouched
- Default: `discovered`

### New Files

| File | Purpose |
|------|---------|
| `src/pages/pipeline/Discover.tsx` | Stage 1 |
| `src/pages/pipeline/Analyze.tsx` | Stage 2 |
| `src/pages/pipeline/Watch.tsx` | Stage 3 |
| `src/pages/pipeline/Execute.tsx` | Stage 4 |
| `src/pages/pipeline/History.tsx` | Stage 5 |
| `src/components/pipeline/PipelineStepper.tsx` | Shared navigation with counts |
| `src/components/pipeline/MatchStatusBadge.tsx` | Match status indicator |
| `src/components/pipeline/StaleIndicator.tsx` | Freshness indicator |
| `src/components/pipeline/ManualPriceOverride.tsx` | Inline price editing |
| `src/components/pipeline/ExecutionCard.tsx` | Cost breakdown card |
| `src/hooks/usePipelineData.ts` | Stage-specific data fetching |

### Route Changes in App.tsx

| New Route | Page |
|-----------|------|
| `/pipeline` | Redirects to `/pipeline/discover` |
| `/pipeline/discover` | Stage 1 |
| `/pipeline/analyze` | Stage 2 |
| `/pipeline/watch` | Stage 3 |
| `/pipeline/execute` | Stage 4 |
| `/pipeline/history` | Stage 5 |

Old `/pipeline` and `/batch-import` routes replaced. `/stats` route kept but links to History.

### Existing Code Reused

| What | Where |
|------|-------|
| `batch-parser.ts` + `batch-market-import` function | Stage 1 paste input |
| `polymarket-sync-24h` function | Stage 1 sync button |
| `watch-mode-poll` function | Stage 3 auto-polling |
| `ExecutionDecision` component + `execution-engine.ts` | Stage 4 cost breakdown |
| `mark-executed` function | Stage 4 bet placement |
| `settle-bets` function | Stage 5 auto-settlement |
| `EditBetDialog` + `PredictiveReportDownload` | Stage 5 editing/export |
| `UnmatchedTeamsPanel` component | Stage 1 team mapping |
| `useSignalStats` hook | Stage 5 stats |

### Event Lifecycle

```text
Discovered (Stage 1) -> Matched (Stage 1) -> Analyzing (Stage 2) -> Watching (Stage 3) -> Executing (Stage 4) -> Settled (Stage 5)
```

Events can be dismissed at any stage. Bad bets never make it past their current stage.

## Build Order

1. Database migration (add `pipeline_stage` column)
2. PipelineStepper shared component
3. Stage 1: Discovery (includes batch import absorption)
4. Stage 2: Analysis
5. Stage 3: Watching
6. Stage 4: Execution
7. Stage 5: History
8. Route updates in App.tsx
9. Header navigation updates

