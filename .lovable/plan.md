

# Fix Polymarket Direct Links

## Problem Identified
The Polymarket links aren't working because:

1. **Firecrawl games (majority of signals) don't have slugs** - The sync function stores slugs from Gamma API events, but Firecrawl-scraped games are upserted without the `polymarket_slug` field
2. **When signals are updated, slugs aren't copied** - The UPDATE path in polymarket-monitor doesn't include `polymarket_slug`
3. **Most signals have NULL slugs** - Query confirmed only 1 out of 10 recent signals has a slug

## Data Evidence
```sql
-- Most signals have NULL polymarket_slug:
nhl-min-edm-2026-01-31 -- ONLY this one has a slug
NULL -- Memphis Grizzlies vs New Orleans Pelicans
NULL -- Toronto Raptors vs Orlando Magic
NULL -- Lakers, Blue Jackets, Michigan, Seahawks, etc.
```

## Solution

### Part 1: Generate Slugs for Firecrawl Games (Backend Fix)

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

When upserting Firecrawl games, generate the slug in the format Polymarket uses:
`{sport}-{team1code}-{team2code}-{YYYY-MM-DD}`

Current upsert (line ~657):
```typescript
const { error: fcError } = await supabase
  .from('polymarket_h2h_cache')
  .upsert({
    condition_id: conditionId,
    event_title: `${game.team1Name} vs ${game.team2Name}`,
    // NO polymarket_slug!
  });
```

Add slug generation:
```typescript
// Generate Polymarket-style slug: nhl-min-edm-2026-01-31
const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
const generatedSlug = `${sportCode}-${game.team1Code}-${game.team2Code}-${dateStr}`;

const { error: fcError } = await supabase
  .from('polymarket_h2h_cache')
  .upsert({
    // ... existing fields
    polymarket_slug: generatedSlug, // NEW: Generated slug for direct URLs
  });
```

---

### Part 2: Copy Slug When Updating Signals (Backend Fix)

**File: `supabase/functions/polymarket-monitor/index.ts`**

When updating an existing signal (lines 1509-1523), the slug isn't being included:

```typescript
// Current UPDATE path - missing polymarket_slug
const { data, error } = await supabase
  .from('signal_opportunities')
  .update({
    ...signalData,
    side: betSide,
    // polymarket_slug NOT included here!
  })
```

Fix: Also update the slug on existing signals:
```typescript
const polymarketSlug = cache?.polymarket_slug || null;

const { data, error } = await supabase
  .from('signal_opportunities')
  .update({
    ...signalData,
    side: betSide,
    polymarket_slug: polymarketSlug, // NEW: Update slug on existing signals
  })
```

---

### Part 3: Improve Frontend Fallback (Already Done)

The frontend code in SignalCard.tsx already has the correct URL generation logic from the earlier change:
```typescript
const getPolymarketDirectUrl = (): string | null => {
  const slug = (signal as any).polymarket_slug;
  if (!slug) return null;
  
  // Extract sport, calculate week, build URL
  return `https://polymarket.com/sports/${sport}/games/week/${weekNumber}/${slug}`;
};
```

The issue is just that the slug is NULL because of the backend problems above.

---

## Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Generate `polymarket_slug` for Firecrawl games |
| `supabase/functions/polymarket-monitor/index.ts` | Copy `polymarket_slug` when updating existing signals |

## Expected Result
After these fixes:
1. New Firecrawl-scraped games will have slugs like `nhl-min-edm-2026-01-31`
2. Existing signals will get slugs when they're updated by the monitor
3. The "Trade on Poly" button will open the correct game page directly

