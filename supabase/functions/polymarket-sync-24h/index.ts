import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gamma API for Polymarket events
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Sports-related categories to capture
const SPORTS_TAGS = [
  'sports', 'nba', 'nfl', 'nhl', 'mlb', 'mls',
  'ufc', 'mma', 'boxing', 'wrestling',
  'tennis', 'golf', 'soccer', 'football', 'basketball',
  'baseball', 'hockey', 'cricket', 'rugby',
  'formula 1', 'f1', 'nascar', 'motorsport',
  'olympics', 'esports', 'darts', 'snooker',
];

// Check if event is sports-related based on tags
function isSportsCategory(tags: any[]): boolean {
  if (!tags || !Array.isArray(tags)) return false;
  
  return tags.some(tag => {
    if (typeof tag !== 'string') return false;
    const tagLower = tag.toLowerCase();
    return SPORTS_TAGS.some(sport => tagLower.includes(sport));
  });
}

// Detect sport from title/question
function detectSport(title: string, question: string): string | null {
  const combined = `${title} ${question}`.toLowerCase();
  
  const sportPatterns: Array<{ patterns: RegExp[]; sport: string }> = [
    { patterns: [/\bnba\b/, /lakers|celtics|warriors|heat|bulls|knicks|nets|bucks|76ers|suns|nuggets|clippers|mavericks|rockets|grizzlies|timberwolves|pelicans|spurs|thunder|jazz|blazers|kings|hornets|hawks|wizards|magic|pistons|cavaliers|raptors|pacers/i], sport: 'NBA' },
    { patterns: [/\bnfl\b/, /chiefs|eagles|49ers|cowboys|bills|ravens|bengals|dolphins|lions|packers|jets|patriots|broncos|chargers|raiders|steelers|browns|texans|colts|jaguars|titans|commanders|giants|saints|panthers|falcons|buccaneers|seahawks|rams|cardinals|bears|vikings/i], sport: 'NFL' },
    { patterns: [/\bnhl\b/, /maple leafs|canadiens|bruins|rangers|islanders|devils|flyers|penguins|capitals|hurricanes|panthers|lightning|red wings|senators|sabres|blue jackets|blackhawks|blues|wild|avalanche|stars|predators|jets|flames|oilers|canucks|kraken|golden knights|coyotes|sharks|ducks|kings/i], sport: 'NHL' },
    { patterns: [/\bufc\b/, /\bmma\b/, /adesanya|jones|pereira|volkanovski|makhachev|islam|strickland|chimaev|covington|diaz|mcgregor|usman|chandler|poirier|holloway|o'?malley|yan|sterling/i], sport: 'UFC' },
    { patterns: [/\batp\b/, /\bwta\b/, /djokovic|sinner|alcaraz|medvedev|zverev|rublev|tsitsipas|ruud|fritz|de minaur|sabalenka|swiatek|gauff|rybakina|pegula|keys|zheng|ostapenko|kvitova|badosa/i, /australian open|french open|wimbledon|us open|grand slam/i], sport: 'Tennis' },
    { patterns: [/premier league|\bepl\b|arsenal|chelsea|liverpool|man city|manchester city|man united|manchester united|tottenham|spurs|newcastle|brighton|aston villa|west ham|bournemouth|fulham|crystal palace|brentford|wolves|nottingham forest|everton|luton|burnley|sheffield/i], sport: 'EPL' },
    { patterns: [/\bmlb\b|yankees|red sox|dodgers|mets|phillies|braves|cubs|cardinals|padres|giants|mariners|astros|rangers|twins|guardians|orioles|rays|blue jays|brewers|diamondbacks|rockies|marlins|nationals|pirates|reds|royals|tigers|white sox|angels|athletics/i], sport: 'MLB' },
    { patterns: [/champions league|\bucl\b|real madrid|barcelona|bayern|juventus|inter milan|ac milan|psg|paris saint|dortmund|benfica|porto|ajax|celtic/i], sport: 'UCL' },
    { patterns: [/la liga|atletico madrid|sevilla|villarreal|real sociedad|athletic bilbao/i], sport: 'LaLiga' },
    { patterns: [/serie a|napoli|roma|lazio|fiorentina|atalanta/i], sport: 'SerieA' },
    { patterns: [/bundesliga|leverkusen|leipzig|frankfurt|wolfsburg|freiburg/i], sport: 'Bundesliga' },
    { patterns: [/\bbox(?:ing)?\b|fury|usyk|joshua|canelo|crawford|spence|davis|haney|stevenson|lomachenko/i], sport: 'Boxing' },
  ];
  
  for (const { patterns, sport } of sportPatterns) {
    if (patterns.some(p => p.test(combined))) {
      return sport;
    }
  }
  
  return null;
}

// Detect market type from question
function detectMarketType(question: string): string {
  const q = question.toLowerCase();
  
  if (/over|under|o\/u|total|combined|points scored|more than|less than|at least \d+|exactly \d+/.test(q)) {
    return 'total';
  }
  if (/spread|handicap|\+\d+\.?\d*|\-\d+\.?\d*|cover|margin/.test(q)) {
    return 'spread';
  }
  if (/prop|player|score|yards|touchdowns|assists|rebounds|strikeouts|home runs|goals scored by/.test(q)) {
    return 'player_prop';
  }
  if (/championship|winner|mvp|award|season|division|conference|super bowl|world series|stanley cup/.test(q)) {
    return 'futures';
  }
  // Default to h2h for "vs", "beat", "win" patterns
  return 'h2h';
}

// Extract entity (team/player name) from question
function extractEntity(question: string, title: string): string | null {
  const combined = `${title} ${question}`;
  
  // Try to extract "Will X beat/win" pattern
  const willMatch = combined.match(/will (?:the )?([A-Za-z\s]+?)(?:\s+beat|\s+win|\s+defeat|\?)/i);
  if (willMatch) {
    return willMatch[1].trim();
  }
  
  // Try "X vs Y" pattern
  const vsMatch = combined.match(/([A-Za-z\s]+?)\s+(?:vs\.?|versus|v\.?)\s+([A-Za-z\s]+)/i);
  if (vsMatch) {
    return `${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`;
  }
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-SYNC-24H] Starting universal sports scan...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate 24hr window
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    console.log(`[POLY-SYNC-24H] Window: now to ${in24Hours.toISOString()}`);

    // Fetch ALL active events from Gamma API
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
        
        // Safety cap at 1000 events
        if (allEvents.length >= 1000) {
          hasMore = false;
        }
      }
    }

    console.log(`[POLY-SYNC-24H] Fetched ${allEvents.length} total active events`);

    // Filter: Sports category + ends within 24 hours
    const qualifying: any[] = [];
    let statsNoEndDate = 0;
    let statsNotSports = 0;
    let statsOutsideWindow = 0;
    let statsNoMarkets = 0;

    for (const event of allEvents) {
      const tags = event.tags || [];
      
      // Must be sports category
      if (!isSportsCategory(tags)) {
        statsNotSports++;
        continue;
      }

      // Must have an end date
      if (!event.endDate) {
        statsNoEndDate++;
        continue;
      }

      // End date must be within 24 hours
      const endDate = new Date(event.endDate);
      if (endDate > in24Hours || endDate < now) {
        statsOutsideWindow++;
        continue;
      }

      // Must have at least one market
      const markets = event.markets || [];
      if (markets.length === 0) {
        statsNoMarkets++;
        continue;
      }

      // Take the primary market
      const primaryMarket = markets[0];
      
      qualifying.push({
        event,
        market: primaryMarket,
        endDate,
      });
    }

    console.log(`[POLY-SYNC-24H] Filtering stats:`);
    console.log(`  - Not sports: ${statsNotSports}`);
    console.log(`  - No end date: ${statsNoEndDate}`);
    console.log(`  - Outside 24h window: ${statsOutsideWindow}`);
    console.log(`  - No markets: ${statsNoMarkets}`);
    console.log(`  - QUALIFYING: ${qualifying.length}`);

    // Upsert qualifying events
    let upserted = 0;
    let monitored = 0;

    for (const { event, market, endDate } of qualifying) {
      const conditionId = market.conditionId || market.id || event.id;
      const question = market.question || event.question || '';
      const title = event.title || '';
      
      // Detect sport and market type
      const detectedSport = detectSport(title, question);
      const marketType = detectMarketType(question);
      const extractedEntity = extractEntity(question, title);

      // Parse prices
      let yesPrice = 0.5;
      let noPrice = 0.5;
      
      if (market.outcomePrices && Array.isArray(market.outcomePrices)) {
        yesPrice = parseFloat(market.outcomePrices[0]) || 0.5;
        noPrice = parseFloat(market.outcomePrices[1]) || 0.5;
      } else if (market.yes_price !== undefined) {
        yesPrice = parseFloat(market.yes_price) || 0.5;
        noPrice = parseFloat(market.no_price) || 0.5;
      } else if (market.outcomes && Array.isArray(market.outcomes)) {
        yesPrice = parseFloat(market.outcomes[0]?.price) || 0.5;
        noPrice = parseFloat(market.outcomes[1]?.price) || 0.5;
      }
      
      // Validate prices
      if (isNaN(yesPrice) || yesPrice < 0 || yesPrice > 1) yesPrice = 0.5;
      if (isNaN(noPrice) || noPrice < 0 || noPrice > 1) noPrice = 0.5;
      
      const volume = parseFloat(market.volume || event.volume || '0') || 0;
      const liquidity = parseFloat(market.liquidity || event.liquidity || '0') || 0;

      // Upsert to polymarket_h2h_cache
      const { error: cacheError } = await supabase
        .from('polymarket_h2h_cache')
        .upsert({
          condition_id: conditionId,
          event_title: title,
          question: question,
          event_date: endDate.toISOString(),
          yes_price: yesPrice,
          no_price: noPrice,
          volume: volume,
          liquidity: liquidity,
          sport_category: detectedSport || 'Sports',
          extracted_league: detectedSport,
          extracted_entity: extractedEntity,
          market_type: marketType,
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
          event_name: title || question.substring(0, 100),
          watch_state: 'monitored',
          commence_time: endDate.toISOString(),
          polymarket_condition_id: conditionId,
          polymarket_question: question,
          polymarket_yes_price: yesPrice,
          polymarket_volume: volume,
          polymarket_matched: false,
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
    const { data: expiredEvents } = await supabase
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
        filter_stats: {
          not_sports: statsNotSports,
          no_end_date: statsNoEndDate,
          outside_window: statsOutsideWindow,
          no_markets: statsNoMarkets,
        },
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
