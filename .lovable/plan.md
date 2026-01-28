
# Plan: Add SMS Text Notifications for Confirmed Signals

## Summary

This plan adds SMS text notifications via Twilio so you receive alerts on your phone even when your browser is closed overnight. When an event transitions to **confirmed** status, the system will send an SMS to your configured phone number.

---

## What You'll Need to Provide

**Twilio Account Setup** (5 minutes):
1. Go to [twilio.com](https://twilio.com) and create a free account (includes trial credits)
2. Get your **Account SID** and **Auth Token** from the Twilio console
3. Get a Twilio phone number (free in trial mode)
4. Provide these 3 values when prompted:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`  
   - `TWILIO_PHONE_NUMBER` (the Twilio number, e.g., +15551234567)

---

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `supabase/functions/send-sms-alert/index.ts` | **NEW** - Edge function to send SMS via Twilio |
| `supabase/functions/active-mode-poll/index.ts` | Call SMS function when event confirmed |
| Database migration | Add `user_phone` column to profiles table |
| `src/pages/Settings.tsx` | Add phone number input field |

---

## Implementation Details

### 1. Create send-sms-alert Edge Function

```typescript
// supabase/functions/send-sms-alert/index.ts

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, message } = await req.json();
    
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const credentials = btoa(`${accountSid}:${authToken}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message,
      }),
    });

    const result = await response.json();
    
    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[SEND-SMS-ALERT] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

### 2. Update active-mode-poll to Send SMS on Confirmation

Add SMS notification after creating the signal opportunity (around line 187):

```typescript
// After confirming an edge...
console.log(`[ACTIVE-MODE-POLL] CONFIRMED EDGE: ${event.event_name} - ${edgePct.toFixed(1)}%`);

// Send SMS alert
try {
  const smsMessage = `EDGE DETECTED: ${event.event_name}\n+${edgePct.toFixed(1)}% edge. Poly: ${(polyPrice * 100).toFixed(0)}c. Execute now!`;
  
  // Get user phone from profiles (assumes single user for now)
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone_number')
    .limit(1)
    .single();
    
  if (profile?.phone_number) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({
        to: profile.phone_number,
        message: smsMessage,
      }),
    });
    console.log(`[ACTIVE-MODE-POLL] SMS sent to ${profile.phone_number}`);
  }
} catch (smsErr) {
  console.error('[ACTIVE-MODE-POLL] SMS error:', smsErr);
  // Don't fail the whole operation if SMS fails
}
```

---

### 3. Database Migration - Add Phone Number

Add `phone_number` column to profiles table:

```sql
ALTER TABLE profiles 
ADD COLUMN phone_number text DEFAULT NULL;

COMMENT ON COLUMN profiles.phone_number IS 
  'User phone number in E.164 format for SMS alerts';
```

---

### 4. Settings Page - Add Phone Input

Add a phone number field to the Settings page:

```text
+------------------------------------------+
|  SMS Notifications                        |
|  ----------------------------------------|
|  Phone Number: [+61 412 345 678]          |
|  Format: Include country code (+61...)   |
|  [Save]                                  |
+------------------------------------------+
```

- Input validation for E.164 format (starts with +, 10-15 digits)
- Save to `profiles.phone_number`
- Show confirmation when saved

---

## How It Works Overnight

```text
You go to bed with Auto-Polling ON
        ↓
Browser tab stays open (laptop plugged in)
        ↓
3:47 AM - Watch Poll detects NBA injury movement
        ↓
Event escalated to ACTIVE state
        ↓
Active Poll runs every 60s
        ↓
3:52 AM - Movement holds, edge confirmed!
        ↓
active-mode-poll calls send-sms-alert
        ↓
Your phone buzzes: "EDGE DETECTED: Lakers vs Celtics +4.2% edge..."
        ↓
You wake up, grab phone, execute on Polymarket
```

---

## Secrets Required

| Secret | Description |
|--------|-------------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID (starts with AC...) |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (+15551234567 format) |

---

## Cost

Twilio SMS pricing:
- **Australia**: ~$0.08 AUD per SMS
- **US**: ~$0.01 USD per SMS
- Trial accounts get $15 free credit (~150+ messages)

With ~2-5 confirmed signals per week, monthly cost would be under $2.

---

## Expected Outcome

After implementation:
- Your phone buzzes whenever an edge is confirmed (even at 3 AM)
- SMS includes event name, edge percentage, and Polymarket price
- You can set your phone number in Settings
- Works independently of browser - true "set and forget" overnight monitoring
