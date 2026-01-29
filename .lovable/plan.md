

## Add Live Score Links to SMS Alerts

### Overview

Enhance SMS alerts with a clickable link that opens a live score page for the game. Since SMS is text-based and needs to work on any phone, we'll use **Google Search** deep links which:
- Work universally on all devices
- Trigger Google's live sports widget for NHL/NBA/Soccer
- Don't require any API keys or authentication
- Keep SMS character count reasonable

---

### Implementation

**File: `supabase/functions/send-sms-alert/index.ts`**

Add a new optional field for the live score link and include it in the message template:

```text
CURRENT SMS FORMAT:
🎯 EDGE DETECTED: Jets vs. Lightning
Market: H2H
Polymarket: 38¢ ($260K vol)
Bookmaker Fair: 58%
Raw Edge: +19.9%
Time: 3h until start
ACT NOW - window may close

NEW SMS FORMAT:
🎯 EDGE DETECTED: Jets vs. Lightning
BET: Tampa Bay Lightning YES
Poly: 38¢ | Fair: 58% | Edge: +19.9%
Starts: 3h

📺 Live Score: google.com/search?q=Jets+vs+Lightning
🎯 Trade: [polymarket link]
```

**Changes:**
1. Add `live_score_url?: string` field to `SmsAlertRequest` interface
2. Create `buildLiveScoreUrl(eventName: string)` helper function
3. Include the link in the message body (shortened for SMS character limits)

**Helper Function:**
```typescript
function buildLiveScoreUrl(eventName: string): string {
  // Convert "Jets vs. Lightning" → "Jets+vs+Lightning+live+score"
  const searchQuery = eventName
    .replace(/\./g, '')
    .replace(/\s+/g, '+')
    + '+live+score';
  return `google.com/search?q=${encodeURIComponent(searchQuery)}`;
}
```

---

### Technical Considerations

| Consideration | Solution |
|---------------|----------|
| SMS character limits (160 chars) | Use shortened URL format without `https://` prefix |
| Universal compatibility | Google Search works on all phones/browsers |
| Sport coverage | Google shows live widgets for NHL, NBA, NFL, Soccer |
| No API needed | Just a URL construction - no external calls |

---

### Updated SMS Example

For **Jets vs. Lightning** with Tampa Bay YES at 38¢:

```
🎯 EDGE: Jets vs. Lightning
BET: Tampa Bay Lightning YES
38¢ | Fair 58% | +19.9%
3h to kickoff

📺 google.com/search?q=Jets+vs+Lightning+live
```

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/send-sms-alert/index.ts` | Add `buildLiveScoreUrl()` helper and include link in structured message template |

---

### Summary

This adds a Google live score deep link to every SMS alert, making it easy to check game status from your phone when the alert arrives. The link format is compact and universally compatible.

