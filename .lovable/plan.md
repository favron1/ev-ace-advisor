

# Plan: Fix Edge Calculation to Measure Real Arbitrage

## Problem Summary

The current edge formula is fundamentally flawed:

```typescript
// CURRENT (wrong)
edge = Math.abs(bookmakerProb - 0.5) * 100
```

This measures **how far from 50/50 an event is** - not actual mispricing. A 79.7% favorite shows as "29.7% edge" even when there's no arbitrage opportunity at all.

**Real edge** requires comparing two independent price sources (bookmakers vs prediction market).

---

## Solution: Proper Edge Calculation

### Option A: Match Against Polymarket (Preferred)
Compare bookmaker probability against actual Polymarket prices for the same event.

```text
Edge = Bookmaker Probability - Polymarket Price

Example:
- Bookmakers say 79.7% for Utah Jazz
- Polymarket prices Utah Jazz YES at 70¢
- True Edge = 79.7% - 70% = 9.7%
```

### Option B: No Match Available
When no Polymarket market exists for an H2H event, we have two options:
1. **Don't show edge** - Only surface as "informational signal"
2. **Show vs sharp book baseline** - Compare soft book consensus vs sharp-only consensus

---

## Implementation Steps

### 1. Enhance Polymarket Matching

Improve the fetch-polymarket function to capture sports-related markets:
- NBA game outcomes
- Tennis match winners
- UFC fight outcomes

Add fuzzy name matching to pair events:
```text
Bookmaker: "Utah Jazz vs Golden State Warriors"
Polymarket: "Will the Utah Jazz beat the Warriors on Jan 29?"
→ Match confidence: 95%
```

### 2. Update Signal Detection Logic

```text
For each H2H event:
  1. Try to find matching Polymarket market
  2. If matched:
     - edge = bookmakerProb - polymarketPrice
     - Store matched_polymarket: true
  3. If not matched:
     - Calculate "signal strength" (current formula renamed)
     - OR skip event entirely
     - Store matched_polymarket: false
```

### 3. Add UI Distinction

Show different badge types:
- **"EDGE: +9.7%"** - Real arbitrage (matched to Polymarket)
- **"SIGNAL STRENGTH: 29.7%"** - No match, informational only

### 4. Database Changes

Add columns to track match quality:
```sql
ALTER TABLE signal_opportunities
ADD COLUMN polymarket_match_confidence numeric,
ADD COLUMN is_true_arbitrage boolean DEFAULT false;
```

---

## Technical Changes

| File | Change |
|------|--------|
| `supabase/functions/fetch-polymarket/index.ts` | Add sports category filtering and name extraction |
| `supabase/functions/detect-signals/index.ts` | Implement proper edge calculation with market matching |
| `src/components/terminal/SignalCard.tsx` | Distinguish between true edge and signal strength |
| Database migration | Add match tracking columns |

---

## Edge Cases to Handle

1. **Stale Polymarket prices**: Only use markets updated within last 2 hours
2. **Low liquidity markets**: Flag if Polymarket volume < $10k
3. **Name mismatches**: Use Levenshtein distance with 0.8 threshold
4. **Multiple outcomes**: Handle 3-way soccer markets differently

---

## Expected Outcome

After implementation:

| Before | After |
|--------|-------|
| Edge: 29.7% (inflated) | True Edge: 8.2% (if Polymarket matched) |
| All signals show "edge" | Only matched signals show "edge" |
| Misleading opportunity quality | Accurate arbitrage detection |

**Edge distribution should shift from 20-30% range down to 2-10% range** which is realistic for mature markets.

---

## Alternative: Conservative Mode

If Polymarket matching proves difficult short-term, implement a "sharp book baseline" approach:

```text
Edge = Soft Book Consensus - Sharp Book Price

This measures soft book inefficiency vs sharp benchmark,
which is a valid (though smaller) opportunity.
```

This would produce 1-5% edges which are realistic for closing line value plays.

