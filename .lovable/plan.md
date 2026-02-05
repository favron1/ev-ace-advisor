

# Fix: Tiered Polymarket Price Verification System

## Problem Summary

The current pricing pipeline has significant gaps:

| Source | Count | Status | Issue |
|--------|-------|--------|-------|
| CLOB Verified | 105 | Working | Real executable prices |
| Firecrawl | 53 | Broken | 32 no orderbook, 21 missing tokens |
| Gamma API | 8 | Partial | Stuck at 50c placeholder |

The core issue: Firecrawl creates synthetic condition_ids (`firecrawl_nba_hou_okc`) that don't map to real Polymarket markets. Meanwhile, valid CLOB markets exist for the same games but with different condition_ids.

---

## Solution: Implement Tiered Price Verification

Create a robust fallback chain that always attempts to resolve real executable prices:

```text
Tier 1: CLOB API Direct (highest confidence - 100%)
   ↓ if fails
Tier 2: Gamma API Search (high confidence - 95%)
   ↓ if fails  
Tier 3: Firecrawl HTML Scrape with __NEXT_DATA__ extraction (medium - 80%)
   ↓ if fails
Tier 4: CLOB Search API by team names (medium-low - 75%)
   ↓ if fails
Tier 5: On-chain CTF Exchange event validation (low - 60%)
   ↓ if all fail
Mark as UNTRADEABLE with specific reason
```

---

## Implementation Details

### Part 1: Fix Duplicate Market Problem

File: `supabase/functions/polymarket-sync-24h/index.ts`

**Problem**: Firecrawl creates `firecrawl_nba_hou_okc` condition IDs that never match CLOB.

**Fix**: Before creating Firecrawl entries, check if a CLOB-verified market already exists for the same teams:

```text
// In Firecrawl processing loop (~line 860)
// BEFORE creating synthetic condition_id, check for existing real market
const { data: existingMarket } = await supabase
  .from('polymarket_h2h_cache')
  .select('condition_id, yes_price, token_id_yes')
  .eq('source', 'clob_verified')
  .or(`team_home.ilike.%${game.team1Name.split(' ').pop()}%,team_home.ilike.%${game.team2Name.split(' ').pop()}%`)
  .maybeSingle();

if (existingMarket?.condition_id) {
  // Skip Firecrawl entry - real market exists
  console.log(`[FIRECRAWL] Skipping ${game.team1Name} vs ${game.team2Name} - CLOB market exists`);
  return;
}
```

### Part 2: Aggressive Token Resolution for Firecrawl Markets

File: `supabase/functions/polymarket-sync-24h/index.ts`

**Problem**: 21 Firecrawl markets have `MISSING_TOKENS`.

**Fix**: After main sync, run tokenize-market for all markets missing tokens:

```text
// After line 978 (after existing backfill)
// PHASE 2: Use tokenize-market edge function for remaining untokenized markets
const { data: stillMissingTokens } = await supabase
  .from('polymarket_h2h_cache')
  .select('condition_id, team_home, team_away, sport_category, polymarket_slug')
  .is('token_id_yes', null)
  .eq('status', 'active')
  .limit(20);

if (stillMissingTokens && stillMissingTokens.length > 0) {
  console.log(`[POLY-SYNC-24H] Running tokenize-market for ${stillMissingTokens.length} markets...`);
  
  for (const market of stillMissingTokens) {
    // Build market URL if we have slug
    const marketUrl = market.polymarket_slug 
      ? `https://polymarket.com/event/${market.polymarket_slug}`
      : null;
    
    // Call tokenize-market with all available data
    const tokenResult = await tokenizeMarket({
      conditionId: market.condition_id.startsWith('firecrawl_') ? undefined : market.condition_id,
      teamHome: market.team_home,
      teamAway: market.team_away,
      sport: market.sport_category,
      marketUrl,
    });
    
    if (tokenResult.success) {
      await supabase
        .from('polymarket_h2h_cache')
        .update({
          condition_id: tokenResult.conditionId, // Replace synthetic ID with real one
          token_id_yes: tokenResult.tokenIdYes,
          token_id_no: tokenResult.tokenIdNo,
          token_source: tokenResult.tokenSource,
          tradeable: true,
          untradeable_reason: null,
        })
        .eq('condition_id', market.condition_id);
    }
  }
}
```

### Part 3: Add CLOB Orderbook Validation

File: `supabase/functions/polymarket-sync-24h/index.ts`

**Problem**: 32 markets have tokens but `NO_ORDERBOOK_EXISTS`.

**Fix**: During CLOB price refresh, validate orderbook depth exists:

```text
// In CLOB price refresh section (~line 1258)
for (const [tokenId, priceData] of Object.entries(allPrices)) {
  const buyPrice = parseFloat(priceData.BUY || '0');
  const sellPrice = parseFloat(priceData.SELL || '0');
  
  // NEW: Validate orderbook has liquidity (BUY and SELL prices exist)
  const hasOrderbook = buyPrice > 0 && sellPrice > 0;
  
  if (!hasOrderbook) {
    // Mark as untradeable - no active orderbook
    await supabase
      .from('polymarket_h2h_cache')
      .update({
        tradeable: false,
        untradeable_reason: 'NO_ORDERBOOK_EXISTS',
      })
      .eq('condition_id', conditionId);
    continue;
  }
  
  // Validate bid-ask spread is reasonable (< 20%)
  const spread = buyPrice - sellPrice;
  if (spread > 0.20) {
    console.log(`[CLOB] Wide spread detected: ${conditionId} bid=${sellPrice} ask=${buyPrice} spread=${(spread*100).toFixed(0)}%`);
  }
  
  // Continue with price update...
}
```

### Part 4: On-Chain Validation Tier (Future Enhancement)

File: Create `supabase/functions/_shared/onchain-validator.ts`

For markets that fail API validation, add on-chain CTF Exchange validation:

```text
// Query Polygon for OrderFilled events to validate token exists
// This uses Bitquery or direct RPC calls
async function validateOnChain(tokenId: string): Promise<boolean> {
  // Check if token has any recent trades on CTF Exchange
  // Contract: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E (Polygon)
  
  // Option 1: Use Bitquery GraphQL API
  // Option 2: Use Polygon RPC getLogs for TokenRegistered events
  // Option 3: Use Alchemy/Infura trace APIs
  
  return hasRecentActivity;
}
```

### Part 5: Cleanup Duplicate Firecrawl Entries

Database migration to remove synthetic Firecrawl entries where real CLOB market exists:

```text
-- Find and expire duplicate Firecrawl entries
WITH real_markets AS (
  SELECT DISTINCT team_home, team_away
  FROM polymarket_h2h_cache
  WHERE source = 'clob_verified' AND status = 'active'
)
UPDATE polymarket_h2h_cache fc
SET status = 'expired', 
    untradeable_reason = 'DUPLICATE_OF_CLOB_MARKET'
FROM real_markets rm
WHERE fc.source = 'firecrawl'
  AND fc.status = 'active'
  AND (
    fc.team_home = rm.team_home OR fc.team_home = rm.team_away
  )
  AND (
    fc.team_away = rm.team_home OR fc.team_away = rm.team_away
  );
```

---

## Expected Results

| Metric | Current | After Fix |
|--------|---------|-----------|
| CLOB-verified markets | 105 | 140+ |
| Untradeable (missing tokens) | 21 | 5 |
| Untradeable (no orderbook) | 32 | 20* |
| Duplicate Firecrawl entries | ~30 | 0 |
| Markets with real prices | 63% | 90%+ |

*Some markets genuinely have no orderbook - these are correctly marked untradeable.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Duplicate detection, token resolution, orderbook validation |
| `supabase/functions/tokenize-market/index.ts` | No changes - already implements tiered extraction |
| Database | Cleanup duplicate Firecrawl entries |
| Future: `_shared/onchain-validator.ts` | On-chain CTF Exchange validation |

---

## Technical Notes

### Why Firecrawl Creates Duplicate Markets

The current flow:
1. Gamma API returns some games with condition_ids
2. Firecrawl scrapes NBA page and creates synthetic IDs like `firecrawl_nba_hou_okc`
3. Both get inserted, but only Gamma-sourced ones have real CLOB tokens
4. Firecrawl entries fail token resolution because the synthetic ID doesn't exist in CLOB

### Why NO_ORDERBOOK_EXISTS

Some Polymarket markets are created but not yet trading:
- Pre-game markets with no liquidity providers
- Markets created by API but not listed on UI
- Markets awaiting resolution

These should remain marked untradeable until orderbook activity appears.

### The Tiered System You Described

The existing `tokenize-market` function already implements this:
1. CLOB API Direct (confidence: 100%)
2. Gamma API Search (confidence: 95%)
3. Firecrawl HTML __NEXT_DATA__ (confidence: 80%)
4. CLOB Search API (confidence: 75%)

The fix is to:
- Call this during sync for all markets
- Replace synthetic condition_ids with real ones when found
- Skip Firecrawl entry creation when CLOB market already exists

