
# Plan: Enable Championship Futures Arbitrage Matching

## Problem Summary

Your system has all the data needed for sports arbitrage, but **detect-signals only processes H2H markets**:

| Data Source | What You Have | What's Matchable |
|-------------|---------------|------------------|
| Bookmaker Outrights | 496 signals (e.g., "NBA Championship Winner: Denver Nuggets" @ 13%) | **These can match Polymarket** |
| Bookmaker H2H | 437 signals (e.g., "Jazz vs Warriors") | No Polymarket equivalent |
| Polymarket Sports | 364 markets (e.g., "Will the Denver Nuggets win the 2026 NBA Finals?") | Championship futures only |

The fix is to update `detect-signals` to also process **outright markets** with championship-specific matching logic.

## Solution Overview

Add a second processing pipeline in `detect-signals/index.ts` that:
1. Fetches outright bookmaker signals (currently ignored)
2. Uses specialized matching logic for championship questions
3. Compares bookmaker fair probability vs Polymarket price
4. Surfaces true arbitrage opportunities

## Implementation Details

### File: `supabase/functions/detect-signals/index.ts`

**Change 1: Fetch outrights alongside H2H**

Add a third parallel fetch for outright signals:
```
bookmaker_signals?market_type=eq.outrights
```

**Change 2: Add championship-specific team extraction**

Create a function to extract team names from outright event names:
```
"NBA Championship Winner: Denver Nuggets" → "Denver Nuggets"
"EPL Winner: Manchester City" → "Manchester City"
```

**Change 3: Add championship question matching**

Create a new matching function that:
- Parses Polymarket questions like "Will the Denver Nuggets win the 2026 NBA Finals?"
- Extracts the team name
- Matches against bookmaker outright team names
- Returns the YES price as the comparison point

**Change 4: Process outrights loop**

Add a second processing loop after the H2H loop that:
- Iterates through outright signals
- Matches against championship Polymarket markets
- Calculates edge as: `bookmaker_prob - polymarket_yes_price`
- Creates opportunities with `is_true_arbitrage: true` when matched

### Example Match Flow

```
Bookmaker Signal:
  event_name: "NBA Championship Winner: Denver Nuggets"
  implied_probability: 0.13 (13%)

Polymarket Market:
  question: "Will the Denver Nuggets win the 2026 NBA Finals?"
  yes_price: 0.08 (8%)

Result:
  edge_percent: 5% (13% - 8%)
  is_true_arbitrage: true
  side: YES
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/detect-signals/index.ts` | Add outright fetching, championship matching logic, and processing loop |

## Expected Outcome

After implementation:
- True arbitrage signals when bookmaker championship odds exceed Polymarket prices
- Example: Denver Nuggets at 13% bookmaker vs 8% Polymarket = 5% edge opportunity
- Signals properly labeled as `is_true_arbitrage: true` with real edge percentages
