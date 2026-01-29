const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmsAlertRequest {
  to: string;
  message: string;
  // Enhanced alert fields (optional)
  event_name?: string;
  market?: string;
  poly_price?: number;
  poly_volume?: number;
  bookmaker_fair_prob?: number;
  raw_edge?: number;
  net_edge?: number;
  stake_amount?: number;
  time_until_start?: string;
}

// Build Google live score URL from event name
function buildLiveScoreUrl(eventName: string): string {
  const searchQuery = eventName
    .replace(/\./g, '')
    .replace(/\s+/g, '+')
    + '+live+score';
  return `google.com/search?q=${searchQuery}`;
}

// Build enhanced message if structured data is provided
function buildEnhancedMessage(req: SmsAlertRequest): string {
  // If a custom message is provided, use it directly
  if (req.message && !req.event_name) {
    return req.message;
  }
  
  // Build structured alert if we have the data
  if (req.event_name && req.poly_price !== undefined && req.bookmaker_fair_prob !== undefined) {
    const volume = req.poly_volume ? `$${(req.poly_volume / 1000).toFixed(0)}K vol` : '';
    const liveScoreUrl = buildLiveScoreUrl(req.event_name);
    
    return `🎯 EDGE: ${req.event_name}
Poly: ${(req.poly_price * 100).toFixed(0)}¢ ${volume ? `(${volume})` : ''} | Fair: ${(req.bookmaker_fair_prob * 100).toFixed(0)}% | Edge: +${req.raw_edge?.toFixed(1) || '0'}%
${req.time_until_start ? `Starts: ${req.time_until_start}` : ''}
📺 ${liveScoreUrl}`.trim();
  }
  
  return req.message;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[SEND-SMS-ALERT] Processing SMS request...');

  try {
    const requestData: SmsAlertRequest = await req.json();
    const { to } = requestData;
    
    if (!to) {
      throw new Error('Missing required field: to');
    }

    // Build message (enhanced or custom)
    const message = buildEnhancedMessage(requestData);
    
    if (!message) {
      throw new Error('Missing required field: message');
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
    console.log(`[SEND-SMS-ALERT] Message length: ${message.length} chars`);

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
