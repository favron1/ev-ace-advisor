
# Fix: Infinite Re-render Loop in Watch State Hook

## Problem Summary

The auto-polling and notification system has a **dependency loop** causing excessive API requests (dozens per second instead of one every few minutes). This is draining resources and causing "Failed to fetch" errors.

## Root Cause

The `useWatchState` hook has `fetchWatchStates` as a dependency of the realtime subscription effect. Because `fetchWatchStates` depends on `options` (which includes the `onNewConfirmed` callback), and this callback is recreated on every render in Terminal.tsx, it causes:

1. Callback recreated on render
2. `fetchWatchStates` recreated
3. Realtime subscription torn down and recreated
4. New subscription triggers immediate fetch
5. Fetch causes re-render
6. Loop repeats infinitely

## Solution

### 1. Stabilize the callback reference in useWatchState

Move the `onNewConfirmed` callback to a ref so it doesn't affect the `fetchWatchStates` dependency:

```typescript
// Store callback in ref to avoid dependency issues
const onNewConfirmedRef = useRef(options?.onNewConfirmed);
useEffect(() => {
  onNewConfirmedRef.current = options?.onNewConfirmed;
}, [options?.onNewConfirmed]);

// Remove options from fetchWatchStates dependencies
const fetchWatchStates = useCallback(async () => {
  // ... existing code ...
  
  // Use ref instead of options directly
  if (onNewConfirmedRef.current) {
    const newlyConfirmed = newConfirmed.filter(e => !previousIds.has(e.id));
    if (newlyConfirmed.length > 0) {
      onNewConfirmedRef.current(newlyConfirmed);
    }
  }
}, []); // No dependencies - stable reference
```

### 2. Stabilize the handleNewConfirmed callback in Terminal.tsx

Wrap the callback in useCallback with stable dependencies:

```typescript
const handleNewConfirmed = useCallback((newEvents: EventWatchState[]) => {
  for (const event of newEvents) {
    const movement = event.movement_pct?.toFixed(1) || '0';
    notify(
      `EDGE DETECTED`,
      `${event.event_name}\n+${movement}% movement confirmed. Execute now!`
    );
  }
}, [notify]); // notify should be stable from useNotifications
```

### 3. Ensure notify function is stable in useNotifications

The `notify` function should be wrapped in useCallback with no dependencies that change frequently.

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useWatchState.ts` | Use ref for callback, remove options from fetchWatchStates dependencies |
| `src/pages/Terminal.tsx` | Stabilize handleNewConfirmed with useCallback |
| `src/hooks/useNotifications.ts` | Verify notify function is stable |

## Expected Result After Fix

- Initial load: 1 request
- Every 5 minutes (Watch Poll): 1 request
- Every 60 seconds (Active Poll, if active events): 1 request
- On realtime change: 1 request
- No more rapid-fire requests or "Failed to fetch" errors

## Technical Details

The fix uses React refs to break the dependency cycle. By storing the callback in a ref and updating it via a separate effect, we can:
- Keep `fetchWatchStates` stable (empty dependency array)
- Still call the latest callback when needed
- Prevent the realtime subscription from constantly reconnecting
