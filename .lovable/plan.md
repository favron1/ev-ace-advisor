

# Market Watch Dashboard

## Overview

Create a comprehensive, always-visible dashboard that shows exactly what the system is monitoring at any given time, broken down by sport, source, and status. This will eliminate confusion about what's being scanned, what's being watched, and what edges have been found.

## Current State

The existing `PolymarketCacheStats` component only shows aggregate counts. The data exists but isn't visible:

| Status | Sport | Source | Count |
|--------|-------|--------|-------|
| watching | NHL | API | 50 |
| watching | NHL | Firecrawl | 30 |
| watching | NBA | Firecrawl | 10 |
| watching | NCAA | Firecrawl | 9 |
| watching | NFL | Both | 2 |
| idle | basketball_nba | API | 100 (futures) |
| triggered | NHL | API | 1 |

**Total Active Monitoring: ~104 markets**

## Proposed Solution

### New Component: `MarketWatchDashboard.tsx`

A collapsible/expandable panel that shows:

1. **Summary Row** - Quick stats at a glance
2. **Sport Breakdown** - Expandable sections per sport
3. **Market List** - Scrollable list of currently watched markets
4. **Scan History** - Recent scan results with edge counts

---

## Visual Layout

```text
+--------------------------------------------------+
| MARKET WATCH                        [Collapse ^] |
+--------------------------------------------------+
| MONITORING NOW                                   |
| +--------+ +--------+ +--------+ +--------+      |
| |  104   | |   1    | |   2    | |  511   |      |
| |Watching| |Trigger | | Edges  | | Total  |      |
| +--------+ +--------+ +--------+ +--------+      |
+--------------------------------------------------+
| BY SPORT                                         |
|                                                  |
| NHL      [================] 81 watching          |
|          API: 50 | Firecrawl: 30 | Triggered: 1  |
|                                                  |
| NBA      [====            ] 11 watching          |
|          API: 1  | Firecrawl: 10                 |
|                                                  |
| NCAA     [===             ] 9 watching           |
|          Firecrawl: 9                            |
|                                                  |
| NFL      [=               ] 2 watching           |
|          API: 1  | Firecrawl: 1                  |
+--------------------------------------------------+
| RECENT SCANS                                     |
|                                                  |
| 8:35am  104 markets | 2 edges | 1 triggered      |
| 8:30am  102 markets | 0 edges | 0 triggered      |
| 8:25am  100 markets | 1 edge  | 0 triggered      |
+--------------------------------------------------+
| ACTIVE MARKETS (tap to expand)           [v]     |
|                                                  |
| Blue Jackets vs Blackhawks  $55K  +15.2% edge    |
| Islanders vs Rangers        $776K  50/50         |
| Stars vs Golden Knights     $558K  47/53         |
| ... +98 more                                     |
+--------------------------------------------------+
```

---

## Technical Implementation

### 1. New Hook: `useMarketWatch.ts`

Consolidates data from multiple sources:

```typescript
interface MarketWatchStats {
  // Summary counts
  totalWatching: number;
  totalTriggered: number;
  totalEdgesFound: number;
  totalInCache: number;
  
  // By sport breakdown
  bySport: {
    sport: string;
    watching: number;
    triggered: number;
    apiCount: number;
    firecrawlCount: number;
  }[];
  
  // Active markets with details
  watchedMarkets: {
    id: string;
    eventName: string;
    sport: string;
    source: 'api' | 'firecrawl';
    volume: number;
    yesPrice: number;
    noPrice: number;
    hasEdge: boolean;
    edgePercent?: number;
    status: 'watching' | 'triggered' | 'idle';
  }[];
  
  // Scan history
  recentScans: {
    timestamp: Date;
    marketsChecked: number;
    edgesFound: number;
    signalsCreated: number;
  }[];
}
```

### 2. New Component: `MarketWatchDashboard.tsx`

Features:
- Collapsible sections for each sport
- Color-coded status indicators
- Real-time updates via Supabase subscription
- Scrollable market list with search/filter
- Compact mode for sidebar, full mode for modal

### 3. Integration Points

- Add to Terminal.tsx in the right sidebar
- Subscribe to `polymarket_h2h_cache` changes
- Subscribe to `signal_opportunities` changes
- Track scan history locally or via new table

---

## Data Sources

| Data | Source Table | Query |
|------|--------------|-------|
| Watching markets | `polymarket_h2h_cache` | `WHERE monitoring_status = 'watching'` |
| Triggered markets | `polymarket_h2h_cache` | `WHERE monitoring_status = 'triggered'` |
| Active edges | `signal_opportunities` | `WHERE status = 'active'` |
| Event states | `event_watch_state` | All states |
| Scan results | `signal_opportunities` | Group by hour |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useMarketWatch.ts` | Create | Hook to fetch and aggregate market data |
| `src/components/terminal/MarketWatchDashboard.tsx` | Create | Main dashboard component |
| `src/pages/Terminal.tsx` | Modify | Replace/enhance PolymarketCacheStats |

---

## Features

1. **Real-time Updates**: Supabase subscription refreshes data automatically
2. **Sport Breakdown**: See exactly how many markets per sport are monitored
3. **Source Tracking**: Distinguish API vs Firecrawl markets
4. **Edge Visibility**: Highlight markets with detected edges
5. **Scan History**: See results from recent scans at a glance
6. **Expandable Markets**: Click to see full list of watched markets
7. **Volume Indicators**: Show market liquidity for each game

---

## User Benefits

- **No more confusion** about what "6 events" means
- **Clear visibility** into multi-sport coverage
- **Real-time feedback** when scans complete
- **Easy verification** that your filters are working
- **Confidence** that the system is actually monitoring what you expect

