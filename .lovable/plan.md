
# Fix Polymarket H2H Matching for NBA Game Markets

## Problem Identified

You found a Timberwolves vs Dallas game at 70¢ on Polymarket, but the system shows "No Match" because:

1. **Database only has Futures**: The `polymarket_markets` table only contains NBA Finals championship markets (e.g., "Will Timberwolves win 2026 NBA Finals?" at 2.5¢), not tonight's game markets
2. **fetch-polymarket uses wrong API endpoint**: It fetches top 100 events by general popularity (politics, crypto) instead of sports-specific H2H markets
3. **detect-signals can't match**: When it tries to match "Dallas Mavericks vs Minnesota Timberwolves" against cached markets, it finds only futures markets which don't match

Polymarket actually has **62 active NBA game markets** with massive volume:
- Trail Blazers vs Wizards: $2.25M volume, 69¢
- Pelicans vs Thunder: $1.46M volume, 87¢  
- Pistons vs Nuggets: $1.19M volume, 71¢

## Solution: Two-Part Fix

### Part 1: Enhance detect-signals to Search Live Polymarket

Instead of only checking cached data, `detect-signals` will make a **live API call** when creating a signal, using the same `fetchPolymarketForEvent()` helper that `active-mode-poll` uses:

```text
CURRENT FLOW:
Bookmaker signal detected → Search cached polymarket_markets → No match → Signal Only

NEW FLOW:  
Bookmaker signal detected → Live Polymarket API search → Match found → Calculate Edge → True Arbitrage!
```

**API call example:**
```
GET https://gamma-api.polymarket.com/events?active=true&title_contains=Timberwolves
```

Returns the live H2H market with current YES/NO prices.

### Part 2: Display Available NBA Markets in UI

Add a new component that shows currently available Polymarket NBA game markets so you can verify what's tradeable:

| Game | YES Price | Volume | Status |
|------|-----------|--------|--------|
| Trail Blazers vs Wizards | 69¢ | $2.25M | Available |
| Timberwolves vs Mavericks | 70¢ | (if exists) | Available |
| Pelicans vs Thunder | 87¢ | $1.46M | Available |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/detect-signals/index.ts` | Import `fetchPolymarketForEvent()` helper and call it for unmatched H2H signals before marking as "Signal Only" |
| `src/components/terminal/PolymarketAvailability.tsx` | New component to display available Polymarket NBA markets |
| `src/pages/Terminal.tsx` | Add the PolymarketAvailability component to the terminal page |

## Technical Details

### detect-signals Enhancement

The key change is around line 750-758 of detect-signals where unmatched signals are created:

```javascript
// BEFORE: No match found, create signal-only
if (!polyMatch) {
  polyPrice = 0.5;
  signalStrength = Math.abs(bookmakerProbFair - 0.5) * 100;
  edgePct = 0;
  isTrueArbitrage = false;
  h2hUnmatchedCount++;
}

// AFTER: No cache match, try LIVE Polymarket API
if (!polyMatch) {
  console.log(`No cache match for ${eventName}, trying live API...`);
  const liveMatch = await fetchPolymarketForEvent(eventName, recommendedOutcome);
  
  if (liveMatch && liveMatch.confidence >= 0.85) {
    polyPrice = liveMatch.yes_price;
    edgePct = (bookmakerProbFair - polyPrice) * 100;
    isTrueArbitrage = true;
    matchConfidence = liveMatch.confidence;
    h2hMatchedCount++;
    console.log(`LIVE MATCH: ${eventName} -> ${liveMatch.question} (edge: ${edgePct.toFixed(1)}%)`);
  } else {
    // Fallback to signal-only
    polyPrice = 0.5;
    signalStrength = Math.abs(bookmakerProbFair - 0.5) * 100;
    edgePct = 0;
    isTrueArbitrage = false;
    h2hUnmatchedCount++;
  }
}
```

### API Cost Consideration

Each unmatched H2H signal will trigger 1-3 Polymarket API calls. With ~15-20 unique H2H events per detection run, this adds ~20-60 Polymarket API calls (free, no quota limit) per scan.

## Expected Outcome

After implementation:

| Event | Before | After |
|-------|--------|-------|
| Timberwolves vs Dallas | Signal Only (0% edge) | True Arbitrage (1-3% edge if Polymarket lags) |
| Utah vs Warriors | Signal Only | True Arbitrage or Signal Only (depends on match) |

You'll see actual edge percentages calculated from live Polymarket prices, not just signal strength indicators.
