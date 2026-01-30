
# Fix: Add NHL to Firecrawl Scraping for Accurate Prices

## Problem Identified

Your screenshots show Polymarket has **real prices** for all games:
- Avalanche vs Red Wings: COL 61¢ / DET 40¢ ($87.80k volume)
- Jets vs Panthers: WPG 39¢ / FLA 62¢
- Spurs vs Hornets: SAS 62¢ / CHA 40¢

But our database shows **stale 50¢/50¢ placeholders** for NHL games while NBA games have correct prices.

**Root Cause:** The `polymarket-sync-24h` function only scrapes NBA, CBB, and NFL via Firecrawl. NHL is missing, so NHL games rely on the Gamma API which returns stale/placeholder prices.

## Solution

Add NHL scraping to the Firecrawl pipeline, matching the pattern already used for NBA, CBB, and NFL.

### Changes Required

**1. Add NHL team mapping** (in `polymarket-sync-24h`)
```typescript
const NHL_TEAM_MAP: Record<string, string> = {
  'col': 'Colorado Avalanche', 'det': 'Detroit Red Wings',
  'wpg': 'Winnipeg Jets', 'fla': 'Florida Panthers',
  // ... full NHL team mapping
};
```

**2. Add NHL to Firecrawl scrape targets** (line 410-414)
```typescript
const [nbaGames, cbbGames, nflGames, nhlGames] = await Promise.all([
  scrapePolymarketGames('nba', firecrawlApiKey),
  scrapePolymarketGames('cbb', firecrawlApiKey),
  scrapePolymarketGames('nfl', firecrawlApiKey),
  scrapePolymarketGames('nhl', firecrawlApiKey),  // NEW
]);
```

**3. Update `scrapePolymarketGames` function** to support NHL
```typescript
async function scrapePolymarketGames(
  sport: 'nba' | 'cbb' | 'nfl' | 'nhl',  // Add nhl
  firecrawlApiKey: string
): Promise<ParsedGame[]> {
  const sportUrl = sport === 'nhl'
    ? 'https://polymarket.com/sports/nhl/games'
    : sport === 'cbb'
      ? 'https://polymarket.com/sports/cbb/games'
      : sport === 'nfl'
        ? 'https://polymarket.com/sports/nfl/games'
        : 'https://polymarket.com/sports/nba/games';
  
  const teamMap = sport === 'nhl' 
    ? NHL_TEAM_MAP 
    : sport === 'nfl' 
      ? NFL_TEAM_MAP 
      : NBA_TEAM_MAP;
  // ...
}
```

**4. Include NHL games in Firecrawl upsert** (line 584-589)
```typescript
const firecrawlGames: Array<{ game: ParsedGame; sport: string; sportCode: string }> = [
  ...scrapedNba.map(g => ({ game: g, sport: 'NBA', sportCode: 'nba' })),
  ...scrapedCbb.map(g => ({ game: g, sport: 'NCAA', sportCode: 'cbb' })),
  ...scrapedNfl.map(g => ({ game: g, sport: 'NFL', sportCode: 'nfl' })),
  ...scrapedNhl.map(g => ({ game: g, sport: 'NHL', sportCode: 'nhl' })), // NEW
];
```

## Expected Outcome

After this fix:
- NHL games will have **real prices** (e.g., 61¢/40¢ instead of 50¢/50¢)
- NHL games will have **real volumes** (e.g., $87k instead of $339)
- Edge detection will work correctly for NHL (it currently can't detect edges when prices are 50¢/50¢)
- NHL signals will appear in the feed just like they did when you won those previous bets

## Technical Notes

- The NHL team codes on Polymarket appear to be 3-letter abbreviations (COL, DET, WPG, FLA, etc.)
- Firecrawl scraping pattern `([a-z]{2,3})(\d+)¢` should work for NHL
- No database schema changes required
- Deploy will be automatic after code changes
