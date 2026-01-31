

# Clean Up Invalid Signals & Verify Remaining Bets

## Summary

Yes, the **NO-side signals are NOT good bets**. They were calculated with inverted probability logic, showing positive edges when the real edges were negative.

## Signals to REMOVE (False Positives)

| Event | Claimed Edge | Real Edge | Why Bad |
|-------|-------------|-----------|---------|
| Blackhawks (NO) | +19.0% | **-1.1%** | Bug inverted 40% underdog to 60% favorite |
| Patriots (NO) | +16.9% | **-17%** | Bug inverted 33% underdog |
| Flyers (NO) | +5.1% | **-3%** | Bug inverted ~47% to ~53% |
| Michigan State (NO) | +11.4% | **-11%** | Bug inverted 39% to 61% |
| Blue Jackets vs Blues (NO) | +6.0% | **~-6%** | Bug inverted probabilities |

These 5 signals will be dismissed.

## Signals to VERIFY (YES-side)

| Event | Edge | Status | Concern |
|-------|------|--------|---------|
| Wizards (YES) | +40% | SUSPICIOUS | 93.8% fair prob vs 50% Poly - artifact or stale data |
| Seahawks (YES) | +26.6% | CHECK | 76.6% fair prob needs staleness check |
| Panthers (YES) | +19.3% | LIKELY VALID | 60% vs 41% - reasonable spread |
| Red Wings (YES) | +24.2% | LIKELY VALID | 58% vs 34% - reasonable |
| Sabres (YES) | +10.5% | LIKELY VALID | 55% vs 45% - reasonable |

## Action Plan

### Step 1: Dismiss All NO-Side Signals
Update status to 'dismissed' for the 5 false positive signals.

### Step 2: Investigate Suspicious YES Signals
- **Wizards**: 93.8% fair prob with 50% Polymarket price is a 40%+ edge - this triggers the "high probability artifact" filter. This was likely created before that filter was active.
- **Seahawks**: 76.6% at 50% Poly is a 26% edge - high but possible if bookmakers are sharp.

### Step 3: Keep Valid YES Signals
- Panthers, Red Wings, and Sabres signals appear mathematically valid with reasonable edges.

## Technical Changes

### File: Edge Function Call (API)
Dismiss the 5 NO-side signals by updating their status in the database.

### Validation
After cleanup, run a fresh poll to generate new signals with the corrected edge calculation. The fix we deployed earlier will ensure new signals are calculated correctly.

## Expected Result

- 5 bad signals removed
- 2 suspicious signals flagged for review (may keep or dismiss after checking current prices)
- 3 valid YES signals retained
- Fresh poll will only generate signals with true positive edges

