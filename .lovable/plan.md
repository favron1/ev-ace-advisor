
# Critical Bug Fixes: Signal Processing Integrity

## Summary

Three critical bugs are causing incorrect signals in the feed:

1. **Cross-Sport Team Mismatch** - "Blackhawks vs. Penguins" (NHL) is matching "Atlanta Hawks" (NBA)
2. **Duplicate Opposing Signals** - Same event ("Utah vs. Hurricanes") shows BUY YES for BOTH teams
3. **Artifact High Edges** - 50%+ edges on 90%+ fair probabilities with stale data are not real

## Bug Analysis

### Bug #1: Cross-Sport Team Mismatch

**Root Cause**: The `findBookmakerMatch` function in `polymarket-monitor/index.ts` uses fuzzy substring matching to find teams. When searching "Blackhawks", the word "hawks" matches the Atlanta Hawks in the NBA data (since the bookmaker API is fetched separately by sport group but matching is not namespace-locked).

**Evidence from DB**:
```
event_name: "Blackhawks vs. Penguins" 
recommended_outcome: "Atlanta Hawks" ← WRONG
```

**Fix Required**: Validate that the matched team is an actual participant in the Polymarket event. If `teamName ∉ {home_team, away_team}` from the event → DROP SIGNAL.

### Bug #2: Duplicate Opposing Signals

**Root Cause**: The signal deduplication checks for `event_name + recommended_outcome` but allows signals for BOTH outcomes (Hurricanes AND Utah) to exist simultaneously for the same event. There's no exclusivity rule preventing two BUY YES signals on opposite sides.

**Evidence from DB**:
```
event_name: "Utah vs. Hurricanes" | recommended_outcome: "Carolina Hurricanes" | side: YES
event_name: "Utah vs. Hurricanes" | recommended_outcome: "Utah Hockey Club" | side: YES
```

**Fix Required**: Before creating/updating a signal, invalidate (expire) any existing active signal for the same event with a DIFFERENT recommended_outcome. Only ONE BUY YES signal per event at a time.

### Bug #3: Artifact High Edges on Stale Data

**Root Cause**: When `polymarket_updated_at` is hours stale (e.g., 4-6 hours old), the cached Polymarket price is outdated while the bookmaker fair probability is current. This creates phantom "edges" of 50%+ that don't exist in reality.

**Evidence**: Signals showing `edge_percent: 54.6%` with `polymarket_updated_at: 2h-6h ago` and `fair_prob: 92%`.

**Fix Required**: 
- Require fresh confirmation (≤3 minutes staleness) for edges on high-probability outcomes (fair prob ≥85%)
- Cap max displayable edge at 40% when fair prob ≥90% OR staleness ≥30 minutes

---

## Implementation Plan

### File 1: `supabase/functions/polymarket-monitor/index.ts`

#### Change 1A: Team Participant Validation

Add a validation gate after `findBookmakerMatch()` to ensure the matched team is actually in the event:

```typescript
// After line 695 (teamName = match.teamName)
if (match && teamName) {
  // CRITICAL: Validate team belongs to this event
  const eventNorm = normalizeName(event.event_name);
  const teamNorm = normalizeName(teamName);
  
  // Team name must appear in the event name (e.g., "Oilers" in "Sharks vs. Oilers")
  if (!eventNorm.includes(teamNorm.split(' ').pop() || '')) {
    console.log(`[POLY-MONITOR] INVALID MATCH: "${teamName}" not in event "${event.event_name}" - DROPPING`);
    continue;
  }
}
```

#### Change 1B: One-Signal-Per-Event Exclusivity

Before creating a new signal, expire any existing signal for the same event with a different outcome:

```typescript
// Before line 850 (INSERT new signal block)
// Invalidate any opposing signal for this event
await supabase
  .from('signal_opportunities')
  .update({ status: 'expired' })
  .eq('event_name', event.event_name)
  .eq('status', 'active')
  .neq('recommended_outcome', teamName);
```

#### Change 1C: Staleness & High-Prob Edge Gating

Add validation for artifact edges:

```typescript
// After line 756 (rawEdge >= 0.02 check), add:
// Gate against artifact edges on high-probability outcomes
const staleness = now.getTime() - new Date(event.last_poly_refresh || 0).getTime();
const stalenessMinutes = staleness / 60000;

if (bookmakerFairProb >= 0.85 && stalenessMinutes > 3) {
  console.log(`[POLY-MONITOR] Skipping high-prob edge for ${event.event_name} - stale price (${stalenessMinutes.toFixed(0)}m old)`);
  continue;
}

if (bookmakerFairProb >= 0.90 && rawEdge > 0.40) {
  console.log(`[POLY-MONITOR] Capping artifact edge for ${event.event_name} - raw ${(rawEdge * 100).toFixed(1)}% on 90%+ prob`);
  rawEdge = 0.40; // Cap at 40%
}
```

### File 2: `src/components/terminal/SignalCard.tsx`

Add visual warning for potentially stale/artifact signals:

```tsx
// Add near the staleness warning display
{signal.bookmaker_probability && signal.bookmaker_probability >= 0.85 && 
 signal.edge_percent > 40 && (
  <span className="text-yellow-500 text-xs">⚠️ High-prob edge - verify manually</span>
)}
```

---

## Validation Rules Summary

| Rule | Condition | Action |
|------|-----------|--------|
| Team Mismatch | `teamName` not found in `event_name` | DROP signal |
| Duplicate Signal | Active signal exists for same event, different outcome | EXPIRE old signal |
| Stale High-Prob | `fair_prob ≥ 85%` AND `staleness > 3min` | DROP signal |
| Artifact Cap | `fair_prob ≥ 90%` AND `raw_edge > 40%` | CAP edge to 40% |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Add team validation, signal exclusivity, staleness gating |
| `src/components/terminal/SignalCard.tsx` | Add high-prob edge warning |

---

## Expected Behavior After Fix

1. **Blackhawks vs. Penguins** → No signal (Atlanta Hawks rejected as non-participant)
2. **Utah vs. Hurricanes** → Only ONE active BUY YES signal (older one expired)
3. **Any 50%+ edge on 90% fair prob** → Blocked unless price is ≤3 minutes fresh

