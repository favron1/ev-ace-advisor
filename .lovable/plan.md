
# Plan: Add Clear Bet Recommendation Display

## Problem
Currently, signal cards show event names like "Utah Jazz vs Golden State Warriors" with just "YES" or "NO" as the side, but users don't know **which team to actually bet on**.

The `outcome` field (containing the actual team name like "Utah Jazz") exists in `bookmaker_signals` but is discarded during signal detection.

## Solution Overview
Store the specific team/player pick in the signal data and display it prominently in the UI so users clearly see "Bet on **Utah Jazz** to win" rather than just "YES".

---

## Implementation Steps

### 1. Database Migration
Add a `recommended_outcome` column to store the actual pick:

```sql
ALTER TABLE signal_opportunities 
ADD COLUMN recommended_outcome text;

COMMENT ON COLUMN signal_opportunities.recommended_outcome IS 
  'The specific team/player/outcome to bet on';
```

### 2. Update Signal Detection (`detect-signals/index.ts`)
Pass through the `outcome` field from bookmaker signals:

```text
Current:
  side = bookmakerProb > 0.5 ? 'YES' : 'NO'

Updated:
  recommended_outcome = bestSignal.outcome  // "Utah Jazz"
  side = 'YES'  // Always YES for H2H favorites
```

The detection will now include:
- `recommended_outcome`: The actual team/player name (e.g., "Utah Jazz")
- `side`: Still tracks YES/NO for Polymarket-style logic
- `event_name`: The full matchup (e.g., "Utah Jazz vs Golden State Warriors")

### 3. Update TypeScript Types
Add the new field to `SignalOpportunity` interface:

```typescript
// src/types/arbitrage.ts
export interface SignalOpportunity {
  // ... existing fields
  recommended_outcome?: string;  // The specific pick
}
```

### 4. Update Signal Card UI (`SignalCard.tsx`)
Display the recommendation prominently:

```text
Before:
  [HIGH] Utah Jazz vs Golden State Warriors
  [YES ↑] @ 50.0¢

After:
  [HIGH] Utah Jazz vs Golden State Warriors
  [BET: Utah Jazz] ↑ 79.7% implied
  "Back Utah Jazz to win"
```

Visual changes:
- Replace ambiguous "YES/NO" badge with team name
- Add clear action text: "Back [Team] to win"
- Show the bookmaker implied probability for the pick
- Color-code based on confidence level

---

## Technical Changes

| File | Change |
|------|--------|
| Database migration | Add `recommended_outcome` column |
| `supabase/functions/detect-signals/index.ts` | Store `bestSignal.outcome` as `recommended_outcome` |
| `src/types/arbitrage.ts` | Add `recommended_outcome?: string` to interface |
| `src/components/terminal/SignalCard.tsx` | Display recommended outcome prominently with clear action text |

---

## Expected Result

**Before:**
> Utah Jazz vs Golden State Warriors  
> [YES] @ 50.0¢  
> Edge: +29.7%

**After:**
> Utah Jazz vs Golden State Warriors  
> **Bet: Utah Jazz** (79.7% implied)  
> Edge: +29.7% | Confidence: 95

Users will instantly know they should place a bet on Utah Jazz to win, rather than guessing what "YES" means.
