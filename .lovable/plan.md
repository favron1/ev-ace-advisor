

# Implementation Plan: Fix CLOB Price Parsing Bug

## Problem Summary

The system displays incorrect Polymarket prices (e.g., 71¢ instead of the actual 50¢) because of a data parsing mismatch between the CLOB API response format and how it's consumed.

**Root Cause**: The CLOB `/prices` API returns price data in an object format:
```json
{ "token_id": { "BUY": "0.50" } }
```

But two edge functions incorrectly expect a simple string:
```typescript
parseFloat(clobPrices[tokenId])  // Returns NaN when tokenId value is an object!
```

## Identified Bugs

### Bug 1: `refresh-signals/index.ts` - Lines 417-427

**Current (Broken):**
```typescript
if (tokenId && clobPrices[tokenId]) {
  livePrice = parseFloat(clobPrices[tokenId]);  // NaN - it's an object!
}
```

**Expected API Response:**
```json
{ "22027783...": { "BUY": "0.50" } }
```

### Bug 2: `polymarket-monitor/index.ts` - Lines 1338-1339

When refreshing existing signals, always stores YES price regardless of signal side:
```typescript
polymarket_yes_price: freshPrice,
polymarket_price: freshPrice,  // BUG: Should be (1 - freshPrice) for NO-side signals
```

## Technical Changes

### File 1: `supabase/functions/refresh-signals/index.ts`

#### Change 1: Update Interface (line 50-52)

```typescript
// BEFORE
interface ClobPriceResponse {
  [tokenId: string]: string;
}

// AFTER
interface ClobPriceResponse {
  [tokenId: string]: { BUY?: string; SELL?: string } | string;
}
```

#### Change 2: Fix Price Extraction (lines 417-430)

```typescript
// BEFORE
if (tokenId && clobPrices[tokenId]) {
  livePrice = parseFloat(clobPrices[tokenId]);
}

// AFTER
if (tokenId && clobPrices[tokenId]) {
  const priceData = clobPrices[tokenId];
  if (typeof priceData === 'object' && priceData !== null) {
    // CLOB returns { BUY: "0.50", SELL: "0.48" }
    livePrice = parseFloat(priceData.BUY || priceData.SELL || '0');
  } else if (typeof priceData === 'string') {
    livePrice = parseFloat(priceData);
  }
}

// Same fix for opposite price:
if (oppositeTokenId && clobPrices[oppositeTokenId]) {
  const priceData = clobPrices[oppositeTokenId];
  if (typeof priceData === 'object' && priceData !== null) {
    oppositePrice = parseFloat(priceData.BUY || priceData.SELL || '0');
  } else if (typeof priceData === 'string') {
    oppositePrice = parseFloat(priceData);
  }
}
```

### File 2: `supabase/functions/polymarket-monitor/index.ts`

#### Change 1: Fix Signal Update Price Logic (lines 1335-1343)

When refreshing prices for existing active signals, respect the signal's `side`:

```typescript
// BEFORE
await supabase
  .from('signal_opportunities')
  .update({
    polymarket_yes_price: freshPrice,
    polymarket_price: freshPrice,  // BUG: Always YES price
    polymarket_volume: cache.volume || 0,
    polymarket_updated_at: now.toISOString(),
  })
  .eq('id', signal.id);

// AFTER
// Fetch signal's side to determine correct price
const { data: signalData } = await supabase
  .from('signal_opportunities')
  .select('side')
  .eq('id', signal.id)
  .single();

const signalSide = signalData?.side || 'YES';
const signalPrice = signalSide === 'YES' ? freshPrice : (1 - freshPrice);

await supabase
  .from('signal_opportunities')
  .update({
    polymarket_yes_price: freshPrice,
    polymarket_price: signalPrice,  // FIX: Side-adjusted price
    polymarket_volume: cache.volume || 0,
    polymarket_updated_at: now.toISOString(),
  })
  .eq('id', signal.id);
```

**Optimization**: Instead of fetching each signal's side in the loop, modify the query at line 1311 to include `side`:

```typescript
const { data: activeSignals } = await supabase
  .from('signal_opportunities')
  .select('id, polymarket_condition_id, side')  // Add side
  .eq('status', 'active');
```

Then use `signal.side` directly.

## Summary of Changes

| File | Location | Change |
|------|----------|--------|
| `refresh-signals/index.ts` | Lines 50-52 | Update interface to handle object response |
| `refresh-signals/index.ts` | Lines 417-430 | Parse CLOB response as object, extract `BUY` price |
| `polymarket-monitor/index.ts` | Line 1313 | Include `side` in active signals query |
| `polymarket-monitor/index.ts` | Lines 1335-1343 | Use signal's side to set correct `polymarket_price` |

## Expected Result

After fix:
- `polymarket_yes_price`: Always stores the YES token price (e.g., 50¢)
- `polymarket_price`: Stores the side-adjusted price (YES=50¢, NO=50¢)
- UI displays correct cents: "29¢ share" for NO-side bets on 71¢ YES markets → "50¢ share" for accurate pricing

## Testing

1. Deploy updated functions
2. Run `refresh-signals` and verify logs show correct prices (not NaN)
3. Check signal database for accurate price values
4. Verify UI displays correct cent prices

