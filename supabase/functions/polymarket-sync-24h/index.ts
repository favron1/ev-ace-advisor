import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gamma API for Polymarket events
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Sports categories to monitor
const SPORTS_CATEGORIES = [
  'Sports',
  'NBA',
  'NFL',
  'NHL',
  'UFC',
  'MMA',
  'Tennis',
  'Soccer',
  'Football',
  'Basketball',
  'Boxing',
];

// Team name normalization for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract team names from Polymarket question/title
function extractTeams(question: string, title: string): { home: string | null; away: string | null } {
  const combined = `${title} ${question}`;
  
  // Common patterns: "Lakers vs Celtics", "Will the Lakers beat the Celtics?"
  const vsPattern = /([A-Za-z\s]+)\s+(?:vs\.?|versus|v\.?)\s+([A-Za-z\s]+)/i;
  const beatPattern = /Will (?:the\s+)?([A-Za-z\s]+)\s+(?:beat|defeat|win against)\s+(?:the\s+)?([A-Za-z\s]+)/i;
  const winPattern = /([A-Za-z\s]+)\s+(?:to\s+)?win\s+(?:vs\.?|against)\s+([A-Za-z\s]+)/i;
  
  let match = combined.match(vsPattern) || combined.match(beatPattern) || combined.match(winPattern);
  
  if (match) {
    return {
      home: match[1].trim(),
      away: match[2].trim(),
    };
  }
  
  return { home: null, away: null };
}

// Determine if this is a sports H2H market
function isSportsH2H(event: any): boolean {
  const rawTags = event.tags || [];
  // Ensure tags are strings
  const tags = rawTags.filter((t: any) => typeof t === 'string');
  const title = (event.title || '').toLowerCase();
  const question = (event.question || '').toLowerCase();
  
  // Check if it's a sports category
  const isSports = tags.some((tag: string) => 
    SPORTS_CATEGORIES.some(cat => tag.toLowerCase().includes(cat.toLowerCase()))
  ) || SPORTS_CATEGORIES.some(cat => 
    title.includes(cat.toLowerCase()) || question.includes(cat.toLowerCase())
  );
  
  if (!isSports) return false;
  
  // Check if it's a H2H match (not futures/championship)
  const futuresKeywords = ['championship', 'winner', 'mvp', 'season', 'playoffs', 'finals', 'title'];
  const isFutures = futuresKeywords.some(kw => title.includes(kw) || question.includes(kw));
  
  // H2H patterns
  const h2hPatterns = ['vs', 'versus', 'beat', 'defeat', 'win against', 'to win'];
  const isH2H = h2hPatterns.some(p => title.includes(p) || question.includes(p));
  
  return isH2H && !isFutures;
}

// Detect league from question/title
function detectLeague(question: string, title: string): string | null {
  const combined = `${title} ${question}`.toLowerCase();
  
  const leagues = [
    { pattern: /\bnba\b/, league: 'NBA' },
    { pattern: /\bnfl\b/, league: 'NFL' },
    { pattern: /\bnhl\b/, league: 'NHL' },
    { pattern: /\bufc\b/, league: 'UFC' },
    { pattern: /\bmma\b/, league: 'MMA' },
    { pattern: /\batp\b|\bwta\b|tennis/i, league: 'Tennis' },
    { pattern: /\bpremier league\b|\bepl\b/, league: 'EPL' },
    { pattern: /\bla liga\b/, league: 'La Liga' },
    { pattern: /\bchampions league\b|\bucl\b/, league: 'UCL' },
  ];
  
  for (const { pattern, league } of leagues) {
    if (pattern.test(combined)) return league;
  }
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-SYNC-24H] Starting rolling 24hr sync...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate 24hr window
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Fetch ALL active events from Gamma API
    console.log('[POLY-SYNC-24H] Fetching active Polymarket events...');
    
    let allEvents: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[POLY-SYNC-24H] Gamma API error: ${response.status}`);
        break;
      }
      
      const events = await response.json();
      
      if (events.length === 0) {
        hasMore = false;
      } else {
        allEvents = allEvents.concat(events);
        offset += limit;
        
        // Safety cap at 500 events
        if (allEvents.length >= 500) {
          hasMore = false;
        }
      }
    }

    console.log(`[POLY-SYNC-24H] Fetched ${allEvents.length} total active events`);

    // Filter to events within 24hr window that are sports H2H
    const qualifying: any[] = [];

    for (const event of allEvents) {
      // Skip if no end date
      if (!event.endDate) continue;

      const endDate = new Date(event.endDate);
      
      // Must end within 24 hours and not already ended
      if (endDate <= now || endDate > in24Hours) continue;

      // Must be sports H2H (not futures)
      if (!isSportsH2H(event)) continue;

      // Get markets for this event
      const markets = event.markets || [];
      if (markets.length === 0) continue;

      // Take the primary market
      const primaryMarket = markets[0];
      
      qualifying.push({
        event,
        market: primaryMarket,
        endDate,
      });
    }

    console.log(`[POLY-SYNC-24H] ${qualifying.length} events qualify (H2H, <24hr)`);

    // Upsert qualifying events to cache and event_watch_state
    let upserted = 0;
    let monitored = 0;

    for (const { event, market, endDate } of qualifying) {
      const conditionId = market.conditionId || market.id;
      const yesPrice = parseFloat(market.outcomePrices?.[0] || market.yes_price || '0.5');
      const noPrice = parseFloat(market.outcomePrices?.[1] || market.no_price || '0.5');
      const volume = parseFloat(market.volume || event.volume || '0');
      const liquidity = parseFloat(market.liquidity || event.liquidity || '0');
      
      const teams = extractTeams(market.question || event.question, event.title);
      const league = detectLeague(market.question || event.question, event.title);

      // Upsert to polymarket_h2h_cache
      const { error: cacheError } = await supabase
        .from('polymarket_h2h_cache')
        .upsert({
          condition_id: conditionId,
          event_title: event.title,
          question: market.question || event.question,
          event_date: endDate.toISOString(),
          yes_price: yesPrice,
          no_price: noPrice,
          volume: volume,
          liquidity: liquidity,
          team_home: teams.home,
          team_away: teams.away,
          team_home_normalized: teams.home ? normalizeTeamName(teams.home) : null,
          team_away_normalized: teams.away ? normalizeTeamName(teams.away) : null,
          sport_category: league || 'Sports',
          extracted_league: league,
          market_type: 'h2h',
          status: 'active',
          last_price_update: now.toISOString(),
          last_bulk_sync: now.toISOString(),
        }, {
          onConflict: 'condition_id',
        });

      if (cacheError) {
        console.error(`[POLY-SYNC-24H] Cache upsert error: ${cacheError.message}`);
        continue;
      }
      upserted++;

      // Create/update event_watch_state entry
      const eventKey = `poly_${conditionId}`;
      
      const { error: stateError } = await supabase
        .from('event_watch_state')
        .upsert({
          event_key: eventKey,
          event_name: event.title,
          watch_state: 'monitored',
          commence_time: endDate.toISOString(),
          polymarket_condition_id: conditionId,
          polymarket_question: market.question || event.question,
          polymarket_yes_price: yesPrice,
          polymarket_volume: volume,
          polymarket_matched: true,
          last_poly_refresh: now.toISOString(),
          updated_at: now.toISOString(),
        }, {
          onConflict: 'event_key',
        });

      if (!stateError) {
        monitored++;
      }
    }

    // Expire events that have started
    const { data: expiredEvents, error: expireError } = await supabase
      .from('event_watch_state')
      .update({ 
        watch_state: 'expired',
        updated_at: now.toISOString(),
      })
      .lt('commence_time', now.toISOString())
      .eq('watch_state', 'monitored')
      .select('id');

    const expiredCount = expiredEvents?.length || 0;

    // Also expire stale cache entries
    await supabase
      .from('polymarket_h2h_cache')
      .update({ status: 'expired' })
      .lt('event_date', now.toISOString())
      .eq('status', 'active');

    const duration = Date.now() - startTime;
    console.log(`[POLY-SYNC-24H] Complete: ${upserted} cached, ${monitored} monitored, ${expiredCount} expired in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allEvents.length,
        qualifying_events: qualifying.length,
        upserted_to_cache: upserted,
        now_monitored: monitored,
        expired: expiredCount,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POLY-SYNC-24H] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
