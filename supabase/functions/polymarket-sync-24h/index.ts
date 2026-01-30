import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  SPORTS_CONFIG, 
  SPORT_CODES, 
  ALLOWED_SPORTS,
  detectSportFromText,
  type SportCode,
} from '../_shared/sports-config.ts';
import { 
  scrapeAllSports, 
  type ParsedGame,
} from '../_shared/firecrawl-scraper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gamma API for Polymarket events
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Sport detection now uses shared config - this wrapper maintains backward compat

// Detect sport from title/question using keywords
// Uses shared config for pattern matching
function detectSport(title: string, question: string): string | null {
  const combined = `${title} ${question}`;
  
  // Use shared detection first
  const detected = detectSportFromText(combined);
  if (detected) return detected;
  
  // Fallback for additional sports not in main config (Tennis, UFC, etc.)
  const fallbackPatterns: Array<{ patterns: RegExp[]; sport: string }> = [
    // UFC/MMA
    { patterns: [/\bufc\b/, /\bmma\b/, /adesanya|jones|pereira|volkanovski|makhachev/i], sport: 'UFC' },
    // Tennis
    { patterns: [/\batp\b/, /\bwta\b/, /djokovic|sinner|alcaraz|medvedev|zverev/i, /australian open|french open|wimbledon|us open/i], sport: 'Tennis' },
    // EPL
    { patterns: [/premier league|\bepl\b|arsenal|chelsea|liverpool|man city|manchester city|man united/i], sport: 'EPL' },
    // MLB
    { patterns: [/\bmlb\b|yankees|red sox|dodgers|mets|phillies|braves/i], sport: 'MLB' },
    // Champions League
    { patterns: [/champions league|\bucl\b|real madrid|barcelona|bayern|juventus/i], sport: 'UCL' },
    // La Liga
    { patterns: [/la liga|laliga|atletico madrid|sevilla|villarreal/i], sport: 'LaLiga' },
    // Serie A
    { patterns: [/serie a|napoli|roma|lazio|inter milan|ac milan/i], sport: 'SerieA' },
    // Bundesliga
    { patterns: [/bundesliga|leverkusen|leipzig|dortmund|frankfurt/i], sport: 'Bundesliga' },
    // Boxing
    { patterns: [/\bbox(?:ing)?\b|fury|usyk|joshua|canelo|crawford/i], sport: 'Boxing' },
    // Golf
    { patterns: [/\bpga\b|\bgolf\b|masters|us open golf|british open/i], sport: 'Golf' },
    // F1
    { patterns: [/formula 1|\bf1\b|verstappen|hamilton|leclerc|norris/i], sport: 'F1' },
    // Generic sports
    { patterns: [/\bvs\.?\b.*(?:win|beat|defeat)/, /who\s+will\s+win.*(?:game|match|fight|bout)/i], sport: 'Sports' },
  ];
  
  for (const { patterns, sport } of fallbackPatterns) {
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
// NON_TRADEABLE_KEYWORDS - explicit blocklist for markets without bookmaker API coverage
const NON_TRADEABLE_KEYWORDS = [
  /championship/i, /champion/i, /mvp/i, /dpoy/i, /opoy/i,
  /award/i, /trophy/i, /coach of the year/i,
  /olympic/i, /gold medal/i, /world series winner/i,
  /super bowl winner/i, /winner.*202[6-9]/i,
  /coach.*year/i, /rookie.*year/i, /division.*winner/i,
  /conference.*winner/i, /finals.*winner/i
];

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
  console.log('[POLY-SYNC-24H] Starting universal sports scan with 24-HOUR window + ALL market types...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate 24-HOUR window (focused on actionable events)
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    console.log(`[POLY-SYNC-24H] Window: now to ${in24Hours.toISOString()} (24 hours)`);

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

    console.log(`[POLY-SYNC-24H] Fetched ${allEvents.length} sports-tagged events from Gamma API`);

    // ============= FIRECRAWL SCRAPING FOR ALL CONFIGURED SPORTS =============
    // Uses unified sports config - automatically scrapes all configured sports
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    let firecrawlGames: Array<{ game: ParsedGame; sport: string; sportCode: SportCode }> = [];
    
    if (firecrawlApiKey) {
      console.log(`[POLY-SYNC-24H] Firecrawl key found - scraping ${SPORT_CODES.length} configured sports...`);
      
      // Scrape ALL configured sports dynamically in parallel
      firecrawlGames = await scrapeAllSports(firecrawlApiKey);
      
      // Log counts by sport
      const countsBySport: Record<string, number> = {};
      for (const code of SPORT_CODES) {
        countsBySport[SPORTS_CONFIG[code].name] = firecrawlGames.filter(g => g.sportCode === code).length;
      }
      console.log(`[POLY-SYNC-24H] Firecrawl totals by sport: ${JSON.stringify(countsBySport)}`);
    } else {
      console.log(`[POLY-SYNC-24H] No FIRECRAWL_API_KEY - skipping sports page scraping`);
    }

    // Log first 10 event titles for debugging
    console.log(`[POLY-SYNC-24H] Sample Gamma API event titles:`);
    allEvents.slice(0, 10).forEach((e, i) => {
      console.log(`  ${i + 1}. title="${e.title || 'N/A'}" endDate="${e.endDate || 'N/A'}"`);
    });

    // Helper: Check if event is within 24-hour window using multiple date sources
    // This fixes NBA/Tennis where endDate is set to season end, not game day
    function isWithin24HourWindow(event: any, now: Date, in24Hours: Date): { inWindow: boolean; dateSource: string; resolvedDate: Date | null } {
      // 1. Try startDate first (most accurate for actual game time)
      if (event.startDate) {
        const startDate = new Date(event.startDate);
        if (!isNaN(startDate.getTime()) && startDate >= now && startDate <= in24Hours) {
          return { inWindow: true, dateSource: 'startDate', resolvedDate: startDate };
        }
      }
      
      // 2. Try endDate (works for NHL where endDate = game day)
      if (event.endDate) {
        const endDate = new Date(event.endDate);
        if (!isNaN(endDate.getTime()) && endDate >= now && endDate <= in24Hours) {
          return { inWindow: true, dateSource: 'endDate', resolvedDate: endDate };
        }
      }
      
      // 3. Parse date from market question text (e.g., "on 2026-01-31?" or "January 31")
      const questionText = event.markets?.[0]?.question || event.question || '';
      
      // Try ISO format first: "on 2026-01-31"
      const isoMatch = questionText.match(/on\s+(\d{4}-\d{2}-\d{2})/i);
      if (isoMatch) {
        const parsedDate = new Date(isoMatch[1] + 'T23:59:59Z');
        if (!isNaN(parsedDate.getTime()) && parsedDate >= now && parsedDate <= in24Hours) {
          return { inWindow: true, dateSource: 'question-iso', resolvedDate: parsedDate };
        }
      }
      
      // Try natural format: "January 31" or "Jan 31"
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
      const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                           'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      const naturalMatch = questionText.match(/(?:on\s+)?(?:(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2}))/i);
      if (naturalMatch) {
        const monthStr = naturalMatch[1].toLowerCase();
        const day = parseInt(naturalMatch[2], 10);
        let monthIndex = monthNames.indexOf(monthStr);
        if (monthIndex === -1) monthIndex = monthAbbrevs.indexOf(monthStr);
        
        if (monthIndex !== -1 && day >= 1 && day <= 31) {
          // Use current year, or next year if month has passed
          const currentYear = now.getFullYear();
          let parsedDate = new Date(Date.UTC(currentYear, monthIndex, day, 23, 59, 59));
          
          // If date is in the past, try next year
          if (parsedDate < now) {
            parsedDate = new Date(Date.UTC(currentYear + 1, monthIndex, day, 23, 59, 59));
          }
          
          if (parsedDate >= now && parsedDate <= in24Hours) {
            return { inWindow: true, dateSource: 'question-natural', resolvedDate: parsedDate };
          }
        }
      }
      
      return { inWindow: false, dateSource: 'none', resolvedDate: null };
    }

    // Filter: Check if within 24 HOURS using multi-source date detection
    // Now process ALL market types, not just H2H
    const qualifying: any[] = [];
    let statsNoEndDate = 0;
    let statsOutsideWindow = 0;
    let statsNoMarkets = 0;
    let statsByMarketType: Record<string, number> = { h2h: 0, total: 0, spread: 0, player_prop: 0, futures: 0 };
    let statsByDateSource: Record<string, number> = {};

    for (const event of allEvents) {
      const title = event.title || '';
      const question = event.question || '';
      const firstMarketQuestion = event.markets?.[0]?.question || '';
      
      // CRITICAL: Detect sport at EVENT level FIRST - this ensures Totals/Spreads/Props inherit the league
      // from the parent event title, not from their individual market question (e.g., "Over 220.5?" won't match)
      const eventLevelSport = detectSport(title, question) || detectSport(title, firstMarketQuestion);

      // Check 24h window using multiple date sources (startDate, endDate, question text)
      const { inWindow, dateSource, resolvedDate } = isWithin24HourWindow(event, now, in24Hours);
      
      if (!inWindow) {
        // Determine why it failed for logging
        if (!event.endDate && !event.startDate) {
          statsNoEndDate++;
        } else {
          statsOutsideWindow++;
        }
        continue;
      }
      
      // Track which date source is being used
      statsByDateSource[dateSource] = (statsByDateSource[dateSource] || 0) + 1;
      
      // Use resolved date for event_date field
      const eventDate = resolvedDate || new Date(event.endDate || event.startDate);

      // Must have at least one market
      const markets = event.markets || [];
      if (markets.length === 0) {
        statsNoMarkets++;
        continue;
      }

      // NEW: Process ALL valid markets from this event (not just H2H)
      for (const market of markets) {
        const mQuestion = (market.question || '').toLowerCase();
        
        // Detect market type using Gamma's field first, then fallback to regex
        const gammaType = (market.sportsMarketType || '').toLowerCase();
        let marketType: string;
        
        if (gammaType === 'moneyline' || gammaType === 'h2h' || gammaType === 'winner') {
          marketType = 'h2h';
        } else if (gammaType.includes('total') || gammaType.includes('over') || gammaType.includes('under')) {
          marketType = 'total';
        } else if (gammaType.includes('spread') || gammaType.includes('handicap')) {
          marketType = 'spread';
        } else {
          // Fall back to regex-based detection
          marketType = detectMarketType(market.question || '');
        }
        
        // Skip futures markets (championship, MVP, etc.) - not tradable in 24h window
        if (marketType === 'futures') {
          continue;
        }
        
        // Track stats
        statsByMarketType[marketType] = (statsByMarketType[marketType] || 0) + 1;
        
        // CRITICAL FIX: Use event-level sport for ALL markets, with fallback to market-level detection
        const marketSport = eventLevelSport || detectSport(title, market.question || '') || 'Sports';
        
        // SPORT FOCUS: Only process NHL, NBA, NCAA, NFL markets
        if (!ALLOWED_SPORTS.some(s => marketSport.toUpperCase().includes(s))) {
          continue; // Skip non-focused sports (Tennis, UFC, Soccer, etc.)
        }
        
        qualifying.push({
          event,
          market,
          endDate: eventDate,
          detectedSport: marketSport,
          marketType,
        });
      }
    }

    // firecrawlGames is already populated from scrapeAllSports above
    console.log(`[POLY-SYNC-24H] Adding ${firecrawlGames.length} Firecrawl-scraped games to qualifying`);

    console.log(`[POLY-SYNC-24H] Filtering stats:`);
    console.log(`  - No end date: ${statsNoEndDate}`);
    console.log(`  - Outside 24h window: ${statsOutsideWindow}`);
    console.log(`  - No markets: ${statsNoMarkets}`);
    console.log(`  - Markets by type: ${JSON.stringify(statsByMarketType)}`);
    console.log(`  - Date sources used: ${JSON.stringify(statsByDateSource)}`);
    console.log(`  - QUALIFYING FROM GAMMA: ${qualifying.length}`);
    console.log(`  - QUALIFYING FROM FIRECRAWL: ${firecrawlGames.length}`);

    // Log sample qualifying events by type
    if (qualifying.length > 0) {
      console.log(`[POLY-SYNC-24H] Sample qualifying markets:`);
      const sampleH2H = qualifying.filter(q => q.marketType === 'h2h').slice(0, 2);
      const sampleTotal = qualifying.filter(q => q.marketType === 'total').slice(0, 2);
      const sampleSpread = qualifying.filter(q => q.marketType === 'spread').slice(0, 2);
      
      [...sampleH2H, ...sampleTotal, ...sampleSpread].forEach((q, i) => {
        console.log(`  ${i + 1}. [${q.detectedSport}/${q.marketType}] ${q.market.question?.substring(0, 60) || q.event.title?.substring(0, 60)}`);
      });
    }

    // ============= UPSERT FIRECRAWL GAMES FIRST =============
    let firecrawlUpserted = 0;
    
    // Set a default event_date for scraped games (today + 12 hours since we don't know exact time)
    const defaultEventDate = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    
    for (const { game, sport, sportCode } of firecrawlGames) {
      const conditionId = `firecrawl_${sportCode}_${game.team1Code}_${game.team2Code}`;
      
      const { error: fcError } = await supabase
        .from('polymarket_h2h_cache')
        .upsert({
          condition_id: conditionId,
          event_title: `${game.team1Name} vs ${game.team2Name}`,
          question: `Will ${game.team1Name} beat ${game.team2Name}?`,
          team_home: game.team1Name,
          team_away: game.team2Name,
          team_home_normalized: game.team1Name.toLowerCase(),
          team_away_normalized: game.team2Name.toLowerCase(),
          yes_price: game.team1Price,
          no_price: game.team2Price,
          event_date: defaultEventDate.toISOString(), // Set default event date for monitor filter
          sport_category: sport,
          extracted_league: sport,
          market_type: 'h2h',
          status: 'active',
          monitoring_status: 'watching',
          source: 'firecrawl',
          last_price_update: now.toISOString(),
          last_bulk_sync: now.toISOString(),
        }, {
          onConflict: 'condition_id',
        });
      
      if (!fcError) {
        firecrawlUpserted++;
      }
    }
    
    console.log(`[POLY-SYNC-24H] Firecrawl games upserted: ${firecrawlUpserted}`);

    // Upsert qualifying events from Gamma API
    let upserted = 0;
    let monitored = 0;

    let skippedNonTradeable = 0;
    
    for (const { event, market, endDate, detectedSport, marketType } of qualifying) {
      const conditionId = market.conditionId || market.id || event.id;
      const question = market.question || event.question || '';
      const title = event.title || '';
      
      // Skip non-tradeable markets (Olympics, MVP, Championship futures, etc.)
      const combinedText = `${title} ${question}`;
      const isNonTradeable = NON_TRADEABLE_KEYWORDS.some(p => p.test(combinedText));
      
      if (isNonTradeable) {
        console.log(`[SKIP] Non-tradeable: ${question.substring(0, 60)}`);
        skippedNonTradeable++;
        continue;
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
    console.log(`[POLY-SYNC-24H] Complete: ${upserted} cached, ${monitored} monitored, ${expiredCount} expired, ${skippedNonTradeable} non-tradeable skipped in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allEvents.length,
        qualifying_events: qualifying.length,
        upserted_to_cache: upserted,
        now_monitored: monitored,
        expired: expiredCount,
        skipped_non_tradeable: skippedNonTradeable,
        duration_ms: duration,
        filter_stats: {
          no_end_date: statsNoEndDate,
          outside_window: statsOutsideWindow,
          no_markets: statsNoMarkets,
          markets_by_type: statsByMarketType,
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
