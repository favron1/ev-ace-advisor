
# Fix Polymarket Sports URLs

## Summary
Update the URL generation to use the correct sports URL format that Polymarket uses for game markets.

## Current Issue
The app generates URLs like:
`https://polymarket.com/event/nhl-cbj-chi-2026-01-30`

But Polymarket uses:
`https://polymarket.com/sports/nhl/games/week/18/nhl-cbj-chi-2026-01-30`

## Solution

**File: `src/components/terminal/SignalCard.tsx`**

Update the `getPolymarketDirectUrl` function to:

1. Parse the sport from the slug (e.g., `nhl-` prefix)
2. Calculate the week number from the event date
3. Build the correct sports URL format

### Changes

Replace the URL generation logic (around line 186-195):

```typescript
// Generate Polymarket sports URL using slug from backend
// Format: /sports/{sport}/games/week/{week}/{slug}
const getPolymarketDirectUrl = (): string | null => {
  const slug = (signal as any).polymarket_slug;
  if (!slug) return null;
  
  // Extract sport from slug prefix (e.g., "nhl-min-edm-2026-01-31" -> "nhl")
  const sportMatch = slug.match(/^([a-z]+)-/i);
  if (!sportMatch) return null;
  
  const sport = sportMatch[1].toLowerCase();
  
  // Calculate week number from the date in the slug (last 10 chars: YYYY-MM-DD)
  const dateMatch = slug.match(/(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;
  
  const eventDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
  const weekNumber = getSeasonWeek(eventDate, sport);
  
  return `https://polymarket.com/sports/${sport}/games/week/${weekNumber}/${slug}`;
};

// Helper: Calculate season week for a given sport and date
function getSeasonWeek(date: Date, sport: string): number {
  // NHL/NBA seasons typically start in October
  // NFL seasons start in September
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  
  // Determine season start based on sport
  let seasonStart: Date;
  if (sport === 'nfl') {
    // NFL: First Thursday of September
    seasonStart = new Date(month >= 8 ? year : year - 1, 8, 5);
  } else {
    // NHL/NBA: Mid-October
    seasonStart = new Date(month >= 9 ? year : year - 1, 9, 4);
  }
  
  // Calculate weeks since season start
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.floor((date.getTime() - seasonStart.getTime()) / msPerWeek);
  
  // Return week number (1-indexed, capped at reasonable range)
  return Math.max(1, Math.min(weeksSinceStart + 1, 52));
}
```

### Special Handling for Non-Sports Slugs

If a slug doesn't match the sports pattern (e.g., Australian league `aus-new-bri-2026-01-31`), fall back to the search URL.

## Result
- Links will open directly to the correct Polymarket game page
- Week numbers will be calculated automatically based on the event date
- Fallback search still works when direct URL can't be generated
