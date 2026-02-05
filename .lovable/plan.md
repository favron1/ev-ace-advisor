
# Batch Import: Morning Market Data ("Last Resort" Fixer)

## Overview

Build a batch import feature that allows pasting structured morning market data (sport, time, teams, prices) to populate missing markets or update prices that the automated pipeline missed.

This serves as a **last resort** safety net - when Firecrawl, Gamma API, and CLOB all fail to discover or price a market correctly, you can manually import verified data from the Polymarket UI.

## User Flow

```text
+-------------------+       +-------------------+       +-------------------+
|  Copy text from   |  -->  |  Paste into       |  -->  |  System parses,   |
|  Polymarket UI    |       |  batch import     |       |  matches to       |
|  (NHL, NBA, etc)  |       |  textarea         |       |  bookmakers, and  |
+-------------------+       +-------------------+       |  updates cache    |
                                                        +-------------------+
```

## Implementation

### 1. New Page: `/batch-import`

Create `src/pages/BatchImport.tsx` - a simple page with:
- Large textarea for pasting raw text
- "Parse & Preview" button to show what will be imported
- Preview table showing: Sport, Time, Home Team, Away Team, Home Price, Away Price, Match Status
- "Import All" button to process confirmed entries

### 2. Parser Logic

Parse the format you provided:

```text
[SPORT EMOJI] [LEAGUE] - Head-to-Head Markets

[TIME]

[AWAY TEAM] vs [HOME TEAM]

[AWAY TEAM]: [PRICE]c

[HOME TEAM]: [PRICE]c
```

Detection patterns:
- Sport headers: `/^[^a-z]*(?:NHL|NBA|NFL|NCAA|EPL|UCL)/i`
- Time: `/^\d{1,2}:\d{2}\s*(?:AM|PM)$/i`
- Teams line: `/^(.+?)\s+vs\s+(.+)$/i`
- Price line: `/^(.+?):\s*(\d+)(?:c|¢)?$/i`

### 3. New Edge Function: `batch-market-import`

`supabase/functions/batch-market-import/index.ts`

Accepts an array of parsed markets:
```typescript
interface BatchMarket {
  sport: 'NHL' | 'NBA' | 'NFL' | 'NCAA' | 'EPL';
  gameTime: string;         // "10:30 AM"
  homeTeam: string;         // Full name from paste
  awayTeam: string;         // Full name from paste
  homePrice: number;        // 0.67 (converted from 67c)
  awayPrice: number;        // 0.34 (converted from 34c)
}
```

For each entry:
1. **Resolve team names** using existing `canonicalize.ts` and `sports-config.ts` team maps
2. **Check if market exists** in `polymarket_h2h_cache` (by normalized team names + date)
3. **Update or insert**:
   - If exists: Update `yes_price`, `no_price`, `last_price_update`, set `source = 'batch_import'`
   - If new: Insert with synthetic `condition_id`, `tradeable = true`, `source = 'batch_import'`
4. **Attempt bookmaker match** using canonical matching (build index from fresh odds)
5. **Return summary**: Markets updated, created, matched to bookies, failed

### 4. Integration with Existing Pipeline

Markets created/updated via batch import:
- Are picked up by `watch-mode-poll` and `active-mode-poll` automatically
- Have `source = 'batch_import'` for tracking
- Skip the CLOB token validation (assumed tradeable since you verified on UI)
- Will generate signals when edges are detected

### 5. UI Preview Table

Before importing, show a preview:

| Status | Sport | Time | Match | Home | Away | Bookie Match |
|--------|-------|------|-------|------|------|--------------|
| NEW | NHL | 10:30 AM | Panthers @ Lightning | 0.37 | 0.65 | Pending |
| UPDATE | NBA | 11:00 AM | Pacers @ Bucks | 0.51 | 0.50 | Pending |

Color coding:
- Green = new market
- Yellow = updating existing
- Red = parse error (team names not resolved)

## File Changes Summary

### New Files
1. `src/pages/BatchImport.tsx` - Batch import UI page
2. `src/lib/batch-parser.ts` - Text parsing utility
3. `supabase/functions/batch-market-import/index.ts` - Edge function

### Modified Files
4. `src/App.tsx` - Add route `/batch-import`
5. `src/pages/Terminal.tsx` or navigation - Add link to batch import

## Technical Details

### Team Name Resolution Chain

The batch import reuses the existing canonicalization system:

1. Parse "Miami Heat" from paste
2. `resolveTeamName("Miami Heat", "nba", teamMap)` returns "Miami Heat" (exact match)
3. Generate `teamId`: "miami_heat"
4. Generate `teamSetKey`: "boston_celtics|miami_heat" (alphabetical)
5. Match to bookmaker via `lookupKey`: "NBA|boston_celtics|miami_heat"

This ensures batch-imported markets can be matched to bookmaker odds using the same O(1) indexed lookup as automated markets.

### Handling 0c Prices

Your sample included:
```
NY Islanders: 0c
NJ Devils: 0c
```

These indicate markets that exist on Polymarket but have no liquidity yet. The parser will:
- Detect 0c as `0.00` price
- Mark these as `tradeable = false` with `untradeable_reason = 'NO_LIQUIDITY'`
- Still insert them so they're monitored for when liquidity arrives

### Price Normalization

Input: `67c` or `67¢` or `0.67`
Output: `0.67` (decimal)

The parser handles all formats and normalizes to decimal.
