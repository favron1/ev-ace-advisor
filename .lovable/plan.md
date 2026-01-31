

## Fix: Prevent False Sport Detection + Add English Football Support

### Problem Summary

The QPR vs Coventry City signal is **completely invalid** due to multiple bugs:

| Issue | Impact |
|-------|--------|
| "Rangers" in team name matches NHL detection pattern | Signal tagged as NHL ice hockey |
| System fetches NHL odds data for refresh | QPR match not found, no update |
| Signal assigned `team_name: New York Rangers` | Completely wrong team |
| 64% bookmaker probability is from NHL, not football | Edge calculation is garbage |

Sportsbet's 2.05 odds (48.8%) for Coventry is the **correct** market price. The 30.9% edge displayed is a **data artifact**.

### Root Cause

In `supabase/functions/_shared/sports-config.ts` line 50:
```typescript
detectionPatterns: [
  /\bnhl\b/i,
  /rangers|islanders|.../i,  // "rangers" matches "Queens Park Rangers"
]
```

The regex `rangers` is not anchored, so it matches any text containing "Rangers" anywhere.

### Two-Part Solution

**Part 1: Fix NHL Detection Pattern (Prevention)**

Make team name patterns more specific to avoid false positives:

```typescript
// Current (broken):
/rangers|islanders|devils|.../i

// Fixed (anchored to prevent false matches):
/\b(new york\s+)?rangers\b/i  // Requires "Rangers" or "New York Rangers"
/\bny\s*rangers\b/i           // Also matches "NY Rangers"
```

Or better - use multi-word patterns:
```typescript
// Instead of just "rangers", require context:
/new york rangers|ny rangers|nyr/i
```

**Part 2: Add English Football Support (Future Feature)**

Add English Championship / EPL to `SPORTS_CONFIG`:

```typescript
efl_championship: {
  name: 'EFL',
  polymarketUrl: 'https://polymarket.com/sports/soccer/efl',
  oddsApiSport: 'soccer_efl_champ',  // The Odds API endpoint
  oddsApiMarkets: 'h2h',
  teamMap: {
    'qpr': 'Queens Park Rangers',
    'cov': 'Coventry City',
    // ... other Championship teams
  },
  detectionPatterns: [
    /\befl\b/i,
    /championship/i,
    /coventry|qpr|queens park|cardiff|swansea|.../i,
  ],
}
```

Note: English football is a **3-way market** (Home/Draw/Away), which requires different edge calculation logic than 2-way H2H. This is a significant architecture consideration.

### Immediate Action: Expire This Signal

The QPR vs Coventry signal must be expired immediately as it's based on completely incorrect data.

```sql
UPDATE signal_opportunities 
SET status = 'expired' 
WHERE event_name ILIKE '%queens park rangers%' 
   OR event_name ILIKE '%coventry%';
```

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/_shared/sports-config.ts` | Fix NHL detection patterns to require full team names like "New York Rangers" instead of just "Rangers" |
| `supabase/functions/polymarket-monitor/index.ts` | Ensure sport detection fallback doesn't misclassify |
| Database | Expire the QPR vs Coventry signal |

### Technical Considerations for English Football

Adding full English football support requires:
1. 3-way market handling (Win/Draw/Win) vs current 2-way (Home/Away)
2. Draw probability must be factored into edge calculations
3. Different API endpoint (`soccer_efl_champ`, `soccer_england_league1`, etc.)
4. May need separate "fair value" calculation that accounts for draws

This is a larger architectural change if you want to fully support European football markets.

### Expected Outcome After Fix

1. QPR vs Coventry signal expires immediately
2. Future matches with "Rangers" in team name won't be misclassified as NHL
3. English football markets will be skipped (until full support is added) rather than incorrectly processed

