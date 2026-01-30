

# Integrated Basketball Scraping + Sport Focus

## Overview

This plan integrates Firecrawl-based scraping directly into the scan flow (no separate NBA button) and focuses the system exclusively on **NHL, NBA, NCAA CBB, and NFL**.

---

## Current Scan Flow

When you press the "Full Scan" button, this happens:

```text
1. useSignals.runDetection() called
   ↓
2. polymarket-sync-24h invoked
   → Fetches sports events from Polymarket Gamma API (tag_slug=sports)
   → Filters to 24-hour window
   → Upserts to polymarket_h2h_cache
   ↓
3. polymarket-monitor invoked
   → Reads cache, fetches CLOB prices
   → Fetches bookmaker odds from The Odds API
   → Compares prices, creates signals
```

**The Problem**: Polymarket's Gamma API doesn't expose NBA/NCAA H2H games, so Step 2 captures 0 basketball markets.

---

## Proposed Changes

### 1. Modify `polymarket-sync-24h` to Include Firecrawl Scraping

After fetching from the Gamma API, the function will **also** scrape Polymarket's basketball pages:

```text
polymarket-sync-24h:
  ├── Fetch from Gamma API (tag_slug=sports)
  ├── NEW: Scrape /sports/nba/games via Firecrawl
  ├── NEW: Scrape /sports/cbb/games via Firecrawl  
  ├── NEW: Scrape /sports/nfl/games via Firecrawl (if available)
  ├── Filter to 24h window
  └── Upsert ALL to polymarket_h2h_cache
```

### 2. Update Sport Filtering to Focus on 4 Leagues

The scan will **only process** markets from:
- **NHL** (already works via API)
- **NBA** (via Firecrawl scrape)
- **NCAA CBB** (via Firecrawl scrape)
- **NFL** (via API + Firecrawl backup)

All other sports (Tennis, UFC, Soccer, etc.) will be temporarily suspended.

### 3. Remove Standalone NBA Scrape Button

The PolymarketCacheStats component will revert to showing just the "Sync API" button. Scraping happens automatically during Full Scan.

### 4. Update `polymarket-monitor` Sport Endpoints

Focus only on the 4 target sports when fetching bookmaker odds:

| Sport | Odds API Endpoint | Markets |
|-------|------------------|---------|
| NHL | icehockey_nhl | h2h |
| NBA | basketball_nba | h2h |
| NCAA | basketball_ncaab | h2h |
| NFL | americanfootball_nfl | h2h |

---

## Technical Details

### Modified `polymarket-sync-24h` Flow

```typescript
// After Gamma API fetch...

// Scrape NBA games
const nbaGames = await scrapePolymarketGames('nba');
for (const game of nbaGames) {
  qualifying.push({
    conditionId: `firecrawl_nba_${game.team1Code}_${game.team2Code}`,
    title: `${game.team1Name} vs ${game.team2Name}`,
    yesPrice: game.team1Price,
    noPrice: game.team2Price,
    sport: 'NBA',
    source: 'firecrawl'
  });
}

// Scrape NCAA CBB games
const ncaaGames = await scrapePolymarketGames('cbb');
// ... same pattern
```

### Firecrawl Parsing (Already Built)

The scraper extracts game data like:
```text
tor48¢  orl53¢  →  { Toronto Raptors: 0.48, Orlando Magic: 0.53 }
```

### Sport Focus Filter

Add early filter in both edge functions:

```typescript
const ALLOWED_SPORTS = ['NHL', 'NBA', 'NCAA', 'NFL', 'basketball_nba', 
                        'basketball_ncaab', 'icehockey_nhl', 'americanfootball_nfl'];

// Skip if not in allowed list
if (!ALLOWED_SPORTS.some(s => detectedSport.includes(s))) {
  continue;
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Add Firecrawl scraping for NBA/CBB/NFL after Gamma fetch |
| `supabase/functions/polymarket-monitor/index.ts` | Filter SPORT_ENDPOINTS to only NHL/NBA/NCAA/NFL |
| `src/components/terminal/PolymarketCacheStats.tsx` | Remove NBA scrape button, simplify to single sync |
| `supabase/functions/scrape-polymarket-prices/index.ts` | Add NCAA team mappings, export helper functions |

---

## Expected Result

After pressing "Full Scan":

| Sport | Source | Expected Markets |
|-------|--------|-----------------|
| NHL | Gamma API | ~60-70 H2H games |
| NBA | Firecrawl | ~10-15 H2H games |
| NCAA CBB | Firecrawl | ~100-400 H2H games |
| NFL | API + Firecrawl | ~10-16 H2H games |
| **Total** | Combined | **~180-500 H2H markets** |

---

## Considerations

**Firecrawl Usage**: Each scan will use 2-3 Firecrawl credits (one per sport page). With a 30-minute scan interval, this means ~48-72 credits/day.

**Parsing Reliability**: If Polymarket changes their page layout, the regex patterns may need updating. The scraper includes fallback logging to detect format changes.

**NCAA Team Mapping**: NCAA has hundreds of teams. The initial implementation will use the team codes directly from the scraped data, relying on bookmaker matching by partial name.

