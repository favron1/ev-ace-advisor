

## Revert to 24-Hour Window + Expand to ALL Market Types

### Summary

The current system was recently expanded to a 7-day window but is restricted to H2H markets only. You want to go back to a **24-hour window** but capture **ALL market types** offered on Polymarket (H2H, Totals, Spreads, Player Props). This gives you comprehensive coverage of every tradeable opportunity within the critical execution window.

---

### What Changes

| Setting | Current | Proposed |
|---------|---------|----------|
| Time Window | 7 days | **24 hours** |
| Market Types | H2H only | **All (H2H, Totals, Spreads, Props)** |
| Sports Coverage | All sports | All sports (unchanged) |
| Movement Tracking | All markets | All markets (unchanged) |

---

### Why 24 Hours + All Markets

- **24-hour window**: Sharp money moves happen closest to event start; longer horizons add noise without increasing actionable edges
- **All market types**: Polymarket offers Totals (Over/Under 220.5), Spreads (-5.5), and Props - each represents an independent edge opportunity
- **Comprehensive coverage**: Every market within 24 hours gets monitored for both price edges AND bookmaker movement

---

### Technical Changes

#### File: `supabase/functions/polymarket-sync-24h/index.ts`

**Change 1: Revert to 24-hour window**
```typescript
// BEFORE (current):
const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

// AFTER:
const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
```

**Change 2: Process ALL markets per event (not just H2H)**
```typescript
// BEFORE: Only finds H2H market, skips if not found
const h2hMarket = markets.find(...); // Filters out totals/spreads
if (!h2hMarket) continue;

// AFTER: Process ALL valid markets from each event
for (const market of markets) {
  const marketType = detectMarketType(market.question);
  // Upsert each market separately with its own condition_id
  // Track H2H, total, spread, player_prop types
}
```

**Change 3: Update logging to reflect new scope**
- Change log messages from "No H2H market" to "Market type: X"
- Track stats for each market type discovered

#### File: `supabase/functions/polymarket-monitor/index.ts`

**Change: Support all market types in matching logic**
- The monitor already fetches `h2h,spreads,totals` from bookmakers
- Needs to match Polymarket totals to bookmaker totals (same threshold)
- Needs to match Polymarket spreads to bookmaker spreads (same line)

---

### Data Flow After Change

```text
FULL SCAN → Fetch ALL Polymarket sports markets ending in 24h
         → For EACH event:
              → Process H2H market (if exists)
              → Process Total (O/U) market (if exists)
              → Process Spread market (if exists)
              → Process Player Props (if exists)
         → Upsert ALL to polymarket_h2h_cache
         
BACKGROUND MONITOR (every 5 min)
         → Load all watching markets (H2H + Totals + Spreads)
         → Fetch bookmaker odds (h2h,spreads,totals)
         → Match by market type + threshold
         → Calculate edge per market type
         → Trigger on Edge ≥5% OR Movement confirmed
```

---

### Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Time window | 7 days | 24 hours |
| Markets per event | 1 (H2H only) | 3-5 (H2H + Totals + Spreads + Props) |
| Total markets monitored | ~145 | ~300-500 |
| Movement tracking | All | All (unchanged) |

---

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Revert to 24h window, process ALL markets per event |
| `supabase/functions/polymarket-monitor/index.ts` | Add Totals/Spreads matching logic (threshold-based) |

---

### Edge Cases Handled

- **Multiple markets per event**: Each gets its own `condition_id` entry in cache
- **Threshold matching**: Totals match on "Over 220.5" ↔ bookmaker "220.5" line
- **Spread matching**: Spreads match on "-5.5" ↔ bookmaker "-5.5" line
- **No double-counting**: Each market type tracked independently

