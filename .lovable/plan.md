

# Fix: Polymarket H2H vs O/U Market Misclassification

## Problem Identified

Based on my investigation:

1. **You searched Polymarket for "Utah vs. Hurricanes"** and found:
   - An **Over/Under 5.5** market (Totals) showing 57%
   - A **resolved "Hurricanes"** market (already settled)
   - **No active H2H market** for this game

2. **But the app is recommending an H2H bet** because:
   - The cache has `question: "Utah vs. Hurricanes"` (which is just the event title, not the actual market question)
   - `market_type: "h2h"` (incorrectly classified)  
   - `yes_price: 0.5` (50% placeholder price)

## Root Cause

The `polymarket-sync-24h` function has two issues:

### Issue 1: Wrong Question Source
The function is storing the **event title** as the question instead of the **actual market question**:
```
Event title: "Utah vs. Hurricanes"  ← What's stored
Actual market question: "Will there be over 5.5 goals?" ← What exists
```

### Issue 2: Market Type Detection Failure
Because the question is just "Utah vs. Hurricanes" (no "over/under" keywords), the `detectMarketType()` function defaults to `h2h`:
```typescript
// This returns 'h2h' when no O/U or spread patterns found
return 'h2h'; // Line 106
```

### Issue 3: Multiple Markets Not Handled
Each Polymarket event can have **multiple markets** (H2H, O/U 5.5, O/U 6.5, etc.), but we only take the first market (`markets[0]`), which may not be an H2H.

---

## Solution

### Step 1: Use Gamma API's `sportsMarketType` Field
The logs show Gamma API returns a `sportsMarketType` field that indicates the actual market type. Use this instead of regex-based detection:
```typescript
const marketType = market.sportsMarketType || detectMarketType(question);
```

### Step 2: Filter for H2H Markets Only (When Focus Mode = h2h_only)
Since the system is designed for H2H arbitrage, skip O/U and spread markets:
```typescript
if (marketType === 'total' || marketType === 'spread') {
  statsNonH2h++;
  continue; // Skip non-H2H markets
}
```

### Step 3: Iterate ALL Markets in Event
Instead of just taking `markets[0]`, look through all markets to find an actual H2H market:
```typescript
// Find H2H market from all event markets
const h2hMarket = markets.find(m => {
  const type = m.sportsMarketType || detectMarketType(m.question);
  return type === 'h2h' || type === 'moneyline';
});

if (!h2hMarket) {
  statsNoH2H++;
  continue; // No H2H market exists for this event
}
```

### Step 4: Add H2H Existence Verification
Before creating a signal, verify the Polymarket market actually exists by checking the `sportsMarketType`:
```typescript
// In detect-signals: Skip if matched market isn't actually H2H
if (matchedMarket.market_type !== 'h2h' && matchedMarket.market_type !== 'moneyline') {
  console.log(`[DETECT] Skipping ${eventName}: Poly market is ${matchedMarket.market_type}, not H2H`);
  continue;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-sync-24h/index.ts` | Use `sportsMarketType` field, filter for H2H only, iterate all event markets |
| `supabase/functions/detect-signals/index.ts` | Add validation that matched Polymarket market is actually H2H |

---

## Technical Details

### Changes to `polymarket-sync-24h/index.ts`

**Line ~309** - Replace single market selection with H2H search:
```typescript
// Current (wrong):
const primaryMarket = markets[0];

// Fixed:
// Find the H2H/moneyline market, not O/U or spread
const h2hMarket = markets.find(m => {
  const type = m.sportsMarketType?.toLowerCase() || '';
  const question = (m.question || '').toLowerCase();
  
  // Skip totals and spreads
  if (type.includes('total') || type.includes('spread') || 
      type.includes('over') || type.includes('under')) {
    return false;
  }
  if (/over\s+\d+|under\s+\d+|o\/u|spread|handicap/i.test(question)) {
    return false;
  }
  
  // Accept moneyline, h2h, or generic matches
  return type === 'h2h' || type === 'moneyline' || 
         type === '' || /vs\.?|beat|win/i.test(question);
});

if (!h2hMarket) {
  statsNoH2H++;
  continue; // This event doesn't have an H2H market on Poly
}
```

**Line ~353** - Use Gamma's market type field:
```typescript
// Current:
const marketType = detectMarketType(question);

// Fixed:
const marketType = market.sportsMarketType?.toLowerCase() || detectMarketType(question);
```

### Changes to `detect-signals/index.ts`

Add validation in the signal creation loop to skip non-H2H matches:
```typescript
// Before creating signal, verify market type
if (bestMatch && bestMatch.market_type && bestMatch.market_type !== 'h2h') {
  console.log(`[DETECT] Skipping ${signal.event_name}: Matched market is ${bestMatch.market_type}, not H2H`);
  continue;
}
```

---

## Expected Outcome

After these fixes:
- Utah vs. Hurricanes will be **skipped** (no H2H market exists on Polymarket)
- Only events with actual H2H/moneyline markets will generate signals
- No more "phantom" bets for markets that don't exist
- Edge calculations will be accurate because they're based on real tradeable markets

---

## Verification Steps

1. Deploy updated functions
2. Trigger `polymarket-sync-24h` 
3. Check logs for "No H2H market" messages for games like Utah vs. Hurricanes
4. Verify `polymarket_h2h_cache` only contains actual H2H markets
5. Confirm signal feed no longer shows bets for non-existent markets

