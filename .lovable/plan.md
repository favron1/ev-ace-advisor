

# Information-Arrival Detection System

## Current State Analysis

The system currently operates as a **value scanner**:
- `polymarket-monitor` fetches bookmaker consensus and compares to Polymarket
- No historical sharp book price tracking exists
- `bookmaker_signals` table stores aggregated "consensus" data (2,262 records), not individual book movements
- `probability_snapshots` has minimal data (94 records) and isn't used for movement detection
- Signals are created when `rawEdge >= 2%` without checking HOW or WHEN the edge appeared

**The gap**: No distinction between slow drift, static mispricing, or rapid coordinated sharp moves.

---

## Proposed Architecture

```text
Every 5 minutes:
  
  [NEW] 1. Store individual sharp book prices
        └── sharp_book_snapshots table (Pinnacle, Betfair, Circa)
  
  [NEW] 2. Calculate movement for each sharp book
        └── Compare to 15min, 30min ago
        └── Check velocity + direction
  
  [NEW] 3. MOVEMENT GATE
        ├── ≥2 sharp books moved?
        ├── ≥X% probability change (scaled to baseline)?
        ├── Same direction (no counter-moves)?
        └── Recency bias (≥70% of move in last 10min)?
  
  [EXISTING] 4. Compare to Polymarket (only if gate passes)
  
  [MODIFIED] 5. Create tiered signal
        ├── ELITE: Movement + ≥5% edge → SMS
        ├── STRONG: Movement + ≥3% edge → SMS
        └── STATIC: No movement (optional, no SMS)
```

---

## Database Changes

### New Table: `sharp_book_snapshots`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| event_key | text | Links to event_watch_state.event_key |
| event_name | text | Human-readable name |
| outcome | text | Team/player being priced |
| bookmaker | text | pinnacle, betfair, circa |
| implied_probability | numeric | Fair prob at capture |
| raw_odds | numeric | Decimal odds |
| captured_at | timestamptz | When captured |

**Indexes**:
- `(event_key, bookmaker, captured_at)` for time-series queries
- Auto-cleanup: DELETE WHERE captured_at < now() - interval '24 hours'

### Modify: `signal_opportunities`

Add columns:
- `movement_confirmed` (boolean, default false) - Movement gate passed
- `movement_velocity` (numeric) - Speed of sharp book move
- `signal_tier` (text: 'elite', 'strong', 'static') - Quality classification

---

## Movement Detection Logic (Your Refinements Applied)

### 1. Probability-Relative Threshold
```text
function getMovementThreshold(baselineProb):
  // 3% move from 20% is massive, 3% from 75% is less meaningful
  return max(0.02, 0.12 * baselineProb)
```

### 2. Recency Bias Check
```text
function checkRecencyBias(snapshots):
  // Get oldest and newest prices
  oldest = snapshots[0].implied_probability
  newest = snapshots[-1].implied_probability
  totalMove = abs(newest - oldest)
  
  // Get price 10 minutes ago
  tenMinAgo = snapshots.find(s => s.captured_at > now - 10min)
  recentMove = abs(newest - tenMinAgo.implied_probability)
  
  // Require ≥70% of move in last 10 minutes
  return (recentMove / totalMove) >= 0.70
```

### 3. No Counter-Move Check
```text
function checkNoCounterMoves(movements):
  // movements = [{ book, direction, magnitude }, ...]
  primaryDirection = sign(movements[0].change)
  
  for each movement:
    // If any sharp book moved meaningfully in opposite direction, fail
    if sign(movement.change) != primaryDirection && abs(movement.change) >= 0.02:
      return false
  
  return true
```

### 4. Full Movement Gate
```text
function detectSharpMovement(event_key, outcome):
  // Get last 30 minutes of sharp book data
  snapshots = SELECT * FROM sharp_book_snapshots
              WHERE event_key = event_key AND outcome = outcome
              AND captured_at > now() - interval '30 minutes'
              ORDER BY captured_at
  
  byBook = groupBy(snapshots, 'bookmaker')
  movements = []
  
  for book in ['pinnacle', 'betfair', 'circa']:
    if book not in byBook or byBook[book].length < 2: continue
    
    oldest = byBook[book][0].implied_probability
    newest = byBook[book][-1].implied_probability
    change = newest - oldest
    
    // Probability-relative threshold
    threshold = max(0.02, 0.12 * oldest)
    
    if abs(change) >= threshold:
      // Check recency bias
      if checkRecencyBias(byBook[book]):
        movements.push({ book, change, direction: sign(change) })
  
  // Coordination check: ≥2 books, same direction, no counter-moves
  if movements.length >= 2:
    if checkNoCounterMoves(movements):
      avgVelocity = avg(movements.map(m => abs(m.change)))
      return { triggered: true, velocity: avgVelocity }
  
  return { triggered: false }
```

---

## Signal Tier Classification

| Tier | Movement Gate | Net Edge | SMS | UI Badge |
|------|--------------|----------|-----|----------|
| **ELITE** | PASSED | ≥5% | Yes (immediate) | Pulsing red |
| **STRONG** | PASSED | ≥3% | Yes | Yellow |
| **STATIC** | FAILED | ≥2% | Never | Gray (optional) |

**Key change**: STATIC edges are never SMS'd. They are low-confidence, manual-review-only opportunities.

---

## Implementation Steps

### Step 1: Database Migration
Create `sharp_book_snapshots` table with indexes and auto-cleanup trigger.
Add `movement_confirmed`, `movement_velocity`, `signal_tier` columns to `signal_opportunities`.

### Step 2: Modify `ingest-odds` Function
Currently stores aggregated consensus. Modify to ALSO store individual sharp book prices:
- Before calculating consensus, log each Pinnacle/Betfair/Circa price to `sharp_book_snapshots`
- ~5 extra rows per event per poll cycle

### Step 3: Modify `polymarket-monitor` Function
Add movement detection before signal creation:

```text
// Before line 570 (edge check)
const movement = await detectSharpMovement(event.event_key, teamName);

if (rawEdge >= 0.02) {
  const tier = movement.triggered
    ? (netEdge >= 0.05 ? 'elite' : netEdge >= 0.03 ? 'strong' : 'static')
    : 'static';
  
  // Only create signals for movement-confirmed or high static edges
  if (movement.triggered || netEdge >= 0.05) {
    // Insert/update with movement_confirmed, movement_velocity, signal_tier
    // Only send SMS if tier is 'elite' or 'strong'
  }
}
```

### Step 4: Update Frontend
- Add filter: "Movement-Confirmed Only" toggle (default: on)
- Show "MOVEMENT CONFIRMED" badge for elite/strong signals
- Show movement velocity on signal card (e.g., "+4.2% in 10min")
- Gray out static edges, mark as "Manual Review"

### Step 5: Add Cleanup Cron
Schedule daily cleanup of `sharp_book_snapshots` older than 24 hours to prevent table bloat.

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Create `sharp_book_snapshots`, add signal columns |
| `supabase/functions/ingest-odds/index.ts` | Store individual sharp book prices |
| `supabase/functions/polymarket-monitor/index.ts` | Add movement gate, tier classification, modify SMS logic |
| `src/hooks/useSignals.ts` | Add `movementConfirmedOnly` filter option |
| `src/components/terminal/SignalCard.tsx` | Show movement badge, velocity, tier styling |
| `src/components/terminal/FiltersBar.tsx` | Add "Movement-Confirmed Only" toggle |

---

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Signals per day | 50+ (many static) | 5-15 (movement-confirmed) |
| SMS alerts | Every ≥3% edge | Only coordinated moves |
| False positive rate | Higher | Much lower |
| Signal trust | Variable | High (information-arrival only) |
| Time to detection | Indeterminate | ~5-15 min after sharp move |

**The system will now answer the right question:**
> "Did bookmakers just move sharply, and Polymarket has not reacted yet?"

Instead of:
> "Is there a price discrepancy right now?"

This is the architectural shift from hobbyist EV scanning to professional information-arrival detection.

