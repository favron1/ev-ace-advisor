

# Add "Bettable Only" Filter Toggle

## What This Does

Adds a toggle switch to the FiltersBar that filters the signal feed to show **only actionable opportunities** - signals with a `BET` or `STRONG_BET` execution decision. This helps you focus on signals that pass the net +EV criteria rather than wading through marginal or NO_BET signals.

## Implementation

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Terminal.tsx` | Add `showBettableOnly` state and pass to FiltersBar + getFilteredSignals |
| `src/components/terminal/FiltersBar.tsx` | Add new toggle switch for "Bettable Only" |

### UI Change

The FiltersBar will get a new toggle in the Signal Type section:

```
Signal Type
-----------
[ ] True Edges Only     <- existing
[ ] Bettable Only       <- NEW

Shows: BET/STRONG_BET only (when enabled)
```

### Technical Details

**Terminal.tsx changes:**
- Add `showBettableOnly` state (default: `false`)
- Pass to `FiltersBar` as prop
- Include in `getFilteredSignals({ bettableOnly: showBettableOnly })`

**FiltersBar.tsx changes:**
- Add props: `showBettableOnly: boolean` and `onShowBettableOnlyChange: (value: boolean) => void`
- Add a second Switch component below "True Edges Only"
- Update helper text dynamically based on state

### Visual Layout

The Signal Type section will show both toggles stacked:

```text
Signal Type
-----------
[Toggle] True Edges Only
         Showing matched arbitrage only
         
[Toggle] Bettable Only  
         Showing BET/STRONG_BET signals only
```

## Result

When "Bettable Only" is enabled, the Signal Feed will only show signals where:
- `execution_decision === 'BET'` OR
- `execution_decision === 'STRONG_BET'`

All `MARGINAL` and `NO_BET` signals will be hidden, letting you focus on actionable opportunities.

