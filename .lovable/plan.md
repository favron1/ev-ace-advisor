
# Fix: All Market Types Detection (Not Just H2H)

## Problem Summary

The sync function correctly detects and stores ALL market types (H2H, Totals, Spreads, Player Props):

| Market Type | Count in DB | Issue |
|-------------|-------------|-------|
| H2H | 219 | Working |
| Futures | 1,356 | Correctly skipped (long-dated) |
| Totals | 35 | `extracted_league = null` → SKIPPED |
| Spreads | 1 | `extracted_league = null` → SKIPPED |
| Player Props | 12 | `extracted_league = null` → SKIPPED |
| Props | 75 | `extracted_league = null` → SKIPPED |

**Root Cause**: The `polymarket-monitor` filters markets by `extracted_league IN ('NBA', 'NHL', ...)`. Since Totals/Spreads/Props often have their league detection fail (returning `null`), they're silently excluded from monitoring.

---

## Technical Fix

### Step 1: Improve League Extraction in polymarket-sync-24h

Currently, league detection runs on the market question, but for Totals/Spreads/Props, the question format is different (e.g., "Will Hawks vs. Celtics go OVER 220.5?"). The parent event title often has better context.

```typescript
// CURRENT (line 287-288):
const detectedSport = detectSport(title, question) || 
                      detectSport(title, firstMarketQuestion) || 'Sports';

// FIX: Also try detecting from the specific market.question
const detectedSport = detectSport(title, question) || 
                      detectSport(title, market.question) ||
                      detectSport(title, firstMarketQuestion) || 'Sports';
```

### Step 2: Inherit League from Parent Event

For multi-market events (e.g., one NBA game has H2H + Totals + Spreads), all child markets should inherit the detected league from the parent event title:

```typescript
// Calculate sport ONCE at the event level
const eventSport = detectSport(event.title || '', event.question || '');

// For EACH market in the event, use the event-level sport
for (const market of markets) {
  const marketType = detectMarketType(market.question);
  
  // Sport comes from EVENT, not individual market
  qualifying.push({
    event,
    market,
    endDate,
    detectedSport: eventSport || 'Sports',  // Inherited from parent
    marketType,
  });
}
```

### Step 3: Update Monitor to Handle All Market Types

The monitor already supports spreads/totals in the `SPORT_ENDPOINTS` mapping (line 15-28):

```typescript
const SPORT_ENDPOINTS: Record<string, { sport: string; markets: string }> = {
  'NBA': { sport: 'basketball_nba', markets: 'h2h,spreads,totals' },  // ✅ Already there
  'NFL': { sport: 'americanfootball_nfl', markets: 'h2h,spreads,totals' },
  // ...
};
```

The matching logic `findBookmakerMatch()` already handles market types (lines 458-500) - it just needs the correct `extracted_league` to work.

### Step 4: Backfill Existing Markets

Run a one-time update to fix markets with null extracted_league by re-detecting from event_title:

```sql
-- Example: Fix NHL totals that have team names in question
UPDATE polymarket_h2h_cache 
SET extracted_league = 'NHL'
WHERE extracted_league IS NULL 
  AND market_type IN ('total', 'spread')
  AND (question ILIKE '%bruins%' OR question ILIKE '%rangers%' OR ...);
```

---

## Files to Modify

1. **supabase/functions/polymarket-sync-24h/index.ts**
   - Move sport detection to event level (before market loop)
   - Pass inherited sport to all child markets
   - Ensure extracted_league is never null for markets with identifiable teams

2. **supabase/functions/polymarket-monitor/index.ts**
   - Remove or loosen the `extracted_league IN (...)` filter
   - Add fallback: try to detect sport from event_title if extracted_league is null

---

## Expected Outcome

- All 35 Totals, 1 Spread, and 87 Props/Player Props become eligible for monitoring
- Edge detection works across H2H, Totals, Spreads, and Player Props
- Signal feed shows opportunities beyond just H2H markets
- Same Polymarket-first architecture - just with broader market coverage

---

## Technical Notes

### Market Type to Bookmaker API Mapping
| Polymarket Type | Bookmaker API Key |
|-----------------|-------------------|
| h2h | `h2h` (moneyline) |
| total | `totals` (over/under) |
| spread | `spreads` (handicap) |
| player_prop | Not supported by Odds API v4 free tier |

### Edge Calculation Differences
- **Totals**: Compare Polymarket YES price vs. bookmaker OVER/UNDER probability
- **Spreads**: Compare Polymarket YES price vs. bookmaker spread-adjusted probability
- **H2H**: Standard fair probability comparison

