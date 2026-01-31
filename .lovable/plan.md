
# Revert Filter Bypass and Set All Filters ON by Default

## What Happened
You didn't realize the filter was turned off, which is why the Michigan signal disappeared. The LIVE bypass I added was overcomplicating things when the real issue was just needing better defaults.

## Changes

### 1. Revert the LIVE Event Filter Bypass
**File: `src/hooks/useSignals.ts`**
- Remove the `hasStarted` check that lets LIVE events bypass the movement-confirmed filter
- Restore simple, straightforward filtering logic

### 2. Set All Filters ON by Default  
**File: `src/pages/Terminal.tsx`**
- Change `showTrueEdgesOnly` from `false` to `true`
- Change `showBettableOnly` from `false` to `true`  
- Keep `showMovementConfirmedOnly` as `true` (already defaulted ON)

This means by default you'll only see signals that are:
- True edges (matched to Polymarket)
- Bettable (BET or STRONG_BET decisions)
- Movement-confirmed (ELITE or STRONG tier)

### 3. Keep the "Show All" Empty State UX
The improved empty state from the previous change is still useful - if all filters hide everything, you'll see "No signals match your filters" with a "Show all signals" button rather than a confusing empty state.

## Result
- Filters work exactly as expected with no special cases
- Professional defaults: only high-quality, actionable signals shown by default
- Clear feedback when filters are hiding available signals

---

## Technical Details

**useSignals.ts filter logic (simplified):**
```typescript
// Remove hasStarted bypass - filters work normally
if (filters.movementConfirmedOnly) {
  const tier = s.signal_tier || 'static';
  if (tier === 'static' && !s.movement_confirmed) return false;
}
```

**Terminal.tsx defaults:**
```typescript
const [showTrueEdgesOnly, setShowTrueEdgesOnly] = useState(true);     // Was false
const [showBettableOnly, setShowBettableOnly] = useState(true);        // Was false  
const [showMovementConfirmedOnly, setShowMovementConfirmedOnly] = useState(true); // Already true
```
