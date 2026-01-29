
## Fix Polymarket Price Refresh - CLOB API Integration

### Problem Summary

The signal detection pipeline is failing because:

1. **Polymarket H2H prices are stuck at 0.5** - The Gamma API returns placeholder prices that aren't real executable prices
2. **Edge calculations are wrong** - With `poly_price = 0.5`, even good opportunities show as negative edge
3. **NBA H2H markets don't exist** - Polymarket only offers NBA futures, not individual game matchups

### Solution

Add a **CLOB price refresh step** after syncing markets from Gamma. The CLOB API returns real order book prices (best bid/ask) that can be used for accurate edge calculation.

---

### Implementation Changes

#### File 1: `supabase/functions/sync-polymarket-h2h/index.ts`

Add CLOB batch price refresh after upserting markets:

```text
CURRENT FLOW:
1. Fetch events from Gamma API → Get condition_ids
2. Parse prices (often 0.5 placeholder) 
3. Store in polymarket_h2h_cache
4. Done (with stale prices!)

NEW FLOW:
1. Fetch events from Gamma API → Get condition_ids
2. Parse initial prices (may be placeholder)
3. Store in polymarket_h2h_cache
4. ✨ NEW: Batch fetch CLOB prices for all H2H condition_ids
5. ✨ NEW: Update cache with real CLOB prices
```

**Changes:**
- Add `refreshClobPrices()` function using Polymarket CLOB batch API
- Call after initial upsert, targeting only `market_type = 'h2h'` entries
- CLOB API endpoint: `POST https://clob.polymarket.com/prices` with token_ids array

#### File 2: `supabase/functions/watch-mode-poll/index.ts`

Already filters for `market_type = 'h2h'` correctly - no changes needed if sync provides real prices.

---

### Technical Details

**CLOB Batch Price API:**
```
POST https://clob.polymarket.com/prices
Content-Type: application/json

{
  "[condition_id_1]": ["BUY"],
  "[condition_id_2]": ["BUY"],
  ...
}
```

Response returns executable YES prices for each token.

**Why this works:**
- Gamma API = metadata only (title, volume, condition_id)
- CLOB API = live order book (executable prices, liquidity depth)

---

### Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| H2H markets with real prices | 0 | ~23 |
| Edge calculation accuracy | Broken (all show -edge) | Correct |
| NHL game signals | 0 (false negatives) | Expected 5-10 per day |
| NBA game signals | 0 (markets don't exist) | 0 (no change - markets still don't exist) |

**Note:** NBA H2H markets don't exist on Polymarket, so NBA game signals will remain unavailable. However, NHL and soccer H2H games will start surfacing properly.

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/sync-polymarket-h2h/index.ts` | Add CLOB batch price refresh after Gamma sync |

---

### Alternative: Real-Time CLOB in Watch-Mode-Poll

If sync-based refresh is too slow (prices change fast), an alternative is to:
1. Keep Gamma sync as-is (metadata only)
2. Move CLOB refresh to `watch-mode-poll` - fetch live prices per-event during each 5-minute poll

This ensures prices are fresh at detection time, not sync time.

---

### Summary

The core fix is simple: **fetch real CLOB prices instead of accepting Gamma's 0.5 placeholders**. This will unlock NHL and soccer H2H signal detection. NBA individual game betting remains unavailable due to Polymarket's market coverage (only futures offered).
