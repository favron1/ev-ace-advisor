

## Fix SMS Alert Format - Restore Full Details + Live Score Link

### Problem

The last edit condensed the SMS format too much, losing important information like:
- The specific team/bet to place (e.g., "Market: Carolina Hurricanes YES")
- The Net EV calculation
- Time until start
- "ACT NOW" call to action

### New Structure

Based on your screenshot, here's the improved format with the **live score link at the top as a clickable header**:

```text
📺 google.com/search?q=Utah+vs+Hurricanes+live+score
🎯 EDGE DETECTED: Utah vs. Hurricanes
Market: Carolina Hurricanes YES
Polymarket: 40¢ ($164K vol)
Bookmaker Fair: 56%
Raw Edge: +16.2%
Net EV: +$16.20 on $100 stake
Time: ~10 hours until start
ACT NOW - window may close
```

### Implementation

**File: `supabase/functions/send-sms-alert/index.ts`**

Update the `buildEnhancedMessage` function to:

1. Put the **live score URL at the very top** (so it's clickable as a header)
2. Restore all the detail lines:
   - Event name
   - **The bet** (Market: [Team] YES)
   - Polymarket price + volume (liquidity)
   - Bookmaker fair probability  
   - Raw edge %
   - Net EV on $100 stake
   - Time until start
   - Call to action

### Updated Template

```typescript
return `📺 ${liveScoreUrl}
🎯 EDGE DETECTED: ${req.event_name}
Market: ${req.market || 'H2H'}
Polymarket: ${(req.poly_price * 100).toFixed(0)}¢ ${volume ? `(${volume})` : ''}
Bookmaker Fair: ${(req.bookmaker_fair_prob * 100).toFixed(0)}%
Raw Edge: +${req.raw_edge?.toFixed(1) || '0'}%
${netEv ? `Net EV: ${netEv} on $${req.stake_amount} stake` : ''}
${req.time_until_start ? `Time: ${req.time_until_start}` : ''}
ACT NOW - window may close`.trim();
```

### Key Changes

| Element | Current (broken) | Fixed |
|---------|-----------------|-------|
| Live score link | At bottom | **At top (clickable header)** |
| The bet | Missing | **Market: [Team] YES** |
| Poly price | Shown | Shown |
| Bookmaker fair | Condensed with Poly | **Separate line** |
| Liquidity/Volume | Shown | Shown |
| Net EV | Missing | **Restored** |
| Time | Condensed | **Full line** |
| Call to action | Missing | **ACT NOW restored** |

### File to Modify

| File | Change |
|------|--------|
| `supabase/functions/send-sms-alert/index.ts` | Update `buildEnhancedMessage()` to restore full format with live score link at top |

