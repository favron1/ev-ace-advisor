

# Fix: Polymarket Token ID Extraction

## Problem Summary

The CLOB API integration is incomplete because token IDs are not being captured from Gamma API responses. This causes:
- `token_id_yes` and `token_id_no` columns remain NULL
- CLOB batch pricing returns 0 results (falls back to stale Gamma prices)
- No bid/ask spread data available

## Root Cause

The Gamma API response structure may differ from what we expected. The `clobTokenIds` field might be:
1. At a different path in the response (e.g., nested differently)
2. Named differently (e.g., `tokenIds`, `outcomes[0].tokenId`)
3. Only available via a separate endpoint

## Fix Plan

### Step 1: Debug Gamma API Response Structure

Add detailed logging to `polymarket-sync-24h` to see exactly what fields are available in the Gamma response:

```typescript
// Log first market's structure for debugging
if (qualifying.length > 0) {
  const sample = qualifying[0].market;
  console.log(`[POLY-SYNC-24H] Sample market fields:`, Object.keys(sample));
  console.log(`[POLY-SYNC-24H] Sample market data:`, JSON.stringify(sample).substring(0, 500));
}
```

### Step 2: Fix Token ID Extraction

Based on Polymarket documentation, the token IDs might be in:
- `market.clobTokenIds` (current attempt)
- `market.outcomes[0].clobTokenId` 
- `market.tokens[0]` and `market.tokens[1]`

Update extraction logic to try all possible paths:

```typescript
// Try multiple paths for token ID extraction
let tokenIdYes: string | null = null;
let tokenIdNo: string | null = null;

// Path 1: clobTokenIds array
if (market.clobTokenIds && Array.isArray(market.clobTokenIds)) {
  tokenIdYes = market.clobTokenIds[0] || null;
  tokenIdNo = market.clobTokenIds[1] || null;
}
// Path 2: tokens array
else if (market.tokens && Array.isArray(market.tokens)) {
  tokenIdYes = market.tokens[0]?.token_id || market.tokens[0] || null;
  tokenIdNo = market.tokens[1]?.token_id || market.tokens[1] || null;
}
// Path 3: outcomes with tokenId
else if (market.outcomes && Array.isArray(market.outcomes)) {
  tokenIdYes = market.outcomes[0]?.clobTokenId || market.outcomes[0]?.tokenId || null;
  tokenIdNo = market.outcomes[1]?.clobTokenId || market.outcomes[1]?.tokenId || null;
}
```

### Step 3: Fallback to CLOB Markets Endpoint

If Gamma doesn't provide token IDs, fetch them directly from CLOB:

```typescript
// If no token IDs from Gamma, fetch from CLOB markets endpoint
if (!tokenIdYes && conditionId) {
  try {
    const clobResp = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
    if (clobResp.ok) {
      const clobData = await clobResp.json();
      // CLOB returns tokens array with token_id fields
      if (clobData.tokens && Array.isArray(clobData.tokens)) {
        tokenIdYes = clobData.tokens.find(t => t.outcome === 'Yes')?.token_id || null;
        tokenIdNo = clobData.tokens.find(t => t.outcome === 'No')?.token_id || null;
      }
    }
  } catch (e) {
    console.warn(`[POLY-SYNC-24H] Failed to fetch CLOB market: ${conditionId}`);
  }
}
```

### Step 4: Fix Sport Misclassification

The sport detection regex is matching "Hawks" in "Blackhawks" as NBA. Fix by being more specific:

```typescript
// NHL - be more specific about Blackhawks
{ patterns: [/\bnhl\b/, /blackhawks/i, /maple leafs|canadiens|...], sport: 'NHL' },

// NBA - remove 'hawks' standalone match that conflicts
{ patterns: [/\bnba\b/, /atlanta hawks/i, /lakers|celtics|...], sport: 'NBA' },
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Add debug logging, fix token ID extraction paths, add CLOB fallback |
| `supabase/functions/polymarket-sync-24h/index.ts` | Fix sport detection regex for Blackhawks/Hawks |

## Expected Outcome

After fixes:
- Token IDs populated in `polymarket_h2h_cache`
- CLOB batch pricing returns actual bid/ask data
- Accurate spread estimation for edge calculations
- Correct sport classification

## Verification Steps

1. Deploy updated function
2. Trigger `polymarket-sync-24h` manually
3. Check logs for "Sample market fields" to see actual Gamma response structure
4. Query `polymarket_h2h_cache` to verify `token_id_yes` is populated
5. Run `polymarket-monitor` and verify "Got X prices, X spreads from CLOB" shows non-zero values

