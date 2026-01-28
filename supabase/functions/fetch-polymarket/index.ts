// ========================================
// DEPRECATED: MANUAL DEBUGGING ONLY
// ========================================
// This function is NOT scheduled via pg_cron.
// Polymarket data is now fetched per-event by active-mode-poll
// using the fetchPolymarketForEvent() helper with LIVE API calls.
//
// This function exists for:
// - Manual debugging (invoke manually when needed)
// - Testing Polymarket API connectivity
// - Populating polymarket_markets table for analytics
//
// DO NOT schedule this via pg_cron.
// DO NOT use cached data from polymarket_markets for trading decisions.
//
// AUTHORITATIVE SOURCE FOR TRADING: active-mode-poll (uses live Polymarket API)
// ========================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching Polymarket markets...');
    
    // Use the Gamma API for events with active markets
    const response = await fetch(
      'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100',
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      console.error('Polymarket API error:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Polymarket', status: response.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventsData = await response.json();
    const events = Array.isArray(eventsData) ? eventsData : [];
    console.log(`Received ${events.length} events from API`);

    // Extract markets from events
    const markets: any[] = [];
    
    for (const event of events) {
      // Each event can have multiple markets
      const eventMarkets = event.markets || [];
      
      for (const market of eventMarkets) {
        // Skip closed or inactive markets
        if (market.closed || !market.active) continue;
        
        // Parse prices from outcomePrices
        let yesPrice = 0.5;
        let noPrice = 0.5;
        
        if (market.outcomePrices) {
          try {
            const prices = typeof market.outcomePrices === 'string' 
              ? JSON.parse(market.outcomePrices) 
              : market.outcomePrices;
            if (Array.isArray(prices) && prices.length >= 2) {
              yesPrice = parseFloat(prices[0]) || 0.5;
              noPrice = parseFloat(prices[1]) || 0.5;
            }
          } catch (e) {
            // Use defaults
          }
        }

        // Skip markets with no real price data
        if (yesPrice === 0.5 && noPrice === 0.5) continue;

        const categoryTag = event.tags?.[0];
        const categoryLabel = typeof categoryTag === 'object' ? categoryTag?.label : (categoryTag || 'General');

        markets.push({
          market_id: market.conditionId || market.id,
          question: market.question || event.title || 'Unknown',
          description: market.description || event.description || null,
          category: categoryLabel,
          end_date: market.endDate || event.endDate || null,
          yes_price: yesPrice,
          no_price: noPrice,
          volume: parseFloat(market.volume) || 0,
          liquidity: parseFloat(market.liquidity) || 0,
          status: 'active',
          last_updated: new Date().toISOString(),
        });
      }
    }

    console.log(`Processed ${markets.length} active markets with real prices`);

    // Store in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (markets.length > 0) {
      const upsertResponse = await fetch(
        `${supabaseUrl}/rest/v1/polymarket_markets`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(markets),
        }
      );

      if (!upsertResponse.ok) {
        const error = await upsertResponse.text();
        console.error('Database upsert error:', error);
      } else {
        console.log('Markets upserted successfully');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        events_fetched: events.length,
        markets_fetched: markets.length,
        sample: markets.slice(0, 3)
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
