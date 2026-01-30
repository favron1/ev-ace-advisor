

# Analysis: Edge Detection & SMS Issues

## Problem 1: Why Only Hockey Signals?

**Root Cause Analysis:**

Looking at the data and logs, I found:

1. **Limited Polymarket Cache**: The system loaded **52 watched markets**, but only:
   - 81 NHL markets (most in cache)
   - 12 NBA markets
   - 8 NCAA markets  
   - 2 NFL markets

2. **Volume Filter Blocking NBA**: Many NBA markets have **volume = 0** in the cache:
   ```
   Toronto Raptors vs Orlando Magic: volume = 0
   Sacramento Kings vs Boston Celtics: volume = 0
   Memphis Grizzlies vs New Orleans Pelicans: volume = 0
   ```
   
   The API-sourced markets require `volume >= 5000` to be processed (line 816), so these are being loaded but likely failing edge checks.

3. **Matching Issues**: The logs show mismatches where the system incorrectly pairs events:
   ```
   INVALID MATCH: "Columbus Blue Jackets" not found in event "St. Louis Blues vs Nashville Predators"
   INVALID MATCH: "New Orleans Pelicans" not found in event "Portland Trail Blazers vs New York Knicks"
   ```
   
   The AI matching is returning wrong bookmaker games for Polymarket events.

4. **Only 18/52 Matched**: Out of 52 polled markets, only 18 found matching bookmaker data, and only 1 had a significant edge (the Blackhawks game).

---

## Problem 2: Why No SMS For The Blackhawks Signal?

**Root Cause: Signal Tier = "static" (not "elite" or "strong")**

The current signal shows:
- `signal_tier: "static"`
- `movement_confirmed: false`

SMS alerts are **ONLY** sent for `elite` or `strong` tier signals (lines 563-567):

```typescript
if (signalTier !== 'elite' && signalTier !== 'strong') {
  console.log(`[POLY-MONITOR] Skipping SMS for ${signalTier} tier signal`);
  return false;
}
```

The tier calculation logic (lines 429-437):

```typescript
function calculateSignalTier(movementTriggered: boolean, netEdge: number) {
  if (!movementTriggered) return 'static';  // <-- This is why!
  if (netEdge >= 0.05) return 'elite';
  if (netEdge >= 0.03) return 'strong';
  return 'static';
}
```

**The Problem**: Even with a 15.2% edge, without **movement confirmation** (2+ sharp books moving in the same direction within 30 minutes), the signal is classified as `static` and SMS is never sent.

---

## Summary of Issues

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Only hockey signals | Most NBA/NCAA/NFL markets have zero volume or fail matching | Only NHL markets pass all filters |
| Matching failures | AI returns wrong bookmaker games for abbreviations | 34/52 markets fail to match |
| No SMS alert | Signal tier = "static" because no movement confirmation | User never notified |

---

## Proposed Fixes

### Fix 1: Allow SMS for High-Edge Static Signals

**Rationale**: A 15.2% edge is significant regardless of movement. Send SMS for static signals with edge >= 10%.

**Change**: Update SMS condition (around line 1383):

```typescript
// Before:
if (!signalError && signal && !existingSignal && (signalTier === 'elite' || signalTier === 'strong')) {

// After:
const shouldSendSms = signalTier === 'elite' || signalTier === 'strong' || rawEdge >= 0.10;
if (!signalError && signal && !existingSignal && shouldSendSms) {
```

### Fix 2: Improve Signal Tier for High-Edge Static Signals

**Alternative Approach**: Consider high-edge static signals as "strong" for SMS purposes.

**Change**: Update `calculateSignalTier` function:

```typescript
function calculateSignalTier(movementTriggered: boolean, netEdge: number): 'elite' | 'strong' | 'static' {
  // High edge alone qualifies as strong (for SMS)
  if (netEdge >= 0.10) return movementTriggered ? 'elite' : 'strong';
  
  if (!movementTriggered) return 'static';
  if (netEdge >= 0.05) return 'elite';
  if (netEdge >= 0.03) return 'strong';
  return 'static';
}
```

This means:
- 10%+ edge = at least "strong" (gets SMS)
- 10%+ edge + movement = "elite"
- Under 10% requires movement to get SMS

### Fix 3: Improve Matching Accuracy

The AI matching is returning incorrect games. Add stricter validation in `findBookmakerMatch` to verify the matched game contains BOTH teams from the Polymarket event before proceeding.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Update signal tier logic, SMS triggering conditions |

### Implementation Steps

1. Update `calculateSignalTier` to promote high-edge (10%+) static signals to "strong"
2. Alternatively, update SMS trigger condition to include high-edge static signals
3. Add logging for why signals are classified as static
4. Redeploy and test with a manual scan

### Expected Outcome

After these fixes:
- The 15.2% Blackhawks edge would trigger an SMS alert
- High-edge opportunities won't be missed due to lack of movement confirmation
- User will receive notifications for significant edges regardless of movement status

