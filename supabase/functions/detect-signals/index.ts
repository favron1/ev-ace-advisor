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

// Normalize team names for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    console.log('Running signal detection...');
    
    // Parse request body
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // Default values
    }
    
    const eventHorizonHours = body.eventHorizonHours || 24;
    const minEventHorizonHours = body.minEventHorizonHours || 2;
    
    console.log(`Event horizon: ${minEventHorizonHours}h - ${eventHorizonHours}h (H2H only)`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now = new Date();

    // Calculate time boundaries
    const minHorizon = new Date(now.getTime() + minEventHorizonHours * 60 * 60 * 1000).toISOString();
    const maxHorizon = new Date(now.getTime() + eventHorizonHours * 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // PRIORITY: Fetch H2H signals within event horizon
    const h2hQuery = `${supabaseUrl}/rest/v1/bookmaker_signals?captured_at=gte.${twoHoursAgo}&market_type=eq.h2h&commence_time=gte.${minHorizon}&commence_time=lte.${maxHorizon}&order=implied_probability.desc&limit=500`;
    
    const h2hResponse = await fetch(h2hQuery, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    const h2hSignals: BookmakerSignal[] = await h2hResponse.json();
    console.log(`Found ${h2hSignals.length} H2H signals within ${eventHorizonHours}h horizon`);

    const opportunities: any[] = [];
    const processedEvents = new Set<string>();

    // PROCESS H2H SIGNALS - These are the priority!
    // Group by event to find best opportunities
    const eventGroups = new Map<string, BookmakerSignal[]>();
    for (const signal of h2hSignals) {
      const existing = eventGroups.get(signal.event_name) || [];
      existing.push(signal);
      eventGroups.set(signal.event_name, existing);
    }

    console.log(`Processing ${eventGroups.size} unique H2H events`);

    for (const [eventName, signals] of eventGroups) {
      // Skip if already processed
      if (processedEvents.has(eventName)) continue;
      processedEvents.add(eventName);

      // Find best signal for this event (prefer sharp books)
      const sortedSignals = signals.sort((a, b) => {
        if (a.is_sharp_book !== b.is_sharp_book) return a.is_sharp_book ? -1 : 1;
        return b.confirming_books - a.confirming_books;
      });

      const bestSignal = sortedSignals[0];
      const hoursLeft = hoursUntilEvent(bestSignal.commence_time);
      
      // Skip if outside our window
      if (hoursLeft === null || hoursLeft < minEventHorizonHours || hoursLeft > eventHorizonHours) {
        continue;
      }

      // H2H-only: we do NOT match against long-dated Polymarket markets (this was causing far-future results).
      // For now, treat "edge" as distance from 50% implied probability (proxy signal strength).
      const bookmakerProb = bestSignal.implied_probability;
      const edge = Math.abs(bookmakerProb - 0.5) * 100;
      const side = bookmakerProb > 0.5 ? 'YES' : 'NO';
      const polyPrice = 0.5; // placeholder until we add proper H2H market matching
      
      // Minimum edge threshold
      if (edge < 2) continue;

      // Calculate confidence using tiered scoring system
      let confidence = 30; // Base score

      // Edge magnitude scoring (5-35 points)
      if (edge >= 20) {
        confidence += 35;
      } else if (edge >= 10) {
        confidence += 25;
      } else if (edge >= 5) {
        confidence += 15;
      } else if (edge >= 2) {
        confidence += 5;
      }

      // Sharp book presence scoring (0-15 points)
      // Check if any sharp books are in the signals for this event
      const eventSignals = signals;
      const hasPinnacle = eventSignals.some(s => s.outcome.includes('Pinnacle') || s.is_sharp_book);
      const hasBetfair = eventSignals.some(s => s.outcome.includes('Betfair'));
      if (bestSignal.is_sharp_book || hasPinnacle) {
        confidence += 15;
      } else if (hasBetfair) {
        confidence += 10;
      }

      // Confirming books scoring (0-15 points based on actual agreement)
      const confirmingCount = bestSignal.confirming_books || 1;
      if (confirmingCount >= 10) {
        confidence += 15;
      } else if (confirmingCount >= 6) {
        confidence += 10;
      } else if (confirmingCount >= 3) {
        confidence += 5;
      }

      // Time factor scoring (0-5 points)
      if (hoursLeft && hoursLeft <= 6) {
        confidence += 5;
      } else if (hoursLeft && hoursLeft <= 12) {
        confidence += 3;
      }

      confidence = Math.min(Math.round(confidence), 95);

      const urgency = calculateUrgency(hoursLeft, edge, bestSignal.is_sharp_book);
      const timeLabel = formatTimeRemaining(hoursLeft);

      opportunities.push({
        polymarket_market_id: null,
        event_name: eventName,
        side,
        polymarket_price: polyPrice,
        bookmaker_probability: bookmakerProb,
        edge_percent: Math.round(edge * 10) / 10,
        confidence_score: confidence,
        urgency,
        signal_factors: {
          hours_until_event: Math.round(hoursLeft * 10) / 10,
          time_label: timeLabel,
          confirming_books: bestSignal.confirming_books,
          is_sharp_book: bestSignal.is_sharp_book,
          market_type: 'h2h',
          matched_polymarket: false,
        },
        status: 'active',
        expires_at: bestSignal.commence_time || new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    console.log(`Detected ${opportunities.length} opportunities`);

    // Sort by urgency then edge
    const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    opportunities.sort((a, b) => {
      const urgencyDiff = urgencyOrder[a.urgency as keyof typeof urgencyOrder] - urgencyOrder[b.urgency as keyof typeof urgencyOrder];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.edge_percent - a.edge_percent;
    });

    const topOpportunities = opportunities.slice(0, 50);

    // Always clear active opportunities so the UI can't keep showing far-future leftovers
    await fetch(`${supabaseUrl}/rest/v1/signal_opportunities?status=eq.active`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    // Insert the new near-term H2H opportunities
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
        unique_events: eventGroups.size,
        signals_surfaced: topOpportunities.length,
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
