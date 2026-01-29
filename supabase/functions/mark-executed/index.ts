// Edge function to mark a signal as executed via SMS link click
// URL format: /mark-executed?id={signal_id}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const signalId = url.searchParams.get('id');
    
    if (!signalId) {
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Missing Signal ID</h1>
          <p>Invalid link - no signal ID provided.</p>
        </body>
        </html>`,
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the signal details first
    const { data: signal, error: fetchError } = await supabase
      .from('signal_opportunities')
      .select('id, event_name, status, polymarket_yes_price, edge_percent')
      .eq('id', signalId)
      .maybeSingle();

    if (fetchError || !signal) {
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Not Found</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Signal Not Found</h1>
          <p>This signal may have already been dismissed or expired.</p>
        </body>
        </html>`,
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );
    }

    if (signal.status === 'executed') {
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Already Executed</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>✅ Already Marked</h1>
          <p><strong>${signal.event_name}</strong></p>
          <p>This bet was already marked as executed. No more SMS updates will be sent.</p>
        </body>
        </html>`,
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );
    }

    // Mark as executed
    const { error: updateError } = await supabase
      .from('signal_opportunities')
      .update({ status: 'executed' })
      .eq('id', signalId);

    if (updateError) {
      throw updateError;
    }

    // Create log entry
    await supabase.from('signal_logs').insert({
      opportunity_id: signalId,
      event_name: signal.event_name,
      side: 'YES',
      entry_price: signal.polymarket_yes_price || 0,
      edge_at_signal: signal.edge_percent || 0,
      confidence_at_signal: 85,
      outcome: 'pending',
    });

    console.log(`[MARK-EXECUTED] Signal marked as executed: ${signal.event_name}`);

    return new Response(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>Bet Placed</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: system-ui; padding: 40px; text-align: center; background: #0a0a0a; color: #fff;">
        <h1 style="color: #22c55e;">✅ Bet Marked as Placed!</h1>
        <p style="font-size: 18px; margin: 20px 0;"><strong>${signal.event_name}</strong></p>
        <p style="color: #888;">Entry: ${((signal.polymarket_yes_price || 0) * 100).toFixed(0)}¢ | Edge: +${(signal.edge_percent || 0).toFixed(1)}%</p>
        <p style="margin-top: 30px; color: #22c55e;">No more SMS updates will be sent for this bet.</p>
        <p style="color: #666; font-size: 14px; margin-top: 40px;">You can close this page.</p>
      </body>
      </html>`,
      { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
    );

  } catch (error) {
    console.error('[MARK-EXECUTED] Error:', error);
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>❌ Error</h1>
        <p>Something went wrong. Please try again.</p>
      </body>
      </html>`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
    );
  }
});
