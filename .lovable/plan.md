

# Firecrawl-Based NBA H2H Price Scraping

## Summary

**Good news!** Your Firecrawl connector is already connected and working. I've confirmed that scraping `https://polymarket.com/sports/nba/games` returns all NBA H2H games with their moneyline prices in a parseable format.

This gives us a workaround to get NBA (and NCAA) game prices directly from the Polymarket website when the API doesn't expose them.

---

## What I Found

| URL | Data Retrieved |
|-----|---------------|
| `/sports/nba/games` | All NBA H2H games with prices (TOR 48¢, ORL 53¢, etc.) |
| `/sports/cbb/games` | All NCAA CBB games (440 markets!) |
| `/sports/nhl/games` | NHL games (72 markets) |

The scraped markdown contains parseable patterns like:
```text
tor48¢  orl53¢          # Raptors vs Magic
lal76¢  was25¢          # Lakers vs Wizards  
cle63¢  phx38¢          # Cavaliers vs Suns
```

---

## Proposed Implementation

### 1. Create Edge Function: `scrape-polymarket-prices`

A new edge function that:
- Uses Firecrawl to scrape the NBA/CBB games page
- Parses the markdown to extract team names and prices
- Returns structured JSON with game matchups and odds

### 2. Update the `polymarket_h2h_cache` Table

Add or update entries from scraped data, marking them with `source: 'firecrawl'` to distinguish from API data.

### 3. UI Integration Options

**Option A: Scheduled sync (recommended)**
- Run scrape every 15-30 minutes via pg_cron
- Automatically populates NBA games into cache
- No manual work needed

**Option B: On-demand button**
- Add "Refresh NBA Prices" button to Terminal
- User triggers scrape when needed

**Option C: Hybrid**
- Scheduled sync for background updates
- Manual refresh button for real-time price check before betting

---

## Technical Details

### Edge Function Structure

```text
supabase/functions/scrape-polymarket-prices/index.ts

1. Call Firecrawl API to scrape /sports/nba/games
2. Parse markdown using regex patterns:
   - Team codes: /([a-z]{3})(\d+¢)/g → "tor48¢" → team: TOR, price: 0.48
   - Game blocks: Match pairs of teams
3. Upsert to polymarket_h2h_cache with:
   - team_home, team_away
   - yes_price, no_price
   - source: 'firecrawl'
   - last_price_update: now()
```

### Parsing Logic

From the scraped content, each game line contains:
```text
Lakers28-18  Wizards12-34  lal76¢  was25¢
```

Regex extraction:
```typescript
const gamePattern = /([A-Z][a-z]+)\d+-\d+.*?([a-z]{3})(\d+)¢.*?([a-z]{3})(\d+)¢/g;
```

---

## Coverage Impact

| Sport | Current | After Implementation |
|-------|---------|---------------------|
| NBA H2H | 0 | ~63 games |
| NCAA CBB | 0 | ~440 games |
| NHL | 72 | 72 (no change) |
| Tennis | 63 | 63 (no change) |

---

## Considerations

**Pros:**
- Gets all NBA/NCAA data that API doesn't provide
- Firecrawl handles JavaScript rendering
- Already connected in your project

**Cons:**
- Firecrawl has usage limits (check your plan)
- Web scraping is less reliable than API
- Data format could change if Polymarket updates their UI

**Recommendation:** Start with Option C (hybrid) - scheduled sync every 30 minutes plus a manual refresh button for when you need live prices before placing a bet.

---

## Implementation Steps

1. Create `scrape-polymarket-prices` edge function
2. Add parsing logic for NBA game data
3. Test with `/sports/nba/games` URL
4. Add to pg_cron for scheduled runs (every 30 min)
5. Add "Refresh NBA" button to Terminal UI
6. Extend to `/sports/cbb/games` for NCAA coverage

