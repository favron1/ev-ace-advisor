const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookmakerSignal {
  event_name: string;
  outcome: string;
  implied_probability: number;
  confirming_books: number;
  odds_movement: number;
  captured_at: string;
}

interface PolymarketMarket {
  id: string;
  market_id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  end_date: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running signal detection...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch recent bookmaker signals (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const signalsResponse = await fetch(
      `${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${oneHourAgo}&order=captured_at.desc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const signals: BookmakerSignal[] = await signalsResponse.json();
    console.log(`Found ${signals.length} recent bookmaker signals`);

    // Fetch active Polymarket markets
    const marketsResponse = await fetch(
      `${supabaseUrl}/rest/v1/polymarket_markets?status=eq.active&order=volume.desc&limit=100`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const markets: PolymarketMarket[] = await marketsResponse.json();
    console.log(`Found ${markets.length} active Polymarket markets`);

    const opportunities: any[] = [];

    // Aggregate signals by event
    const eventSignals = new Map<string, BookmakerSignal[]>();
    for (const signal of signals) {
      const key = signal.event_name;
      if (!eventSignals.has(key)) {
        eventSignals.set(key, []);
      }
      eventSignals.get(key)!.push(signal);
    }

    // For each event with signals, check for Polymarket matches
    for (const [eventName, eventSignalList] of eventSignals) {
      // Find matching Polymarket market (fuzzy match on keywords)
      const keywords = eventName.toLowerCase().split(/\s+vs\s+|\s+/);
      const matchingMarket = markets.find(market => {
        const question = market.question.toLowerCase();
        return keywords.some(kw => kw.length > 3 && question.includes(kw));
      });

      if (!matchingMarket) continue;

      // Calculate consensus probability from bookmakers
      const avgProb = eventSignalList.reduce((sum, s) => sum + s.implied_probability, 0) / eventSignalList.length;
      const maxConfirming = Math.max(...eventSignalList.map(s => s.confirming_books));
      const avgMovement = eventSignalList.reduce((sum, s) => sum + Math.abs(s.odds_movement || 0), 0) / eventSignalList.length;

      // Compare with Polymarket prices
      const polyYesProb = matchingMarket.yes_price;
      const polyNoProb = matchingMarket.no_price;

      // Determine which side has edge
      const yesEdge = (avgProb - polyYesProb) * 100;
      const noEdge = ((1 - avgProb) - polyNoProb) * 100;

      // Only surface if edge is significant
      const minEdge = 3; // 3% minimum edge
      
      if (yesEdge >= minEdge || noEdge >= minEdge) {
        const side = yesEdge >= noEdge ? 'YES' : 'NO';
        const edge = side === 'YES' ? yesEdge : noEdge;
        const polyPrice = side === 'YES' ? polyYesProb : polyNoProb;

        // Calculate confidence score
        let confidence = 50; // Base
        confidence += Math.min(maxConfirming * 5, 20); // +5 per confirming book, max 20
        confidence += Math.min(avgMovement, 15); // Movement adds confidence
        confidence += Math.min(matchingMarket.liquidity / 10000, 15); // Liquidity adds confidence
        confidence = Math.min(Math.round(confidence), 100);

        // Determine urgency
        let urgency: 'low' | 'normal' | 'high' | 'critical' = 'normal';
        if (edge >= 15 && maxConfirming >= 4) urgency = 'critical';
        else if (edge >= 10 || (edge >= 7 && maxConfirming >= 3)) urgency = 'high';
        else if (edge < 5) urgency = 'low';

        // Calculate expiry (shorter for faster markets)
        const expiryHours = matchingMarket.end_date 
          ? Math.min(Math.floor((new Date(matchingMarket.end_date).getTime() - Date.now()) / (1000 * 60 * 60)), 24)
          : 24;

        opportunities.push({
          polymarket_market_id: matchingMarket.id,
          event_name: eventName,
          side,
          polymarket_price: polyPrice,
          bookmaker_probability: avgProb,
          edge_percent: Math.round(edge * 10) / 10,
          confidence_score: confidence,
          urgency,
          signal_factors: {
            movement_magnitude: avgMovement,
            confirming_books: maxConfirming,
            liquidity_score: Math.round(matchingMarket.liquidity),
          },
          status: 'active',
          expires_at: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    console.log(`Detected ${opportunities.length} opportunities`);

    // Insert opportunities
    if (opportunities.length > 0) {
      const insertResponse = await fetch(
        `${supabaseUrl}/rest/v1/signal_opportunities`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(opportunities),
        }
      );

      if (!insertResponse.ok) {
        const error = await insertResponse.text();
        console.error('Failed to insert opportunities:', error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        opportunities: opportunities,
        movements_detected: signals.length,
        polymarkets_analyzed: markets.length,
        signals_surfaced: opportunities.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
