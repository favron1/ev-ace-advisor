

# Add Decimal Odds Comparison to Signal Cards

## What You'll See

The signal cards will now show both Polymarket and Sharp Book payouts in **dollar format** (decimal odds), making it easy to compare directly with what you see on Sportsbet.

### New "Odds Comparison" Section

```
+-------------------+-------------------+
|   POLYMARKET      |   SHARP BOOKS     |
|     $2.33         |     $1.63         |
|   (43¢ share)     |   (fair value)    |
+-------------------+-------------------+
```

**What this means:**
- **POLYMARKET $2.33** = If you buy a 43¢ share and it wins, you get $1.00 back (2.33x return)
- **SHARP BOOKS $1.63** = The fair odds based on sharp bookmaker consensus

**The edge is the difference**: You're getting $2.33 odds on Polymarket when the "true" price should be closer to $1.63. That 70¢ difference per dollar is your profit margin.

## Calculation Logic

```
Polymarket decimal odds = 1 / polymarket_yes_price
Example: 1 / 0.43 = $2.33

Sharp book decimal odds = 1 / bookmaker_prob_fair  
Example: 1 / 0.61 = $1.64
```

## Files to Modify

### 1. `src/components/terminal/SignalCard.tsx`

**Add helper function:**
```typescript
function toDecimalOdds(probability: number): string {
  if (!probability || probability <= 0) return 'N/A';
  return `$${(1 / probability).toFixed(2)}`;
}
```

**Replace the current hero metrics row** with a new odds comparison layout:

- Column 1: **POLYMARKET** - Shows decimal odds + cents price
- Column 2: **SHARP BOOKS** - Shows decimal odds + fair probability
- Column 3: **EDGE** - Shows the dollar difference per $1 bet

### Example Display

For the Rangers vs Islanders signal:
- Polymarket YES: 43¢ → **$2.33** payout
- Sharp Fair Value: 61% → **$1.64** payout  
- Edge: **+$0.69** per dollar (you're getting 69¢ more per $1 than fair value)

## Visual Design

The new comparison will be prominent and color-coded:
- Polymarket odds in **primary color** (blue/purple)
- Sharp book odds in **neutral color** (white/gray)
- A clear **arrow or "vs"** between them
- The difference highlighted in **green** when positive

