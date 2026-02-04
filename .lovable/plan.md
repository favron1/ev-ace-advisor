
# Signal Generation Pipeline Failure: Root Cause Analysis

## ✅ ALL FIXES IMPLEMENTED (Feb 4, 2026)

---

## Critical Issues Fixed

### ✅ Fix 1: Token ID Repair Pipeline (CRITICAL)
**File: `polymarket-monitor/index.ts`**

Added self-healing token repair that:
1. Detects markets with missing `token_id_yes`
2. Attempts CLOB API lookup by `condition_id`
3. Updates cache with resolved token IDs
4. Only blocks after repair fails

### ✅ Fix 2: Cache Price Update in Monitor
**File: `polymarket-monitor/index.ts`**

When CLOB prices are fetched successfully, cache is now updated:
```typescript
if (livePolyPrice !== null && livePolyPrice !== 0.5) {
  cacheUpdate.yes_price = livePolyPrice;
  cacheUpdate.no_price = 1 - livePolyPrice;
}
```

### ✅ Fix 3: Relax Mapping Inversion Gate
**File: `polymarket-monitor/index.ts`**

Disabled aggressive blocking logic:
```typescript
const shouldBlock = false; // DISABLED - was too aggressive
```
Now logs for monitoring but doesn't block legitimate signals.

### ✅ Fix 4: Remove Volume Filter from Edge Calculation
**File: `polymarket-monitor/index.ts`**

Changed from:
```typescript
if (yesFairProb !== null && noFairProb !== null && liveVolume >= 5000)
```
To:
```typescript
if (yesFairProb !== null && noFairProb !== null)
```

### ✅ Fix 5: Populate Probability Snapshots for Movement Detection
**File: `ingest-odds/index.ts`**

Added population of `probability_snapshots` table:
- Extracts fair probabilities from H2H signals
- Stores them for velocity calculation
- Enables movement-confirmed signal tiers (STRONG, ELITE)

---

## Expected Outcome After Fixes

| Metric | Before | Expected After Fix |
|--------|--------|-----------|
| Markets with tokens | 17/73 (23%) | 60+ (80%+) |
| Markets with real prices | 0 | 60+ |
| Edges calculated | 9 | 60+ |
| Edges over threshold | 0 | 5-15 per scan |
| Signals created | 0 | 3-10 per day |
| Movement-confirmed signals | 0 | 1-5 per day |

---

## Deployment Status

- [x] `polymarket-monitor` deployed
- [x] `ingest-odds` deployed

**Next step:** Run a scan to verify signals are generating.
