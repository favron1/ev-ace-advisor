
# Fix: Auto-Polling Intervals Keep Resetting (Never Fire)

## Problem Identified

The auto-polling system has a **perpetual reset bug** - the 5-minute Watch Poll timer is being reset every time any state changes, so it never actually reaches zero and fires.

## Root Cause

In `useAutoPolling.ts`, line 175:
```typescript
}, [state.isEnabled, watchIntervalMs, activeIntervalMs, activeCount, runWatchPollSafe, runActivePollSafe]);
```

The `runWatchPollSafe` and `runActivePollSafe` callbacks are dependencies of the interval setup effect. But these callbacks depend on `state.pollsToday`, `dailyUsagePercent`, and other values that change. Every time these values change:

1. The callbacks get recreated
2. The effect runs again (because dependencies changed)
3. Old intervals are cleared
4. New intervals are created - **resetting the countdown**
5. Timer never reaches zero

## Solution

Store the poll functions in refs so they can be called with the latest values without being dependencies of the interval effect:

### Changes to `useAutoPolling.ts`

```text
1. Create refs to store the latest poll functions:
   const onWatchPollRef = useRef(onWatchPoll);
   const onActivePollRef = useRef(onActivePoll);
   
   // Keep refs updated
   useEffect(() => {
     onWatchPollRef.current = onWatchPoll;
     onActivePollRef.current = onActivePoll;
   }, [onWatchPoll, onActivePoll]);

2. Create refs for safeguard values:
   const dailyUsagePercentRef = useRef(dailyUsagePercent);
   const isPausedRef = useRef(isPaused);
   const activeCountRef = useRef(activeCount);
   
   // Keep updated
   useEffect(() => {
     dailyUsagePercentRef.current = dailyUsagePercent;
     isPausedRef.current = isPaused;
     activeCountRef.current = activeCount;
   }, [dailyUsagePercent, isPaused, activeCount]);

3. Simplify poll functions to use refs (no dependencies):
   const runWatchPollSafe = useCallback(async () => {
     if (isPollingRef.current) return;
     if (dailyUsagePercentRef.current > 90) return;
     if (isPausedRef.current) return;
     
     isPollingRef.current = true;
     setState(s => ({ ...s, isRunning: true }));
     
     try {
       await onWatchPollRef.current();
       // ... rest of logic
     } finally {
       isPollingRef.current = false;
       // ...
     }
   }, [watchIntervalMs]); // Minimal stable dependencies

4. Remove callback dependencies from interval effect:
   useEffect(() => {
     if (!state.isEnabled) { ... }
     
     watchIntervalRef.current = setInterval(runWatchPollSafe, watchIntervalMs);
     // ...
     
     return () => { ... };
   }, [state.isEnabled, watchIntervalMs, activeIntervalMs, activeCount]);
   // Note: runWatchPollSafe removed from dependencies
```

## Why This Fixes It

| Before | After |
|--------|-------|
| Poll function changes → effect re-runs → interval resets | Poll function refs stay stable → effect only runs when truly needed |
| Timer resets every second | Timer runs uninterrupted for full 5 minutes |
| Poll never fires | Poll fires on schedule |

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useAutoPolling.ts` | Use refs for callbacks and safeguard values to stabilize the interval setup effect |

## Expected Behavior After Fix

- Watch Poll: Fires every 5 minutes consistently
- Active Poll: Fires every 60 seconds when active events exist
- Countdown timers: Count down smoothly without resetting
- Safeguards: Still work (API limit check, pause check) via refs
