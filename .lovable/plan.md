

# Set All Filters OFF by Default

## Summary
Change the default filter settings so all signals are visible when you load or refresh the page. You can then manually turn on any filters you want.

## Change

**File: `src/pages/Terminal.tsx`**

Update the filter state defaults from `true` to `false`:

```typescript
// Before (current)
const [showTrueEdgesOnly, setShowTrueEdgesOnly] = useState(true);
const [showBettableOnly, setShowBettableOnly] = useState(true);
const [showMovementConfirmedOnly, setShowMovementConfirmedOnly] = useState(true);

// After (proposed)
const [showTrueEdgesOnly, setShowTrueEdgesOnly] = useState(false);
const [showBettableOnly, setShowBettableOnly] = useState(false);
const [showMovementConfirmedOnly, setShowMovementConfirmedOnly] = useState(false);
```

## Result
- Page load/refresh: All signals visible (no filtering)
- Manually toggle filters ON when you want to narrow down to high-quality signals only
- The "Show all signals" empty state button will still work if you toggle filters on and they hide everything

