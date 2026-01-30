

# Fix: Tier Classification for Movement-Confirmed Signals

## Problem Identified

The tier classification logic in `polymarket-monitor/index.ts` (lines 950-956) is **incorrect**:

```text
Current Logic (BUGGY):
┌─────────────────────────────────────────────────────────────────────┐
│  triggerReason === 'both'      → ELITE (correct)                    │
│  triggerReason === 'edge'      → ELITE if ≥5%, else STRONG (WRONG)  │
│  triggerReason === 'movement'  → ELITE if ≥5%, else STRONG (correct)│
└─────────────────────────────────────────────────────────────────────┘
```

Your winning bets (Jets vs Lightning, Flyers vs Bruins, etc.) were detected via **edge-only trigger** (5%+ static edge) but incorrectly labeled as `elite` because the code doesn't distinguish edge-only from movement-confirmed.

## Correct Logic

```text
Tier Assignment Rules:
┌───────────────────────────────────────────────────────────────────────────────┐
│  ELITE  = Movement confirmed (≥2 sharp books) + Net Edge ≥ 5%                 │
│  STRONG = Movement confirmed (≥2 sharp books) + Net Edge ≥ 3%                 │
│  STATIC = Edge-only trigger (no movement) OR movement + edge < 3%             │
└───────────────────────────────────────────────────────────────────────────────┘
```

This means:
- **Signals will still reach the feed** via the edge-only trigger (≥5% static edge)
- They'll just be correctly labeled as **STATIC** instead of falsely labeled ELITE
- Movement-confirmed signals will be properly elevated to ELITE/STRONG

## Solution

Replace the inline tier logic with the existing `calculateSignalTier()` helper function that already implements correct logic:

| Line | Current (Buggy) | Fixed |
|------|-----------------|-------|
| 950-956 | Inline if/else assigns `elite` to edge-only | Use `calculateSignalTier(movementTriggered, netEdge)` |

---

## Technical Changes

### File: `supabase/functions/polymarket-monitor/index.ts`

**Lines 950-956** - Replace buggy inline logic:

```typescript
// BEFORE (buggy):
let signalTier: 'elite' | 'strong' | 'static' = 'static';
if (triggerReason === 'both') {
  signalTier = 'elite';
} else if (triggerReason === 'edge' || triggerReason === 'movement') {
  signalTier = rawEdge >= 0.05 ? 'elite' : 'strong';
}

// AFTER (correct):
// Use the dedicated helper that enforces movement requirement
const signalTier = calculateSignalTier(movementTriggered, netEdge);
```

The existing helper on lines 226-234 already implements the correct logic:

```typescript
function calculateSignalTier(
  movementTriggered: boolean,
  netEdge: number
): 'elite' | 'strong' | 'static' {
  if (!movementTriggered) return 'static';  // ← Edge-only = STATIC
  if (netEdge >= 0.05) return 'elite';      // ← Movement + 5% = ELITE
  if (netEdge >= 0.03) return 'strong';     // ← Movement + 3% = STRONG
  return 'static';
}
```

---

## Impact

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| 5% edge, no movement | ELITE ❌ | STATIC ✅ |
| 3% edge, movement from 2 books | STRONG ✅ | STRONG ✅ |
| 6% edge, movement from 3 books | ELITE ✅ | ELITE ✅ |
| 4% edge, no movement | STRONG ❌ | Does not create signal (below 5% threshold) |

**Your next scan:**
- Static edge signals will still appear (5%+ edge triggers creation)
- They'll be correctly labeled STATIC in the UI
- Movement-confirmed signals will properly earn ELITE/STRONG badges
- SMS alerts only fire for genuine movement-confirmed signals

