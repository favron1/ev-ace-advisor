

# Implementing Anti-Inversion Safety Rails

## Analysis Summary

The external review correctly identified 3 critical inversion vectors in the current code:

### Issue #1: `tokens[0]` Not Guaranteed to be YES Token

**Location**: `polymarket-monitor/index.ts` lines 1341-1343

```typescript
// CURRENT (DANGEROUS):
livePolyPrice = parseFloat(marketData.tokens?.[0]?.price || livePolyPrice);
```

**Problem**: When the CLOB batch fetch fails and we fallback to a single market fetch, we blindly assume `tokens[0]` is the YES token. Polymarket doesn't guarantee token ordering.

**Evidence from DB**: We correctly store `token_id_yes` in the cache, but the fallback code ignores it.

---

### Issue #2: Title-Based YES/NO Team Assignment

**Location**: `polymarket-monitor/index.ts` lines 806-808

```typescript
// CURRENT:
const titleParts = eventName.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*-\s*.*)?$/i);
const polyYesTeam = titleParts?.[1]?.trim() || '';  // Assumed YES
const polyNoTeam = titleParts?.[2]?.trim() || '';   // Assumed NO
```

**Problem**: We assume "first team in title = YES token". But Polymarket's YES token might actually correspond to the second team or a different outcome entirely. We should validate this against the actual outcome labels in the CLOB response.

---

### Issue #3: Movement Override Can Force Wrong Side

**Location**: `polymarket-monitor/index.ts` lines 1551-1564

```typescript
if (movement.direction === 'shortening' && yesEdge > 0.01) {
  betSide = 'YES';  // Can force wrong side if mapping inverted
  ...
}
```

**Problem**: If our YES/NO mapping is already inverted, `yesEdge > 0.01` could be a false positive based on wrong data.

---

## Proposed Solution: 3 Safety Rails

### Safety Rail #1: Use `tokenIdYes` for Fallback Price Lookup

Replace the dangerous `tokens[0]` fallback with explicit token ID matching:

```typescript
// SAFE:
if (event.polymarket_condition_id) {
  try {
    const clobUrl = `${CLOB_API_BASE}/markets/${event.polymarket_condition_id}`;
    const clobResponse = await fetch(clobUrl);
    
    if (clobResponse.ok) {
      const marketData = await clobResponse.json();
      
      // Find YES token explicitly using stored token ID
      if (tokenIdYes) {
        const yesToken = marketData.tokens?.find((t: any) => t.token_id === tokenIdYes);
        if (yesToken?.price) {
          livePolyPrice = parseFloat(yesToken.price);
        }
      } else {
        // No token ID = untradeable, skip
        console.log(`[POLY-MONITOR] No tokenIdYes for ${event.event_name} - SKIPPING`);
        continue;
      }
    }
  } catch {
    // Use cached price
  }
}
```

---

### Safety Rail #2: Dual-Mapping EV Gate

This is the "cannot possibly fire wrong side" upgrade. Before creating any signal, compute EV under both possible mappings and reject if the swapped mapping looks better:

```typescript
// After calculating edges with current mapping:
const yesEdge_A = yesFairProb - livePolyPrice;
const noEdge_A  = noFairProb  - (1 - livePolyPrice);

// Compute with SWAPPED mapping (assume livePolyPrice belongs to NO team)
const yesEdge_B = yesFairProb - (1 - livePolyPrice);
const noEdge_B  = noFairProb  - livePolyPrice;

// Best edge under each mapping
const bestA = Math.max(yesEdge_A, noEdge_A);
const bestB = Math.max(yesEdge_B, noEdge_B);

// Require current mapping to win clearly
const MAPPING_MARGIN = 0.02; // 2% edge margin
if (bestB > bestA + MAPPING_MARGIN) {
  console.log(`[POLY-MONITOR] MAPPING_INVERSION_DETECTED: bestA=${(bestA*100).toFixed(1)}%, bestB=${(bestB*100).toFixed(1)}% - SKIPPING`);
  continue;
}
```

**How This Works**: If we accidentally attached the YES price to the wrong team, the swapped mapping will produce dramatically better EV. We skip the trade instead of firing an inverted signal.

---

### Safety Rail #3: Tighten Movement Override Threshold

Movement can only override side selection if there's a substantial edge, not just 1%:

```typescript
// CURRENT:
if (movement.direction === 'shortening' && yesEdge > 0.01) { ... }

// PROPOSED:
if (movement.direction === 'shortening' && yesEdge > 0.03) { ... }
```

Raising to 3% ensures movement only overrides when there's meaningful edge that's less likely to be an artifact of inversion.

---

## Technical Implementation

### File to Modify

**`supabase/functions/polymarket-monitor/index.ts`**

### Changes

| Line | Current | Proposed |
|------|---------|----------|
| 1334-1349 | `tokens[0]` fallback | Use `tokenIdYes` to find correct token |
| ~1520 | After edge calculation | Add dual-mapping EV gate |
| 1552, 1558 | `> 0.01` threshold | `> 0.03` threshold |

---

## Why These 3 Rails Work Together

| Rail | Protects Against |
|------|------------------|
| Token ID lookup | Array ordering issues in CLOB response |
| Dual-mapping gate | All title→team mapping mistakes |
| Higher movement threshold | Movement forcing wrong side on marginal edges |

The dual-mapping gate is the **critical** safety rail. Even if rails #1 and #3 fail, the dual-mapping gate mathematically prevents firing inverted signals.

---

## Expected Outcome

After implementing these changes:

1. **Zero inverted signals** from token array ordering
2. **Automatic rejection** of signals where mapping looks wrong
3. **Logging visibility** into `MAPPING_INVERSION_DETECTED` events for debugging
4. **Movement overrides** only on confident 3%+ edges

---

## Testing Plan

1. Deploy changes
2. Run `polymarket-monitor` and check logs for:
   - `MAPPING_INVERSION_DETECTED` entries (signals correctly blocked)
   - Normal `EDGE CALC` entries (signals correctly passed)
3. Verify no signals appear with suspicious favorite/underdog flips

