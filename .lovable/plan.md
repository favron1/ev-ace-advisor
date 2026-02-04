
# Signal Generation Pipeline Failure: Root Cause Analysis

## Executive Summary

Signals stopped generating on **Feb 1, 2026** (3 days ago). The last successful signals were NHL games on Jan 31 with edges of 5-40%. Currently, 0 signals are being created despite 73 markets being monitored.

---

## Critical Issues Identified

### Issue 1: Token ID Crisis (56 of 73 markets blocked)
**Impact: 77% of markets immediately blocked**

The `polymarket-monitor` requires CLOB token IDs to get live prices, but:
- **API-sourced markets** (NHL games from Gamma API) have tokens but placeholder prices (50¢)
- **Firecrawl-sourced markets** (NBA, Soccer) have REAL prices but NO tokens

```text
Source        | Has Tokens | Has Real Prices
--------------|------------|----------------
API/Gamma     | YES        | NO (all 50¢)  
Firecrawl     | NO         | YES (34-67¢)
```

**Why this happened**: The sync function stores default 0.5 prices from Gamma API metadata. CLOB price fetching happens in the monitor, but only for tokenized markets.

### Issue 2: CLOB Price Fetch Not Updating Cache
**Impact: All "tokenized" markets show stale 50¢ prices**

The monitor fetches live CLOB prices but:
1. Logs show `priced_from_clob: 0` - zero prices actually retrieved
2. Cache still shows `yes_price: 0.5` for all API markets
3. The CLOB fetch is working (logs show polyPrice=0.41) but cache isn't being updated properly

**Evidence**:
```sql
-- All API markets have 50¢ placeholder prices
SELECT yes_price FROM polymarket_h2h_cache WHERE source='api' AND market_type='h2h'
-- Result: ALL rows show yes_price = 0.5
```

### Issue 3: Mapping Inversion Block Too Aggressive
**Impact: Legitimate signals blocked**

The safety rail at line 2288-2305 blocks signals when:
- Current mapping edge < 1% AND
- Swapped mapping edge > 5%

This logic INCORRECTLY blocks markets where:
- Polymarket price (41¢) matches bookmaker fair prob (40.8%)
- There's genuinely NO edge - not a mapping problem

**Example from logs**:
```
Bruins vs. Panthers: polyPrice=0.41, yesFairProb=0.408
→ bestA=0.24% (tiny edge), bestB=18.2% (swapped)
→ BLOCKED - but should just SKIP (no real edge)
```

### Issue 4: Volume Filter on Edge Calculation
**Impact: Low-volume markets skipped**

Line 2244 requires `liveVolume >= 5000` to calculate edges. Many new H2H markets have $0 volume initially.

### Issue 5: Movement Detection Finding No Velocity
**Impact: All signals capped at STATIC tier**

Logs show `0 movement-confirmed` - the velocity calculation requires historical snapshots in `probability_snapshots` table. Without movement confirmation:
- All signals capped at STATIC tier
- No SMS alerts sent (requires STRONG or ELITE tier)

---

## What Changed Since Jan 31 (When Signals Worked)

| Factor | Jan 31 (Working) | Now (Broken) |
|--------|-----------------|--------------|
| Token ID availability | Most markets had tokens | 77% missing tokens |
| CLOB price accuracy | Real prices (38¢, 43¢, etc.) | All 50¢ placeholders |
| Edge detection | 5-40% edges found | 0 edges over threshold |
| Markets monitored | ~30 H2H games | 73 markets (but 56 blocked) |

---

## Recommended Fixes (Priority Order)

### Fix 1: Token ID Repair Pipeline (CRITICAL)
Create a self-healing process that:
1. Looks up missing token IDs from CLOB API by condition_id
2. Updates cache with resolved token IDs
3. Runs before each monitor cycle

### Fix 2: Cache Price Update in Monitor
When CLOB prices are fetched successfully, update the cache:
```typescript
// After fetching CLOB prices, update cache
await supabase.from('polymarket_h2h_cache').update({
  yes_price: freshClobPrice,
  last_price_update: now.toISOString(),
}).eq('condition_id', conditionId);
```

### Fix 3: Relax Mapping Inversion Gate
Change the blocking logic from:
```typescript
const shouldBlock = bestA < 0.01 && bestB > SWAP_THRESHOLD;
```
To skip naturally when no edge exists:
```typescript
// Don't block - just let the "no positive edge" check handle it
const shouldBlock = false; // Disable aggressive blocking
```

### Fix 4: Remove Volume Filter from Edge Calculation
Change line 2244 from:
```typescript
if (yesFairProb !== null && noFairProb !== null && liveVolume >= 5000)
```
To:
```typescript
if (yesFairProb !== null && noFairProb !== null)
```

### Fix 5: Populate Probability Snapshots for Movement Detection
Ensure `ingest-odds` is storing snapshots to `probability_snapshots` table for velocity calculation.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Fix token repair, relax inversion block, remove volume filter |
| `supabase/functions/polymarket-sync-24h/index.ts` | Fetch CLOB prices during sync, not just metadata |
| `supabase/functions/tokenize-market/index.ts` | Enhance token lookup to run for all untokenized markets |

---

## Expected Outcome After Fixes

| Metric | Current | After Fix |
|--------|---------|-----------|
| Markets with tokens | 17/73 (23%) | 60+ (80%+) |
| Markets with real prices | 0 | 60+ |
| Edges calculated | 9 | 60+ |
| Edges over threshold | 0 | 5-15 per scan |
| Signals created | 0 | 3-10 per day |
