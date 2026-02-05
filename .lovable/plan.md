

# Batch Import: Pipeline Integration & Matching Strategy

## Current Status

The batch import feature is **already implemented** and working:
- **Frontend**: `/batch-import` page with JSON parsing and preview
- **Backend**: `batch-market-import` edge function that inserts into `polymarket_h2h_cache`
- **Matching**: Uses the canonical matching system (`canonicalize.ts` + `sports-config.ts`)

## How It Connects to the Pipeline

```text
                                              ┌─────────────────────────────┐
   BATCH IMPORT                               │   polymarket_h2h_cache      │
   ─────────────                              │   (central market cache)    │
   Your JSON paste ─────────────────────────▶ │                             │
                                              │   ✓ event_title             │
                                              │   ✓ yes_price / no_price    │
                                              │   ✓ team_home_normalized    │
                                              │   ✓ team_away_normalized    │
                                              │   ✓ source = 'batch_import' │
                                              └───────────────┬─────────────┘
                                                              │
                    ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
                    │                                         │                                         │
                    ▼                                         ▼                                         ▼
        ┌───────────────────┐                   ┌───────────────────┐                   ┌───────────────────┐
        │  watch-mode-poll  │                   │  polymarket-monitor│                  │  active-mode-poll │
        │  (every 5 min)    │                   │  (on-demand)       │                  │  (every 60 sec)   │
        └─────────┬─────────┘                   └─────────┬─────────┘                   └─────────┬─────────┘
                  │                                       │                                       │
                  │  1. Query polymarket_h2h_cache        │                                       │
                  │  2. Query bookmaker_signals           │                                       │
                  │  3. Match by team_set_key             │                                       │
                  │  4. Calculate edge                    │                                       │
                  │  5. Store in event_watch_state        │                                       │
                  │  6. Escalate if edge >= 2%            │                                       │
                  ▼                                       ▼                                       ▼
        ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
        │                               event_watch_state                                                │
        │                        (edges, probabilities, signal state)                                    │
        └───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Matching Mechanism

### Team Name Resolution Chain

When you paste `"Detroit Pistons"`:

1. **Resolve to canonical name**: `resolveTeamName("Detroit Pistons", "nba", teamMap)` 
   - Checks exact match in `SPORTS_CONFIG.nba.teamMap` values
   - Returns: `"Detroit Pistons"` (exact match)

2. **Generate team ID**: `teamId("Detroit Pistons")`
   - Slugify: `"detroit_pistons"`

3. **Generate team set key**: `makeTeamSetKey("detroit_pistons", "new_york_knicks")`
   - Alphabetical sort: `"detroit_pistons|new_york_knicks"`

4. **Store normalized**: Both `team_home_normalized` and `team_away_normalized` stored in cache

### Bookmaker Matching (O(1) Lookup)

The `watch-mode-poll` function:

1. **Loads bookmaker_signals** (from The Odds API via `ingest-odds`)
2. **Indexes by canonical key**: `NBA|detroit_pistons|new_york_knicks`
3. **Looks up your batch-imported market** using the same canonical key
4. **If match found**: Calculates edge = `book_fair_prob - polymarket_price`

### What Happens After Import

| Step | Timing | Action |
|------|--------|--------|
| 1 | Immediate | Market inserted into `polymarket_h2h_cache` with normalized teams |
| 2 | Next 5 min | `watch-mode-poll` picks up the market, attempts bookie match |
| 3 | If match found | Edge calculated, stored in `event_watch_state` |
| 4 | If edge >= 2% | Escalated to `active` state, appears in Signal Feed |
| 5 | Every 60 sec | `active-mode-poll` refreshes prices, recalculates edge |
| 6 | If tradeable | Signal shown with BET/STRONG_BET recommendation |

## Current Limitations

There are two gaps in the current implementation:

### 1. Missing Token IDs (Token Gate)

Markets imported via batch import do **NOT** have `token_id_yes` and `token_id_no` populated. This means:
- The market is marked as `tradeable = true` based on price (non-zero)
- But the **Token Gate** in `active-mode-poll` will fail to refresh CLOB prices
- The signal may be marked `untradeable_reason = 'unverified_polymarket_price'`

**Solution needed**: Either:
- A) Skip the token gate for `source = 'batch_import'` markets (trust your manual prices)
- B) Add a token repair step that searches CLOB API by team names after batch import
- C) Accept that batch-imported markets won't have real-time CLOB refresh (use your pasted prices as-is)

### 2. Synthetic Condition IDs

Batch imports use synthetic condition IDs: `batch_nba_detroit_pistons|new_york_knicks_2026-02-05`

These don't map to real Polymarket markets. When a real sync happens later, we might create duplicates.

**Solution needed**: Before creating, search for existing market by `team_home_normalized + team_away_normalized + event_date` (already implemented in the edge function).

## Recommended Next Steps

1. **Test the full flow**: Import some markets, wait 5 minutes, check if they appear in Pipeline with bookie matches

2. **Add token repair queue**: After batch import, trigger `tokenize-market` function to resolve real token IDs via CLOB Search API

3. **Add link in Terminal header**: Quick access to `/batch-import` when you need the manual fix

4. **Show import source in Pipeline**: Badge "BATCH" on cards that came from batch import vs automated discovery

## Technical Details

### Edge Function: `batch-market-import`

```
POST /functions/v1/batch-market-import
Body: { markets: [...] }

For each market:
├─ getSportCodeFromLeague(sport) → 'nba'
├─ resolveTeamName(homeTeam, 'nba', teamMap) → canonical name
├─ teamId(canonical) → normalized slug
├─ makeTeamSetKey(homeId, awayId) → order-independent key
├─ Check existing by normalized teams + date
├─ INSERT or UPDATE polymarket_h2h_cache
└─ Build bookie index → check for immediate matches
```

### Files Involved

| File | Purpose |
|------|---------|
| `supabase/functions/batch-market-import/index.ts` | Edge function handling import |
| `supabase/functions/_shared/canonicalize.ts` | Team name resolution utilities |
| `supabase/functions/_shared/sports-config.ts` | Team maps for NBA, NHL, NFL, etc. |
| `supabase/functions/watch-mode-poll/index.ts` | Picks up markets, matches to bookies |
| `src/pages/BatchImport.tsx` | Frontend UI |
| `src/lib/batch-parser.ts` | JSON/text parsing logic |

