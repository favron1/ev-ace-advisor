
## ✅ COMPLETED: Outlier Protection + Bookmaker Probability Refresh

### Changes Implemented

**1. Outlier Protection in polymarket-monitor (Prevention)**
- Added check in `calculateConsensusFairProb` to reject bookmaker probabilities >92% or <8%
- Protects against data glitches like Betfair showing 99% for a 50/50 game
- Logs rejected outliers for debugging

**2. Bookmaker Probability Refresh in refresh-signals (Correction)**
- Added fresh bookmaker odds fetching from The Odds API during signal refresh
- Recalculates fair probability using current market data with outlier protection
- Auto-expires signals where stored probability differs from fresh consensus by >15%

**3. Expired Stale Blues Signal**
- The Blue Jackets vs Blues signal has been expired

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Added outlier rejection (>92% or <8%) in `calculateConsensusFairProb` |
| `supabase/functions/refresh-signals/index.ts` | Added fresh bookmaker odds fetching, consensus probability calculation, and stale data detection |

### Key Code Additions

```typescript
// In polymarket-monitor - calculateConsensusFairProb
if (fairProb > 0.92 || fairProb < 0.08) {
  console.log(`[POLY-MONITOR] OUTLIER REJECTED: ${bookmaker.key} fairProb=${(fairProb * 100).toFixed(1)}%`);
  continue; // Skip this bookmaker's data point
}
```

```typescript
// In refresh-signals - stale data detection
if (probDiff > 0.15) {
  console.log(`[REFRESH] STALE DATA DETECTED: ${signal.event_name} - stored=${...}%, fresh=${...}%`);
  toExpire.push({ id: signal.id, reason: 'stale_bookmaker_data' });
}
```

### Expected Behavior

1. **Future Signal Creation**: Signals won't be created with outlier bookmaker data (e.g., 99% glitches)
2. **Signal Refresh**: Clicking "Refresh" will now:
   - Fetch fresh bookmaker odds from The Odds API
   - Recalculate fair probability with outlier protection
   - Auto-expire signals where stored probability differs >15% from fresh consensus
   - Show `stale_data_expired` count in refresh response
