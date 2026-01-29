

# Directional Signal Labeling: BUY YES vs BUY NO

## Overview

The system will now explicitly label whether to **BUY YES** or **BUY NO** on Polymarket based on the direction of sharp bookmaker movement:

| Movement Direction | Meaning | Polymarket Action |
|---|---|---|
| **Shortening** | Bookies increased probability (favoring outcome) | **BUY YES** |
| **Drifting** | Bookies decreased probability (disfavoring outcome) | **BUY NO** |

This keeps the system **directionally neutral** and lets signal quality (edge, movement, liquidity) determine which opportunities surface.

---

## Technical Changes

### 1. Backend: polymarket-monitor Edge Function

**Current logic (line 715-827):**
```javascript
const rawEdge = bookmakerFairProb - livePolyPrice;
// Always sets side: 'YES'
```

**New logic:**
```javascript
// Determine bet side based on movement direction and edge
let betSide: 'YES' | 'NO' = 'YES';
let rawEdge = bookmakerFairProb - livePolyPrice;

if (movement.triggered && movement.direction === 'drifting') {
  // Bookies drifted (prob DOWN) - bet NO on Polymarket
  // Edge = (1 - bookmakerFairProb) - (1 - livePolyPrice) = livePolyPrice - bookmakerFairProb
  betSide = 'NO';
  rawEdge = (1 - livePolyPrice) - (1 - bookmakerFairProb);
}

if (rawEdge >= 0.02) {
  // ... signal creation with side: betSide
}
```

**SMS message update:**
```
BUY YES: Edmonton Oilers  (or)
BUY NO: San Jose Sharks
```

### 2. Types: Update SignalFactors

Add `bet_direction` field to signal_factors for explicit tracking:

```typescript
interface SignalFactors {
  // ... existing fields
  bet_direction?: 'BUY_YES' | 'BUY_NO';
}
```

### 3. Frontend: SignalCard Updates

**Bet badge logic:**
```tsx
const betDirection = signal.side === 'YES' ? 'BUY YES' : 'BUY NO';
const directionColor = signal.side === 'YES' 
  ? 'bg-green-500/20 text-green-400' 
  : 'bg-blue-500/20 text-blue-400';

<Badge className={directionColor}>
  {betDirection}: {betTarget}
</Badge>
```

**Action text update:**
```tsx
// Current: "Back Edmonton Oilers to win"
// New (YES): "BUY YES: Back Edmonton Oilers to win"
// New (NO): "BUY NO: Fade San Jose Sharks"
```

### 4. Frontend: FiltersBar Enhancement

Add optional filter for users who only want BUY YES signals:

```tsx
<div className="flex items-center space-x-2">
  <Switch
    id="buy-yes-only"
    checked={showBuyYesOnly}
    onCheckedChange={onShowBuyYesOnlyChange}
  />
  <Label>BUY YES Only</Label>
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Calculate edge/side based on movement direction, update SMS format |
| `src/types/arbitrage.ts` | Add `bet_direction` to SignalFactors |
| `src/components/terminal/SignalCard.tsx` | Display BUY YES/BUY NO badges with colors, update action text |
| `src/components/terminal/FiltersBar.tsx` | Add optional "BUY YES Only" filter toggle |
| `src/hooks/useSignals.ts` | Add `buyYesOnly` filter option |
| `src/pages/Terminal.tsx` | Wire up new filter state |

---

## Example Signal Display

**BUY YES Signal (Shortening):**
```
ELITE +4.2%
Event: Sharks vs. Oilers
BUY YES: Edmonton Oilers  [green badge]
Action: Back Edmonton Oilers to win
Poly: 34¢ | Fair: 61% | Edge: +27%
Movement: Sharp books SHORTENING (favoring Oilers)
```

**BUY NO Signal (Drifting):**
```
STRONG +3.1%
Event: Sharks vs. Oilers  
BUY NO: San Jose Sharks  [blue badge]
Action: Fade San Jose Sharks (buy NO)
Poly: 66¢ | Fair: 39% | Edge: +27%
Movement: Sharp books DRIFTING (disfavoring Sharks)
```

---

## SMS Alert Format

**Current:**
```
ELITE: Sharks vs. Oilers
BET: Edmonton Oilers
Poly: 34¢ ($26K)
```

**New:**
```
ELITE: Sharks vs. Oilers
BUY YES: Edmonton Oilers
Poly YES: 34¢ ($26K)
Sharp books SHORTENING +4.2%
```

or

```
STRONG: Sharks vs. Oilers
BUY NO: San Jose Sharks
Poly NO: 66¢ ($26K)
Sharp books DRIFTING -3.8%
```

---

## Summary

This implementation:
1. Detects BOTH shortening (BUY YES) and drifting (BUY NO) movements
2. Labels signals clearly with the required action
3. Keeps movement gate, liquidity checks, and edge thresholds unchanged
4. Allows optional frontend filter to hide BUY NO signals
5. Does NOT remove drifting signals at detection level - quality determines action

