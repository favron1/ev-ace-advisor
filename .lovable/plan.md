
## Fix: Display Actual Bet Side (Team Name), Not Event Name

### Problem
Signal cards show "BET: Utah vs. Hurricanes" - which is the event name, not the bet. You need to know which team to back (e.g., "BET: Utah Utes" or "BET: Carolina Hurricanes").

The `recommended_outcome` column in `signal_opportunities` is empty/null because the edge function that creates signals from the polymarket-monitor flow doesn't populate it correctly.

### Data Flow Issue
1. **polymarket-monitor** creates signals but sets `recommended_outcome: null`
2. **active-mode-poll** sets `recommended_outcome: event.bookmaker_market_key` - but this is often the matched team name from matching logic, not necessarily correct
3. **detect-signals** correctly sets `recommended_outcome: recommendedOutcome` (the specific team name from bookmaker data)

### Root Cause
The `polymarket-monitor` edge function at line ~429 inserts signals without `recommended_outcome`:
```typescript
await supabase.from('signal_opportunities').insert({
  event_name: event.event_name,
  side: 'YES',
  // MISSING: recommended_outcome
  ...
});
```

### Fix Plan

**1. Update `polymarket-monitor` to include recommended_outcome**
- When creating a signal, extract the team name from the matched bookmaker data
- The match function already identifies which team we're betting on
- Store this in `recommended_outcome` column

**2. Update SignalCard fallback logic**
- If `recommended_outcome` is null AND `is_true_arbitrage` is true, show a warning
- Never display the event name as the bet - that's misleading
- Show "Bet side unknown - check data" if we can't determine the team

**3. Fix SMS message to include team name**
- Update SMS template to include the specific team/outcome being recommended

### Technical Changes

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Pass matched team name to signal creation |
| `src/components/terminal/SignalCard.tsx` | Don't fallback to event_name; show error if no recommended_outcome |
| `supabase/functions/active-mode-poll/index.ts` | Verify bookmaker_market_key contains the right team name |
| SMS template | Include team name in alert message |

### Expected Result
- Cards show "BET: Utah Utes" or "BET: Carolina Hurricanes" (specific team)
- SMS alerts include which team to back
- If system can't determine the bet side, it shows an error rather than misleading info
