

# Fix: Polymarket Price Not Updating in Signal Feed

## Problem Analysis

The signal cards show outdated Polymarket prices even though polls are running successfully. The user's screenshot shows a price discrepancy between what's displayed in the terminal and the actual Polymarket price.

### Root Cause

After detailed investigation, I found **two interconnected bugs** in the price refresh logic in `polymarket-monitor/index.ts`:

1. **Inverted Bid/Ask Mapping**: The CLOB price fetch function maps prices incorrectly:
   ```typescript
   // Current (WRONG):
   bid: parseFloat(pd.BUY || '0'),   // BUY should be ask
   ask: parseFloat(pd.SELL || '0'),  // SELL should be bid
   ```
   
   In market terminology:
   - BUY price = what you pay = **ask** (market asks this price from you)
   - SELL price = what you receive = **bid** (market bids this to buy from you)

2. **Wrong Price Selection**: The signal update uses `ask` thinking it's the buy price, but due to bug #1, it's actually the SELL price:
   ```typescript
   const freshPrice = prices.ask > 0 ? prices.ask : prices.bid;
   // This grabs SELL price instead of BUY price
   ```

This creates price discrepancies between:
- Cache `yes_price`: 50¢ (correct BUY price from sync functions)
- Signal `polymarket_price`: 51¢ (incorrect, using swapped SELL price)

---

## Solution

### Fix 1: Correct the Bid/Ask Mapping in CLOB Fetch

In `supabase/functions/polymarket-monitor/index.ts`, fix the `fetchClobPrices` function to correctly map CLOB API response:

```typescript
// FIXED mapping:
priceMap.set(tokenId, {
  bid: parseFloat(pd.SELL || '0'),  // SELL = what market pays you = bid
  ask: parseFloat(pd.BUY || '0'),   // BUY = what you pay = ask
});
```

### Fix 2: Use Consistent Price for Signal Updates

Update the signal refresh logic to use the BUY price (ask) consistently, which is the executable entry price:

```typescript
const freshPrice = prices.ask > 0 ? prices.ask : prices.bid;
```

After fix #1, this will correctly select the BUY price.

### Fix 3: Use Cache `yes_price` as Fallback

As an additional safeguard, if CLOB prices aren't available, fall back to the cache's `yes_price` which is already correctly sourced:

```typescript
// Get fresh price from CLOB, or fall back to cache
let freshPrice = 0;
if (clobPrices.has(cache.token_id_yes)) {
  const prices = clobPrices.get(cache.token_id_yes)!;
  freshPrice = prices.ask > 0 ? prices.ask : prices.bid;
} else {
  freshPrice = cache.yes_price; // Fallback to cache
}
```

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Fix bid/ask mapping in `fetchClobPrices` (lines 586-594) |
| `supabase/functions/polymarket-monitor/index.ts` | Add cache fallback in signal refresh (lines 1042-1065) |

### Impact

- Signal cards will display the correct live Polymarket price
- Edge calculations will use accurate BUY prices
- Price timestamps will reflect actual updates (not just timestamp updates)

### Testing

After deployment:
1. Trigger a poll via the terminal
2. Verify signal prices match cache `yes_price` values
3. Confirm `polymarket_updated_at` timestamps update with each poll
4. Cross-check displayed prices against live Polymarket website

