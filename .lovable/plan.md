

# H2H-Only Architecture Fix

## Problem Summary

The Pipeline only shows 3 H2H markets when there should be ~70+ in the next 24 hours. Investigation revealed:

| Metric | Current | Expected |
|--------|---------|----------|
| H2H markets in Polymarket cache | 71 | 71 |
| Markets passing volume filter | 9 | 71 |
| Markets matched to bookmakers | 3 | ~40 |
| Bookmaker H2H events available | 36 | 36 |

**Root causes:**
1. `min_poly_volume = 5000` filters out 87% of markets (volume data is `$0` for many)
2. Sport category normalization missing for NCAA, Soccer, etc.
3. No volume data being captured during Polymarket sync for new markets

---

## Solution

### 1. Remove Volume Filter Entirely
**File: `scan_config` table**

Volume is unreliable for fresh markets. Instead, use the existence of a tradeable Polymarket market as the gating factor:

```sql
UPDATE scan_config SET min_poly_volume = 0;
```

### 2. Fix watch-mode-poll to Skip Volume Check
**File: `supabase/functions/watch-mode-poll/index.ts`**

Remove the volume filter from the market query:

```typescript
// BEFORE:
.gte('volume', minVolume)

// AFTER:
// (removed - any H2H market with a price is eligible)
```

### 3. Add Sport Category Normalization
**File: `supabase/functions/watch-mode-poll/index.ts`**

Expand `normalizeSportCategory()` to handle more categories:

```typescript
const aliases: Record<string, string> = {
  // Existing
  'NHL': 'icehockey_nhl',
  'NBA': 'basketball_nba',
  'NFL': 'americanfootball_nfl',
  
  // Add NCAA mapping
  'NCAA': 'basketball_ncaab',
  'NCAAB': 'basketball_ncaab',
  
  // Add Soccer mappings  
  'EPL': 'soccer_epl',
  'La Liga': 'soccer_spain_la_liga',
  'Bundesliga': 'soccer_germany_bundesliga',
  'Serie A': 'soccer_italy_serie_a',
  'UCL': 'soccer_uefa_champs_league',
};
```

### 4. Enable All Configured Sports in scan_config
**Database update:**

```sql
UPDATE scan_config 
SET enabled_sports = ARRAY[
  'basketball_nba',
  'basketball_ncaab', 
  'icehockey_nhl',
  'americanfootball_nfl',
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_uefa_champs_league'
];
```

### 5. Clean Up Non-H2H Markets from Database
**One-time cleanup:**

```sql
-- Remove spreads, totals, and futures from event_watch_state
UPDATE event_watch_state 
SET watch_state = 'expired'
WHERE event_name ILIKE '%spread:%'
   OR event_name ILIKE '%o/u %'
   OR event_name ILIKE '%traded%'
   OR event_name ILIKE '%win totals%'
   OR event_name ILIKE '%championship%';

-- Also clean up polymarket_h2h_cache
UPDATE polymarket_h2h_cache 
SET status = 'expired'
WHERE market_type != 'h2h';
```

---

## Technical Details

### Why Volume Filtering Fails

Polymarket's Gamma API returns volume data, but:
1. New markets start with `$0` volume
2. The sync runs every few hours, so volume is stale
3. Many legitimate H2H games have low volume because they're new

The real filter should be: **Does a tradeable Polymarket market exist?** If yes, monitor it.

### Expected Outcome After Fix

| Metric | Before | After |
|--------|--------|-------|
| H2H markets monitored | 3 | ~50+ |
| Sports covered | NHL only | NHL, NBA, NCAA, EPL, La Liga, etc. |
| False positives | None | None (still requires bookmaker match) |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/watch-mode-poll/index.ts` | Remove volume filter, expand sport normalization |
| Database (`scan_config`) | Set `min_poly_volume = 0`, expand `enabled_sports` |
| Database (`event_watch_state`) | Expire non-H2H entries |
| Database (`polymarket_h2h_cache`) | Expire non-H2H market_types |

