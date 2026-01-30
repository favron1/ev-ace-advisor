

# Firecrawl Integration as Polling Fallback

## Current Polling Architecture

The system currently runs three automated pg_cron jobs:

| Job | Schedule | Function | Purpose |
|-----|----------|----------|---------|
| polymarket-sync-24h | Every 30 min | Sync Polymarket cache | Fetches API + Firecrawl data |
| polymarket-monitor | Every 5 min | Edge detection | Compares cache vs bookmakers |
| ingest-odds | Every 10 min | Bookmaker ingestion | Fetches The Odds API data |

## Identified Issues with Firecrawl Integration

### 1. Volume Filter Blocks Scraped Data
- **Problem**: `watch-mode-poll` applies `.gte('volume', 5000)` filter
- **Impact**: All 18 Firecrawl markets have volume = 0, so they're excluded
- **Current state**: 63 API markets pass volume filter, 0 Firecrawl markets pass

### 2. Firecrawl Only Runs During Sync (Not Monitoring)
- **Problem**: Firecrawl scraping only happens in `polymarket-sync-24h` (every 30 min)
- **Impact**: If API fails or returns stale prices, there's no Firecrawl fallback during the more frequent monitoring cycles (every 5 min)

### 3. No Fallback in Active-Mode-Poll
- **Problem**: `active-mode-poll` refreshes prices via CLOB API and Gamma API only
- **Impact**: Firecrawl-sourced markets (NBA/CBB) can't get fresh prices during active monitoring

---

## Proposed Changes

### 1. Update `watch-mode-poll` to Include Firecrawl Markets

Modify the market loading query to fetch Firecrawl-sourced markets separately (without volume filter) and combine them:

```typescript
// Load API markets with volume filter
const { data: apiMarkets } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .eq('status', 'active')
  .eq('market_type', 'h2h')
  .gte('volume', minVolume)
  .or('source.is.null,source.eq.api')
  // ... existing filters

// Load Firecrawl markets WITHOUT volume filter
const { data: firecrawlMarkets } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .eq('status', 'active')
  .eq('market_type', 'h2h')
  .eq('source', 'firecrawl')
  .in('extracted_league', ['NBA', 'NCAA', 'NFL'])
  // No volume filter - scraped data lacks volume

// Combine both sets
const polyMarkets = [...(apiMarkets || []), ...(firecrawlMarkets || [])];
```

### 2. Add Firecrawl Fallback to `active-mode-poll`

When a Firecrawl-sourced market is in active monitoring, refresh its price by re-scraping:

```typescript
// In active-mode-poll, if market source is 'firecrawl'
if (event.source === 'firecrawl' && firecrawlApiKey) {
  // Re-scrape the relevant sport page for fresh prices
  const sportCode = getSportCodeFromLeague(event.extracted_league);
  const freshGames = await scrapePolymarketGames(sportCode, firecrawlApiKey);
  
  // Find matching game by team names
  const matchedGame = findMatchingGame(freshGames, event.team_home, event.team_away);
  if (matchedGame) {
    livePolyPrice = matchedGame.team1Price;
  }
}
```

### 3. Create Shared Firecrawl Scraping Module

Extract the scraping logic into a shared utility that can be imported by multiple edge functions:

```text
supabase/functions/_shared/firecrawl-scraper.ts
├── parseGamesFromMarkdown()
├── scrapePolymarketGames()
├── NBA_TEAM_MAP
├── NFL_TEAM_MAP
├── NCAA_TEAM_MAP (new)
```

### 4. Add Firecrawl Price Refresh to Monitor (Optional Enhancement)

If API prices are stale (>10 min since last update), use Firecrawl as backup:

```typescript
// In polymarket-monitor, before edge calculation
if (market.last_price_update < tenMinutesAgo && firecrawlApiKey) {
  // Refresh via Firecrawl scrape as fallback
  const freshPrice = await refreshViaFirecrawl(market);
  if (freshPrice) {
    market.yes_price = freshPrice;
  }
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/watch-mode-poll/index.ts` | Add dual-query for API + Firecrawl markets |
| `supabase/functions/active-mode-poll/index.ts` | Add Firecrawl fallback for price refresh |
| `supabase/functions/_shared/firecrawl-scraper.ts` | Create shared module with scraping helpers |
| `supabase/functions/polymarket-sync-24h/index.ts` | Import from shared module |
| `supabase/functions/polymarket-monitor/index.ts` | (Optional) Add stale price fallback |

---

## Expected Outcome

After implementation:

| Scenario | Current Behavior | New Behavior |
|----------|-----------------|--------------|
| NBA/CBB market in cache | Ignored (volume=0) | Included in watch-mode |
| Firecrawl market goes active | Price can't refresh | Scrapes fresh price |
| API returns stale data | Uses stale price | Falls back to Firecrawl |
| 30-min sync fails | No NBA data until next sync | Monitor can scrape as fallback |

---

## Technical Considerations

**Firecrawl Credit Usage**:
- Current: ~48-72 credits/day (3 scrapes × every 30 min × 24h)
- With fallback in active-mode: +1-5 scrapes/day for active markets
- Estimated total: ~50-80 credits/day

**Shared Module Pattern**:
Deno edge functions support importing from `_shared` folders:
```typescript
import { scrapePolymarketGames } from '../_shared/firecrawl-scraper.ts';
```

