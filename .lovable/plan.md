# Unified Sport Configuration System - COMPLETE ✅

## Summary
Created a single source of truth (`sports-config.ts`) for all sport configurations. Adding a new sport now requires editing ONE file.

## Architecture

```
supabase/functions/_shared/
├── sports-config.ts    # Central configuration (team maps, URLs, patterns)
└── firecrawl-scraper.ts  # Uses config for dynamic scraping
```

## How to Add a New Sport

Edit `supabase/functions/_shared/sports-config.ts`:

```typescript
// In SPORTS_CONFIG, add:
mlb: {
  name: 'MLB',
  polymarketUrl: 'https://polymarket.com/sports/mlb/games',
  oddsApiSport: 'baseball_mlb',
  oddsApiMarkets: 'h2h',
  oddsApiOutright: 'baseball_mlb_world_series_winner',
  teamMap: {
    'nyy': 'New York Yankees',
    'lad': 'Los Angeles Dodgers',
    // ...
  },
  detectionPatterns: [/\bmlb\b/i, /yankees|dodgers|red sox/i],
}
```

That's it! All functions automatically pick up the new sport:
- `polymarket-sync-24h` scrapes it
- `polymarket-monitor` monitors it
- `active-mode-poll` tracks it

## Files Updated

| File | Change |
|------|--------|
| `_shared/sports-config.ts` | NEW - Central configuration |
| `_shared/firecrawl-scraper.ts` | Now imports from config |
| `polymarket-sync-24h/index.ts` | Uses `scrapeAllSports()` dynamically |
| `polymarket-monitor/index.ts` | Uses `buildSportEndpoints()` |
| `active-mode-poll/index.ts` | Uses `buildOutrightEndpoints()` |

## Current Sports Configured

- **NHL** - Hockey
- **NBA** - Basketball  
- **NFL** - Football
- **NCAA/CBB** - College Basketball

## Key Exports from sports-config.ts

```typescript
// Constants
SPORT_CODES        // ['nhl', 'nba', 'nfl', 'cbb']
SPORT_NAMES        // ['NHL', 'NBA', 'NFL', 'NCAA']
ALLOWED_SPORTS     // Same as SPORT_NAMES

// Functions
buildSportEndpoints()     // For polymarket-monitor
buildOutrightEndpoints()  // For active-mode-poll
detectSportFromText(text) // Pattern-based detection
getTeamMap(sportCode)     // Get team abbreviation map
getSportCodeFromLeague(name) // 'NBA' -> 'nba'
```
