

# Polymarket-First Arbitrage Detection Engine

## Executive Summary

This plan completely inverts the current system architecture. Instead of scanning bookmakers first and searching for Polymarket matches, the system will treat **Polymarket as the single source of truth** for all tradeable opportunities. The workflow becomes:

1. **Start with Polymarket**: Query all active sports markets from cache
2. **Fetch matching bookmaker odds**: For each Polymarket market, find corresponding bookmaker probability
3. **Calculate edge**: Compare Polymarket price vs bookmaker fair probability
4. **Monitor winners**: Track markets with edge for persistence confirmation
5. **Execute on Polymarket**: Always execute on Polymarket (the execution venue)

---

## Current State Analysis

### What Polymarket Actually Has (from cache)

| Market Type | Sport | Count | Volume |
|-------------|-------|-------|--------|
| Futures | NHL | 704 | $9.2M |
| Futures | NBA | 358 | $222M |
| Futures | NFL | 124 | $5.2M |
| Futures | Soccer | 107 | $408M |
| H2H | Unknown | 74 | $1.4M |
| Futures | Unknown | 72 | $91M |
| Totals | NBA | 33 | $4.1M |
| Props | NFL | 36 | $26M |

**Key Insight**: Polymarket's sports coverage is overwhelmingly **Futures/Championship** markets, not individual game H2H. The system must adapt to match against bookmaker outrights/futures endpoints.

### Current Architecture Problem

The existing code in `watch-mode-poll` and `detect-signals` operates bookmaker-first:
1. Fetches bookmaker H2H odds for individual games
2. Tries to match against Polymarket cache
3. Fails because Polymarket doesn't have those H2H games

This is fundamentally wrong. We need to flip the entire flow.

---

## Technical Implementation

### Phase 1: Database Schema Updates

Add columns to track Polymarket as source of truth and enable direct price refresh:

```sql
-- Add Polymarket tracking columns to event_watch_state
ALTER TABLE public.event_watch_state 
ADD COLUMN IF NOT EXISTS polymarket_condition_id text,
ADD COLUMN IF NOT EXISTS polymarket_question text,
ADD COLUMN IF NOT EXISTS polymarket_yes_price numeric,
ADD COLUMN IF NOT EXISTS polymarket_volume numeric,
ADD COLUMN IF NOT EXISTS bookmaker_market_key text,
ADD COLUMN IF NOT EXISTS bookmaker_source text,
ADD COLUMN IF NOT EXISTS last_poly_refresh timestamp with time zone;

-- Performance index for Polymarket cache queries
CREATE INDEX IF NOT EXISTS idx_poly_cache_type_sport_vol 
ON public.polymarket_h2h_cache(market_type, sport_category, volume DESC)
WHERE status = 'active';

-- Index for condition_id lookups (direct refresh)
CREATE INDEX IF NOT EXISTS idx_poly_cache_condition 
ON public.polymarket_h2h_cache(condition_id);
```

### Phase 2: New Edge Function - `polymarket-first-scan`

Create a new edge function that implements the correct flow:

**File**: `supabase/functions/polymarket-first-scan/index.ts`

```text
FLOW:
1. Query all active Polymarket sports markets from cache
   - Group by market_type (futures, h2h, totals, props)
   - Group by sport_category
   
2. For each group, fetch matching bookmaker odds:
   - Futures → The Odds API outrights endpoint
   - H2H → The Odds API h2h endpoint  
   - Totals → The Odds API totals endpoint
   - Props → The Odds API player_props endpoint
   
3. For each Polymarket market:
   - Find matching bookmaker outcome
   - Calculate bookmaker fair probability (vig-removed)
   - Calculate edge = (bookmaker_fair_prob - poly_yes_price) * 100
   
4. Filter to markets with edge >= MIN_EDGE (2%)

5. Create/update event_watch_state entries for edge markets
   - Store polymarket_condition_id for direct refresh
   - Store bookmaker_market_key for future comparison
   
6. Return summary of edges found
```

**Bookmaker Endpoints Mapping**:

| Polymarket Type | Bookmaker Endpoint | Example |
|-----------------|-------------------|---------|
| NBA Futures | `basketball_nba_championship_winner` | NBA Championship |
| NFL Futures | `americanfootball_nfl_super_bowl_winner` | Super Bowl |
| NHL Futures | `icehockey_nhl_championship_winner` | Stanley Cup |
| EPL Futures | `soccer_epl_championship_winner` | Premier League |
| NBA Totals | `basketball_nba` with `markets=totals` | Season win totals |

### Phase 3: Update `active-mode-poll` for Direct Refresh

Modify `active-mode-poll` to use `condition_id` for guaranteed-accurate Polymarket price refresh:

**Key Changes**:

1. For each active event, fetch fresh Polymarket price using `condition_id`:
```typescript
async function refreshPolymarketPrice(conditionId: string): Promise<number | null> {
  const url = `https://gamma-api.polymarket.com/markets/${conditionId}`;
  const response = await fetch(url);
  const market = await response.json();
  
  if (market.outcomePrices) {
    const prices = JSON.parse(market.outcomePrices);
    return parseFloat(prices[0]); // YES price
  }
  return null;
}
```

2. Fetch fresh bookmaker price for the same market
3. Calculate live edge with both fresh prices
4. Confirm edge persistence before alerting

### Phase 4: Modify `watch-mode-poll` (Polymarket-First)

Rewrite to start with Polymarket cache instead of bookmaker endpoints:

**New Flow**:

```typescript
// 1. Get Polymarket markets from cache, grouped by type
const { data: polyMarkets } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .eq('status', 'active')
  .order('volume', { ascending: false });

// 2. Group by sport/type for efficient API calls
const nbaFutures = polyMarkets.filter(m => 
  m.sport_category === 'basketball_nba' && m.market_type === 'futures'
);
const nbaTotals = polyMarkets.filter(m =>
  m.sport_category === 'basketball_nba' && m.market_type === 'total'
);
// ... etc for each category

// 3. Fetch ONE bookmaker outright call per category
const nbaChampionshipOdds = await fetchBookmakerOutrights('basketball_nba_championship_winner');

// 4. Match and calculate edge for each Polymarket market
for (const polyMarket of nbaFutures) {
  const teamName = polyMarket.team_home_normalized;
  const bookmakerMatch = findBookmakerMatch(teamName, nbaChampionshipOdds);
  
  if (bookmakerMatch) {
    const bookmakerFairProb = calculateFairProb(bookmakerMatch.odds);
    const edge = (bookmakerFairProb - polyMarket.yes_price) * 100;
    
    if (edge >= MIN_EDGE) {
      // Create/update watch state with Polymarket as source
      await upsertWatchState({
        polymarket_condition_id: polyMarket.condition_id,
        polymarket_question: polyMarket.question,
        polymarket_yes_price: polyMarket.yes_price,
        edge_percent: edge,
        // ... other fields
      });
    }
  }
}
```

### Phase 5: Update `sync-polymarket-h2h` for Better Entity Extraction

Enhance the sync function to extract more structured data:

1. **Better team/player extraction** for futures markets:
   - "Will the Denver Nuggets win the 2026 NBA Finals?" → team: "Denver Nuggets", league: "NBA"
   - "Will LeBron James win 2026 NBA MVP?" → player: "LeBron James", award: "MVP"

2. **Add extracted entity columns** to cache:
```sql
ALTER TABLE public.polymarket_h2h_cache
ADD COLUMN IF NOT EXISTS extracted_entity text,
ADD COLUMN IF NOT EXISTS extracted_league text,
ADD COLUMN IF NOT EXISTS extracted_threshold numeric;
```

3. **Improve sport detection** to reduce null categories

### Phase 6: Update UI Components

**SignalCard.tsx Changes**:
- Display Polymarket question text prominently
- Show Polymarket YES price in cents (e.g., "45c")
- Show bookmaker fair probability comparison
- Add direct link to Polymarket market for execution
- Show volume and last update time

**ScanControlPanel.tsx Changes**:
- Add "Polymarket Sync" button to trigger cache refresh
- Show cache stats (markets by type, last sync time)
- Add toggle for market type focus (Futures vs H2H vs All)

**New Component: PolymarketCacheStats.tsx**:
- Display breakdown of cached markets by sport/type
- Show total volume across categories
- Show last sync timestamp
- Button to trigger manual sync

### Phase 7: Configuration Updates

**scan_config table additions**:
```sql
ALTER TABLE public.scan_config
ADD COLUMN IF NOT EXISTS poly_sync_interval_hours integer DEFAULT 6,
ADD COLUMN IF NOT EXISTS min_poly_volume integer DEFAULT 5000,
ADD COLUMN IF NOT EXISTS enabled_market_types text[] DEFAULT ARRAY['futures', 'h2h', 'total'];
```

**supabase/config.toml**:
```toml
[functions.polymarket-first-scan]
verify_jwt = false
```

---

## API Cost Optimization

| Current Approach | New Approach |
|-----------------|--------------|
| 20+ API calls per watch poll (one per sport) | 4-6 API calls (one per category with Poly coverage) |
| Searches for markets that don't exist | Only fetches bookmaker data for known Poly markets |
| 500 req/month limit constrains coverage | Same limit covers more useful data |

**New API Call Strategy**:

1. **Polymarket Sync** (free): 0 API calls - uses Polymarket public API
2. **Watch Mode Poll**: 
   - 1 call for NBA Championship outrights
   - 1 call for NFL Super Bowl outrights
   - 1 call for NHL Stanley Cup outrights
   - 1 call for EPL Winner outrights
   - = 4 calls per poll vs 20+ previously
3. **Active Mode Refresh**: 
   - Direct condition_id lookups (free, no search)
   - Single bookmaker refresh per active market

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/xxx.sql` | Create | Add columns to event_watch_state + indexes |
| `supabase/functions/polymarket-first-scan/index.ts` | Create | New Polymarket-first scanning logic |
| `supabase/functions/watch-mode-poll/index.ts` | Rewrite | Invert to Polymarket-first flow |
| `supabase/functions/active-mode-poll/index.ts` | Modify | Use condition_id for direct refresh |
| `supabase/functions/sync-polymarket-h2h/index.ts` | Enhance | Better entity extraction |
| `supabase/config.toml` | Update | Add new function config |
| `src/components/terminal/SignalCard.tsx` | Modify | Show Polymarket-first data |
| `src/components/terminal/PolymarketCacheStats.tsx` | Create | Cache statistics display |
| `src/hooks/usePolymarketCache.ts` | Enhance | Add cache stats and sync triggers |
| `src/types/scan-config.ts` | Update | Add new config fields |

---

## Implementation Order

1. **Database Migration** - Add new columns and indexes
2. **sync-polymarket-h2h Enhancement** - Better entity extraction
3. **polymarket-first-scan** - New core scanning function
4. **watch-mode-poll Rewrite** - Polymarket-first flow
5. **active-mode-poll Update** - Direct condition_id refresh
6. **UI Updates** - SignalCard and cache stats

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Markets covered | ~50 (H2H games that don't exist) | 1,500+ (all Poly sports) |
| Match success rate | ~5% (searching for wrong markets) | 95%+ (matching against known markets) |
| API efficiency | 20+ calls/poll | 4-6 calls/poll |
| Edge detection | Unreliable | Accurate (correct comparison) |
| Execution venue clarity | Confused | Always Polymarket |

