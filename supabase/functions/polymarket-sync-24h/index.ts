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

// Determine if this is a sports event (broader filter for H2H-style markets)
function isSportsEvent(event: any): { isSports: boolean; isH2H: boolean; league: string | null } {
  const rawTags = event.tags || [];
  // Ensure tags are strings
  const tags = rawTags.filter((t: any) => typeof t === 'string');
  const title = (event.title || '').toLowerCase();
  const question = (event.question || '').toLowerCase();
  const combined = `${title} ${question}`;
  
  // Check if it's a sports category
  const isSports = tags.some((tag: string) => 
    SPORTS_CATEGORIES.some(cat => tag.toLowerCase().includes(cat.toLowerCase()))
  ) || SPORTS_CATEGORIES.some(cat => 
    combined.includes(cat.toLowerCase())
  );
  
  if (!isSports) return { isSports: false, isH2H: false, league: null };
  
  // Detect league
  const leaguePatterns = [
    { pattern: /\bnba\b/i, league: 'NBA' },
    { pattern: /\bnfl\b/i, league: 'NFL' },
    { pattern: /\bnhl\b/i, league: 'NHL' },
    { pattern: /\bufc\b/i, league: 'UFC' },
    { pattern: /\bmma\b/i, league: 'MMA' },
    { pattern: /\batp\b|\bwta\b|australian open|wimbledon|us open|french open/i, league: 'Tennis' },
    { pattern: /\bpremier league\b|\bepl\b/i, league: 'EPL' },
    { pattern: /\bchampions league\b|\bucl\b/i, league: 'UCL' },
  ];
  
  let league: string | null = null;
  for (const { pattern, league: l } of leaguePatterns) {
    if (pattern.test(combined)) {
      league = l;
      break;
    }
  }
  
  // Long-dated futures keywords (exclude these)
  const futuresKeywords = ['championship', 'mvp', 'season', 'regular season', 'division', 'conference'];
  const isFutures = futuresKeywords.some(kw => combined.includes(kw));
  
  // H2H patterns - be more inclusive
  const h2hPatterns = ['vs', 'versus', 'beat', 'defeat', 'win against', 'to win', ' win ', ' beat '];
  const hasH2HPattern = h2hPatterns.some(p => combined.includes(p));
  
  // Also check for "Will X win?" pattern which is common for match outcomes
  const willWinPattern = /will\s+(?:the\s+)?[\w\s]+\s+win/i.test(combined);
  
  // Check for team-like patterns (e.g., "Lakers", "Celtics", "Heat", "Warriors")
  const teamPattern = /lakers|celtics|warriors|heat|bulls|knicks|nets|bucks|76ers|suns|nuggets|clippers|mavericks|rockets|grizzlies|timberwolves|pelicans|spurs|thunder|jazz|blazers|kings|hornets|hawks|wizards|magic|pistons|cavaliers|raptors|pacers/i;
  const hasTeam = teamPattern.test(combined);
  
  // Consider it H2H if:
  // 1. Has explicit H2H pattern (vs, beat, etc.) OR
  // 2. Has "Will X win?" pattern with a team name
  // 3. NOT a long-dated futures market
  const isH2H = (hasH2HPattern || willWinPattern || hasTeam) && !isFutures;
  
  return { isSports: true, isH2H, league };
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

    // Filter to sports events (be more inclusive for now to understand inventory)
    const qualifying: any[] = [];
    let statsNoEndDate = 0;
    let statsFutures = 0;
    let statsNotSports = 0;
    let statsNoMarkets = 0;
    let sampleSportsEvents: string[] = [];
    let sampleEndDates: string[] = [];

    for (const event of allEvents) {
      // Must be sports
      const sportCheck = isSportsEvent(event);
      if (!sportCheck.isSports) {
        statsNotSports++;
        continue;
      }

      // Log sample sports events for debugging
      if (sampleSportsEvents.length < 10) {
        const endDate = event.endDate ? new Date(event.endDate).toISOString() : 'no-date';
        sampleSportsEvents.push(`${event.title?.substring(0, 50)}...`);
        sampleEndDates.push(endDate);
      }

      // For now, skip if not H2H pattern (but accept even if end date is far)
      if (!sportCheck.isH2H) {
        statsFutures++;
        continue;
      }

      // Get markets for this event
      const markets = event.markets || [];
      if (markets.length === 0) {
        statsNoMarkets++;
        continue;
      }

      // Take the primary market
      const primaryMarket = markets[0];
      
      // Use endDate as the event date (even if it's far in future for now)
      const endDate = event.endDate ? new Date(event.endDate) : new Date(Date.now() + 24*60*60*1000);
      
      qualifying.push({
        event,
        market: primaryMarket,
        endDate,
        league: sportCheck.league,
      });
    }

    console.log(`[POLY-SYNC-24H] Stats: notSports=${statsNotSports}, futures=${statsFutures}, noMarkets=${statsNoMarkets}`);
    console.log(`[POLY-SYNC-24H] Sample sports titles: ${JSON.stringify(sampleSportsEvents)}`);
    console.log(`[POLY-SYNC-24H] Sample end dates: ${JSON.stringify(sampleEndDates)}`);
    console.log(`[POLY-SYNC-24H] ${qualifying.length} events qualify as H2H sports`);

    // Upsert qualifying events to cache and event_watch_state
    let upserted = 0;
    let monitored = 0;

    for (const { event, market, endDate, league } of qualifying) {
      const conditionId = market.conditionId || market.id || event.id;
      
      // Parse prices defensively - Polymarket API structure varies
      let yesPrice = 0.5;
      let noPrice = 0.5;
      
      // Try different price field locations
      if (market.outcomePrices && Array.isArray(market.outcomePrices)) {
        yesPrice = parseFloat(market.outcomePrices[0]) || 0.5;
        noPrice = parseFloat(market.outcomePrices[1]) || 0.5;
      } else if (market.yes_price !== undefined) {
        yesPrice = parseFloat(market.yes_price) || 0.5;
        noPrice = parseFloat(market.no_price) || 0.5;
      } else if (market.outcomes && Array.isArray(market.outcomes)) {
        // Some markets have outcomes array with price field
        yesPrice = parseFloat(market.outcomes[0]?.price) || 0.5;
        noPrice = parseFloat(market.outcomes[1]?.price) || 0.5;
      }
      
      // Validate prices are in valid range
      if (isNaN(yesPrice) || yesPrice < 0 || yesPrice > 1) yesPrice = 0.5;
      if (isNaN(noPrice) || noPrice < 0 || noPrice > 1) noPrice = 0.5;
      
      const volume = parseFloat(market.volume || event.volume || '0') || 0;
      const liquidity = parseFloat(market.liquidity || event.liquidity || '0') || 0;
      
      const teams = extractTeams(market.question || event.question || '', event.title || '');

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
