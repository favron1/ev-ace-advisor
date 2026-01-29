import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gamma API for Polymarket events
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Detect sport from title/question using keywords
// Returns sport key or null if not sports-related
function detectSport(title: string, question: string): string | null {
  const combined = `${title} ${question}`.toLowerCase();
  
  const sportPatterns: Array<{ patterns: RegExp[]; sport: string }> = [
    // NHL - check FIRST to catch "Blackhawks" before NBA's "hawks" pattern
    { patterns: [/\bnhl\b/, /blackhawks|maple leafs|canadiens|habs|bruins|rangers|islanders|devils|flyers|penguins|capitals|caps|hurricanes|canes|panthers|lightning|bolts|red wings|senators|sens|sabres|blue jackets|blues|wild|avalanche|avs|stars|predators|preds|jets|flames|oilers|canucks|kraken|golden knights|knights|coyotes|sharks|ducks|kings/i], sport: 'NHL' },
    
    // NBA - team names and league (use "atlanta hawks" to avoid matching "blackhawks")
    { patterns: [/\bnba\b/, /lakers|celtics|warriors|heat|bulls|knicks|nets|bucks|76ers|sixers|suns|nuggets|clippers|mavericks|rockets|grizzlies|timberwolves|pelicans|spurs|thunder|jazz|blazers|trail blazers|hornets|atlanta hawks|wizards|magic|pistons|cavaliers|raptors|pacers/i], sport: 'NBA' },
    
    // NFL - team names and league (use "new york jets" context to avoid NHL jets confusion)
    { patterns: [/\bnfl\b/, /chiefs|eagles|49ers|niners|cowboys|bills|ravens|bengals|dolphins|lions|packers|patriots|broncos|chargers|raiders|steelers|browns|texans|colts|jaguars|titans|commanders|giants|saints|panthers|falcons|buccaneers|bucs|seahawks|rams|cardinals|bears|vikings/i], sport: 'NFL' },
    
    // UFC/MMA - fighters and terms
    { patterns: [/\bufc\b/, /\bmma\b/, /adesanya|jones|pereira|volkanovski|makhachev|islam|strickland|chimaev|covington|diaz|mcgregor|usman|chandler|poirier|holloway|o'?malley|yan|sterling|pantoja|moreno|figueiredo|dvalishvili|merab|shevchenko|grasso|zhang weili|namajunas|nunes/i], sport: 'UFC' },
    
    // Tennis - players and tournaments
    { patterns: [/\batp\b/, /\bwta\b/, /djokovic|sinner|alcaraz|medvedev|zverev|rublev|tsitsipas|ruud|fritz|de minaur|sabalenka|swiatek|gauff|rybakina|pegula|keys|zheng|ostapenko|kvitova|badosa|krejcikova|vondrousova|haddad|paolini/i, /australian open|french open|roland garros|wimbledon|us open|grand slam|indian wells|miami open|madrid open|italian open|cincinnati/i], sport: 'Tennis' },
    
    // EPL - team names
    { patterns: [/premier league|\bepl\b|arsenal|chelsea|liverpool|man city|manchester city|man united|manchester united|tottenham|spurs|newcastle|brighton|aston villa|west ham|bournemouth|fulham|crystal palace|brentford|wolves|wolverhampton|nottingham forest|everton|luton|burnley|sheffield|ipswich|leicester/i], sport: 'EPL' },
    
    // MLB - team names and league
    { patterns: [/\bmlb\b|yankees|red sox|dodgers|mets|phillies|braves|cubs|cardinals|padres|giants|mariners|astros|rangers|twins|guardians|orioles|rays|blue jays|brewers|diamondbacks|d-?backs|rockies|marlins|nationals|nats|pirates|reds|royals|tigers|white sox|angels|athletics|a's/i], sport: 'MLB' },
    
    // Champions League
    { patterns: [/champions league|\bucl\b|real madrid|barcelona|barca|bayern|juventus|juve|inter milan|ac milan|psg|paris saint|dortmund|benfica|porto|ajax|celtic/i], sport: 'UCL' },
    
    // La Liga
    { patterns: [/la liga|laliga|atletico madrid|sevilla|villarreal|real sociedad|athletic bilbao|real betis|valencia cf|girona/i], sport: 'LaLiga' },
    
    // Serie A
    { patterns: [/serie a|napoli|roma|lazio|fiorentina|atalanta|bologna|torino|monza|genoa|udinese|sassuolo|lecce|empoli|cagliari|verona|frosinone|salernitana/i], sport: 'SerieA' },
    
    // Bundesliga
    { patterns: [/bundesliga|leverkusen|leipzig|frankfurt|wolfsburg|freiburg|hoffenheim|mainz|augsburg|werder bremen|union berlin|koln|cologne|gladbach|bochum|heidenheim|darmstadt/i], sport: 'Bundesliga' },
    
    // Boxing
    { patterns: [/\bbox(?:ing)?\b|fury|usyk|joshua|canelo|crawford|spence|davis|haney|stevenson|lomachenko|bivol|beterbiev|tank davis|shakur/i], sport: 'Boxing' },
    
    // College sports
    { patterns: [/\bncaa\b|march madness|college football|college basketball|cfb playoff|final four/i], sport: 'NCAA' },
    
    // Golf
    { patterns: [/\bpga\b|\bgolf\b|masters|us open golf|british open|open championship|ryder cup|scheffler|mcilroy|rahm|koepka|spieth|thomas|hovland|morikawa|cantlay|woods/i], sport: 'Golf' },
    
    // F1/Racing
    { patterns: [/formula 1|\bf1\b|verstappen|hamilton|leclerc|norris|sainz|perez|alonso|russell|grand prix|monaco gp|silverstone/i], sport: 'F1' },
    
    // Generic sports terms that indicate it's a sports event
    { patterns: [/\bvs\.?\b.*(?:win|beat|defeat)/, /will\s+(?:the\s+)?[A-Z][a-z]+\s+(?:beat|win|defeat)/, /who\s+will\s+win.*(?:game|match|fight|bout)/i], sport: 'Sports' },
  ];
  
  for (const { patterns, sport } of sportPatterns) {
    if (patterns.some(p => p.test(combined))) {
      return sport;
    }
  }
  
  return null;
}

// Detect market type from question with improved patterns
function detectMarketType(question: string): string {
  const q = question.toLowerCase();
  
  // Totals (Over/Under) - expanded patterns
  if (/\bover\s+\d+\.?\d*/i.test(q) || /\bunder\s+\d+\.?\d*/i.test(q)) return 'total';
  if (/total\s+(?:points|goals|runs|score)/i.test(q)) return 'total';
  if (/score\s+over|score\s+under/i.test(q)) return 'total';
  if (/combined\s+(?:score|points|total)/i.test(q)) return 'total';
  if (/o\/u|over\/under/i.test(q)) return 'total';
  if (/more than \d+|less than \d+|at least \d+|exactly \d+/i.test(q)) return 'total';
  
  // Spreads - expanded patterns
  if (/cover\s+[\-\+]?\d+\.?\d*/i.test(q)) return 'spread';
  if (/win\s+by\s+\d+\+?/i.test(q)) return 'spread';
  if (/\b[\-\+]\d+\.5\b/.test(q)) return 'spread'; // -5.5, +3.5 patterns
  if (/spread|handicap|margin\s+of/i.test(q)) return 'spread';
  
  // Player props - expanded patterns
  if (/\d+\+?\s+(?:points|rebounds|assists|yards|touchdowns|goals|strikeouts|home runs|hits|saves)/i.test(q)) return 'player_prop';
  if (/score\s+\d+\+?\s+points/i.test(q)) return 'player_prop';
  if (/throw\s+\d+\+?\s+(?:tds|touchdowns)/i.test(q)) return 'player_prop';
  if (/record\s+\d+\+?\s+(?:rebounds|assists)/i.test(q)) return 'player_prop';
  if (/rush\s+for\s+\d+\+?\s+yards/i.test(q)) return 'player_prop';
  
  // Futures
  if (/championship|winner|mvp|award|season|division|conference|super bowl|world series|stanley cup/i.test(q)) {
    return 'futures';
  }
  
  // Default to h2h for "vs", "beat", "win" patterns
  return 'h2h';
}

// Extract numeric threshold from question (e.g., "over 220.5" -> 220.5)
function extractThreshold(question: string): number | null {
  const q = question.toLowerCase();
  
  // Over/under patterns: "over 220.5", "under 110.5"
  const overUnderMatch = q.match(/(?:over|under)\s+(\d+\.?\d*)/i);
  if (overUnderMatch) return parseFloat(overUnderMatch[1]);
  
  // Spread patterns: "cover -5.5", "+3.5"
  const spreadMatch = q.match(/(?:cover\s+)?([\-\+]\d+\.?\d*)/i);
  if (spreadMatch) return parseFloat(spreadMatch[1]);
  
  // Win by patterns: "win by 5+"
  const winByMatch = q.match(/win\s+by\s+(\d+)\+?/i);
  if (winByMatch) return parseFloat(winByMatch[1]);
  
  // Prop patterns: "score 25+ points"
  const propMatch = q.match(/(?:score|throw|record|rush\s+for)\s+(\d+)\+?/i);
  if (propMatch) return parseFloat(propMatch[1]);
  
  // General number extraction for totals
  const totalMatch = q.match(/total.*?(\d+\.?\d*)/i);
  if (totalMatch) return parseFloat(totalMatch[1]);
  
  return null;
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

// Extract home and away team names from "Team A vs Team B" format
function extractTeamNames(title: string, question: string): { home: string | null; away: string | null } {
  // "X vs Y" pattern - try to match just from title first, then question
  // Using non-greedy +? and anchoring more strictly to avoid over-matching
  const vsPattern = /^([A-Za-z\s\.\-']+?)\s+vs\.?\s+([A-Za-z\s\.\-']+?)$/i;
  
  // Try title first (often cleaner format like "Rangers vs. Islanders")
  const titleMatch = title.match(vsPattern);
  if (titleMatch && titleMatch[1] && titleMatch[2]) {
    const home = titleMatch[1].trim().replace(/\?$/, '');
    const away = titleMatch[2].trim().replace(/\?$/, '');
    if (home.length >= 2 && away.length >= 2) {
      return { home, away };
    }
  }
  
  // Try question as fallback
  const questionMatch = question.match(vsPattern);
  if (questionMatch && questionMatch[1] && questionMatch[2]) {
    const home = questionMatch[1].trim().replace(/\?$/, '');
    const away = questionMatch[2].trim().replace(/\?$/, '');
    if (home.length >= 2 && away.length >= 2) {
      return { home, away };
    }
  }
  
  // Try looser pattern on title (for cases like "Team A vs Team B (Event Info)")
  const looseVsPattern = /([A-Za-z0-9\s\.\-']+?)\s+(?:vs\.?|versus|v\.?)\s+([A-Za-z0-9\s\.\-']+?)(?:\s*[\(\?]|$)/i;
  const looseMatch = title.match(looseVsPattern) || question.match(looseVsPattern);
  if (looseMatch && looseMatch[1] && looseMatch[2]) {
    const home = looseMatch[1].trim();
    const away = looseMatch[2].trim();
    if (home.length >= 2 && away.length >= 2) {
      return { home, away };
    }
  }
  
  // Try "Will X beat Y" pattern
  const beatMatch = question.match(/will (?:the )?([A-Za-z\s\.\-']+?)\s+(?:beat|defeat)\s+(?:the )?([A-Za-z\s\.\-']+)/i);
  if (beatMatch && beatMatch[1] && beatMatch[2]) {
    return { 
      home: beatMatch[1].trim(), 
      away: beatMatch[2].trim().replace(/\?$/, '') 
    };
  }
  
  return { home: null, away: null };
}

// Normalize team name for matching (lowercase, remove common prefixes/suffixes)
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+fc$/i, '')
    .replace(/\s+cf$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-SYNC-24H] Starting universal sports scan with 7-DAY window...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate 7-DAY window (expanded from 24h for comprehensive coverage)
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    console.log(`[POLY-SYNC-24H] Window: now to ${in7Days.toISOString()} (7 days)`);

    // Fetch sports events using tag_slug=sports filter
    let allEvents: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    // Primary: Fetch events tagged with "sports"
    while (hasMore) {
      const url = `${GAMMA_API_BASE}/events?active=true&closed=false&tag_slug=sports&limit=${limit}&offset=${offset}`;
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
        
        // Safety cap at 500 sports events
        if (allEvents.length >= 500) {
          hasMore = false;
        }
      }
    }

    console.log(`[POLY-SYNC-24H] Fetched ${allEvents.length} sports-tagged events`);

    // Log first 10 event titles for debugging
    console.log(`[POLY-SYNC-24H] Sample sports event titles:`);
    allEvents.slice(0, 10).forEach((e, i) => {
      console.log(`  ${i + 1}. title="${e.title || 'N/A'}" endDate="${e.endDate || 'N/A'}"`);
    });

    // Filter: ends within 7 DAYS (sports filter already applied via tag_slug)
    const qualifying: any[] = [];
    let statsNoEndDate = 0;
    let statsOutsideWindow = 0;
    let statsNoMarkets = 0;
    let statsNoH2H = 0;

    for (const event of allEvents) {
      const title = event.title || '';
      const question = event.question || '';
      const firstMarketQuestion = event.markets?.[0]?.question || '';
      
      // Detect specific sport from title/question for bookmaker matching
      const detectedSport = detectSport(title, question) || detectSport(title, firstMarketQuestion) || 'Sports';

      // Must have an end date
      if (!event.endDate) {
        statsNoEndDate++;
        continue;
      }

      // End date must be within 7 DAYS (expanded window for early movement detection)
      const endDate = new Date(event.endDate);
      if (endDate > in7Days || endDate < now) {
        statsOutsideWindow++;
        continue;
      }

      // Must have at least one market
      const markets = event.markets || [];
      if (markets.length === 0) {
        statsNoMarkets++;
        continue;
      }

      // NEW: Find an actual H2H/moneyline market, not O/U or spread
      // Iterate all markets in the event to find a true H2H market
      const h2hMarket = markets.find((m: any) => {
        // Use Gamma API's sportsMarketType field if available
        const gammaType = (m.sportsMarketType || '').toLowerCase();
        const mQuestion = (m.question || '').toLowerCase();
        
        // Skip explicit totals and spreads
        if (gammaType.includes('total') || gammaType.includes('spread') || 
            gammaType.includes('over') || gammaType.includes('under')) {
          return false;
        }
        
        // Skip if question contains O/U or spread patterns
        if (/over\s+\d+|under\s+\d+|o\/u|spread|handicap|\+\d+\.5|\-\d+\.5/i.test(mQuestion)) {
          return false;
        }
        
        // Accept moneyline, h2h, or winner markets
        if (gammaType === 'h2h' || gammaType === 'moneyline' || gammaType === 'winner') {
          return true;
        }
        
        // Accept generic "vs" pattern questions (likely H2H)
        if (/\bvs\.?\s+|\bbeat\b|\bwin\s+(?:against|vs)/i.test(mQuestion)) {
          return true;
        }
        
        // If no explicit type, accept only if it looks like a simple binary outcome
        // and NOT a totals question
        if (!gammaType && !/\d+\.?\d*\s*(points|goals|runs|score)/i.test(mQuestion)) {
          return true;
        }
        
        return false;
      });

      if (!h2hMarket) {
        statsNoH2H++;
        console.log(`[POLY-SYNC-24H] No H2H market for: ${title} (has ${markets.length} markets)`);
        continue; // This event doesn't have an H2H market on Poly
      }
      
      qualifying.push({
        event,
        market: h2hMarket,
        endDate,
        detectedSport,
      });
    }

    console.log(`[POLY-SYNC-24H] Filtering stats:`);
    console.log(`  - No end date: ${statsNoEndDate}`);
    console.log(`  - Outside 7-day window: ${statsOutsideWindow}`);
    console.log(`  - No markets: ${statsNoMarkets}`);
    console.log(`  - No H2H market: ${statsNoH2H}`);
    console.log(`  - QUALIFYING: ${qualifying.length}`);

    // Log first few qualifying events for debugging
    if (qualifying.length > 0) {
      console.log(`[POLY-SYNC-24H] Sample qualifying events:`);
      qualifying.slice(0, 5).forEach((q, i) => {
        console.log(`  ${i + 1}. [${q.detectedSport}] ${q.event.title?.substring(0, 60) || q.market.question?.substring(0, 60)}`);
      });
      
      // Debug: Log first market structure to understand token ID paths
      const sampleMarket = qualifying[0].market;
      console.log(`[POLY-SYNC-24H] Sample market keys: ${Object.keys(sampleMarket).join(', ')}`);
      console.log(`[POLY-SYNC-24H] Sample clobTokenIds: ${JSON.stringify(sampleMarket.clobTokenIds)}`);
      console.log(`[POLY-SYNC-24H] Sample market data: ${JSON.stringify(sampleMarket).substring(0, 600)}`);
    }

    // Upsert qualifying events
    let upserted = 0;
    let monitored = 0;

    for (const { event, market, endDate, detectedSport } of qualifying) {
      const conditionId = market.conditionId || market.id || event.id;
      const question = market.question || event.question || '';
      const title = event.title || '';
      
      // Detect market type - prefer Gamma API's sportsMarketType field
      const gammaMarketType = (market.sportsMarketType || '').toLowerCase();
      let marketType: string;
      
      if (gammaMarketType === 'moneyline' || gammaMarketType === 'h2h' || gammaMarketType === 'winner') {
        marketType = 'h2h';
      } else if (gammaMarketType.includes('total') || gammaMarketType.includes('over') || gammaMarketType.includes('under')) {
        marketType = 'total';
      } else if (gammaMarketType.includes('spread') || gammaMarketType.includes('handicap')) {
        marketType = 'spread';
      } else {
        // Fall back to regex-based detection
        marketType = detectMarketType(question);
      }
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

      // Extract team names for H2H matching
      const { home: teamHome, away: teamAway } = extractTeamNames(title, question);
      const teamHomeNormalized = teamHome ? normalizeTeamName(teamHome) : null;
      const teamAwayNormalized = teamAway ? normalizeTeamName(teamAway) : null;

      // Extract token IDs - try multiple paths from Gamma response
      let tokenIdYes: string | null = null;
      let tokenIdNo: string | null = null;
      
      // Path 1: clobTokenIds - may be array or JSON string
      if (market.clobTokenIds) {
        let tokenIds = market.clobTokenIds;
        // Parse if it's a JSON string
        if (typeof tokenIds === 'string') {
          try {
            tokenIds = JSON.parse(tokenIds);
          } catch (e) {
            // Not valid JSON, skip
          }
        }
        if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
          tokenIdYes = tokenIds[0] || null;
          tokenIdNo = tokenIds[1] || null;
        }
      }
      // Path 2: tokens array with token_id field
      if (!tokenIdYes && market.tokens && Array.isArray(market.tokens) && market.tokens.length >= 2) {
        tokenIdYes = market.tokens[0]?.token_id || market.tokens[0] || null;
        tokenIdNo = market.tokens[1]?.token_id || market.tokens[1] || null;
      }
      // Path 3: outcomes array with clobTokenId or tokenId
      if (!tokenIdYes && market.outcomes && Array.isArray(market.outcomes) && market.outcomes.length >= 2) {
        tokenIdYes = market.outcomes[0]?.clobTokenId || market.outcomes[0]?.tokenId || null;
        tokenIdNo = market.outcomes[1]?.clobTokenId || market.outcomes[1]?.tokenId || null;
      }
      
      // Fallback: Fetch token IDs directly from CLOB markets endpoint if not found
      if (!tokenIdYes && conditionId) {
        try {
          const clobResp = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
          if (clobResp.ok) {
            const clobData = await clobResp.json();
            if (clobData.tokens && Array.isArray(clobData.tokens)) {
              const yesToken = clobData.tokens.find((t: any) => t.outcome === 'Yes');
              const noToken = clobData.tokens.find((t: any) => t.outcome === 'No');
              tokenIdYes = yesToken?.token_id || null;
              tokenIdNo = noToken?.token_id || null;
            }
          }
        } catch (e) {
          // Silent fail - token IDs not critical for basic sync
        }
      }
      
      // Extract threshold for totals/spreads/props
      const extractedThreshold = extractThreshold(question);

      // Upsert to polymarket_h2h_cache
      const { error: cacheError } = await supabase
        .from('polymarket_h2h_cache')
        .upsert({
          condition_id: conditionId,
          event_title: title,
          question: question,
          team_home: teamHome,
          team_away: teamAway,
          team_home_normalized: teamHomeNormalized,
          team_away_normalized: teamAwayNormalized,
          event_date: endDate.toISOString(),
          yes_price: yesPrice,
          no_price: noPrice,
          volume: volume,
          liquidity: liquidity,
          sport_category: detectedSport,
          extracted_league: detectedSport,
          extracted_entity: extractedEntity,
          market_type: marketType,
          extracted_threshold: extractedThreshold,
          token_id_yes: tokenIdYes,
          token_id_no: tokenIdNo,
          status: 'active',
          monitoring_status: 'watching', // NEW: Mark for continuous monitoring
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
          no_end_date: statsNoEndDate,
          outside_window: statsOutsideWindow,
          no_markets: statsNoMarkets,
          no_h2h_market: statsNoH2H,
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
