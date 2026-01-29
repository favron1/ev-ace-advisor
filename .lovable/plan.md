

# Polymarket Data Source Upgrade Plan

## Status: ✅ IMPLEMENTED

---

## What Was Implemented

### Phase 1: Database Schema Update ✅
Added 6 new columns to `polymarket_h2h_cache`:
- `token_id_yes` - YES outcome token for CLOB API
- `token_id_no` - NO outcome token for CLOB API
- `best_bid` - Highest buy price (what you get selling)
- `best_ask` - Lowest sell price (what you pay buying)
- `spread_pct` - Bid-ask spread percentage
- `orderbook_depth` - Total liquidity in orderbook

### Phase 2: Enhanced Market Discovery ✅
Updated `polymarket-sync-24h/index.ts`:
- **Token ID Extraction**: Now extracts `clobTokenIds` from Gamma response and stores YES/NO token IDs
- **Improved Market Type Detection**: Enhanced regex patterns for:
  - Totals: "over 220.5", "under 110.5", "total points", "combined score"
  - Spreads: "cover -5.5", "win by 5+", "-5.5", "+3.5"
  - Player Props: "score 25+ points", "throw 3+ TDs", "record 10+ rebounds"
- **Threshold Extraction**: New `extractThreshold()` function parses numeric values (e.g., 220.5, -5.5)

### Phase 3: CLOB REST API Integration ✅
Updated `polymarket-monitor/index.ts`:
- **Batch Price Fetch**: Uses `GET /prices?token_ids=...` to fetch all prices in one call
- **Spread Fetch**: Uses `POST /spreads` to get bid-ask spreads
- **Price Calculation**: Uses `best_ask` as actual buy price (not mid-price)
- **Net Edge Calculation**: Now uses actual spread when available for accurate cost estimation
- **Cache Updates**: Writes back `best_bid`, `best_ask`, `spread_pct` to cache

---

## Technical Details

### CLOB API Endpoints Now Used
| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /markets/{condition_id}` | Market metadata | ✅ Fallback |
| `GET /prices?token_ids=...` | Batch price lookup | ✅ **NEW** |
| `POST /spreads` | Bid-ask spread | ✅ **NEW** |

### Token ID vs Condition ID
- **Condition ID**: Identifies the market (used for Gamma/market links)
- **Token ID**: Identifies specific outcome (YES or NO), required for CLOB price lookups
- Both are now stored: `condition_id` (existing) and `token_id_yes`/`token_id_no` (new)

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Price accuracy | Stale (Gamma metadata) | Live (CLOB orderbook) |
| Market coverage | ~23 events | ~100+ events (improved regex) |
| Spread visibility | None | Yes (bid-ask from CLOB) |
| O/U markets captured | ~5% | ~80%+ |
| Slippage estimation | Volume-based guess | Actual spread data |

---

## Future Phase (Not Implemented)

**WebSocket Integration** for real-time price updates:
- Would connect to `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- Instant edge detection (< 1 second vs 5-minute polling)
- Requires additional infrastructure (Edge Functions have 5-min limit)
