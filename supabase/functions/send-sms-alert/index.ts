import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[SEND-SMS-ALERT] Processing SMS request...');

  try {
    const { to, message } = await req.json();
    
    if (!to || !message) {
      throw new Error('Missing required fields: to, message');
    }

    // Validate E.164 format
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (!e164Regex.test(to)) {
      throw new Error(`Invalid phone number format: ${to}. Must be E.164 format (e.g., +14155551234)`);
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER secrets.');
    }

    console.log(`[SEND-SMS-ALERT] Sending SMS to ${to.substring(0, 5)}...`);

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
    
    if (!response.ok) {
      console.error('[SEND-SMS-ALERT] Twilio error:', result);
      throw new Error(result.message || 'Failed to send SMS');
    }

    const duration = Date.now() - startTime;
    console.log(`[SEND-SMS-ALERT] SMS sent successfully in ${duration}ms. SID: ${result.sid}`);

    return new Response(
      JSON.stringify({ success: true, sid: result.sid, duration_ms: duration }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SEND-SMS-ALERT] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
