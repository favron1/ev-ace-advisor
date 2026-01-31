
# Fix: Signal Side Inversion Bug for Away Team Bets

## Problem Summary
The signal for "Canadiens vs. Sabres" is incorrectly telling users to "BUY YES" on Buffalo Sabres, when Sabres is actually the **NO** side in this market (away team = NO). The Polymarket price shown (45¢) is actually the Canadiens (YES) price, not the Sabres price.

## Root Cause
The `polymarket-monitor` edge calculation logic is correctly determining that Sabres has the edge, but when storing the signal, it's storing `side: YES` instead of `side: NO`. This happens because:

1. The signal stores `polymarket_price` but uses the YES token's price regardless of which side is selected
2. When `betSide = 'NO'` is selected, the `polymarket_price` field should use `(1 - livePolyPrice)` to represent the NO side price
3. The refresh-signals function then uses this incorrect price to calculate edge

## Changes Required

### 1. `supabase/functions/polymarket-monitor/index.ts`
**Location:** Signal creation block (around line 1750-1800)

Update the signal object creation to use the correct price based on selected side:

```typescript
// When betSide is 'NO', store the NO price (1 - yesPrice) as polymarket_price
const signalPolyPrice = betSide === 'YES' ? livePolyPrice : (1 - livePolyPrice);
```

The signal insert should use `signalPolyPrice` instead of `livePolyPrice` for the `polymarket_price` field.

### 2. `supabase/functions/refresh-signals/index.ts`  
**Location:** Lines 410-423 (live price retrieval)

Verify the refresh logic correctly retrieves the appropriate token price based on signal side:
- For `side: YES` → use `token_id_yes` price (already correct)
- For `side: NO` → use `token_id_no` price (already correct)

This appears to be working correctly, but the stored price is wrong from creation.

### 3. Add Validation Logging
Add a sanity check log when creating signals:

```typescript
console.log(`[POLY-MONITOR] SIGNAL CREATE: ${betSide} ${recommendedOutcome} @ ${signalPolyPrice.toFixed(2)}c (raw=${livePolyPrice.toFixed(2)}c)`);
```

## Technical Details

### Current Flow (Buggy)
1. Market: "Canadiens vs. Sabres" → YES=Canadiens, NO=Sabres
2. CLOB returns YES price = 0.45 (45¢)
3. Sharp books say Sabres = 55% fair prob
4. System calculates: noEdge = 0.55 - (1 - 0.45) = 0.55 - 0.55 = 0% ← This is correct
5. **BUT** the stored signal has `polymarket_price: 0.45` which is the Canadiens price

### Corrected Flow
1. Market: "Canadiens vs. Sabres" → YES=Canadiens, NO=Sabres
2. CLOB returns YES price = 0.45 (45¢), therefore NO price = 0.55 (55¢)
3. Sharp books say Sabres = 55% fair prob
4. noEdge = 0.55 - 0.55 = 0% → No signal generated (no edge)

### If There Was a Real Edge
If Polymarket had Sabres (NO) at 45¢ while sharp books said 55%:
1. YES price would be 0.55 (55¢ for Canadiens)
2. NO price would be 0.45 (45¢ for Sabres)
3. noEdge = 0.55 - 0.45 = +10% ✅
4. Signal stores `polymarket_price: 0.45` (the NO price)
5. UI shows "BUY NO on Sabres @ 45¢"

## Immediate Action
The current Sabres signal should be **expired or dismissed** as it has an inverted side mapping and likely no real edge at current prices.

## Files Modified
- `supabase/functions/polymarket-monitor/index.ts` - Fix signal price storage
- `supabase/functions/refresh-signals/index.ts` - Add validation logging

## Verification Steps
After deployment:
1. Run `polymarket-monitor` 
2. Check logs for any new NHL signals
3. Verify `side` matches `recommended_outcome` home/away position
4. Verify `polymarket_price` reflects the correct side's price
