

# Fix: Incorrect Event Date Causing Cross-Game Odds Contamination

## Problem Summary

The Red Wings vs. Avalanche signal shows 41.8% fair probability for Detroit, but this is data from **today's game (Jan 31)** being applied to a **future Polymarket market (Feb 2)**. This creates phantom signals with invalid edges.

## Root Cause Chain

```text
Polymarket Market: "Red Wings vs. Avalanche" (slug: nhl-det-col-2026-02-02)
                            |
                            v
Gamma API returns bad/missing startDate/endDate
                            |
                            v
isWithin24HourWindow() falls back to Odds API matching
                            |
                            v
Finds "Avalanche" + "Red Wings" in title, matches TODAY's game
(Colorado @ Detroit on Jan 31) instead of Feb 2's game
                            |
                            v
Cache stores event_date: 2026-01-31 (WRONG - should be Feb 2)
                            |
                            v
polymarket-monitor uses cached date for validation
                            |
                            v
TODAY's bookmaker odds (Detroit 41.8% at HOME) applied to Feb 2 market
                            |
                            v
Signal created with wrong fair probability
```

## Solution: Parse Date from Polymarket Slug

The Polymarket slug (`nhl-det-col-2026-02-02`) contains the **authoritative game date**. We should:

1. **Parse the date from the slug** before falling back to Odds API matching
2. **Use slug date as priority source** when available (most reliable for sports events)
3. **Skip Odds API cross-reference** if slug date is outside 24h window

### Technical Implementation

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Add slug date extraction to `isWithin24HourWindow()`:

```typescript
// Add before Odds API fallback (line ~384):
// 3.5. NEW: Parse date from event slug (e.g., "nhl-det-col-2026-02-02")
const eventSlug = event.slug || '';
const slugDateMatch = eventSlug.match(/(\d{4}-\d{2}-\d{2})$/);
if (slugDateMatch) {
  const slugDate = new Date(slugDateMatch[1] + 'T23:59:59Z');
  if (!isNaN(slugDate.getTime())) {
    // If slug date is within 24h window, use it
    if (slugDate >= now && slugDate <= in24Hours) {
      return { inWindow: true, dateSource: 'slug', resolvedDate: slugDate };
    }
    // If slug date is OUTSIDE 24h window, reject early
    // This prevents matching to wrong game via Odds API
    return { inWindow: false, dateSource: 'slug-outside', resolvedDate: null };
  }
}
```

### Why This Fixes the Bug

| Before | After |
|--------|-------|
| Slug date ignored | Slug date checked first |
| Falls back to Odds API matching | Slug date outside 24h = reject immediately |
| Matches wrong game with same teams | No cross-contamination possible |
| Creates phantom signals | Only creates signals for games in 24h window |

### Additional Safety: Strengthen polymarket-monitor Date Check

**File: `supabase/functions/polymarket-monitor/index.ts`**

Add secondary validation using the slug date:

```typescript
// Before matching, verify slug date matches bookmaker date (if slug available)
const cache = cacheMap.get(event.polymarket_condition_id);
const slugDate = cache?.polymarket_slug?.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];

if (slugDate) {
  const slugDateObj = new Date(slugDate);
  const bookmakerDate = new Date(game.commence_time);
  const daysDiff = Math.abs(slugDateObj.getTime() - bookmakerDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysDiff > 1) {
    console.log(`[POLY-MONITOR] SLUG DATE MISMATCH: slug=${slugDate}, book=${bookmakerDate.toISOString().split('T')[0]} - SKIPPING`);
    continue;
  }
}
```

### Immediate Actions

1. **Expire the bad signal**: Update signal `0928b81a...` to status='expired'
2. **Fix the cache entry**: Update `event_date` for condition `0x9119...` to Feb 2
3. **Deploy the slug-based date parsing fix**

### Test Cases

After deployment, verify:
1. Markets with slug dates outside 24h are NOT synced
2. Markets with slug dates INSIDE 24h use the correct slug date
3. No cross-game contamination for teams playing multiple times (like Red Wings vs Avalanche)

