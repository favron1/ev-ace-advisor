// ========================================
// DEPRECATED: BOOKMAKER-FIRST DETECTION
// ========================================
// This function is DEPRECATED. It uses bookmaker-first logic which creates
// orphaned signals for events that don't have Polymarket H2H markets.
// 
// Use polymarket-monitor instead, which follows the correct Polymarket-first
// architecture: only creates signals for events that have tradeable markets.
// ========================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[DETECT-SIGNALS] DEPRECATED - Use polymarket-monitor instead');
  
  return new Response(
    JSON.stringify({ 
      deprecated: true, 
      message: 'This function is deprecated. Use polymarket-monitor for Polymarket-first detection.',
      redirect: 'polymarket-monitor'
    }),
    { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
});
