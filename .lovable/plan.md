
# Fix: Expand Polymarket Market Discovery

## Problem Identified

The "Found 6 events" message is misleading. Your cache actually contains **511 markets** with **104 actively monitored**. The issue is:

1. **Gamma API date problem**: 486 out of 500 events from the Gamma API have `endDate` set to season end (e.g., July 2026 for NBA) rather than game day, so they fail the 24-hour window filter
2. **Toast message is incorrect**: It shows only Gamma API qualifiers (6), not the full picture including Firecrawl games (39+)
3. **Firecrawl is working well**: It scraped 39 games (20 NHL, 10 NBA, 8 NCAA, 1 NFL) and they ARE being monitored

## Current Data in Your Cache

| Source | Monitoring Status | Count |
|--------|-------------------|-------|
| Gamma API | Watching | 106 (NHL) |
| Firecrawl | Watching | 50 (NHL: 30, NBA: 10, NCAA: 9, NFL: 1) |
| Gamma API | Idle (futures/past) | 355 |
| **Total Active Monitoring** | | **~156** |

## Technical Fixes

### Fix 1: Correct the Toast Message

Show the **total markets being monitored**, not just Gamma API qualifiers:

```typescript
// In useSignals.ts runDetection()
const totalMarkets = syncData.upserted_to_cache + (syncData.firecrawl_upserted || 0);
toast({ title: `Checking ${totalMarkets} markets for edges...` });

// Or show total from cache with watching status
const watchingCount = syncData.total_watching || totalMarkets;
```

### Fix 2: Improve Date Detection for Gamma API Events

For events where `endDate` is far in the future (season end), use alternative date sources:

```typescript
// Enhanced date detection in polymarket-sync-24h/index.ts
function isWithin24HourWindow(event) {
  // 1. startDate (most accurate)
  // 2. Parse from market question: "on 2026-01-31?" or "January 31"
  // 3. Parse from title: "Lakers vs Celtics - Jan 31"
  // 4. Check if today's games by querying Odds API schedule
}
```

### Fix 3: Add Match-Day Detection from External Schedule

Cross-reference Polymarket events with today's games from the Odds API:

```typescript
// Fetch today's schedule from Odds API
const todaysGames = await fetchOddsApi('basketball_nba', 'h2h');
const gameToday = todaysGames.find(g => 
  normalize(g.home_team).includes(normalize(polymarketTeam1)) ||
  normalize(g.away_team).includes(normalize(polymarketTeam1))
);

if (gameToday && gameToday.commence_time < in24Hours) {
  // Override the bad Gamma API date with Odds API date
  return { inWindow: true, resolvedDate: gameToday.commence_time };
}
```

### Fix 4: Update Sync Response to Include All Data

```typescript
return {
  success: true,
  total_fetched: allEvents.length,
  qualifying_from_gamma: qualifying.length,  // 6
  qualifying_from_firecrawl: firecrawlGames.length,  // 39
  total_monitoring: monitored,  // Combined total
  // ...
}
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useSignals.ts` | Fix toast to show total monitored, not just Gamma qualifiers |
| `supabase/functions/polymarket-sync-24h/index.ts` | Add Odds API cross-reference for date detection |
| `supabase/functions/polymarket-sync-24h/index.ts` | Return clearer stats in response |

## What This Means for Your Trading

Your system IS monitoring ~156 markets across all sports. The "6 events" message was just showing the wrong number. After this fix:

1. Toast will show "Checking ~156 markets for edges..."
2. More NBA/NCAA games will qualify as their dates are properly detected
3. The monitor will continue checking all 156 markets against bookmaker data

## Important Reality Check

Even with all markets being scanned, edges are rare because:
- Polymarket NBA has low volume (most traders focus on NHL)
- Bookmaker odds and Polymarket prices are often aligned (no mispricing)
- When edges exist, they're typically 2-4% which nets ~0.5-2% after fees
