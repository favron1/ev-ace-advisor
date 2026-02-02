

# Fix Plan: Enforce Core Logic v1.3 Thresholds

## Problem Summary

The signal "Kings vs. Hurricanes" with **15% book probability** violated multiple Core Logic v1.3 gates but still:
- Was created as a signal
- Was classified as STATIC (should have been REJECTED)
- Triggered an SMS alert (STATIC should never get SMS)

## Root Causes

### 1. Book Probability Floor NOT Enforced
The v1.3 spec requires:
- S2 signals: Book probability >= 50%
- S1 signals: Book probability >= 45%

**Current code has ZERO book probability checks.** A 15% prob signal should be rejected at Stage 3.5.

### 2. SMS Logic Contradicts Spec
The code says "Send SMS for ALL new signals" but v1.3 restricts SMS to ELITE and STRONG only.

### 3. Signal Tier Calculation Ignores Book Prob
`calculateSignalTier()` promotes to STRONG for 10%+ edge alone, ignoring that low book probability signals are fundamentally not tradeable.

## Technical Changes

### Change 1: Add v1.3 Constants to Edge Function
Import the Core Logic v1.3 thresholds directly into the monitor to ensure alignment.

```typescript
// CORE LOGIC v1.3 THRESHOLDS (imported from canonical spec)
const V1_3_GATES = {
  S2_BOOK_PROB_MIN: 0.50,    // 50% minimum for execution-eligible
  S1_BOOK_PROB_MIN: 0.45,    // 45% minimum for watch state
  S2_CONFIDENCE_MIN: 55,
  S2_TIME_TO_START_MIN: 10,  // minutes
  SMS_TIERS: ['elite', 'strong'] as const,
};
```

### Change 2: Add Book Probability Gate (Stage 3.5)
Add a hard gate BEFORE signal creation that rejects signals with book probability below floor.

```typescript
// ============= STAGE 3.5: BOOK PROBABILITY GATE (v1.3) =============
// Book probability must meet minimum thresholds for signal quality
const S1_PROB_FLOOR = 0.45;  // Minimum for any signal
const S2_PROB_FLOOR = 0.50;  // Minimum for execution-eligible

if (recommendedFairProb < S1_PROB_FLOOR) {
  console.log(`[V1.3] BOOK_PROB_GATE_REJECT: ${event.event_name} - ${(recommendedFairProb * 100).toFixed(1)}% < ${S1_PROB_FLOOR * 100}% floor`);
  continue; // REJECT - book probability too low
}

let signalState: 'S2_EXECUTION_ELIGIBLE' | 'S1_PROMOTE' | 'WATCH' = 'WATCH';

if (recommendedFairProb >= S2_PROB_FLOOR) {
  signalState = 'S2_EXECUTION_ELIGIBLE';
} else if (recommendedFairProb >= S1_PROB_FLOOR) {
  signalState = 'S1_PROMOTE';
}
```

### Change 3: Fix SMS Logic to Respect Tier Restriction
Change the SMS dispatch to ONLY send for ELITE and STRONG signals.

```typescript
// Send SMS ONLY for ELITE and STRONG signals (v1.3 compliance)
if (!signalError && signal && !existingSignal) {
  const SMS_ELIGIBLE_TIERS = ['elite', 'strong'];
  
  if (SMS_ELIGIBLE_TIERS.includes(signalTier)) {
    console.log(`[V1.3] SMS SENDING: tier=${signalTier}, edge=${(rawEdge * 100).toFixed(1)}%`);
    const alertSent = await sendSmsAlert(...);
    // ...
  } else {
    console.log(`[V1.3] SMS BLOCKED: tier=${signalTier} not in ${SMS_ELIGIBLE_TIERS.join(',')}`);
  }
}
```

### Change 4: Update calculateSignalTier to Consider Book Prob
Add book probability as a factor in tier calculation.

```typescript
function calculateSignalTier(
  movementTriggered: boolean,
  netEdge: number,
  bookProbability: number  // NEW PARAMETER
): 'elite' | 'strong' | 'static' {
  // v1.3: Low book probability caps tier at STATIC regardless of edge
  if (bookProbability < 0.45) return 'static';
  
  // High edge alone (10%+) qualifies as strong IF book prob is valid
  if (netEdge >= 0.10 && bookProbability >= 0.50) {
    return movementTriggered ? 'elite' : 'strong';
  }
  
  if (!movementTriggered) return 'static';
  if (netEdge >= 0.05) return 'elite';
  if (netEdge >= 0.03) return 'strong';
  return 'static';
}
```

### Change 5: Add v1.3 Compliance Logging
Add clear logging for v1.3 gate decisions to aid debugging.

```typescript
console.log(`[V1.3] GATE_CHECK: ${event.event_name} | bookProb=${(recommendedFairProb * 100).toFixed(1)}% | state=${signalState} | tier=${signalTier}`);
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Add book probability gate, fix SMS logic, update tier calculation |

## Validation Steps

After implementation:
1. Run a scan and verify no signals with <45% book probability are created
2. Verify STATIC signals do not trigger SMS
3. Check logs for `[V1.3] BOOK_PROB_GATE_REJECT` entries
4. Confirm ELITE/STRONG signals still get SMS

## Expected Outcome

- Signals like "Kings @ 15% book prob" will be REJECTED before creation
- SMS will only fire for ELITE and STRONG tier signals
- All signals will comply with Core Logic v1.3 probability floors
- Clear v1.3 logging will make gate decisions transparent

