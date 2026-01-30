
# Fix: P/L Not Updating for Settled Bets

## Root Cause

The `settle-bets` edge function successfully determined outcomes (win/loss) but stored `profit_loss: 0` for 6 bets settled on Jan 30. The calculation formula in the code is correct, but either:
- The function was deployed mid-run with a bug
- There was a data type issue during that specific execution

The code IS correct now, but the damage is done - 6 bets have wrong P/L values stored.

## Current State

| Bet | Outcome | Stored P/L | Should Be |
|-----|---------|------------|-----------|
| Jets vs. Lightning | win | $0.00 | +$163.16 |
| Flyers vs. Bruins | win | $0.00 | +$143.90 |
| Utah vs. Hurricanes | win | $0.00 | +$150.00 |
| Sharks vs. Oilers | win | $0.00 | +$163.16 |
| Avalanche vs. Canadiens | loss | $0.00 | -$100.00 |
| Flames vs. Wild | loss | $0.00 | -$100.00 |

**Total Missing P/L**: +$420.22

---

## Solution: Two-Part Fix

### Part 1: Immediate Database Correction
Run a SQL migration to recalculate P/L for all settled bets that have `profit_loss = 0`:

```sql
UPDATE signal_logs
SET profit_loss = CASE 
  WHEN outcome = 'win' THEN stake_amount * (1 - entry_price) / entry_price
  WHEN outcome = 'loss' THEN -stake_amount
  ELSE 0
END
WHERE outcome IN ('win', 'loss', 'void')
  AND profit_loss = 0
  AND stake_amount IS NOT NULL
  AND stake_amount > 0;
```

### Part 2: Enhance Check Bets Button
Modify the `checkPendingBets` function to also recalculate P/L for any settled bets with incorrect values. This prevents future occurrences.

---

## Files to Modify

| File | Change |
|------|--------|
| Database migration | Fix existing 6 bets with correct P/L values |
| `src/hooks/useSignalStats.ts` | Add P/L recalculation to checkPendingBets |

---

## Expected Result

After fix:
- Stats dashboard shows correct total P/L (+$420.22 correction)
- Win rate remains 5-2 (71.4%)
- ROI calculation becomes accurate
- Future settlements won't have this issue
