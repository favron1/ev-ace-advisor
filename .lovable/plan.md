

# Enforcement of Execution Gates (Hard Safety Controls)

## Summary

The bug fixes were deployed but three critical issues remain:

1. **Bad signals still exist in DB** - The fixes prevent NEW bad signals but don't clean up existing ones
2. **Execute button ignores staleness** - Stale data still shows "Execute (Strong)" button enabled
3. **Edge function needs redeployment** - To activate the new validation logic

This plan enforces HARD GATES that make signals non-executable when safety criteria aren't met.

---

## Current State (From Database Query)

| Event | Recommended Outcome | Issue |
|-------|---------------------|-------|
| Blackhawks vs. Penguins | Atlanta Hawks | Cross-sport mismatch (NBA team in NHL game) |
| Utah vs. Hurricanes | Carolina Hurricanes | Duplicate signal exists |
| Utah vs. Hurricanes | Utah Hockey Club | Duplicate signal exists |
| Islanders vs. Rangers | NY Islanders | 5h stale, 33% edge on 88% fair prob |

---

## Implementation Plan

### Step 1: Clean Up Existing Bad Signals (Database)

Run direct cleanup to expire invalid signals:

```sql
-- Expire the Atlanta Hawks mismatch signal
UPDATE signal_opportunities 
SET status = 'expired' 
WHERE id = '13583b9a-0fdf-4990-b84d-127a51c10192';

-- Expire the older Utah duplicate (keep the newer Hurricanes one)
UPDATE signal_opportunities 
SET status = 'expired' 
WHERE id = 'cd9ba6f8-5b39-4844-b39a-985053c5d327';

-- Expire signals with edge=0 and no Polymarket data (unmatched junk)
UPDATE signal_opportunities 
SET status = 'expired' 
WHERE edge_percent = 0 AND polymarket_updated_at IS NULL;
```

### Step 2: Enforce Execution Gates in SignalCard.tsx

Add a `canExecute` function that checks ALL safety gates before allowing the Execute button to be enabled.

```typescript
// Calculate execution eligibility
const canExecuteSignal = (): { allowed: boolean; reason: string } => {
  // Gate 1: Must have team in event name
  if (betTarget) {
    const teamLastWord = betTarget.split(' ').pop()?.toLowerCase() || '';
    const eventNorm = signal.event_name.toLowerCase();
    if (teamLastWord && !eventNorm.includes(teamLastWord)) {
      return { allowed: false, reason: 'Team mismatch' };
    }
  }
  
  // Gate 2: Must have fresh price data (≤5 minutes)
  const stalenessMinutes = polyUpdatedAt 
    ? (Date.now() - new Date(polyUpdatedAt).getTime()) / 60000 
    : Infinity;
  if (stalenessMinutes > 5) {
    return { allowed: false, reason: 'Stale price data' };
  }
  
  // Gate 3: Must have minimum liquidity ($5K)
  if (!polyVolume || polyVolume < 5000) {
    return { allowed: false, reason: 'Insufficient liquidity' };
  }
  
  // Gate 4: High-prob artifact check (85%+ fair prob needs extra fresh data)
  if (bookmakerProbFair >= 0.85 && signal.edge_percent > 40) {
    return { allowed: false, reason: 'Artifact edge detected' };
  }
  
  // Gate 5: Must have positive execution decision
  if (!signal.execution || signal.execution.execution_decision === 'NO_BET') {
    return { allowed: false, reason: 'No bet recommended' };
  }
  
  return { allowed: true, reason: 'Ready to execute' };
};
```

**Execute Button Update:**

```tsx
const executionStatus = canExecuteSignal();

<Button 
  size="sm" 
  className={cn(
    "flex-1 gap-1",
    executionStatus.allowed && signal.execution.execution_decision === 'STRONG_BET' && "bg-green-600 hover:bg-green-700",
    executionStatus.allowed && signal.execution.execution_decision === 'BET' && "bg-green-600 hover:bg-green-700",
    !executionStatus.allowed && "bg-muted text-muted-foreground"
  )}
  onClick={() => onExecute(signal.id, signal.polymarket_price)}
  disabled={!executionStatus.allowed}
  title={!executionStatus.allowed ? executionStatus.reason : undefined}
>
  <Check className="h-3 w-3" />
  {executionStatus.allowed ? (
    <>
      {signal.execution.execution_decision === 'STRONG_BET' && 'Execute (Strong)'}
      {signal.execution.execution_decision === 'BET' && 'Execute Bet'}
      {signal.execution.execution_decision === 'MARGINAL' && 'Execute (Caution)'}
    </>
  ) : (
    `Watch Only (${executionStatus.reason})`
  )}
</Button>
```

### Step 3: Visual "LOCKED" State for Non-Executable Signals

Add a distinct visual treatment when signals fail gates:

```tsx
{!executionStatus.allowed && (
  <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
    <AlertCircle className="h-4 w-4" />
    <span>NOT EXECUTABLE: {executionStatus.reason}</span>
  </div>
)}
```

### Step 4: Redeploy Edge Function

The `polymarket-monitor` edge function needs to be redeployed to activate the team validation, signal exclusivity, and staleness gating logic that was added in the previous commit.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/terminal/SignalCard.tsx` | Add `canExecuteSignal()` gate function, update button logic, add LOCKED visual state |
| Database (manual cleanup) | Expire Atlanta Hawks signal, expire Utah duplicate, expire zero-edge junk |

---

## Execution Gate Rules Summary

| Gate | Condition | Result if Failed |
|------|-----------|------------------|
| Team Validation | `teamLastWord` not in `event_name` | Button disabled, "Team mismatch" |
| Freshness | `polymarket_updated_at` > 5 minutes ago | Button disabled, "Stale price data" |
| Liquidity | `polyVolume` < $5,000 | Button disabled, "Insufficient liquidity" |
| Artifact Check | Fair prob ≥85% AND edge >40% | Button disabled, "Artifact edge detected" |
| Decision Check | `execution_decision` = NO_BET | Button disabled, "No bet recommended" |

---

## Expected Result After Implementation

1. **Atlanta Hawks signal** → Immediately expired from DB, and future ones blocked by team validation
2. **Utah duplicates** → One expired from DB, future ones blocked by exclusivity rule
3. **Stale signals (>5m)** → Show "Watch Only (Stale price data)" instead of Execute button
4. **High-prob artifacts** → Show "Watch Only (Artifact edge detected)"
5. **Clean signals** → Show normal green "Execute (Strong)" or "Execute Bet"

---

## Before vs After

**Before:**
```
Blackhawks vs. Penguins
BUY YES: Atlanta Hawks
[Execute (Strong)] ← DANGEROUS
```

**After:**
```
Blackhawks vs. Penguins
BUY YES: Atlanta Hawks
[Watch Only (Team mismatch)] ← SAFE
⚠️ NOT EXECUTABLE: Team mismatch
```

