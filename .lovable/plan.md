

## Fix: Backfill Missing Team Names and Prevent Future Gaps

### What Went Wrong
The Utah vs. Hurricanes signal was created before the fix. The matching logic found a bookmaker match but failed to extract the specific team name due to nickname vs. full name mismatches. The signal was saved with `recommended_outcome: null`.

### Why This Must Never Happen
You're correct - if the system can't determine which side to bet, showing the signal is useless. A signal without a bet side is not actionable.

### Fix Plan

**1. Update the signal creation logic to REQUIRE a team name**
- In `polymarket-monitor`, if `match.teamName` is empty or null, don't create the signal
- Only create signals when we can confidently identify the bet side

**2. Fix the existing Utah signal**
- Query the Polymarket cache to get the extracted entity (team name)
- Update the existing signal with the correct `recommended_outcome`

**3. Improve team name extraction**
- Use the `extracted_entity` field from `polymarket_h2h_cache` which already has the team name parsed
- This is more reliable than trying to parse it from matching logic

### Technical Changes

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Add validation: if `teamName` is empty, skip signal creation |
| `supabase/functions/polymarket-monitor/index.ts` | Use `extracted_entity` from cache as fallback for team name |
| Database | Run update to backfill `recommended_outcome` from cache data |

### Validation
- Signals will only be created when we know the exact bet side
- SMS and UI will always show the team name
- No more "BET SIDE UNKNOWN" scenarios for true arbitrage

