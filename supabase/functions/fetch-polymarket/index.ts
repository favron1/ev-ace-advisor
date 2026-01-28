const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  markets: Array<{
    id: string;
    question: string;
    outcomePrices: string;
    volume: string;
    liquidity: string;
    endDate: string;
    active: boolean;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching Polymarket markets...');
    
    // Polymarket public CLOB API
    const marketsResponse = await fetch(
      'https://clob.polymarket.com/markets?next_cursor=&limit=50&active=true&closed=false',
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!marketsResponse.ok) {
      console.error('Polymarket API error:', marketsResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Polymarket', status: marketsResponse.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const marketsData = await marketsResponse.json();
    console.log('Raw markets data:', JSON.stringify(marketsData).slice(0, 500));

    // Process markets
    const markets = (marketsData.data || marketsData || []).map((market: any) => {
      // Parse prices - can be array or object
      let yesPrice = 0.5;
      let noPrice = 0.5;
      
      if (market.outcomePrices) {
        try {
          const prices = typeof market.outcomePrices === 'string' 
            ? JSON.parse(market.outcomePrices) 
            : market.outcomePrices;
          if (Array.isArray(prices)) {
            yesPrice = parseFloat(prices[0]) || 0.5;
            noPrice = parseFloat(prices[1]) || 0.5;
          }
        } catch (e) {
          console.error('Failed to parse prices:', e);
        }
      }

      return {
        market_id: market.condition_id || market.id,
        question: market.question || market.title || 'Unknown',
        description: market.description || null,
        category: market.category || 'General',
        end_date: market.end_date_iso || market.endDate || null,
        yes_price: yesPrice,
        no_price: noPrice,
        volume: parseFloat(market.volume) || 0,
        liquidity: parseFloat(market.liquidity) || 0,
        status: market.active !== false && !market.closed ? 'active' : 'closed',
        last_updated: new Date().toISOString(),
      };
    });

    console.log(`Processed ${markets.length} markets`);

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
