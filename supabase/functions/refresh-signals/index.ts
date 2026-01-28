import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignalOpportunity {
  id: string;
  expires_at: string | null;
  urgency: string;
  signal_factors: Record<string, any>;
}

function calculateUrgency(hoursUntilEvent: number): string {
  if (hoursUntilEvent <= 1) return 'critical';
  if (hoursUntilEvent <= 4) return 'high';
  if (hoursUntilEvent <= 12) return 'normal';
  return 'low';
}

function getTimeLabel(hoursUntilEvent: number): string {
  if (hoursUntilEvent < 1) return `${Math.round(hoursUntilEvent * 60)}m`;
  if (hoursUntilEvent < 24) return `${Math.round(hoursUntilEvent)}h`;
  return `${Math.round(hoursUntilEvent / 24)}d`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.info('Refreshing active signals...');

    // Fetch all active signals
    const { data: signals, error: fetchError } = await supabase
      .from('signal_opportunities')
      .select('id, expires_at, urgency, signal_factors')
      .eq('status', 'active');

    if (fetchError) throw fetchError;

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({
          refreshed: 0,
          expired: 0,
          updated: 0,
          unchanged: 0,
          message: 'No active signals to refresh'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const toExpire: string[] = [];
    const toUpdate: { id: string; urgency: string; signal_factors: Record<string, any> }[] = [];
    let unchanged = 0;

    for (const signal of signals as SignalOpportunity[]) {
      // Check if event has started (expired)
      if (signal.expires_at) {
        const expiresAt = new Date(signal.expires_at);
        if (expiresAt <= now) {
          toExpire.push(signal.id);
          continue;
        }

        // Calculate new urgency based on time remaining
        const hoursUntilEvent = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        const newUrgency = calculateUrgency(hoursUntilEvent);
        const newTimeLabel = getTimeLabel(hoursUntilEvent);

        // Check if urgency needs updating
        if (newUrgency !== signal.urgency) {
          const updatedFactors = {
            ...signal.signal_factors,
            time_label: newTimeLabel,
            hours_until_event: Math.round(hoursUntilEvent * 10) / 10
          };
          toUpdate.push({ id: signal.id, urgency: newUrgency, signal_factors: updatedFactors });
        } else {
          // Just update time label if changed
          const currentTimeLabel = signal.signal_factors?.time_label;
          if (currentTimeLabel !== newTimeLabel) {
            const updatedFactors = {
              ...signal.signal_factors,
              time_label: newTimeLabel,
              hours_until_event: Math.round(hoursUntilEvent * 10) / 10
            };
            toUpdate.push({ id: signal.id, urgency: signal.urgency, signal_factors: updatedFactors });
          } else {
            unchanged++;
          }
        }
      } else {
        unchanged++;
      }
    }

    // Batch expire signals
    if (toExpire.length > 0) {
      const { error: expireError } = await supabase
        .from('signal_opportunities')
        .update({ status: 'expired' })
        .in('id', toExpire);

      if (expireError) {
        console.error('Error expiring signals:', expireError);
      } else {
        console.info(`Expired ${toExpire.length} signals`);
      }
    }

    // Batch update signals
    for (const update of toUpdate) {
      const { error: updateError } = await supabase
        .from('signal_opportunities')
        .update({ urgency: update.urgency, signal_factors: update.signal_factors })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Error updating signal ${update.id}:`, updateError);
      }
    }

    const result = {
      refreshed: signals.length,
      expired: toExpire.length,
      updated: toUpdate.length,
      unchanged,
      timestamp: now.toISOString()
    };

    console.info(`Refresh complete:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Refresh error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
