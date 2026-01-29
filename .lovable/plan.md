
# Plan: Fix Polymarket Links and Add Alternate URL Support

## Problem
You're getting an SSL certificate error (`NET::ERR_CERT_COMMON_NAME_INVALID`) when clicking "Trade on Poly" links. This is a local network/browser issue on your computer, but we can work around it by:

1. Using direct market links instead of search queries
2. Providing alternate URL formats to try
3. Adding a copy-to-clipboard fallback

## Root Cause Analysis
- The current "Trade on Poly" button generates: `polymarket.com/search?query=Utah%20Jazz%20vs%20Golden%20State%20Warriors`
- This search URL is unreliable AND may be blocked by your network
- The system HAS the `condition_id` in the cache table but doesn't pass it to signals

## Solution

### 1. Store condition_id in signals
**File: `supabase/functions/polymarket-monitor/index.ts`**

Add `polymarket_condition_id` to the signal creation payload:
```typescript
.insert({
  event_name: event.event_name,
  polymarket_condition_id: event.polymarket_condition_id, // NEW
  // ... rest of fields
})
```

### 2. Add condition_id column to signal_opportunities
**Database Migration**

```sql
ALTER TABLE signal_opportunities 
ADD COLUMN IF NOT EXISTS polymarket_condition_id TEXT;
```

### 3. Update SignalCard with smart link handling
**File: `src/components/terminal/SignalCard.tsx`**

Replace the simple link button with a dropdown that offers:
- **Open in Polymarket** - Primary action using direct condition_id link
- **Try alternate URL (www)** - Fallback using `www.polymarket.com`
- **Copy link** - Copies the URL to clipboard for manual pasting
- **Search Polymarket** - Falls back to search if no condition_id

URL format options:
```
https://polymarket.com/event/[condition_id]
https://www.polymarket.com/event/[condition_id]
```

### 4. Add visual feedback for copy action
Show a toast notification when the link is copied, so you can paste it into a different browser or incognito window.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Add `polymarket_condition_id` to signal insert |
| `src/components/terminal/SignalCard.tsx` | Add dropdown with alternate URLs + copy button |
| Database migration | Add `polymarket_condition_id` column |

## Immediate Workaround
While you wait for the fix, try these steps to resolve the SSL error:

1. **Check system clock** - Ensure your date/time is correct
2. **Clear Chrome SSL cache**: Settings > Privacy > Clear browsing data > Cookies and site data
3. **Try incognito window** - Bypasses cached certificates
4. **Try Safari or Firefox** - Different SSL certificate handling
5. **Check for antivirus/firewall** - Some security software intercepts HTTPS traffic
