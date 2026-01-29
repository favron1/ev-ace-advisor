
## Fix Fair Probability Calculation - Proper Per-Book Vig Removal

### The Problem

The current implementation in `ingest-odds/index.ts` calculates fair probability incorrectly:

```text
CURRENT (WRONG):
Book A: 2.10 odds   Book B: 2.05 odds   Book C: 2.00 odds
        ↓                   ↓                   ↓
        Average odds = 2.05
        ↓
        1 / 2.05 = 48.8% raw prob
        ↓
        Normalize against other side
        ↓
        "Fair" probability (still includes vig artifacts!)
```

This fails because:
- Each book has different vig levels (Pinnacle ~2%, recreational books ~5-8%)
- Averaging odds preserves vig in the calculation
- The "normalization" step only removes the combined vig, not individual book overround

---

### Correct Approach

```text
CORRECT:
For EACH bookmaker:
  1. Convert both sides to implied probabilities
  2. Remove vig by normalizing to sum = 100%
  3. Extract the vig-free probability for target outcome

Then aggregate across books:
  - Use median or trimmed mean of the vig-free probabilities
  - Weight sharp books higher (Pinnacle, Betfair, Circa)
```

**Example:**
```text
Book A (Pinnacle, low vig):
  Home: 2.10 → 47.6%   Away: 1.85 → 54.1%   Total: 101.7%
  Vig-free: 46.8% / 53.2%

Book B (FanDuel, high vig):
  Home: 2.00 → 50.0%   Away: 1.80 → 55.6%   Total: 105.6%
  Vig-free: 47.3% / 52.7%

Book C (DraftKings):
  Home: 2.05 → 48.8%   Away: 1.82 → 54.9%   Total: 103.7%
  Vig-free: 47.0% / 53.0%

Aggregated fair prob for Home: median(46.8%, 47.3%, 47.0%) = 47.0%
```

---

### Implementation Changes

**File: `supabase/functions/ingest-odds/index.ts`**

Replace the `calculateFairProbability` function with proper per-book vig removal:

```typescript
// Remove vig for a single bookmaker's 2-way market
function removeVigForBook(
  homeOdds: number,
  awayOdds: number
): { homeFair: number; awayFair: number } {
  const homeRaw = 1 / homeOdds;
  const awayRaw = 1 / awayOdds;
  const total = homeRaw + awayRaw;
  
  return {
    homeFair: homeRaw / total,
    awayFair: awayRaw / total,
  };
}

// Calculate fair probability with proper per-book vig removal
function calculateFairProbability(
  outcomeOdds: Record<string, OutcomeOdds[]>,
  targetOutcome: string,
  sharpBookWeighting: boolean,
  sharpBookWeight: number
): { fairProb: number; rawProb: number; avgOdds: number } {
  const outcomes = Object.keys(outcomeOdds);
  
  // For 2-way markets, calculate per-book vig-free probabilities
  if (outcomes.length === 2) {
    const [outcome1, outcome2] = outcomes;
    const bookFairProbs: { prob: number; weight: number }[] = [];
    
    // Find matching book pairs (same bookmaker has both outcomes)
    const bookmakers = new Set<string>();
    for (const odds of outcomeOdds[outcome1]) {
      bookmakers.add(odds.bookmaker);
    }
    
    for (const bookmaker of bookmakers) {
      const odds1 = outcomeOdds[outcome1].find(o => o.bookmaker === bookmaker);
      const odds2 = outcomeOdds[outcome2].find(o => o.bookmaker === bookmaker);
      
      if (odds1 && odds2) {
        // Calculate vig-free probability for this book
        const raw1 = 1 / odds1.odds;
        const raw2 = 1 / odds2.odds;
        const total = raw1 + raw2;
        const fair1 = raw1 / total;
        const fair2 = raw2 / total;
        
        const targetFair = targetOutcome === outcome1 ? fair1 : fair2;
        const weight = odds1.isSharp ? sharpBookWeight : 1;
        
        bookFairProbs.push({ prob: targetFair, weight });
      }
    }
    
    if (bookFairProbs.length > 0) {
      // Weighted average of vig-free probabilities
      let totalWeight = 0;
      let weightedSum = 0;
      for (const { prob, weight } of bookFairProbs) {
        weightedSum += prob * weight;
        totalWeight += weight;
      }
      const fairProb = weightedSum / totalWeight;
      
      // Also calculate average odds for display
      const targetOdds = outcomeOdds[targetOutcome];
      const avgOdds = targetOdds.reduce((sum, o) => sum + o.odds, 0) / targetOdds.length;
      const rawProb = 1 / avgOdds;
      
      return { fairProb, rawProb, avgOdds };
    }
  }
  
  // Fallback for 3+ way markets or incomplete data: use original logic
  // (outrights with many outcomes can't be perfectly devigged)
  const avgOddsMap: Record<string, number> = {};
  for (const outcome of outcomes) {
    const oddsArray = outcomeOdds[outcome];
    avgOddsMap[outcome] = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
  }
  
  const rawProbs: Record<string, number> = {};
  let totalRawProb = 0;
  for (const outcome of outcomes) {
    rawProbs[outcome] = 1 / avgOddsMap[outcome];
    totalRawProb += rawProbs[outcome];
  }
  
  const targetRawProb = rawProbs[targetOutcome] || 0;
  const targetFairProb = totalRawProb > 0 ? targetRawProb / totalRawProb : 0;
  
  return {
    fairProb: targetFairProb,
    rawProb: targetRawProb,
    avgOdds: avgOddsMap[targetOutcome] || 0,
  };
}
```

---

### Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Vig removal | Once, after averaging | Per-book, before averaging |
| Book pairing | None - sides averaged independently | Matches both sides from same book |
| Sharp weighting | Applied to raw odds | Applied to vig-free probs |
| 3-way markets | Same flawed method | Falls back gracefully |

---

### Edge Impact

With proper vig removal:
- Edges will be **more accurate** (no vig inflation/deflation)
- Sharp book opinions will be **properly weighted** after devigging
- False positives from high-vig books will be reduced
- True edges will be more precisely calculated

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/ingest-odds/index.ts` | Replace `calculateFairProbability` function with per-book vig removal logic |

---

### Summary

This fix implements the correct methodology:
1. Convert odds → implied probabilities **per bookmaker**
2. Remove vig (normalize) **per bookmaker**  
3. Aggregate vig-free probabilities across books (weighted by sharpness)

This eliminates the "average odds then invert" anti-pattern and ensures fair probabilities are truly vig-free.
