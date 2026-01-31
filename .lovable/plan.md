

# Implementation Plan: Fix Market Type Mismatch Bug

## Problem Identified

The system is generating false signals (like the 33.9% edge for Sharks vs. Flames) because it's **mixing market types**:

| What's Happening | Expected |
|------------------|----------|
| Loading SPREAD market (Sharks -1.5, 17¢) | Load H2H market (Sharks, 50¢) |
| Comparing to H2H bookmaker odds (51% fair) | Compare to H2H bookmaker odds |
| Calculating edge: 51% - 17% = 34% | Calculating edge: 51% - 50% = 1% |

**Result**: False 34% edge shown to user when actual edge is ~1%

## Root Cause

In `polymarket-monitor/index.ts` line 1186:
```typescript
// CRITICAL FIX: Include ALL market types (H2H, Totals, Spreads), not just those with extracted_league
```

This comment is misleading - loading all market types is correct for discovery, but the processing logic MUST filter by market type since we only fetch H2H bookmaker odds.

## Technical Fix

### File: `supabase/functions/polymarket-monitor/index.ts`

#### Change 1: Add H2H filter to market loading queries (lines 1190-1201)

Add `.eq('market_type', 'h2h')` to both API and Firecrawl market queries:

```typescript
// First, load API-sourced H2H markets only
const { data: apiMarkets, error: apiLoadError } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .in('monitoring_status', ['watching', 'triggered'])
  .eq('status', 'active')
  .eq('market_type', 'h2h')  // NEW: Only H2H markets
  .in('extracted_league', supportedSports)
  .or('source.is.null,source.eq.api')
  .gte('volume', 5000)
  .gte('event_date', now.toISOString())
  .lte('event_date', in24Hours.toISOString())
  .order('event_date', { ascending: true })
  .limit(150);

// Second, load Firecrawl-sourced H2H markets only
const { data: firecrawlMarkets, error: fcLoadError } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .in('monitoring_status', ['watching', 'triggered'])
  .eq('status', 'active')
  .eq('market_type', 'h2h')  // NEW: Only H2H markets
  .eq('source', 'firecrawl')
  .in('extracted_league', supportedSports)
  .gte('event_date', now.toISOString())
  .lte('event_date', in24Hours.toISOString())
  .order('event_date', { ascending: true })
  .limit(100);
```

#### Change 2: Add market type validation in processing loop (around line 1465)

Add a safety check before edge calculation:

```typescript
const cache = cacheMap.get(event.polymarket_condition_id);
const sport = cache?.extracted_league || 'Unknown';
const marketType = cache?.market_type || 'h2h';
const tokenIdYes = cache?.token_id_yes;

// NEW: Skip non-H2H markets (should be filtered at query level, but safety check)
if (marketType !== 'h2h') {
  console.log(`[POLY-MONITOR] Skipping non-H2H market: ${event.event_name} (type=${marketType})`);
  continue;
}
```

#### Change 3: Update the comment at line 1186

Change the misleading comment to reflect reality:

```typescript
// Load only H2H markets since we're comparing against H2H bookmaker odds
// Future: Add separate processing for spreads/totals with corresponding bookmaker data
```

#### Change 4: Expire any invalid signals currently in the database

After deploying, run a cleanup to expire signals created from non-H2H markets:

```sql
-- Run via Cloud View > Run SQL (Test environment)
UPDATE signal_opportunities
SET status = 'expired', 
    signal_factors = signal_factors || '{"expired_reason": "market_type_mismatch"}'::jsonb
WHERE id IN (
  SELECT so.id 
  FROM signal_opportunities so
  LEFT JOIN polymarket_h2h_cache c ON so.polymarket_condition_id = c.condition_id
  WHERE c.market_type != 'h2h' 
    AND so.status = 'active'
);
```

## Summary of Changes

| File | Change | Impact |
|------|--------|--------|
| `polymarket-monitor/index.ts` | Add `.eq('market_type', 'h2h')` to both queries | Only loads H2H markets |
| `polymarket-monitor/index.ts` | Add safety check before processing | Skips any non-H2H that slip through |
| `polymarket-monitor/index.ts` | Update comment | Clarifies design intent |
| Database | Expire invalid signals | Cleans up false signals |

## Expected Outcome

- **Before**: False 33.9% edge for Sharks vs Flames (spread market compared to H2H odds)
- **After**: Correct ~1-3% edge (H2H market compared to H2H odds), or no signal if edge < threshold

## Future Enhancement (Not in Scope)

To properly support spreads and totals markets, we would need to:
1. Fetch bookmaker spreads data from Odds API (`markets=spreads`)
2. Fetch bookmaker totals data from Odds API (`markets=totals`)
3. Add separate edge calculation logic for each market type
4. This is a larger effort and should be a separate implementation

