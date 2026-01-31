

## Enhance Refresh Signals to Fetch Live Data

Currently, when you press the "Refresh" button, it only updates urgency levels and time labels using **cached data** from the database. This means you're not seeing live Polymarket prices or fresh bookmaker odds.

This plan will upgrade the refresh function to actually fetch **live data** from both sources.

---

### What Will Change

**Current Behavior (No API Calls):**
- Updates countdown timers (e.g., "2h" → "1h 45m")
- Recalculates urgency levels (low → normal → high → critical)
- Expires signals that have passed their start time
- Does NOT fetch fresh prices

**New Behavior (Live Data Refresh):**
1. Fetch live Polymarket CLOB prices using token IDs from the cache
2. Recalculate edge percentages with fresh prices
3. Update volume and liquidity data
4. Auto-expire signals where edge has dropped below threshold
5. Update all timestamps to show fresh data

---

### Data Flow

```text
User Clicks Refresh
        │
        ▼
┌─────────────────────────────────────────┐
│ 1. Get Active Signals from DB           │
│    - polymarket_condition_id            │
│    - bookmaker_probability (cached)     │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ 2. Join with polymarket_h2h_cache       │
│    - Get token_id_yes, token_id_no      │
│    - Get current cached prices          │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ 3. Batch Fetch CLOB Prices (Polymarket) │
│    - POST /prices with token IDs        │
│    - Get live bid/ask for each market   │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ 4. Recalculate Edge for Each Signal     │
│    - new_edge = bookmaker_prob - ask    │
│    - Apply cost model (fees, slippage)  │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ 5. Update Signals                       │
│    - Fresh polymarket_price             │
│    - Recalculated edge_percent          │
│    - Updated timestamps & urgency       │
│    - Expire if edge < threshold         │
└─────────────────────────────────────────┘
```

---

### Technical Implementation

#### 1. Update Edge Function: `supabase/functions/refresh-signals/index.ts`

Current: ~100 lines of urgency/time-label logic only

New additions:
- Import CLOB price fetching logic (reuse from polymarket-monitor)
- Join active signals with `polymarket_h2h_cache` to get token IDs
- Batch POST to Polymarket CLOB API (`https://clob.polymarket.com/prices`)
- Recalculate edge: `edge = bookmaker_fair_prob - clob_ask_price`
- Apply net edge calculation (platform fees, spread, slippage)
- Update signals with fresh prices and edges
- Expire signals where net edge drops below 2%

Key changes:
```typescript
// Fetch CLOB prices for all active signals
const tokenIds = signals.map(s => [s.token_id_yes, s.token_id_no]).flat();
const clobPrices = await fetchClobPrices(tokenIds);

// Recalculate edge with live prices
for (const signal of signals) {
  const livePrice = signal.side === 'YES' 
    ? clobPrices.get(signal.token_id_yes)?.ask 
    : clobPrices.get(signal.token_id_no)?.ask;
    
  const newEdge = signal.bookmaker_probability - livePrice;
  // ... update if changed
}
```

#### 2. Update Frontend Response Display

Current toast message:
```
"3 expired, 2 updated, 1 unchanged"
```

New toast message:
```
"Refreshed 6 signals: 2 price updates, 1 edge improved, 1 expired (edge gone)"
```

The `refreshSignals` function in `useSignals.ts` already handles the response - we just need richer data from the backend.

---

### API Cost Considerations

- **Polymarket CLOB API**: Free, no rate limits
- **The Odds API**: NOT called during refresh (uses cached bookmaker probabilities)
- **Impact**: Refreshing remains lightweight but now provides live market prices

The bookmaker probability (`bookmaker_prob_fair`) is cached at signal creation time and represents the "fair value" from sharp books. This doesn't need refreshing as frequently as Polymarket prices since bookmaker lines are more stable.

---

### Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Token ID missing from cache | Skip price update, keep existing data |
| CLOB API returns no price | Keep cached price, log warning |
| Edge drops below 2% | Auto-expire signal with reason |
| Edge improves | Update signal, keep active |
| Firecrawl-sourced signals | Handle separately (no token IDs) |

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/refresh-signals/index.ts` | Add CLOB price fetching, edge recalculation, enhanced response |
| `src/hooks/useSignals.ts` | Update toast message to show richer refresh details |
| `src/lib/api/arbitrage.ts` | No changes needed (already handles refresh response) |

---

### Expected Result

After clicking "Refresh":
1. All signal cards will show **live Polymarket prices** (not stale cached data)
2. Edge percentages will be **recalculated** against current market conditions
3. Signals where the edge has disappeared will be **auto-expired**
4. Countdown timers and urgency levels will be **updated** as before
5. Toast will show a **detailed summary** of what changed

This ensures you're always seeing the current market reality, not outdated data from when signals were first detected.

