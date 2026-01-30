

# Why Only NHL Signals Are Being Found

## Investigation Summary

I analyzed the database, edge function logs, and code to understand why signals are predominantly appearing for NHL while other leagues show minimal activity.

## Root Cause Analysis

### 1. Most NBA Games on Polymarket Have No Actual Volume

The data reveals a critical difference:

| Sport | Source | Markets | With Volume | Notes |
|-------|--------|---------|-------------|-------|
| NHL | API | 51 | 49 (96%) | Strong volume from Gamma API |
| NHL | Firecrawl | 32 | 0 | Firecrawl can't get volume |
| NBA | Firecrawl | 10 | 1 | Only Pistons vs Warriors has $32k volume |
| NCAA | Firecrawl | 14 | 0 | All zero volume |

**Root Issue**: NBA individual game markets on Polymarket have **zero trading volume** except one game. The platform shows prices but virtually no one is trading them - this is a limitation of Polymarket's NBA coverage, not our system.

### 2. Firecrawl-Scraped Markets Lack Volume/Liquidity Data

Firecrawl scrapes prices from Polymarket's sports pages but **cannot obtain volume or liquidity data**. The scraper parses HTML markdown like "DET47¢ GSW54¢" to get prices, but volume requires API access.

```text
NBA Markets from Firecrawl:
- Detroit Pistons vs Warriors: $32k volume (inherited from somewhere)
- Sacramento Kings vs Celtics: $0 volume  
- Lakers vs Wizards: $0 volume
- All other NBA: $0 volume

NHL Markets from Gamma API:
- Blue Jackets vs Blackhawks: $43k volume
- Kings vs Flyers: $37k volume  
- Avalanche vs Red Wings: $3.5k volume
(Most have real volume)
```

### 3. NBA Games ARE Being Monitored - Just No Edges Found

The logs confirm NBA games are being processed:

```text
[POLY-MONITOR] Loaded 9 NBA games
[POLY-MONITOR] Edge calc for Detroit Pistons vs Golden State Warriors: 
  YES_edge=0.2%, NO_edge=-0.2% -> YES 0.2%
```

The Pistons game found a match but only had a **0.2% edge** - far below the 5% threshold needed for a signal. The system is working correctly, there's just no significant mispricing on NBA markets.

### 4. AI Matching Errors for ~50% of Markets

The logs show critical matching failures:

```text
INVALID MATCH: "New Orleans Pelicans" not found in event "Portland Trail Blazers vs New York Knicks" - DROPPING
INVALID MATCH: "Columbus Blue Jackets" not found in event "St. Louis Blues vs Nashville Predators" - DROPPING
INVALID MATCH: "Kent State Golden Flashes" not found in event "Kentucky Wildcats vs Arkansas Razorbacks" - DROPPING
```

The AI is returning **wrong games** when matching Polymarket events to bookmaker data. Out of 52 monitored markets, only 18 successfully matched (35% success rate).

### 5. NCAA Markets Are Being Scraped But Get Wrong Matches

NCAA markets from Firecrawl show abbreviations like "VTECH", "MST", "HIOST" which the AI can't resolve:

```text
INVALID MATCH: "Virginia Tech Hokies" not in "Duke Blue Devils vs VTECH" - DROPPING
INVALID MATCH: "Michigan St Spartans" not in "Michigan Wolverines vs MST" - DROPPING
```

---

## Why NHL Works Better

1. **Gamma API Coverage**: NHL has 51 active markets with real volume from the Gamma API (vs Firecrawl)
2. **Team Name Format**: NHL uses consistent "Nickname vs Nickname" format (Flyers vs Bruins) that matches our local nickname expansion
3. **Real Trading Activity**: NHL games have actual volume ($500-$44k per market)
4. **Better Odds Spread**: NHL often shows larger edges between Polymarket and bookmakers

---

## Technical Fixes to Improve Multi-Sport Coverage

### Fix 1: Enhance Firecrawl Markets with CLOB API Volume Lookup

**Problem**: Firecrawl markets have no volume because scraping can't get it.

**Solution**: After scraping, query the CLOB API to get actual volume for each scraped market.

```typescript
// In polymarket-sync-24h, after Firecrawl upsert:
for (const { game, sportCode } of firecrawlGames) {
  // Look up real market on CLOB by team names
  const clobUrl = `https://clob.polymarket.com/markets?tag=sports`;
  // Match by team names and update volume/liquidity
}
```

### Fix 2: Improve AI Matching Prompt to Return EXACT Match

**Problem**: AI returns semantically related but wrong games.

**Solution**: Update the AI prompt to require exact team name presence in result:

```typescript
const prompt = `Find the EXACT ${sport} game matching "${eventName}".
CRITICAL: Your response MUST contain both teams from the query.
If no exact match exists, respond with "NO_MATCH".
Format: {"home": "Full Team Name", "away": "Full Team Name"}`;
```

### Fix 3: Add Direct Odds API Lookup as Fallback

**Problem**: AI matching is slow (8s timeout) and often wrong.

**Solution**: Add direct fuzzy matching against Odds API data before AI:

```typescript
// Pre-fetch all NBA games from Odds API
const oddsApiGames = await fetchOddsApi('basketball_nba', 'h2h');

// For each Polymarket market, find best fuzzy match
const match = findBestMatch(polymarketTeams, oddsApiGames, {
  minSimilarity: 0.8,
  requireBothTeams: true  
});
```

### Fix 4: Expand NCAA Team Map

**Problem**: NCAA abbreviations like "VTECH", "MST" aren't in the team map.

**Solution**: Expand the NCAA team map in `sports-config.ts`:

```typescript
cbb: {
  teamMap: {
    // Add common abbreviations
    'vtech': 'Virginia Tech Hokies',
    'mst': 'Michigan State Spartans',  
    'hiost': 'Ohio State Buckeyes', // HIOST typo pattern
    // ... more mappings
  }
}
```

---

## Implementation Priority

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| 1 | Improve AI matching prompt (require exact match) | High - reduces false matches | Low |
| 2 | Expand NCAA team map | Medium - catches more NCAAB | Low |
| 3 | Add CLOB volume lookup for Firecrawl markets | High - enables proper filtering | Medium |
| 4 | Add direct Odds API fuzzy matching | High - faster, more reliable | Medium |

---

## Important Context: Polymarket NBA Coverage Is Limited

The investigation confirms a known constraint from the project documentation:

> "A significant constraint is that Polymarket frequently lacks individual NBA game head-to-head (H2H) matchups, often only offering championship futures or player props."

The cache shows 101 "basketball_nba" markets but nearly all are **championship futures** (e.g., "2026 NBA Champion - Will Memphis Grizzlies"), not individual game H2H markets. Only 10 actual NBA game markets exist, and 9 of those have zero volume.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Improve AI prompt, add validation |
| `supabase/functions/_shared/sports-config.ts` | Expand NCAA team map |
| `supabase/functions/polymarket-sync-24h/index.ts` | Add CLOB volume lookup for Firecrawl |

