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

// Check if a market question matches a specific match event (not a season/futures market)
function isMatchEvent(question: string): boolean {
  const q = question.toLowerCase();
  // Exclude season-long, futures, and aggregate markets
  if (q.includes('win the') && (q.includes('league') || q.includes('championship') || q.includes('cup'))) return false;
  if (q.includes('2025-26') || q.includes('2025–26') || q.includes('2026')) return false;
  if (q.includes('will') && q.includes('win')) return false; // "Will X win" suggests futures
  if (q.includes('before') || q.includes('by')) return false; // "by March" etc
  
  // Match-specific patterns
  if (q.includes(' vs ') || q.includes(' vs. ') || q.includes(' v ')) return true;
  if (q.includes('winner') && q.includes('match')) return true;
  
  return false;
}

// Extract team names from event for matching
function extractTeams(eventName: string): string[] {
  // Split on common separators
  const parts = eventName.split(/\s+vs\.?\s+|\s+v\s+|\s+-\s+/i);
  return parts.map(p => p.trim().toLowerCase()).filter(p => p.length > 2);
}

// Score how well a market matches an event (0-100)
function calculateMatchScore(eventName: string, marketQuestion: string): number {
  const eventLower = eventName.toLowerCase();
  const questionLower = marketQuestion.toLowerCase();
  
  // Extract teams from event
  const teams = extractTeams(eventName);
  if (teams.length < 2) return 0;
  
  // Check if both teams are mentioned
  const team1Match = teams[0] && questionLower.includes(teams[0]);
  const team2Match = teams[1] && questionLower.includes(teams[1]);
  
  // Require both teams to match for a valid pairing
  if (!team1Match || !team2Match) return 0;
  
  // Must be a match-type market, not futures
  if (!isMatchEvent(marketQuestion)) return 0;
  
  let score = 60; // Base score for matching both teams
  
  // Bonus for exact format match
  if (questionLower.includes(' vs ') || questionLower.includes(' v ')) score += 20;
  
  // Bonus for similar length (suggests same event type)
  const lengthDiff = Math.abs(eventName.length - marketQuestion.length);
  if (lengthDiff < 20) score += 10;
  if (lengthDiff < 10) score += 10;
  
  return Math.min(score, 100);
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

    // Fetch active Polymarket markets with good liquidity
    const marketsResponse = await fetch(
      `${supabaseUrl}/rest/v1/polymarket_markets?status=eq.active&liquidity=gte.1000&order=volume.desc&limit=200`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const markets: PolymarketMarket[] = await marketsResponse.json();
    console.log(`Found ${markets.length} active Polymarket markets with liquidity >= 1000`);

    const opportunities: any[] = [];
    const processedPairs = new Set<string>(); // Avoid duplicates

    // Aggregate signals by event
    const eventSignals = new Map<string, BookmakerSignal[]>();
    for (const signal of signals) {
      const key = signal.event_name;
      if (!eventSignals.has(key)) {
        eventSignals.set(key, []);
      }
      eventSignals.get(key)!.push(signal);
    }

    console.log(`Processing ${eventSignals.size} unique events`);

    // For each event with signals, find matching Polymarket markets
    for (const [eventName, eventSignalList] of eventSignals) {
      // Find best matching Polymarket market
      let bestMatch: { market: PolymarketMarket; score: number } | null = null;
      
      for (const market of markets) {
        const score = calculateMatchScore(eventName, market.question);
        if (score >= 70 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { market, score };
        }
      }

      if (!bestMatch) continue;
      
      const matchingMarket = bestMatch.market;
      const pairKey = `${eventName}|${matchingMarket.id}`;
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

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

      // Only surface if edge is significant (minimum 3%)
      const minEdge = 3;
      
      if (yesEdge >= minEdge || noEdge >= minEdge) {
        const side = yesEdge >= noEdge ? 'YES' : 'NO';
        const edge = side === 'YES' ? yesEdge : noEdge;
        const polyPrice = side === 'YES' ? polyYesProb : polyNoProb;

        // Skip if the Polymarket price is extremely low (likely thin/illiquid)
        if (polyPrice < 0.05 || polyPrice > 0.95) continue;

        // Calculate confidence score
        let confidence = 50; // Base
        confidence += Math.min(maxConfirming * 3, 15); // +3 per confirming book, max 15
        confidence += Math.min(avgMovement * 2, 10); // Movement adds confidence
        confidence += Math.min(matchingMarket.liquidity / 50000, 15); // Liquidity adds confidence
        confidence += Math.min(bestMatch.score - 70, 10); // Match quality bonus
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
            match_score: bestMatch.score,
          },
          status: 'active',
          expires_at: new Date(Date.now() + Math.max(expiryHours, 1) * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    console.log(`Detected ${opportunities.length} valid opportunities`);

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
        opportunities: opportunities.slice(0, 10), // Return first 10 in response
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
