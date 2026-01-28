

# Flip Architecture: Polymarket-First Signal Detection

## Current Problem

The current system follows **Bookmakers Lead, Polymarket Reacts**:
1. Scans bookmaker odds every 5 minutes for movement
2. Tries to find matching Polymarket markets per-event via live API calls
3. Fails frequently because:
   - Polymarket's `title_contains` API search returns political markets instead of sports
   - Market titles don't match (e.g., "Timberwolves vs. Mavericks" vs "Dallas Mavericks vs Minnesota Timberwolves")
   - Rate limits exhausted on failed lookups before reaching target games

## Proposed Solution

**Flip to Polymarket-First Scanning:**

```text
+---------------------+     +--------------------+     +------------------+
|  1. Fetch ALL      |---->| 2. Store in       |---->| 3. For each     |
|  Polymarket Sports |     | polymarket_h2h_   |     | Polymarket      |
|  H2H Markets Daily |     | cache table       |     | event, fetch    |
|                    |     |                    |     | bookmaker odds  |
+---------------------+     +--------------------+     +------------------+
                                                              |
                                                              v
                                                      +------------------+
                                                      | 4. Compare       |
                                                      | Poly price vs    |
                                                      | Bookmaker fair   |
                                                      | probability      |
                                                      +------------------+
                                                              |
                                                              v
                                                      +------------------+
                                                      | 5. Surface       |
                                                      | actionable       |
                                                      | edges (>2%)      |
                                                      +------------------+
```

## Benefits

| Current System | Flipped System |
|---------------|----------------|
| Search-based matching (unreliable) | Pre-cached markets (guaranteed match) |
| Rate-limited per-event lookups | Bulk fetch once daily + live price refresh |
| Missing most NBA games | Every Polymarket sports market captured |
| Manual price entry workaround | Automated end-to-end |

## Technical Implementation

### Phase 1: New Polymarket Cache Table

Create a new table specifically for sports H2H markets with better structure:

```sql
CREATE TABLE polymarket_h2h_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id text UNIQUE NOT NULL,
  event_title text NOT NULL,
  question text NOT NULL,
  
  -- Extracted match data
  team_home text,
  team_away text,
  sport_category text,
  event_date timestamp with time zone,
  
  -- Pricing (updated frequently)
  yes_price numeric NOT NULL,
  no_price numeric NOT NULL,
  volume numeric DEFAULT 0,
  liquidity numeric DEFAULT 0,
  
  -- Metadata
  status text DEFAULT 'active',
  last_price_update timestamp with time zone DEFAULT now(),
  last_bulk_sync timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);
```

### Phase 2: New Edge Function - `sync-polymarket-h2h`

A new function that:
1. Fetches ALL sports markets from Polymarket Gamma API (paginated)
2. Extracts team names from event titles using regex patterns
3. Stores in `polymarket_h2h_cache` with normalized team names
4. Runs once per day (or on-demand) via pg_cron at 6 AM

```typescript
// Fetch pattern for comprehensive sports coverage
const endpoints = [
  '/events?active=true&closed=false&limit=100&offset=0',
  '/events?active=true&closed=false&limit=100&offset=100',
  // ... paginate until exhausted
];

// Parse team names from various title formats:
// "Timberwolves vs. Mavericks" → team_home: "Timberwolves", team_away: "Mavericks"
// "Will the Warriors beat the Lakers?" → team_home: "Warriors", team_away: "Lakers"
function extractTeams(title: string, question: string): { home: string, away: string } | null
```

### Phase 3: Modify Watch Mode Poll

Change `watch-mode-poll` to:
1. First check which events exist in `polymarket_h2h_cache`
2. Only fetch bookmaker odds for events that have a Polymarket market
3. Calculate edge immediately using cached Polymarket price

```typescript
// New flow in watch-mode-poll:
// 1. Get all active Polymarket H2H markets
const { data: polyMarkets } = await supabase
  .from('polymarket_h2h_cache')
  .select('*')
  .eq('status', 'active')
  .gte('event_date', now)
  .lte('event_date', maxHorizon);

// 2. For each Polymarket market, fetch bookmaker odds
for (const polyMarket of polyMarkets) {
  const bookmakerOdds = await fetchBookmakerOdds(polyMarket.team_home, polyMarket.team_away);
  
  // 3. Calculate edge immediately
  const bookmakerFairProb = calculateVigFreeProb(bookmakerOdds);
  const polyPrice = polyMarket.yes_price;
  const edge = (bookmakerFairProb - polyPrice) * 100;
  
  if (edge >= MIN_EDGE) {
    // Surface signal immediately
  }
}
```

### Phase 4: Live Price Refresh

Add a lightweight price-only refresh for active signals:
1. When a signal is surfaced, fetch fresh Polymarket price via API
2. Use `condition_id` for direct market lookup (no search needed)
3. Update `polymarket_h2h_cache` with fresh price before edge calculation

```typescript
// Direct price lookup using condition_id
const url = `https://gamma-api.polymarket.com/markets/${conditionId}`;
const market = await fetch(url).then(r => r.json());
const freshYesPrice = parseFloat(market.outcomePrices[0]);
```

### Phase 5: Update Signal Detection Flow

Modify `detect-signals` to:
1. Join bookmaker signals against `polymarket_h2h_cache` using team name matching
2. Calculate edge for all matched pairs
3. Apply quality filters (volume, staleness, edge threshold)
4. Surface actionable signals only

## Matching Strategy

Use fuzzy matching with the TEAM_ALIASES already in the codebase:

```text
Polymarket: "Timberwolves vs. Mavericks"
  → normalized: ["timberwolves", "wolves", "minnesota"] + ["mavericks", "mavs", "dallas"]

Bookmaker: "Dallas Mavericks vs Minnesota Timberwolves"
  → normalized: ["dallas", "mavericks", "mavs"] + ["minnesota", "timberwolves", "wolves"]

Match confidence: High (multiple alias overlaps)
```

## Scheduling

| Function | Schedule | Purpose |
|----------|----------|---------|
| `sync-polymarket-h2h` | Daily at 6 AM | Bulk refresh all sports markets |
| `watch-mode-poll` | Every 5 min | Check bookmaker odds for cached Poly markets |
| `active-mode-poll` | Every 60 sec | Refresh Poly price + confirm edges |

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/sync-polymarket-h2h/index.ts` | New bulk sync function |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/watch-mode-poll/index.ts` | Check Polymarket cache first before fetching bookmaker odds |
| `supabase/functions/detect-signals/index.ts` | Use cache for matching instead of live search |
| `supabase/functions/active-mode-poll/index.ts` | Use condition_id for direct price lookup |

## Database Changes

1. Create `polymarket_h2h_cache` table with team extraction columns
2. Add pg_cron job for daily sync at 6 AM
3. Add index on `(team_home, team_away, event_date)` for fast matching

## Expected Outcome

After implementation:
- Every Polymarket sports H2H market will be captured and cached
- Matching will be reliable (pre-computed, not search-based)
- Edge detection will work automatically without manual price entry
- Signal cards will show accurate Polymarket prices from verified matches
- No more "no match found" failures for games that clearly exist on Polymarket

