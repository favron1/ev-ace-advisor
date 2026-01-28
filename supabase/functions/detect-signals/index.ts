const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookmakerSignal {
  event_name: string;
  market_type: string;
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

// Normalize team names for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract team/entity from Polymarket question
function extractPolymarketEntity(question: string): string | null {
  const q = question.toLowerCase();
  
  // Pattern: "Will the X win the Y NBA Finals/Super Bowl/etc?"
  const willTheMatch = q.match(/will\s+(?:the\s+)?(.+?)\s+win\s+(?:the\s+)?\d{4}/i);
  if (willTheMatch) {
    return willTheMatch[1].trim();
  }
  
  // Pattern: "Will X win Super Bowl Y?"
  const willWinMatch = q.match(/will\s+(?:the\s+)?(.+?)\s+win\s+super\s+bowl/i);
  if (willWinMatch) {
    return willWinMatch[1].trim();
  }
  
  return null;
}

// Extract team from bookmaker signal
function extractBookmakerEntity(signal: BookmakerSignal): string | null {
  if (signal.market_type !== 'outrights') return null;
  
  // Format: "NBA Championship Winner: Oklahoma City Thunder"
  const colonMatch = signal.event_name.match(/:\s*(.+)$/);
  if (colonMatch) {
    return colonMatch[1].trim();
  }
  
  return signal.outcome;
}

// Calculate match score
function calculateMatchScore(bookmakerEntity: string, polymarketEntity: string): number {
  const be = normalizeName(bookmakerEntity);
  const pe = normalizeName(polymarketEntity);
  
  // Exact match
  if (be === pe) return 100;
  
  // One contains the other
  if (be.includes(pe) || pe.includes(be)) return 90;
  
  // Check word-by-word matching
  const beWords = be.split(/\s+/).filter(w => w.length > 2);
  const peWords = pe.split(/\s+/).filter(w => w.length > 2);
  
  let matchCount = 0;
  for (const word of beWords) {
    if (peWords.some(pw => pw === word || pw.includes(word) || word.includes(pw))) {
      matchCount++;
    }
  }
  
  // Require at least 2 matching words or 1 if only 1 word exists
  if (beWords.length === 1 && matchCount === 1) return 85;
  if (matchCount >= 2) return 80;
  if (matchCount === 1 && beWords.length <= 2) return 70;
  
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running signal detection...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch recent bookmaker signals
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const signalsResponse = await fetch(
      `${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${twoHoursAgo}&market_type=eq.outrights&order=implied_probability.desc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const signals: BookmakerSignal[] = await signalsResponse.json();
    console.log(`Found ${signals.length} outright bookmaker signals`);

    // Fetch active Polymarket markets
    const marketsResponse = await fetch(
      `${supabaseUrl}/rest/v1/polymarket_markets?status=eq.active&liquidity=gte.5000&order=volume.desc&limit=500`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const markets: PolymarketMarket[] = await marketsResponse.json();
    console.log(`Found ${markets.length} Polymarket markets`);

    // Pre-process Polymarket markets to extract entities
    const marketEntities = new Map<string, { market: PolymarketMarket; entity: string }>();
    for (const market of markets) {
      const entity = extractPolymarketEntity(market.question);
      if (entity) {
        marketEntities.set(market.id, { market, entity });
      }
    }
    console.log(`Extracted ${marketEntities.size} Polymarket entities`);

    const opportunities: any[] = [];
    const processedPairs = new Set<string>();

    // Match each outright signal to Polymarket markets
    for (const signal of signals) {
      const bookmakerEntity = extractBookmakerEntity(signal);
      if (!bookmakerEntity) continue;
      
      for (const [marketId, { market, entity: polymarketEntity }] of marketEntities) {
        const pairKey = `${signal.outcome}|${marketId}`;
        if (processedPairs.has(pairKey)) continue;
        
        const matchScore = calculateMatchScore(bookmakerEntity, polymarketEntity);
        if (matchScore < 70) continue;
        
        processedPairs.add(pairKey);
        
        const bookmakerProb = signal.implied_probability;
        const polyPrice = market.yes_price;
        
        // Calculate edge
        const edge = (bookmakerProb - polyPrice) * 100;
        
        // Minimum 2% edge for outrights
        if (edge < 2) continue;
        
        // Skip extreme prices
        if (polyPrice < 0.005 || polyPrice > 0.995) continue;
        
        // Calculate confidence
        let confidence = 50;
        confidence += Math.min(signal.confirming_books * 3, 15);
        confidence += Math.min(market.liquidity / 100000, 15);
        confidence += Math.min((matchScore - 70) / 3, 10);
        confidence += Math.min(edge / 2, 10);
        confidence = Math.min(Math.round(confidence), 100);
        
        // Urgency
        let urgency: 'low' | 'normal' | 'high' | 'critical' = 'normal';
        if (edge >= 15 && signal.confirming_books >= 5) urgency = 'critical';
        else if (edge >= 10 || (edge >= 7 && signal.confirming_books >= 4)) urgency = 'high';
        else if (edge < 5) urgency = 'low';
        
        console.log(`Match found: ${bookmakerEntity} -> ${polymarketEntity} (score: ${matchScore}, edge: ${edge.toFixed(1)}%)`);
        
        opportunities.push({
          polymarket_market_id: market.id,
          event_name: `${signal.outcome} - Championship`,
          side: 'YES',
          polymarket_price: polyPrice,
          bookmaker_probability: bookmakerProb,
          edge_percent: Math.round(edge * 10) / 10,
          confidence_score: confidence,
          urgency,
          signal_factors: {
            confirming_books: signal.confirming_books,
            liquidity_score: Math.round(market.liquidity),
            match_score: matchScore,
            market_question: market.question,
          },
          status: 'active',
          expires_at: market.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    console.log(`Detected ${opportunities.length} opportunities`);

    // Sort and limit
    opportunities.sort((a, b) => b.edge_percent - a.edge_percent);
    const topOpportunities = opportunities.slice(0, 50);

    // Insert
    if (topOpportunities.length > 0) {
      const insertResponse = await fetch(
        `${supabaseUrl}/rest/v1/signal_opportunities`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(topOpportunities),
        }
      );

      if (!insertResponse.ok) {
        const error = await insertResponse.text();
        console.error('Insert error:', error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        opportunities: topOpportunities.slice(0, 10),
        outright_signals: signals.length,
        polymarkets_analyzed: marketEntities.size,
        signals_surfaced: topOpportunities.length,
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
