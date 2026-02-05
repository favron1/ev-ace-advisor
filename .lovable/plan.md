

# Fix Bookmaker Data Coverage: Multi-Source Strategy

## Problem Identified

Your Polymarket games for Feb 6th are **100% valid NBA matchups**, but The Odds API is NOT returning odds for them:

| Your Polymarket Games (Feb 6) | What The Odds API Has (Feb 6) |
|-------------------------------|-------------------------------|
| Knicks vs Pistons ❌ | Pistons vs Wizards |
| Heat vs Celtics ❌ | Magic vs Nets |
| Pacers vs Bucks ❌ | Hawks vs Jazz |
| Pelicans vs Timberwolves ❌ | Raptors vs Bulls |
| Grizzlies vs Trail Blazers ❌ | Rockets vs Hornets |
| Clippers vs Kings ❌ | Mavericks vs Spurs |

**Root Cause**: The Odds API has incomplete NBA game coverage. They're only returning ~6 of the 12+ NBA games scheduled for that day.

## Solution: Multi-Source Bookmaker Data

We'll implement redundant data sources to ensure full game coverage:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     BOOKMAKER DATA SOURCES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PRIMARY: The Odds API                                                  │
│  ├── Coverage: ~60-70% of NBA games                                     │
│  ├── Updates: Real-time                                                 │
│  └── Books: Pinnacle, Betfair, DraftKings, etc.                        │
│                                                                         │
│  BACKUP: ESPN/Covers.com Scrape (NEW)                                   │
│  ├── Coverage: 100% of NBA schedule                                     │
│  ├── Updates: Periodic (every 30 min)                                   │
│  └── Data: Consensus lines, opening lines                               │
│                                                                         │
│  FALLBACK: BallDontLie API (FREE)                                       │
│  ├── Coverage: 100% NBA schedule                                        │
│  ├── Updates: Daily                                                     │
│  └── Data: Game times, matchups (no odds, but confirms games exist)    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Add ESPN Schedule Verification

Create a new edge function `verify-nba-schedule` that:
1. Fetches the full NBA schedule from a free source (ESPN API or BallDontLie)
2. Compares against The Odds API results
3. Logs any **missing games** for debugging
4. Stores verified game schedule to cross-reference during matching

```
Files to Create:
- supabase/functions/verify-nba-schedule/index.ts
```

### Phase 2: Add Covers.com Scraping (Full Odds Coverage)

Create `scrape-covers-odds` edge function that uses Firecrawl to scrape:
- Covers.com/sports/nba/matchups (has all games + consensus odds)
- Alternative: Action Network or Oddschecker

```
Files to Create:
- supabase/functions/scrape-covers-odds/index.ts
```

### Phase 3: Merge Multiple Sources in Ingest Pipeline

Update `ingest-odds` to:
1. First try The Odds API (primary, most accurate)
2. For any games NOT found, fallback to scraped data
3. Mark source in bookmaker_signals: `source = 'odds_api' | 'covers_scrape'`

```
Files to Modify:
- supabase/functions/ingest-odds/index.ts
```

### Phase 4: Add Missing Game Detection

In `watch-mode-poll`, after attempting to match:
1. Log any Polymarket games that have NO bookmaker match
2. Flag these in a new table `unmatched_games_queue`
3. Trigger backup scraping for these specific games

```
Files to Create:
- supabase/migrations/add_unmatched_games_table.sql

Files to Modify:
- supabase/functions/watch-mode-poll/index.ts
```

## Quick Win Option

If you want faster results without building the full multi-source system, we can:

**Option A: Increase The Odds API Horizon**
- Current: 48 hours
- Sometimes games appear closer to start time
- May not help if they never add certain games

**Option B: Add BallDontLie API for Schedule**
- Free, no API key required
- Confirms which games exist
- We can then flag when Odds API is missing coverage

**Option C: Use Covers.com Scraping (Firecrawl)**
- You already have Firecrawl configured
- Covers.com shows ALL NBA games with odds
- Fastest path to 100% coverage

## Recommended Approach

I recommend **Option C (Covers.com Scraping)** as the immediate fix because:
1. You already have Firecrawl working for Polymarket
2. Covers.com has comprehensive odds coverage
3. We can implement it in one edge function
4. Falls back gracefully when The Odds API has data

## Technical Details

### Covers.com Scraping Strategy

```typescript
// Target URL: https://www.covers.com/sport/basketball/nba/matchups

// Expected data structure:
interface CoversGame {
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  spread: { home: number; away: number };
  moneyline: { home: number; away: number };
  total: { over: number; under: number };
  consensus: { homePercent: number; awayPercent: number };
}
```

### Integration with Existing System

The scraped data would be converted to `bookmaker_signals` format:

```typescript
// Convert Covers moneyline to implied probability
const impliedProb = moneyline > 0 
  ? 100 / (moneyline + 100) 
  : Math.abs(moneyline) / (Math.abs(moneyline) + 100);

// Insert into bookmaker_signals with source marker
await supabase.from('bookmaker_signals').insert({
  event_name: `${homeTeam} vs ${awayTeam}`,
  market_type: 'h2h',
  outcome: homeTeam,
  bookmaker: 'covers_consensus',
  odds: americanToDecimal(moneyline),
  implied_probability: impliedProb,
  is_sharp_book: false, // Consensus, not individual sharp book
  commence_time: gameTime,
});
```

### Database Changes

```sql
-- Add source column to track data origin
ALTER TABLE bookmaker_signals 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'odds_api';

-- Add index for faster source filtering
CREATE INDEX IF NOT EXISTS idx_bookmaker_signals_source 
ON bookmaker_signals(source);
```

## Summary

| Phase | Effort | Impact | Timeline |
|-------|--------|--------|----------|
| 1. ESPN Schedule Verify | Low | Medium | 1 hour |
| 2. Covers.com Scraping | Medium | High | 2-3 hours |
| 3. Merge Sources | Medium | High | 1-2 hours |
| 4. Missing Game Detection | Low | Medium | 1 hour |

**Total estimated implementation time: 5-7 hours**

The Covers.com scraping alone (Phase 2) would immediately solve your coverage gap and can be implemented first as a standalone fix.

