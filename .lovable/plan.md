

# Fix: Enforce 24-Hour Window for All Signal Sources

## Problem Identified

The Seahawks vs Patriots signal showing **8 days 20 hours** to kickoff is a clear bug. Your system is supposed to only scan events within 24 hours, but this NFL game is being displayed anyway.

## Root Cause

Two places are missing the 24-hour filter:

1. **Firecrawl Scraping** (polymarket-sync-24h): When games are scraped from Polymarket's sports pages, they're inserted directly into the cache **without checking if they're within 24 hours**. The Polymarket page shows NFL games scheduled for next week.

2. **Monitor Loading** (polymarket-monitor): When loading markets to check for edges, the query only filters for `event_date > now` (future events) but doesn't cap at 24 hours.

## Solution

### Fix 1: Filter Firecrawl Games by 24-Hour Window

**File: `supabase/functions/polymarket-sync-24h/index.ts` (lines ~640-700)**

Before upserting each Firecrawl game, check if the game is within 24 hours. Skip games that are too far away.

```typescript
// Inside the batch.map() for Firecrawl games
await Promise.all(batch.map(async ({ game, sport, sportCode }) => {
  // CRITICAL FIX: Get actual commence time
  const actualCommenceTime = findOddsApiCommenceTime(game.team1Name, game.team2Name);
  const eventDate = actualCommenceTime || fallbackEventDate;
  
  // NEW: Skip games outside 24-hour window
  const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilEvent > 24 || hoursUntilEvent < 0) {
    console.log(`[FIRECRAWL] Skipping ${game.team1Name} vs ${game.team2Name} - ${hoursUntilEvent.toFixed(1)}h away (outside 24h window)`);
    return; // Skip this game
  }
  
  // ... rest of upsert logic
}));
```

### Fix 2: Add 24-Hour Filter to Monitor Query

**File: `supabase/functions/polymarket-monitor/index.ts` (lines ~920-942)**

Add a `.lte('event_date', in24Hours)` filter to both market loading queries.

```typescript
const now = new Date();
const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

// First, load API-sourced markets with volume filter
const { data: apiMarkets, error: apiLoadError } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .in('monitoring_status', ['watching', 'triggered'])
  .eq('status', 'active')
  .in('extracted_league', supportedSports)
  .or('source.is.null,source.eq.api')
  .gte('volume', 5000)
  .gte('event_date', now.toISOString())           // NEW: Only future events
  .lte('event_date', in24Hours.toISOString())     // NEW: Within 24 hours
  .order('event_date', { ascending: true })
  .limit(150);

// Second, load Firecrawl-sourced markets
const { data: firecrawlMarkets, error: fcLoadError } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .in('monitoring_status', ['watching', 'triggered'])
  .eq('status', 'active')
  .eq('source', 'firecrawl')
  .in('extracted_league', supportedSports)
  .gte('event_date', now.toISOString())           // NEW: Only future events
  .lte('event_date', in24Hours.toISOString())     // NEW: Within 24 hours
  .order('event_date', { ascending: true })
  .limit(100);
```

### Fix 3: Clean Up Existing Out-of-Window Signals

After deploying the fixes, we should also clean up the Seahawks signal that's already in the database. This can be done by either:

- Dismissing it manually from the Terminal
- Running a cleanup query to expire signals where event is >24h away

---

## Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Skip Firecrawl games outside 24-hour window |
| `supabase/functions/polymarket-monitor/index.ts` | Add 24-hour filter to market loading queries |

## Expected Results

After these fixes:
1. **Firecrawl games >24h away** will be skipped during sync
2. **Monitor queries** will only load markets within 24 hours
3. **The Seahawks vs Patriots signal** (and similar far-future games) won't appear
4. **Only actionable, near-term signals** will show in the Terminal

