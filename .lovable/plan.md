

# Polymarket Data Source Upgrade Plan

## Overview

Upgrade the Polymarket integration from relying on Gamma API metadata prices to using the CLOB REST API for accurate, executable pricing data. This will also capture more market types (Totals, Spreads, Player Props) while maintaining the strict "Polymarket-first" requirement.

---

## Current State Analysis

### What's Working
- **Gamma API** for market discovery: fetching sports events via `tag_slug=sports`
- **CLOB REST API** partially implemented: `/markets/{condition_id}` endpoint used in `polymarket-monitor`
- **Basic H2H parsing**: extracting team names from "X vs Y" format titles

### Current Limitations
1. **Inaccurate Prices**: Gamma API prices can be stale (metadata, not live orderbook)
2. **Missing Market Types**: Only ~23 of 500 sports events captured (mostly H2H)
3. **No Best Bid/Ask**: System uses mid-price, not actual executable prices
4. **No Spread Data**: Can't assess slippage before recommending trades
5. **Weak Parsing**: Regex misses "Over/Under", "Cover -5.5", and prop formats

---

## Implementation Phases

### Phase 1: Database Schema Update

Add new columns to `polymarket_h2h_cache` for CLOB data:

| Column | Type | Purpose |
|--------|------|---------|
| `token_id_yes` | text | YES outcome token for CLOB API |
| `token_id_no` | text | NO outcome token for CLOB API |
| `best_bid` | numeric | Highest buy price (what you get selling) |
| `best_ask` | numeric | Lowest sell price (what you pay buying) |
| `spread_pct` | numeric | Bid-ask spread percentage |
| `orderbook_depth` | numeric | Total liquidity in orderbook |

---

### Phase 2: Enhanced Market Discovery

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Update the sync function to:

1. **Extract Token IDs from Gamma response**
   - Gamma returns `clobTokenIds` array in market data
   - Store `token_id_yes` (index 0) and `token_id_no` (index 1)

2. **Improve market type regex patterns**

   Current patterns miss many formats. New patterns will capture:

   **Totals (Over/Under):**
   - "Over 220.5 Total Points"
   - "Will Lakers score over 110.5?"
   - "Total points: 215.5+"
   
   **Spreads:**
   - "Lakers -5.5"
   - "Will Celtics cover -3.5?"
   - "Win by 5+ points"
   
   **Player Props:**
   - "LeBron score 25+ points"
   - "Will Mahomes throw 3+ TDs?"
   - "Record 10+ rebounds"

3. **Extract threshold values**
   - Parse numeric thresholds from questions (e.g., 220.5, -5.5, 25+)
   - Store in `extracted_threshold` column

---

### Phase 3: CLOB REST API Integration

**File: `supabase/functions/polymarket-monitor/index.ts`**

Replace metadata pricing with live CLOB execution prices:

1. **Batch Price Fetch**
   ```text
   POST https://clob.polymarket.com/prices
   Body: { "token_ids": ["token1", "token2", ...] }
   Response: {
     "token1": { "BUY": "0.45", "SELL": "0.46" },
     "token2": { "BUY": "0.55", "SELL": "0.56" }
   }
   ```

2. **Spread Fetch**
   ```text
   POST https://clob.polymarket.com/spreads
   Body: [{ "token_id": "token1" }, ...]
   Response: { "token1": "0.02", ... }
   ```

3. **Benefits:**
   - Use `best_ask` as the actual buy price (not mid-price)
   - Factor spread into net edge calculation
   - More accurate slippage estimation

---

### Phase 4: Signal Enhancement

Update signal creation to include:
- Best bid/ask prices for execution reality
- Spread percentage for cost calculation
- Token IDs for direct trading links (already partially implemented)

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add 6 new columns to `polymarket_h2h_cache` |
| `supabase/functions/polymarket-sync-24h/index.ts` | Extract token IDs from Gamma, improve market type regex, extract thresholds |
| `supabase/functions/polymarket-monitor/index.ts` | Add batch CLOB price/spread fetching, update edge calculation |

---

## Technical Details

### Token ID vs Condition ID
- **Condition ID**: Identifies the market (e.g., "Will Lakers win?")
- **Token ID**: Identifies a specific outcome (YES or NO token)
- CLOB API requires Token IDs for price lookups
- Gamma API provides both in the `clobTokenIds` field

### CLOB API Endpoints

| Endpoint | Purpose | Current Status |
|----------|---------|----------------|
| `GET /markets/{condition_id}` | Market metadata | Already used |
| `POST /prices` | Batch price lookup | **Not used** |
| `POST /spreads` | Bid-ask spread | **Not used** |
| `GET /book?token_id=X` | Full orderbook | **Not used** |

---

## Expected Outcomes

| Metric | Current | After Upgrade |
|--------|---------|---------------|
| Price accuracy | Stale (Gamma metadata) | Live (CLOB orderbook) |
| Market coverage | ~23/500 sports events | ~100+/500 |
| Spread visibility | None | Yes (bid-ask) |
| O/U markets captured | ~5% | ~80%+ |
| Slippage estimation | Basic | Accurate |

---

## Risk Considerations

1. **Rate Limits**: CLOB API may have undocumented rate limits - will implement batching
2. **Token ID Mapping**: Need to correctly extract from Gamma's `clobTokenIds` field
3. **Price Staleness**: Even with CLOB, prices can move between fetch and execution
4. **Backward Compatibility**: Must handle existing cache entries without token IDs

---

## Future Phase (Not in This Implementation)

**WebSocket Integration** for real-time price updates:
- Connect to `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- Subscribe to asset_ids of monitored events
- Instant edge detection (< 1 second vs 5-minute polling)

*Note: Edge Functions have a 5-minute execution limit, so this would require additional infrastructure work.*

