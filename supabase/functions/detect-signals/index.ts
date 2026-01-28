const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  eventHorizonHours?: number;
  minEventHorizonHours?: number;
}

interface BookmakerSignal {
  id: string;
  event_name: string;
  market_type: string;
  outcome: string;
  implied_probability: number;
  confirming_books: number;
  odds: number;
  is_sharp_book: boolean;
  commence_time: string | null;
  captured_at: string;
}

interface PolymarketMarket {
  id: string;
  market_id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume: number;
  last_updated: string;
}

// Normalize team/player names for fuzzy matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// Calculate similarity score (0-1)
function similarityScore(a: string, b: string): number {
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / maxLen;
}

// Extract team names from event string like "Utah Jazz vs Golden State Warriors"
function extractTeams(eventName: string): string[] {
  const separators = [' vs ', ' vs. ', ' v ', ' @ ', ' at '];
  for (const sep of separators) {
    if (eventName.toLowerCase().includes(sep.toLowerCase())) {
      return eventName.split(new RegExp(sep, 'i')).map(t => t.trim());
    }
  }
  return [eventName];
}

// Try to match bookmaker event to Polymarket market
function findPolymarketMatch(
  eventName: string, 
  outcome: string,
  polymarkets: PolymarketMarket[]
): { market: PolymarketMarket; confidence: number; matchedPrice: number } | null {
  const teams = extractTeams(eventName);
  const normalizedOutcome = normalizeName(outcome);
  
  let bestMatch: { market: PolymarketMarket; confidence: number; matchedPrice: number } | null = null;
  
  for (const market of polymarkets) {
    const question = normalizeName(market.question);
    
    // Check if any team name appears in the Polymarket question
    for (const team of teams) {
      const teamNorm = normalizeName(team);
      const similarity = similarityScore(teamNorm, question.slice(0, teamNorm.length + 20));
      
      // Also check if team is directly mentioned
      const teamInQuestion = question.includes(teamNorm);
      const outcomeInQuestion = question.includes(normalizedOutcome);
      
      if (teamInQuestion || outcomeInQuestion || similarity > 0.7) {
        // Calculate match confidence
        let confidence = 0;
        if (teamInQuestion) confidence += 0.4;
        if (outcomeInQuestion) confidence += 0.4;
        confidence += similarity * 0.2;
        
        // Determine which price to use based on outcome
        // If outcome matches team that should win, use yes_price
        // Otherwise use no_price
        const matchedPrice = outcomeInQuestion || teamInQuestion ? market.yes_price : market.no_price;
        
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { market, confidence, matchedPrice };
        }
      }
    }
  }
  
  // Only return if confidence is above threshold
  return bestMatch && bestMatch.confidence >= 0.5 ? bestMatch : null;
}

// Calculate hours until event
function hoursUntilEvent(commenceTime: string | null): number | null {
  if (!commenceTime) return null;
  const now = new Date();
  const eventTime = new Date(commenceTime);
  return (eventTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

// Format time remaining for display
function formatTimeRemaining(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// Determine urgency based on time and edge
function calculateUrgency(hoursLeft: number | null, edge: number, isSharp: boolean): 'low' | 'normal' | 'high' | 'critical' {
  // Near-term events with good edge = higher urgency
  if (hoursLeft !== null && hoursLeft <= 6) {
    if (edge >= 8 || isSharp) return 'critical';
    if (edge >= 5) return 'high';
    return 'normal';
  }
  
  if (hoursLeft !== null && hoursLeft <= 12) {
    if (edge >= 10 || (edge >= 6 && isSharp)) return 'high';
    if (edge >= 4) return 'normal';
    return 'low';
  }
  
  // Longer-term: only high if exceptional edge
  if (edge >= 15) return 'high';
  if (edge >= 8) return 'normal';
  return 'low';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running signal detection with Polymarket matching...');
    
    // Parse request body
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // Default values
    }
    
    const eventHorizonHours = body.eventHorizonHours || 24;
    const minEventHorizonHours = body.minEventHorizonHours || 2;
    
    console.log(`Event horizon: ${minEventHorizonHours}h - ${eventHorizonHours}h`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now = new Date();

    // Calculate time boundaries
    const minHorizon = new Date(now.getTime() + minEventHorizonHours * 60 * 60 * 1000).toISOString();
    const maxHorizon = new Date(now.getTime() + eventHorizonHours * 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // Fetch H2H signals and Polymarket markets in parallel
    const [h2hResponse, polymarketResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${twoHoursAgo}&market_type=eq.h2h&commence_time=gte.${minHorizon}&commence_time=lte.${maxHorizon}&order=implied_probability.desc&limit=500`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }),
      fetch(`${supabaseUrl}/rest/v1/polymarket_markets?status=eq.active&last_updated=gte.${twoHoursAgo}&order=volume.desc&limit=200`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }),
    ]);

    const h2hSignals: BookmakerSignal[] = await h2hResponse.json();
    const polymarkets: PolymarketMarket[] = await polymarketResponse.json();
    
    console.log(`Found ${h2hSignals.length} H2H signals, ${polymarkets.length} active Polymarket markets`);

    const opportunities: any[] = [];
    const processedEvents = new Set<string>();

    // Group signals by event
    const eventGroups = new Map<string, BookmakerSignal[]>();
    for (const signal of h2hSignals) {
      const existing = eventGroups.get(signal.event_name) || [];
      existing.push(signal);
      eventGroups.set(signal.event_name, existing);
    }

    console.log(`Processing ${eventGroups.size} unique H2H events`);

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const [eventName, signals] of eventGroups) {
      if (processedEvents.has(eventName)) continue;
      processedEvents.add(eventName);

      // Find best signal for this event (prefer sharp books)
      const sortedSignals = signals.sort((a, b) => {
        if (a.is_sharp_book !== b.is_sharp_book) return a.is_sharp_book ? -1 : 1;
        return b.confirming_books - a.confirming_books;
      });

      const bestSignal = sortedSignals[0];
      const hoursLeft = hoursUntilEvent(bestSignal.commence_time);
      
      if (hoursLeft === null || hoursLeft < minEventHorizonHours || hoursLeft > eventHorizonHours) {
        continue;
      }

      const bookmakerProb = bestSignal.implied_probability;
      const recommendedOutcome = bestSignal.outcome;
      
      // Try to find matching Polymarket market
      const polyMatch = findPolymarketMatch(eventName, recommendedOutcome, polymarkets);
      
      let edge: number;
      let polyPrice: number;
      let isTrueArbitrage: boolean;
      let matchConfidence: number | null = null;
      
      if (polyMatch) {
        // TRUE ARBITRAGE: Compare bookmaker prob vs Polymarket price
        polyPrice = polyMatch.matchedPrice;
        edge = (bookmakerProb - polyPrice) * 100; // Real edge as percentage
        isTrueArbitrage = true;
        matchConfidence = polyMatch.confidence;
        matchedCount++;
        
        console.log(`Matched: ${eventName} -> Polymarket: ${polyMatch.market.question.slice(0, 50)}... (confidence: ${matchConfidence.toFixed(2)})`);
      } else {
        // NO MATCH: Calculate signal strength (distance from 50%)
        // This is NOT true arbitrage - just informational
        polyPrice = 0.5; // Placeholder
        edge = Math.abs(bookmakerProb - 0.5) * 100; // Signal strength, not edge
        isTrueArbitrage = false;
        unmatchedCount++;
      }
      
      // Minimum edge/signal threshold
      if (edge < 2) continue;

      // Calculate confidence using tiered scoring system
      let confidence = 30; // Base score

      // Edge magnitude scoring (adjusted for realistic edges)
      if (isTrueArbitrage) {
        // True arbitrage edges are smaller but more meaningful
        if (edge >= 10) confidence += 35;
        else if (edge >= 5) confidence += 25;
        else if (edge >= 3) confidence += 15;
        else if (edge >= 1) confidence += 5;
      } else {
        // Signal strength scoring (unmatched)
        if (edge >= 20) confidence += 20;
        else if (edge >= 10) confidence += 15;
        else if (edge >= 5) confidence += 10;
      }

      // Sharp book presence scoring
      const hasPinnacle = signals.some(s => s.outcome.includes('Pinnacle') || s.is_sharp_book);
      const hasBetfair = signals.some(s => s.outcome.includes('Betfair'));
      if (bestSignal.is_sharp_book || hasPinnacle) {
        confidence += 15;
      } else if (hasBetfair) {
        confidence += 10;
      }

      // Confirming books scoring
      const confirmingCount = bestSignal.confirming_books || 1;
      if (confirmingCount >= 10) confidence += 15;
      else if (confirmingCount >= 6) confidence += 10;
      else if (confirmingCount >= 3) confidence += 5;

      // Time factor scoring
      if (hoursLeft && hoursLeft <= 6) confidence += 5;
      else if (hoursLeft && hoursLeft <= 12) confidence += 3;

      // Boost confidence for true arbitrage matches
      if (isTrueArbitrage && matchConfidence) {
        confidence += Math.round(matchConfidence * 10);
      }

      confidence = Math.min(Math.round(confidence), 95);

      const urgency = calculateUrgency(hoursLeft, edge, bestSignal.is_sharp_book);
      const timeLabel = formatTimeRemaining(hoursLeft);

      opportunities.push({
        polymarket_market_id: polyMatch?.market.id || null,
        event_name: eventName,
        recommended_outcome: recommendedOutcome,
        side: 'YES',
        polymarket_price: polyPrice,
        bookmaker_probability: bookmakerProb,
        edge_percent: Math.round(edge * 10) / 10,
        confidence_score: confidence,
        urgency,
        is_true_arbitrage: isTrueArbitrage,
        polymarket_match_confidence: matchConfidence,
        signal_factors: {
          hours_until_event: Math.round(hoursLeft * 10) / 10,
          time_label: timeLabel,
          confirming_books: bestSignal.confirming_books,
          is_sharp_book: bestSignal.is_sharp_book,
          market_type: 'h2h',
          matched_polymarket: isTrueArbitrage,
          match_confidence: matchConfidence,
        },
        status: 'active',
        expires_at: bestSignal.commence_time || new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    console.log(`Detected ${opportunities.length} opportunities (${matchedCount} matched, ${unmatchedCount} unmatched)`);

    // Sort by: true arbitrage first, then urgency, then edge
    const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    opportunities.sort((a, b) => {
      // Prioritize true arbitrage
      if (a.is_true_arbitrage !== b.is_true_arbitrage) return a.is_true_arbitrage ? -1 : 1;
      const urgencyDiff = urgencyOrder[a.urgency as keyof typeof urgencyOrder] - urgencyOrder[b.urgency as keyof typeof urgencyOrder];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.edge_percent - a.edge_percent;
    });

    const topOpportunities = opportunities.slice(0, 50);

    // Clear active opportunities
    await fetch(`${supabaseUrl}/rest/v1/signal_opportunities?status=eq.active`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    // Insert new opportunities
    if (topOpportunities.length > 0) {
      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/signal_opportunities`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(topOpportunities),
      });

      if (!insertResponse.ok) {
        const error = await insertResponse.text();
        console.error('Insert error:', error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        opportunities: topOpportunities.slice(0, 10),
        h2h_signals: h2hSignals.length,
        polymarket_markets: polymarkets.length,
        unique_events: eventGroups.size,
        signals_surfaced: topOpportunities.length,
        matched_to_polymarket: matchedCount,
        unmatched_signals: unmatchedCount,
        event_horizon: `${minEventHorizonHours}h - ${eventHorizonHours}h`,
        timestamp: now.toISOString(),
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
