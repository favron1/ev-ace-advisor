
## Fix: Add Outlier Protection + Bookmaker Probability Refresh

### Problem Identified
The Blue Jackets vs Blues signal shows a 30.9% edge because Betfair briefly showed 99% implied probability for the Blues (a data glitch). Sportsbet's 1.82 odds (~55%) is correct and matches all other bookmakers. The system has no protection against outlier data.

### Two-Part Fix

**1. Add Outlier Protection in polymarket-monitor (Prevention)**

When calculating consensus fair probability, reject individual book data points that are extreme outliers:

```typescript
// In calculateConsensusFairProb function
function calculateConsensusFairProb(game, marketKey, targetIndex, sport) {
  // ... existing code ...
  
  for (const bookmaker of game.bookmakers || []) {
    // ... existing code ...
    
    const fairProb = calculateFairProb(odds, adjustedTargetIndex);
    
    // NEW: Outlier protection - reject extreme probabilities (>92% or <8%)
    // Real H2H sporting events rarely have 12+ to 1 favorites
    if (fairProb > 0.92 || fairProb < 0.08) {
      console.log(`[POLY-MONITOR] OUTLIER REJECTED: ${bookmaker.key} prob=${(fairProb*100).toFixed(1)}%`);
      continue; // Skip this bookmaker's data
    }
    
    // ... rest of calculation ...
  }
}
```

**2. Add Bookmaker Probability Refresh in refresh-signals (Correction)**

When refreshing signals, also fetch fresh bookmaker odds and recalculate the fair probability:

```typescript
// In refresh-signals/index.ts
// After getting CLOB prices, also fetch fresh bookmaker odds

// Step 1: Fetch current sharp book odds from The Odds API
const freshOdds = await fetchFreshBookmakerOdds(oddsApiKey, sportKey);

// Step 2: Recalculate fair probability using current data
const freshFairProb = calculateConsensusFairProb(matchedGame, 'h2h', targetIndex, sport);

// Step 3: Update signal with BOTH fresh Poly price AND fresh bookie prob
const newEdge = freshFairProb - livePolyPrice;
```

### Edge Case: Stale Bookmaker Data
If the signal's fair probability differs by >15% from fresh bookmaker consensus, auto-expire it as "stale data":

```typescript
if (Math.abs(signal.bookmaker_prob_fair - freshFairProb) > 0.15) {
  // Mark as expired - the original data was likely bad
  await supabase
    .from('signal_opportunities')
    .update({ status: 'expired', expiry_reason: 'stale_bookmaker_data' })
    .eq('id', signal.id);
}
```

### Immediate Action: Expire This Signal
This Blue Jackets vs Blues signal should be expired immediately since:
- Current sharp book consensus: ~53% Blues
- Signal's stored probability: 83.9% Blues
- Difference: 30.9% (well above 15% threshold)

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Add outlier rejection (>92% or <8%) in `calculateConsensusFairProb` |
| `supabase/functions/refresh-signals/index.ts` | Add fresh bookmaker odds fetching and fair probability recalculation |
| Database | Expire the Blue Jackets vs Blues signal with reason "stale_bookmaker_data" |

### API Quota Consideration
The bookmaker refresh during signal refresh WILL use API quota (1 request per sport with active signals). This is acceptable because:
1. Refresh is user-initiated (not automatic)
2. Ensures data integrity
3. Prevents false signals from persisting

### Expected Outcome
After implementation:
1. The Blues signal will be automatically expired on next refresh
2. Future outlier spikes (like Betfair's 99%) will be rejected at creation time
3. Refresh will show accurate, current edges based on real market consensus
