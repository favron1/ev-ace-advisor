// ============================================================================
// MANUAL MARKET ENTRY - Process manually-entered Polymarket markets
// ============================================================================
// Takes user-provided team names and Poly prices, matches to bookmaker odds,
// and inserts into polymarket_h2h_cache for the normal monitoring pipeline.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Team name normalization for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/city$/, '')
    .replace(/^los|^la|^new|^san|^st/, '');
}

// Generate a synthetic condition ID if none provided
function generateSyntheticConditionId(home: string, away: string, date?: string): string {
  const dateStr = date || new Date().toISOString().split('T')[0];
  const homeNorm = normalizeTeamName(home).substring(0, 6);
  const awayNorm = normalizeTeamName(away).substring(0, 6);
  return `manual-${awayNorm}-${homeNorm}-${dateStr}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { 
      homeTeam, 
      awayTeam, 
      polyYesPrice, 
      polyNoPrice, 
      conditionId, 
      gameDate,
      league = 'NBA'
    } = body;

    console.log(`[MANUAL-ENTRY] Processing: ${awayTeam} @ ${homeTeam}, YES=${polyYesPrice}`);

    // Validate inputs
    if (!homeTeam || !awayTeam || !polyYesPrice) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const yesPrice = parseFloat(polyYesPrice);
    const noPrice = polyNoPrice ? parseFloat(polyNoPrice) : 1 - yesPrice;

    if (yesPrice <= 0 || yesPrice >= 1) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid YES price (must be 0.01-0.99)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate condition ID if not provided
    const finalConditionId = conditionId || generateSyntheticConditionId(homeTeam, awayTeam, gameDate);
    
    // Create event title in standard format
    const eventTitle = `${awayTeam} @ ${homeTeam}`;
    const question = `Will ${homeTeam} beat ${awayTeam}?`;

    // Check if this market already exists
    const { data: existing } = await supabase
      .from('polymarket_h2h_cache')
      .select('id, condition_id')
      .eq('condition_id', finalConditionId)
      .single();

    if (existing) {
      // Update existing entry with new prices
      const { error: updateError } = await supabase
        .from('polymarket_h2h_cache')
        .update({
          yes_price: yesPrice,
          no_price: noPrice,
          last_price_update: new Date().toISOString(),
          source: 'manual',
          monitoring_status: 'watching',
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;

      console.log(`[MANUAL-ENTRY] Updated existing market: ${finalConditionId}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Updated existing market with new prices',
          conditionId: finalConditionId,
          updated: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new market into polymarket_h2h_cache
    const eventDate = gameDate 
      ? new Date(`${gameDate}T19:00:00Z`).toISOString() 
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('polymarket_h2h_cache')
      .insert({
        condition_id: finalConditionId,
        event_title: eventTitle,
        question: question,
        team_home: homeTeam,
        team_away: awayTeam,
        team_home_normalized: normalizeTeamName(homeTeam),
        team_away_normalized: normalizeTeamName(awayTeam),
        yes_price: yesPrice,
        no_price: noPrice,
        event_date: eventDate,
        sport_category: league.toLowerCase().includes('nba') ? 'basketball_nba' : 'basketball',
        market_type: 'h2h',
        status: 'active',
        source: 'manual',
        monitoring_status: 'watching',
        tradeable: true, // Manual entries are assumed tradeable
        last_price_update: new Date().toISOString(),
        last_bulk_sync: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[MANUAL-ENTRY] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[MANUAL-ENTRY] Created new market: ${finalConditionId}`);

    // Also try to find and link to bookmaker data
    // This is best-effort - the watch-mode-poll will also try later
    const homeNorm = normalizeTeamName(homeTeam);
    const awayNorm = normalizeTeamName(awayTeam);

    // Look for matching bookmaker signals
    const { data: bookmakerSignals } = await supabase
      .from('bookmaker_signals')
      .select('*')
      .ilike('event_name', `%${homeTeam.split(' ').pop()}%`)
      .order('captured_at', { ascending: false })
      .limit(5);

    let bookmakerMatch = false;
    if (bookmakerSignals && bookmakerSignals.length > 0) {
      // Check if any match both teams
      for (const sig of bookmakerSignals) {
        const eventNorm = normalizeTeamName(sig.event_name);
        if (eventNorm.includes(homeNorm.substring(0, 4)) || eventNorm.includes(awayNorm.substring(0, 4))) {
          bookmakerMatch = true;
          console.log(`[MANUAL-ENTRY] Found potential bookmaker match: ${sig.event_name}`);
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: bookmakerMatch 
          ? 'Added to pipeline with bookmaker match found'
          : 'Added to pipeline - bookmaker matching will be attempted on next poll',
        conditionId: finalConditionId,
        bookmakerMatch,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[MANUAL-ENTRY] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
