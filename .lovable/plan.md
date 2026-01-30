

# Edge Detection Pipeline Fix

## Problem Summary
The system isn't detecting edges automatically when you press "Scan" because of **three critical bugs** in the detection pipeline:

---

## Bug 1: 3-Way to 2-Way Market Conversion (NHL Ice Hockey)

**Current Behavior:**
The Odds API returns 3-way markets for NHL (Home/Draw/Away):
- Columbus Blue Jackets: 45.4%
- Chicago Blackhawks: 34.0%
- Draw: 20.6%

But Polymarket is 2-way (no draw option).

**The Problem:**
The system uses the 3-way fair probability directly (45.4% for Blue Jackets) when it should renormalize to 2-way:
- Blue Jackets 2-way: 45.4% ÷ (45.4% + 34.0%) = **57.2%**
- Blackhawks 2-way: 34.0% ÷ (45.4% + 34.0%) = **42.8%**

**Impact:**
This makes edges appear ~10-15% smaller than they actually are, causing the trigger threshold (5%) to never be met.

---

## Bug 2: BUY NO Edge Detection Requires Movement Confirmation

**Current Behavior:**
The edge calculation at line 1147 does:
```
rawEdge = bookmakerFairProb - livePolyPrice
```

For the Blue Jackets game:
- `rawEdge = 0.572 (renormalized) - 0.58 = -0.008` (negative)

The system only flips to BUY NO if `movement.triggered && movement.direction === 'drifting'` (line 1149). Without confirmed sharp book movement in the last 30 minutes, it **never considers the NO side**.

**The Actual Edge:**
- Polymarket YES (Blue Jackets): 58¢
- Polymarket NO (Blackhawks): 42¢
- Fair NO probability: 42.8%
- **Edge on NO = 42.8% - 42% = +0.8%** (below threshold)

Wait - after renormalization, the edge is actually quite small. Let me recalculate with the ACTUAL numbers from your Firecrawl data:
- Polymarket YES price: **58¢** (Blue Jackets win)
- Bookmaker Fair (2-way renormalized): **57.2%** (Blue Jackets)
- Edge: 57.2% - 58% = **-0.8%** (wrong side, but small)

**But wait** - the bookmaker data in `bookmaker_signals` shows 45.4% WITH the draw included. After removing the draw and renormalizing, the Blue Jackets fair prob is ~57%, which is CLOSE to the 58¢ Polymarket price.

The actual issue: **The bookmaker API is returning 3-way odds, but the calculation is NOT removing the draw for NHL**.

---

## Bug 3: CLOB Price Not Being Used in Edge Calculation

**Evidence from database:**
```
best_bid: 0.58
best_ask: 0.59
yes_price: 0.5 (STALE!)
```

The system fetches fresh CLOB bid/ask prices but the `yes_price` field is stale at 0.50 instead of the actual 0.58-0.59.

---

## Root Cause Analysis

The pipeline has these issues:

1. **NHL 3-way handling missing**: The `calculateConsensusFairProb` function doesn't filter out "Draw" outcomes for NHL
2. **BUY NO requires movement**: Static NO edges are never detected
3. **Price staleness**: The `yes_price` field isn't being updated with CLOB data before edge calculation

---

## Proposed Fixes

### Fix 1: Add 2-Way Renormalization for NHL

In `polymarket-monitor/index.ts`, update `calculateConsensusFairProb` to filter out Draw outcomes for NHL:

```typescript
function calculateConsensusFairProb(
  game: any, 
  marketKey: string, 
  targetIndex: number,
  sport: string // NEW: pass sport to know if 2-way
): number | null {
  // For NHL, filter out Draw outcomes and renormalize
  const isIceHockey = sport === 'NHL';
  
  for (const bookmaker of game.bookmakers || []) {
    const market = bookmaker.markets?.find((m: any) => m.key === marketKey);
    if (!market?.outcomes || market.outcomes.length < 2) continue;
    
    let outcomes = market.outcomes;
    
    // For NHL: Remove Draw and renormalize to 2-way
    if (isIceHockey && outcomes.length >= 3) {
      outcomes = outcomes.filter((o: any) => 
        !o.name.toLowerCase().includes('draw') &&
        o.name.toLowerCase() !== 'tie'
      );
    }
    
    // ... rest of calculation with filtered outcomes
  }
}
```

### Fix 2: Detect Both YES and NO Edges Without Movement

Update the edge detection logic to check BOTH sides:

```typescript
// Calculate edge for BOTH sides
const yesEdge = bookmakerFairProb - livePolyPrice;  // Edge if buying YES
const noEdge = (1 - bookmakerFairProb) - (1 - livePolyPrice);  // Edge if buying NO

// Pick the positive edge side
let betSide: 'YES' | 'NO';
let rawEdge: number;

if (yesEdge > noEdge && yesEdge > 0) {
  betSide = 'YES';
  rawEdge = yesEdge;
} else if (noEdge > 0) {
  betSide = 'NO';
  rawEdge = noEdge;
} else {
  continue; // No edge on either side
}
```

### Fix 3: Use CLOB Price in Edge Calculation

The code already fetches CLOB prices but uses `livePolyPrice` which may be stale. Ensure the CLOB ask price is used:

```typescript
// Get price from CLOB batch results (preferred)
let livePolyPrice = cache?.yes_price || 0.5;

if (tokenIdYes && clobPrices.has(tokenIdYes)) {
  const prices = clobPrices.get(tokenIdYes)!;
  // Use ASK price (what you pay to buy YES)
  livePolyPrice = prices.ask > 0 ? prices.ask : prices.bid;
}
```

---

## Implementation Steps

1. **Update `calculateConsensusFairProb`** to accept sport parameter and filter Draw outcomes for NHL
2. **Update edge calculation** to check both YES and NO sides without requiring movement confirmation
3. **Verify CLOB price usage** is happening before edge calculation
4. **Add logging** to trace edge calculations for debugging

---

## Expected Outcome

After these fixes, when you press "Scan":
1. NHL games will use proper 2-way fair probabilities
2. Both BUY YES and BUY NO edges will be detected automatically
3. The Blackhawks vs Blue Jackets edge should surface (if one exists after renormalization)

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Add NHL 3-way filtering, bidirectional edge detection |

### Testing Steps
1. Deploy the updated function
2. Run a manual scan
3. Check logs for edge calculation output
4. Verify edges appear in the feed

