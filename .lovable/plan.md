
# Fix: CLOB Price Refresh - Request Both BUY and SELL Sides

## Problem Identified

The CLOB price refresh is broken because we only request the BUY side from the Polymarket CLOB API. The API requires separate entries for BUY and SELL to get both prices.

**Current Code (Broken):**
```typescript
const requestBody = batch.map(token_id => ({
  token_id,
  side: 'BUY' as const  // Only requesting BUY
}));
```

**Result:** `BUY=0.56 SELL=0` → `hasOrderbook = false` → All 105 markets marked `NO_ORDERBOOK_EXISTS`

## Solution

Modify the CLOB batch request to include both BUY and SELL entries for each token:

```typescript
const requestBody: Array<{ token_id: string; side: 'BUY' | 'SELL' }> = [];
for (const token_id of batch) {
  requestBody.push({ token_id, side: 'BUY' });
  requestBody.push({ token_id, side: 'SELL' });
}
```

## File to Modify

`supabase/functions/polymarket-sync-24h/index.ts`

## Changes

### 1. Fix the batch request (lines 1363-1368)

**Before:**
```typescript
for (let i = 0; i < allTokenIds.length; i += batchSize) {
  const batch = allTokenIds.slice(i, i + batchSize);
  const requestBody = batch.map(token_id => ({
    token_id,
    side: 'BUY' as const
  }));
```

**After:**
```typescript
for (let i = 0; i < allTokenIds.length; i += batchSize) {
  const batch = allTokenIds.slice(i, i + batchSize);
  // Request BOTH BUY and SELL for each token
  const requestBody: Array<{ token_id: string; side: 'BUY' | 'SELL' }> = [];
  for (const token_id of batch) {
    requestBody.push({ token_id, side: 'BUY' });
    requestBody.push({ token_id, side: 'SELL' });
  }
```

### 2. Reduce batch size to compensate

Since we're now sending 2 entries per token, reduce batch size from 50 to 25 to stay under API limits:

```typescript
const batchSize = 25; // Was 50, now 25 since we send 2 requests per token
```

## Expected Results

| Metric | Current | After Fix |
|--------|---------|-----------|
| CLOB-verified tradeable | 0 | ~80-90 |
| NO_ORDERBOOK_EXISTS | 105 | ~15-25 |
| 50c placeholders | 20 | 0-5 |
| Valid executable prices | 0 | 80+ |

Markets that genuinely have no SELL-side liquidity will still be correctly marked as untradeable, but markets with active two-sided orderbooks will now be properly validated and tradeable.

## Firecrawl Status

Firecrawl remains partially broken for a different reason:
- 37 markets have synthetic `firecrawl_` condition IDs that don't exist on CLOB
- Many NBA H2H markets aren't on the CLOB API yet (they're visible on the UI but not trading)
- This is a known constraint documented in the architecture

The tiered token resolution from the previous fix will continue attempting to resolve these, but some markets are simply not tradeable until Polymarket officially lists them on CLOB.
