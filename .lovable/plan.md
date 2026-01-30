

# Refactor: Unified Sport Configuration System

## Problem Summary
The system requires manual code changes in 4+ files whenever a new sport needs to be added (like NHL was). This is error-prone and violates DRY (Don't Repeat Yourself) principles.

**Current State - Hardcoded in multiple places:**
- Team mappings duplicated in 2 files
- Sport endpoints defined in 2 files  
- Explicit variable names per sport (`scrapedNba`, `scrapedNhl`)
- Union types that must be manually extended

## Solution: Single Configuration Object

Create one `SPORTS_CONFIG` object that defines everything for each sport, then use it dynamically everywhere.

---

## Technical Changes

### 1. Create Shared Sports Configuration Module

**New file:** `supabase/functions/_shared/sports-config.ts`

```text
// All sport configuration in ONE place
export const SPORTS_CONFIG = {
  nhl: {
    name: 'NHL',
    polymarketUrl: 'https://polymarket.com/sports/nhl/games',
    oddsApiSport: 'icehockey_nhl',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'icehockey_nhl_championship_winner',
    teamMap: {
      'ana': 'Anaheim Ducks',
      'bos': 'Boston Bruins',
      // ... all NHL teams
    },
    detectionPatterns: [/\bnhl\b/, /blackhawks|maple leafs|bruins.../]
  },
  nba: {
    name: 'NBA',
    polymarketUrl: 'https://polymarket.com/sports/nba/games',
    oddsApiSport: 'basketball_nba',
    oddsApiMarkets: 'h2h',
    oddsApiOutright: 'basketball_nba_championship_winner',
    teamMap: { ... },
    detectionPatterns: [...]
  },
  nfl: { ... },
  cbb: { ... },
  // Future: mlb, soccer_epl, etc. - just add here!
};

// Derived values (computed once)
export const ALLOWED_SPORT_CODES = Object.keys(SPORTS_CONFIG);
export const ALLOWED_SPORT_NAMES = Object.values(SPORTS_CONFIG).map(s => s.name);
```

### 2. Update Firecrawl Scraper to Use Config

**File:** `supabase/functions/_shared/firecrawl-scraper.ts`

```text
import { SPORTS_CONFIG } from './sports-config.ts';

export type SportCode = keyof typeof SPORTS_CONFIG;

export async function scrapePolymarketGames(
  sport: SportCode,  // Now type-safe and auto-complete
  firecrawlApiKey: string
): Promise<ParsedGame[]> {
  const config = SPORTS_CONFIG[sport];
  const sportUrl = config.polymarketUrl;
  const teamMap = config.teamMap;
  // ... rest of function unchanged
}
```

### 3. Update Sync Function to Use Dynamic Scraping

**File:** `supabase/functions/polymarket-sync-24h/index.ts`

Replace:
```text
const [nbaGames, cbbGames, nflGames, nhlGames] = await Promise.all([
  scrapePolymarketGames('nba', ...),
  scrapePolymarketGames('cbb', ...),
  scrapePolymarketGames('nfl', ...),
  scrapePolymarketGames('nhl', ...),
]);
```

With:
```text
import { SPORTS_CONFIG, ALLOWED_SPORT_CODES } from './_shared/sports-config.ts';

// Scrape ALL configured sports dynamically
const scrapeResults = await Promise.all(
  ALLOWED_SPORT_CODES.map(sport => 
    scrapePolymarketGames(sport, firecrawlApiKey)
      .then(games => ({ sport, games }))
  )
);

// Flatten into array with sport metadata
const allScrapedGames = scrapeResults.flatMap(({ sport, games }) =>
  games.map(game => ({ 
    game, 
    sport: SPORTS_CONFIG[sport].name, 
    sportCode: sport 
  }))
);
```

### 4. Update Monitor to Use Config

**File:** `supabase/functions/polymarket-monitor/index.ts`

Replace static `SPORT_ENDPOINTS`:
```text
import { SPORTS_CONFIG, ALLOWED_SPORT_CODES } from './_shared/sports-config.ts';

// Build endpoints dynamically from config
const SPORT_ENDPOINTS = Object.fromEntries(
  ALLOWED_SPORT_CODES.map(code => [
    SPORTS_CONFIG[code].name,
    { 
      sport: SPORTS_CONFIG[code].oddsApiSport, 
      markets: SPORTS_CONFIG[code].oddsApiMarkets 
    }
  ])
);
```

### 5. Update Sport Detection

**File:** Multiple functions use regex patterns for sport detection

Replace hardcoded patterns with config-driven detection:
```text
function detectSport(text: string): string | null {
  for (const [code, config] of Object.entries(SPORTS_CONFIG)) {
    if (config.detectionPatterns.some(p => p.test(text))) {
      return config.name;
    }
  }
  return null;
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `_shared/sports-config.ts` | **NEW** - Central configuration |
| `_shared/firecrawl-scraper.ts` | Import config, remove duplicate team maps |
| `polymarket-sync-24h/index.ts` | Use dynamic scraping, import config |
| `polymarket-monitor/index.ts` | Build SPORT_ENDPOINTS from config |
| `active-mode-poll/index.ts` | Import shared SPORT_ENDPOINTS |

---

## Benefits After Refactor

1. **Add new sport = 1 place to edit**
   - Just add a new entry to `SPORTS_CONFIG`
   - All functions automatically pick it up

2. **Type safety**
   - `SportCode` type auto-updates with config
   - IDE auto-completion for sport codes

3. **No more duplicate team mappings**
   - Single source of truth for team name normalization

4. **Easier testing**
   - Can mock `SPORTS_CONFIG` for unit tests

5. **Future extensibility**
   - Add MLB, Soccer, Tennis by adding config entries
   - No code changes needed in scraping/monitoring logic

---

## Example: Adding MLB in the Future

After this refactor, adding MLB would be:

```text
// In sports-config.ts, just add:
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
  detectionPatterns: [/\bmlb\b/, /yankees|dodgers|red sox.../]
}
```

Done! All functions would automatically scrape MLB, monitor MLB odds, and detect MLB markets.

