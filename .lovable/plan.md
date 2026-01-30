
# Cleanup: Remove Unused Polymarket Components

## What We're Removing

### 1. PolymarketAvailability Component
**Location:** `src/components/terminal/PolymarketAvailability.tsx`

**Why remove:**
- Makes direct Gamma API calls instead of using your cache
- Only fetches NBA markets (not NHL, NFL, CBB)
- Currently broken ("Failed to fetch" error in your screenshot)
- Completely redundant - your `polymarket_h2h_cache` already has this data

### 2. MarketsSidebar + polymarket_markets Table
**Location:** `src/components/terminal/MarketsSidebar.tsx`

**Why remove:**
- Shows political markets (Chelsea Clinton, Andrew Yang, LeBron James presidential bids)
- Shows long-dated championship futures (Grizzlies winning 2026 NBA Finals)
- These markets have NO bookmaker coverage - you can't detect edges
- They're not within the 24-hour window your system monitors
- The `polymarket_markets` table is completely separate from your working `polymarket_h2h_cache`

### 3. usePolymarket Hook
**Location:** `src/hooks/usePolymarket.ts`

**Why remove:**
- Only used by MarketsSidebar to fetch from the wrong table
- Not connected to your edge detection system

---

## Files to Delete

| File | Reason |
|------|--------|
| `src/components/terminal/PolymarketAvailability.tsx` | Broken, redundant, NBA-only |
| `src/components/terminal/MarketsSidebar.tsx` | Shows useless political/futures markets |
| `src/hooks/usePolymarket.ts` | Only supports the sidebar |
| `src/lib/api/polymarket-cache.ts` | Duplicate of usePolymarketCache |

## Files to Update

### Terminal.tsx
Remove imports and usage of:
- `PolymarketAvailability`
- `MarketsSidebar`
- `usePolymarket`

---

## What Stays

**PolymarketCacheStats** - This is your main component that:
- Shows the `polymarket_h2h_cache` data (real H2H games)
- Has the "Sync Cache" button
- Shows sport breakdown (NHL, NBA, NFL, CBB)
- Shows freshness status

---

## Database Cleanup (Optional)

The `polymarket_markets` table contains political futures that are never used for edge detection. We can either:
- Leave it (harmless, just takes up space)
- Delete it later if you want to clean up

---

## Result

After this cleanup:
- Terminal shows only the **PolymarketCacheStats** card (your real H2H cache)
- No more confusing political markets
- No more "Failed to fetch" errors
- Simpler, focused UI for your arbitrage workflow
