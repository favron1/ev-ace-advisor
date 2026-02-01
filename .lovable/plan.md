
# Fix Bookmaker Matching: Add Soccer + Fix Event Dates

## Problem Summary

The current bookmaker match rate is critically low:
- **Soccer leagues (79 H2H markets): 0% matched** - Not fetched from Odds API at all
- **NHL/NBA (71 H2H markets): ~20% matched** - Event dates are broken (using scrape timestamp instead of actual game time)

---

## Implementation Details

### Part 1: Add Soccer Leagues to Odds API Ingestion

**File: `supabase/functions/ingest-odds/index.ts`**

Add soccer league sport keys to the `h2hSports` array (line 198):

```typescript
// BEFORE: Only 4 US sports
const h2hSports = [
  'basketball_nba',
  'basketball_ncaab',
  'americanfootball_nfl',
  'icehockey_nhl',
];

// AFTER: Add 5 soccer leagues
const h2hSports = [
  'basketball_nba',
  'basketball_ncaab',
  'americanfootball_nfl',
  'icehockey_nhl',
  // Soccer leagues
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_uefa_champs_league',
];
```

This uses the Odds API sport keys already defined in `sports-config.ts`.

---

### Part 2: Add Soccer to Sync Function's Odds API Pre-Fetch

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Update the `sportsToFetch` array (line 229) to include soccer leagues:

```typescript
// BEFORE: Only 4 US sports
const sportsToFetch = ['basketball_nba', 'basketball_ncaab', 'icehockey_nhl', 'americanfootball_nfl'];

// AFTER: Add 5 soccer leagues from shared config
const sportsToFetch = [
  'basketball_nba', 
  'basketball_ncaab', 
  'icehockey_nhl', 
  'americanfootball_nfl',
  // Soccer leagues (from SPORTS_CONFIG)
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_uefa_champs_league',
];
```

---

### Part 3: Fix Event Date Fallback Logic

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

The fallback date logic (line 551) currently defaults to `now + 12h` when no Odds API match is found. This is problematic because:

1. Scraped games may not match to Odds API due to team name normalization issues
2. The fallback timestamp becomes the "event_date", which doesn't match bookmaker times
3. This causes the 24h window filter to reject valid games

**Fix:** When using fallback date, also improve team name matching to increase hit rate:

```typescript
// Enhanced team name matching in findOddsApiCommenceTime:
// Add common nickname mappings for better matching

// Example: "Man City" should match "Manchester City"
const nicknameMap: Record<string, string[]> = {
  'manchester city': ['man city', 'city'],
  'manchester united': ['man united', 'man utd', 'united'],
  'tottenham': ['spurs', 'tottenham hotspur'],
  'inter milan': ['inter', 'internazionale'],
  'ac milan': ['milan'],
  // ... add more as needed
};
```

Additionally, log warnings when fallback is used so we can track unmatched games:

```typescript
if (!actualCommenceTime) {
  console.log(`[FIRECRAWL] NO_BOOKIE_MATCH: ${game.team1Name} vs ${game.team2Name} - using fallback date`);
  // Track for debugging
  unmatchedGames.push({ team1: game.team1Name, team2: game.team2Name });
}
```

---

## Expected Outcomes

| Metric | Current | After Fix |
|--------|---------|-----------|
| Soccer bookmaker matches | 0% | 80%+ |
| NHL/NBA bookmaker matches | ~20% | 60%+ |
| Total H2H with `bookmaker_commence_time` | 16/211 (8%) | 150+/211 (70%+) |
| Signals with correct `expires_at` | ~8% | 70%+ |

---

## Verification Steps

1. Deploy updated `ingest-odds` function
2. Run `ingest-odds` to populate `bookmaker_signals` with soccer data
3. Deploy updated `polymarket-sync-24h` function
4. Run `polymarket-sync-24h` to populate `bookmaker_commence_time`
5. Query database to verify match rates improved
6. Run `polymarket-monitor` to verify signals use authoritative times

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/ingest-odds/index.ts` | Add 5 soccer leagues to `h2hSports` array |
| `supabase/functions/polymarket-sync-24h/index.ts` | Add 5 soccer leagues to `sportsToFetch` array |
| `supabase/functions/polymarket-sync-24h/index.ts` | Add nickname mapping for better team matching |
