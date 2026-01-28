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

// Normalize team/entity names for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+(fc|united|city|wanderers|hotspur|rovers|albion|athletic)$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// Extract entity name from Polymarket question
function extractEntity(question: string): { entity: string; type: 'championship' | 'other' } | null {
  const q = question.toLowerCase();
  
  // Pattern: "Will X win the Y?"
  const willWinMatch = q.match(/will\s+(.+?)\s+win\s+the\s+\d{4}.*?(premier league|nba|nfl|uefa|champions league|championship|finals|title)/i);
  if (willWinMatch) {
    return { entity: willWinMatch[1].trim(), type: 'championship' };
  }
  
  // Pattern: "X to win Y"
  const toWinMatch = q.match(/(.+?)\s+to\s+win\s+.*?(premier league|nba|nfl|uefa|champions league|championship|finals)/i);
  if (toWinMatch) {
    return { entity: toWinMatch[1].trim(), type: 'championship' };
  }

  return null;
}

// Calculate match score between bookmaker signal and Polymarket market
function calculateMatchScore(signal: BookmakerSignal, market: PolymarketMarket): number {
  const extracted = extractEntity(market.question);
  if (!extracted || extracted.type !== 'championship') return 0;
  
  // Only match outright signals to championship markets
  if (signal.market_type !== 'outrights') return 0;
  
  const signalOutcome = normalizeName(signal.outcome);
  const marketEntity = normalizeName(extracted.entity);
  
  // Exact match
  if (signalOutcome === marketEntity) return 100;
  
  // Partial match - one contains the other
  if (signalOutcome.includes(marketEntity) || marketEntity.includes(signalOutcome)) return 85;
  
  // Word-by-word match
  const signalWords = signalOutcome.split(/\s+/);
  const marketWords = marketEntity.split(/\s+/);
  const matchingWords = signalWords.filter(w => w.length > 2 && marketWords.includes(w));
  
  if (matchingWords.length >= 2) return 75;
  if (matchingWords.length === 1 && signalWords.length <= 2) return 70;
  
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

    // Fetch recent bookmaker signals (last 2 hours to include outrights)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const signalsResponse = await fetch(
      `${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${twoHoursAgo}&order=captured_at.desc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const signals: BookmakerSignal[] = await signalsResponse.json();
    console.log(`Found ${signals.length} recent bookmaker signals`);

    // Count market types
    const outrightSignals = signals.filter(s => s.market_type === 'outrights');
    const h2hSignals = signals.filter(s => s.market_type === 'h2h');
    console.log(`Outrights: ${outrightSignals.length}, H2H: ${h2hSignals.length}`);

    // Fetch active Polymarket markets with good liquidity
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
    console.log(`Found ${markets.length} active Polymarket markets`);

    const opportunities: any[] = [];
    const processedPairs = new Set<string>();

    // Match outright signals to Polymarket championship markets
    for (const signal of outrightSignals) {
      for (const market of markets) {
        const pairKey = `${signal.outcome}|${market.id}`;
        if (processedPairs.has(pairKey)) continue;
        
        const matchScore = calculateMatchScore(signal, market);
        if (matchScore < 70) continue;
        
        processedPairs.add(pairKey);
        
        // Compare probabilities
        const bookmakerProb = signal.implied_probability;
        const polyYesProb = market.yes_price;
        
        // Calculate edge (bookmaker says higher prob than Polymarket price)
        const edge = (bookmakerProb - polyYesProb) * 100;
        
        // Only surface significant edges (minimum 2% for outrights due to lower margins)
        const minEdge = 2;
        
        if (edge >= minEdge) {
          // Skip extremely low or high prices (often illiquid)
          if (polyYesProb < 0.01 || polyYesProb > 0.99) continue;
          
          // Calculate confidence
          let confidence = 50;
          confidence += Math.min(signal.confirming_books * 3, 15);
          confidence += Math.min(market.liquidity / 100000, 15);
          confidence += Math.min((matchScore - 70) / 2, 15);
          confidence += Math.min(edge / 2, 5);
          confidence = Math.min(Math.round(confidence), 100);
          
          // Determine urgency
          let urgency: 'low' | 'normal' | 'high' | 'critical' = 'normal';
          if (edge >= 15 && signal.confirming_books >= 5) urgency = 'critical';
          else if (edge >= 10 || (edge >= 7 && signal.confirming_books >= 4)) urgency = 'high';
          else if (edge < 5) urgency = 'low';
          
          opportunities.push({
            polymarket_market_id: market.id,
            event_name: `${signal.outcome} - Championship Winner`,
            side: 'YES',
            polymarket_price: polyYesProb,
            bookmaker_probability: bookmakerProb,
            edge_percent: Math.round(edge * 10) / 10,
            confidence_score: confidence,
            urgency,
            signal_factors: {
              confirming_books: signal.confirming_books,
              liquidity_score: Math.round(market.liquidity),
              match_score: matchScore,
              market_type: 'outrights',
            },
            status: 'active',
            expires_at: market.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
    }

    console.log(`Detected ${opportunities.length} opportunities`);

    // Sort by edge and confidence
    opportunities.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const urgencyDiff = urgencyOrder[a.urgency as keyof typeof urgencyOrder] - urgencyOrder[b.urgency as keyof typeof urgencyOrder];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.edge_percent - a.edge_percent;
    });

    // Insert opportunities (limit to top 50)
    const topOpportunities = opportunities.slice(0, 50);
    
    if (topOpportunities.length > 0) {
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
          body: JSON.stringify(topOpportunities),
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
        opportunities: topOpportunities.slice(0, 10),
        movements_detected: signals.length,
        outright_signals: outrightSignals.length,
        polymarkets_analyzed: markets.length,
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
