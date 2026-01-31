# Fix: Polymarket Direct Links - COMPLETED ✅

## What Was Fixed

The "Trade on Poly" button now correctly links to Polymarket markets using the `slug` field from the Gamma API.

### Changes Made

1. **Database Migration**: Added `polymarket_slug` column to:
   - `polymarket_h2h_cache` 
   - `signal_opportunities`

2. **Backend - polymarket-sync-24h**: 
   - Extracts `event.slug` from Gamma API responses
   - Stores it in the `polymarket_slug` column during cache upsert

3. **Backend - polymarket-monitor**:
   - Copies `polymarket_slug` from cache when creating new signals

4. **Frontend - SignalCard.tsx**:
   - Removed hardcoded `TEAM_CODES` mapping and broken week calculation logic
   - New `getPolymarketDirectUrl()` uses slug-based URLs with fallbacks:
     - **Priority 1**: `polymarket.com/event/[slug]` (when slug available)
     - **Priority 2**: `polymarket.com/markets?conditionId=[0x...]` (for hex condition IDs)
     - **Priority 3**: `polymarket.com/search?query=[team]` (fallback search)

---

## URL Format

| Scenario | URL Format |
|----------|------------|
| Gamma API market (has slug) | `https://polymarket.com/event/nhl-red-wings-vs-avalanche-january-31` |
| Market with 0x condition ID | `https://polymarket.com/markets?conditionId=0x...` |
| Firecrawl-scraped (no slug) | `https://polymarket.com/search?query=Detroit%20Red%20Wings` |

---

## Testing

To populate slugs for existing markets, run a new sync:
1. Click "Sync Polymarket" in the terminal
2. New signals will automatically have working direct links
