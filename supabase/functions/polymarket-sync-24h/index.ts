// ============================================================================
// LAYER 1: CORE ALGORITHM - PROTECTED
// ============================================================================
// This file is part of the signal detection engine.
// DO NOT MODIFY unless explicitly requested.
// Changes here affect signal detection, edge calculation, and data accuracy.
// ============================================================================

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

// Sports-specific series_id mappings for targeted discovery
// These provide more reliable discovery than tag_slug=sports
const SPORTS_SERIES_IDS: Record<string, number[]> = {
  // NBA - may have multiple series for regular season, playoffs
  'basketball_nba': [10345],
  // NHL
  'icehockey_nhl': [10346],
  // NFL
  'americanfootball_nfl': [10347],
  // NCAA Basketball
  'basketball_ncaab': [10348],
  // Soccer (EPL, La Liga, Serie A, Bundesliga, UCL)
  'soccer_epl': [10360],
  'soccer_spain_la_liga': [10361],
  'soccer_italy_serie_a': [10362],
  'soccer_germany_bundesliga': [10363],
  'soccer_uefa_champs_league': [10364],
};

// Event priority categories based on days until event
type EventPriority = 'imminent' | 'upcoming' | 'future' | 'distant';

function categorizeEventPriority(hoursUntilEvent: number): EventPriority {
  if (hoursUntilEvent <= 24) return 'imminent';
  if (hoursUntilEvent <= 72) return 'upcoming';
  if (hoursUntilEvent <= 168) return 'future';
  return 'distant';
}

// Sport detection now uses shared config - this wrapper maintains backward compat

// Detect sport from title/question using keywords
// Uses shared config for pattern matching
function detectSport(title: string, question: string): string | null {
  const combined = `${title} ${question}`;
  
  // Use shared detection first
  const detected = detectSportFromText(combined);
  if (detected) return detected;
  
  // No fallback patterns needed - using shared config for core 4 sports only
  const fallbackPatterns: Array<{ patterns: RegExp[]; sport: string }> = [];
  
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
  console.log('[POLY-SYNC-24H] FIX v2: FULL discovery mode - caching ALL markets, no date rejection');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate 24-HOUR window (focused on actionable events)
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    console.log(`[POLY-SYNC-24H] Imminent window: now to ${in24Hours.toISOString()} (24 hours)`);
    console.log(`[POLY-SYNC-24H] Cache window: now to ${in7Days.toISOString()} (7 days)`);

    // ============= ODDS API SCHEDULE FETCH =============
    // Pre-fetch today's games from Odds API to cross-reference with Polymarket events
    // This fixes NBA/NCAAB where Gamma API endDate is set to season end, not game day
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    let oddsApiGames: Array<{ home_team: string; away_team: string; commence_time: string; sport_key: string }> = [];
    
    if (ODDS_API_KEY) {
      const sportsToFetch = ['basketball_nba', 'basketball_ncaab', 'icehockey_nhl', 'americanfootball_nfl'];
      
      await Promise.all(sportsToFetch.map(async (sport) => {
        try {
          const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&dateFormat=iso`;
          const response = await fetch(url);
          if (response.ok) {
            const games = await response.json();
            for (const game of games) {
              oddsApiGames.push({
                home_team: game.home_team,
                away_team: game.away_team,
                commence_time: game.commence_time,
                sport_key: sport,
              });
            }
          }
        } catch (e) {
          console.log(`[POLY-SYNC-24H] Odds API fetch failed for ${sport}`);
        }
      }));
      
      console.log(`[POLY-SYNC-24H] Pre-fetched ${oddsApiGames.length} games from Odds API for date cross-reference`);
    } else {
      console.log(`[POLY-SYNC-24H] No ODDS_API_KEY - skipping date cross-reference`);
    }

    // ============= PHASE 1: SPORTS-SPECIFIC API DISCOVERY (PRIMARY) =============
    // Query /sports endpoint first for targeted, reliable discovery
    let allEvents: any[] = [];
    const seenConditionIds = new Set<string>();
    
    console.log('[POLY-SYNC-24H] Phase 1: Fetching via sports-specific series_id endpoints...');
    
    // Fetch sports configuration from /sports endpoint
    let sportSeriesMap: Record<string, number> = {};
    try {
      const sportsResponse = await fetch(`${GAMMA_API_BASE}/sports`);
      if (sportsResponse.ok) {
        const sportsData = await sportsResponse.json();
        console.log(`[POLY-SYNC-24H] /sports endpoint returned ${sportsData.length} sports`);
        
        // Build dynamic series_id map
        for (const sport of sportsData) {
          if (sport.series_id && sport.slug) {
            sportSeriesMap[sport.slug] = sport.series_id;
          }
        }
        console.log(`[POLY-SYNC-24H] Sports series map: ${JSON.stringify(Object.keys(sportSeriesMap))}`);
      }
    } catch (e) {
      console.log('[POLY-SYNC-24H] /sports endpoint unavailable, using fallback IDs');
    }
    
    // Target series IDs - use dynamic map with fallback to known IDs
    const targetSports = [
      { name: 'NBA', seriesId: sportSeriesMap['nba'] || 10345 },
      { name: 'NHL', seriesId: sportSeriesMap['nhl'] || 10346 },
      { name: 'NFL', seriesId: sportSeriesMap['nfl'] || 10347 },
      { name: 'NCAAB', seriesId: sportSeriesMap['ncaab'] || sportSeriesMap['college-basketball'] || 10348 },
    ];
    
    // Fetch events for each sport in parallel
    const sportsFetchResults = await Promise.allSettled(
      targetSports.map(async ({ name, seriesId }) => {
        const events: any[] = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        
        while (hasMore) {
          try {
            // Query with series_id for targeted sport discovery
            const url = `${GAMMA_API_BASE}/events?series_id=${seriesId}&active=true&closed=false&limit=${limit}&offset=${offset}`;
            const response = await fetch(url);
            
            if (!response.ok) {
              console.log(`[POLY-SYNC-24H] Series ${name}(${seriesId}) fetch failed: ${response.status}`);
              break;
            }
            
            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) {
              hasMore = false;
            } else {
              events.push(...data);
              offset += limit;
              
              // Safety cap per sport
              if (events.length >= 500 || offset >= 1000) {
                hasMore = false;
              }
            }
          } catch (e) {
            console.log(`[POLY-SYNC-24H] Series ${name} fetch error:`, e);
            break;
          }
        }
        
        console.log(`[POLY-SYNC-24H] Series ${name}(${seriesId}): fetched ${events.length} events`);
        return { name, events };
      })
    );
    
    // Collect events from sports-specific queries
    for (const result of sportsFetchResults) {
      if (result.status === 'fulfilled' && result.value.events.length > 0) {
        for (const event of result.value.events) {
          const conditionId = event.markets?.[0]?.conditionId || event.id;
          if (conditionId && !seenConditionIds.has(conditionId)) {
            seenConditionIds.add(conditionId);
            allEvents.push(event);
          }
        }
      }
    }
    
    console.log(`[POLY-SYNC-24H] Phase 1 complete: ${allEvents.length} unique events from sports-specific endpoints`);
    
    // ============= PHASE 2: TAG_SLUG=SPORTS FALLBACK (SECONDARY) =============
    // Also fetch via tag_slug=sports for redundancy
    console.log('[POLY-SYNC-24H] Phase 2: Fetching via tag_slug=sports fallback...');
    
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let fallbackEvents = 0;

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
        // Deduplicate against already-fetched events
        for (const event of events) {
          const conditionId = event.markets?.[0]?.conditionId || event.id;
          if (conditionId && !seenConditionIds.has(conditionId)) {
            seenConditionIds.add(conditionId);
            allEvents.push(event);
            fallbackEvents++;
          }
        }
        offset += limit;
        
        // INCREASED: Safety cap at 2000 sports events (was 500)
        if (allEvents.length >= 2000) {
          console.log(`[POLY-SYNC-24H] Hit 2000 event cap, stopping pagination`);
          hasMore = false;
        }
      }
    }

    console.log(`[POLY-SYNC-24H] Phase 2 complete: added ${fallbackEvents} additional events from tag_slug=sports`);
    console.log(`[POLY-SYNC-24H] TOTAL DISCOVERY: ${allEvents.length} unique events from all sources`);

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

    // Helper: Normalize team name for matching
    function normalizeForMatch(name: string): string {
      return name.toLowerCase()
        .replace(/^the\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Helper: Parse event date and calculate priority (NO LONGER REJECTS)
    // Returns date info for all events - let downstream decide what's actionable
    function parseEventDate(event: any, now: Date, in24Hours: Date, in7Days: Date): { 
      resolvedDate: Date | null; 
      dateSource: string; 
      priority: EventPriority;
      hoursUntilEvent: number;
    } {
      // 1. PRIORITY: Parse date from Polymarket slug (e.g., "nhl-det-col-2026-02-02")
      const eventSlug = event.slug || '';
      const slugDateMatch = eventSlug.match(/(\d{4}-\d{2}-\d{2})$/);
      if (slugDateMatch) {
        const slugDate = new Date(slugDateMatch[1] + 'T23:59:59Z');
        if (!isNaN(slugDate.getTime())) {
          const hoursUntil = (slugDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          const priority = categorizeEventPriority(hoursUntil);
          // CACHE ALL - don't reject based on date
          return { resolvedDate: slugDate, dateSource: 'slug', priority, hoursUntilEvent: hoursUntil };
        }
      }
      
      // 2. Try startDate first (most accurate for actual game time)
      if (event.startDate) {
        const startDate = new Date(event.startDate);
        if (!isNaN(startDate.getTime()) && startDate >= now) {
          const hoursUntil = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          const priority = categorizeEventPriority(hoursUntil);
          return { resolvedDate: startDate, dateSource: 'startDate', priority, hoursUntilEvent: hoursUntil };
        }
      }
      
      // 3. Try endDate (works for NHL where endDate = game day)
      if (event.endDate) {
        const endDate = new Date(event.endDate);
        if (!isNaN(endDate.getTime()) && endDate >= now) {
          const hoursUntil = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          const priority = categorizeEventPriority(hoursUntil);
          return { resolvedDate: endDate, dateSource: 'endDate', priority, hoursUntilEvent: hoursUntil };
        }
      }
      
      // 4. Parse date from market question text (e.g., "on 2026-01-31?" or "January 31")
      const questionText = event.markets?.[0]?.question || event.question || '';
      
      // Try ISO format first: "on 2026-01-31"
      const isoMatch = questionText.match(/on\s+(\d{4}-\d{2}-\d{2})/i);
      if (isoMatch) {
        const parsedDate = new Date(isoMatch[1] + 'T23:59:59Z');
        if (!isNaN(parsedDate.getTime()) && parsedDate >= now) {
          const hoursUntil = (parsedDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          const priority = categorizeEventPriority(hoursUntil);
          return { resolvedDate: parsedDate, dateSource: 'question-iso', priority, hoursUntilEvent: hoursUntil };
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
          
          if (parsedDate >= now) {
            const hoursUntil = (parsedDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            const priority = categorizeEventPriority(hoursUntil);
            return { resolvedDate: parsedDate, dateSource: 'question-natural', priority, hoursUntilEvent: hoursUntil };
          }
        }
      }
      
      // 5. Cross-reference with Odds API schedule
      const title = event.title || '';
      const titleNorm = normalizeForMatch(title);
      
      for (const game of oddsApiGames) {
        const homeNorm = normalizeForMatch(game.home_team);
        const awayNorm = normalizeForMatch(game.away_team);
        
        // Check if both teams appear in the Polymarket title (or last word of team name)
        const homeWords = homeNorm.split(' ');
        const awayWords = awayNorm.split(' ');
        const homeLast = homeWords[homeWords.length - 1];
        const awayLast = awayWords[awayWords.length - 1];
        
        const matchesHome = titleNorm.includes(homeNorm) || (homeLast.length > 3 && titleNorm.includes(homeLast));
        const matchesAway = titleNorm.includes(awayNorm) || (awayLast.length > 3 && titleNorm.includes(awayLast));
        
        if (matchesHome && matchesAway) {
          const gameTime = new Date(game.commence_time);
          if (!isNaN(gameTime.getTime()) && gameTime >= now) {
            const hoursUntil = (gameTime.getTime() - now.getTime()) / (1000 * 60 * 60);
            const priority = categorizeEventPriority(hoursUntil);
            return { resolvedDate: gameTime, dateSource: 'odds-api', priority, hoursUntilEvent: hoursUntil };
          }
        }
      }
      
      // Fallback: no date found, mark as distant but still cache
      return { resolvedDate: null, dateSource: 'none', priority: 'distant', hoursUntilEvent: 999 };
    }

    // Process ALL events - categorize by priority instead of filtering
    const qualifying: any[] = [];
    let statsNoEndDate = 0;
    let statsNoMarkets = 0;
    let statsByMarketType: Record<string, number> = { h2h: 0, total: 0, spread: 0, player_prop: 0, futures: 0 };
    let statsByDateSource: Record<string, number> = {};
    let statsByPriority: Record<EventPriority, number> = { imminent: 0, upcoming: 0, future: 0, distant: 0 };

    for (const event of allEvents) {
      const title = event.title || '';
      const question = event.question || '';
      const firstMarketQuestion = event.markets?.[0]?.question || '';
      
      // CRITICAL: Detect sport at EVENT level FIRST - this ensures Totals/Spreads/Props inherit the league
      // from the parent event title, not from their individual market question (e.g., "Over 220.5?" won't match)
      const eventLevelSport = detectSport(title, question) || detectSport(title, firstMarketQuestion);

      // Parse date - NO LONGER REJECTS based on window
      const { resolvedDate, dateSource, priority, hoursUntilEvent } = parseEventDate(event, now, in24Hours, in7Days);
      
      // Track stats
      statsByPriority[priority]++;
      
      // Skip events in the past (already started)
      if (hoursUntilEvent < -0.5) {
        statsNoEndDate++;
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
            priority,
            hoursUntilEvent,
        });
      }
    }

    // firecrawlGames is already populated from scrapeAllSports above
    console.log(`[POLY-SYNC-24H] Adding ${firecrawlGames.length} Firecrawl-scraped games to qualifying`);

    console.log(`[POLY-SYNC-24H] Filtering stats:`);
    console.log(`  - No end date: ${statsNoEndDate}`);
    console.log(`  - No markets: ${statsNoMarkets}`);
    console.log(`  - Markets by type: ${JSON.stringify(statsByMarketType)}`);
    console.log(`  - Date sources used: ${JSON.stringify(statsByDateSource)}`);
    console.log(`  - By priority: ${JSON.stringify(statsByPriority)}`);
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

    // ============= UPSERT FIRECRAWL GAMES WITH VOLUME ENRICHMENT =============
    let firecrawlUpserted = 0;
    let firecrawlVolumeEnriched = 0;
    
    // FALLBACK: Default event_date for scraped games if we can't match to Odds API (now + 12h)
    const fallbackEventDate = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    
    // Helper: Find matching game in Odds API data to get accurate commence_time
    function findOddsApiCommenceTime(team1Name: string, team2Name: string): Date | null {
      const team1Norm = normalizeForMatch(team1Name);
      const team2Norm = normalizeForMatch(team2Name);
      const team1Last = team1Name.split(' ').pop()?.toLowerCase() || '';
      const team2Last = team2Name.split(' ').pop()?.toLowerCase() || '';
      
      for (const game of oddsApiGames) {
        const homeNorm = normalizeForMatch(game.home_team);
        const awayNorm = normalizeForMatch(game.away_team);
        const homeLast = game.home_team.split(' ').pop()?.toLowerCase() || '';
        const awayLast = game.away_team.split(' ').pop()?.toLowerCase() || '';
        
        // Match by full name OR last word (nickname)
        const matches1Home = team1Norm.includes(homeNorm) || homeNorm.includes(team1Norm) || 
                            (team1Last.length > 3 && (team1Last === homeLast || team1Last === awayLast));
        const matches2Home = team2Norm.includes(homeNorm) || homeNorm.includes(team2Norm) ||
                            (team2Last.length > 3 && (team2Last === homeLast || team2Last === awayLast));
        const matches1Away = team1Norm.includes(awayNorm) || awayNorm.includes(team1Norm) ||
                            (team1Last.length > 3 && (team1Last === homeLast || team1Last === awayLast));
        const matches2Away = team2Norm.includes(awayNorm) || awayNorm.includes(team2Norm) ||
                            (team2Last.length > 3 && (team2Last === homeLast || team2Last === awayLast));
        
        // Either team1=home & team2=away, OR team1=away & team2=home
        if ((matches1Home && matches2Away) || (matches1Away && matches2Home)) {
          const commenceTime = new Date(game.commence_time);
          
          // CRITICAL: Skip suspicious "midnight UTC" times (likely API data quality issue)
          // Odds API sometimes returns 00:00:00 UTC as a placeholder instead of actual game time
          // This causes 8h games to show as 20h away
          const isExactMidnight = commenceTime.getUTCHours() === 0 && 
                                  commenceTime.getUTCMinutes() === 0 &&
                                  commenceTime.getUTCSeconds() === 0;
          
          if (isExactMidnight) {
            console.log(`[WARN] Skipping midnight UTC time for ${game.home_team} vs ${game.away_team} - likely inaccurate`);
            continue; // Try next match or fall through to fallback
          }
          
          if (!isNaN(commenceTime.getTime())) {
            return commenceTime;
          }
        }
      }
      
      return null;
    }
    
    // OPTIMIZED: Pre-fetch ALL sports events from Gamma API ONCE for volume enrichment
    // This avoids calling the API 39 times (once per Firecrawl game) - major perf fix
    let gammaEventsForVolume: any[] = [];
    if (firecrawlGames.length > 0) {
      try {
        const gammaUrl = `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=sports&limit=200`;
        const gammaResponse = await fetch(gammaUrl);
        if (gammaResponse.ok) {
          gammaEventsForVolume = await gammaResponse.json();
          console.log(`[POLY-SYNC-24H] Pre-fetched ${gammaEventsForVolume.length} Gamma events for volume enrichment`);
        }
      } catch (e) {
        console.log(`[POLY-SYNC-24H] Gamma pre-fetch failed, continuing without volume enrichment`);
      }
    }
    
    // Helper: Lookup volume AND TOKEN IDs from pre-fetched Gamma events (no API call)
    // FIXED: Now extracts token_id_yes and token_id_no from Gamma market metadata
    function lookupClobVolumeFromCache(
      team1Name: string,
      team2Name: string
    ): { 
      volume: number; 
      liquidity: number; 
      conditionId: string | null;
      tokenIdYes: string | null;
      tokenIdNo: string | null;
    } {
      const searchTerms = [
        team1Name.split(' ').pop()?.toLowerCase() || '',
        team2Name.split(' ').pop()?.toLowerCase() || '',
      ].filter(t => t.length > 2);
      
      if (searchTerms.length < 2) {
        return { volume: 0, liquidity: 0, conditionId: null, tokenIdYes: null, tokenIdNo: null };
      }
      
      for (const event of gammaEventsForVolume) {
        const title = (event.title || '').toLowerCase();
        const question = (event.markets?.[0]?.question || '').toLowerCase();
        const combined = `${title} ${question}`;
        
        const matchesTeam1 = searchTerms[0] && combined.includes(searchTerms[0]);
        const matchesTeam2 = searchTerms[1] && combined.includes(searchTerms[1]);
        
        if (matchesTeam1 && matchesTeam2) {
          const market = event.markets?.[0];
          if (market) {
            const volume = parseFloat(market.volume || event.volume || '0') || 0;
            const liquidity = parseFloat(market.liquidity || event.liquidity || '0') || 0;
            const conditionId = market.conditionId || market.id || event.id;
            
            // NEW: Extract token IDs from Gamma market metadata
            let tokenIdYes: string | null = null;
            let tokenIdNo: string | null = null;
            
            // Path 1: clobTokenIds array (most common)
            if (market.clobTokenIds) {
              let tokenIds = market.clobTokenIds;
              if (typeof tokenIds === 'string') {
                try { tokenIds = JSON.parse(tokenIds); } catch {}
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
            // Path 3: outcomes array with clobTokenId
            if (!tokenIdYes && market.outcomes && Array.isArray(market.outcomes) && market.outcomes.length >= 2) {
              tokenIdYes = market.outcomes[0]?.clobTokenId || market.outcomes[0]?.tokenId || null;
              tokenIdNo = market.outcomes[1]?.clobTokenId || market.outcomes[1]?.tokenId || null;
            }
            
            if (volume > 0) {
              return { volume, liquidity, conditionId, tokenIdYes, tokenIdNo };
            }
          }
        }
      }
      
      return { volume: 0, liquidity: 0, conditionId: null, tokenIdYes: null, tokenIdNo: null };
    }
    
    // Process Firecrawl games in parallel batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < firecrawlGames.length; i += BATCH_SIZE) {
      const batch = firecrawlGames.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async ({ game, sport, sportCode }) => {
        let conditionId = `firecrawl_${sportCode}_${game.team1Code}_${game.team2Code}`;
        let volume = 0;
        let liquidity = 0;
        
        // OPTIMIZED: Use pre-fetched cache (no API call per game)
        const clobData = lookupClobVolumeFromCache(game.team1Name, game.team2Name);
        if (clobData.volume > 0) {
          volume = clobData.volume;
          liquidity = clobData.liquidity;
          firecrawlVolumeEnriched++;
          
          if (clobData.conditionId) {
            conditionId = clobData.conditionId;
          }
        }
        
        // CRITICAL FIX: Use Odds API commence_time for accurate event dates
        // This fixes the "11h to kickoff" bug when games are actually LIVE
        const actualCommenceTime = findOddsApiCommenceTime(game.team1Name, game.team2Name);
        const eventDate = actualCommenceTime || fallbackEventDate;
        
        // CRITICAL FIX: Enforce 24-hour window - skip games outside the window
        const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilEvent > 24 || hoursUntilEvent < 0) {
          console.log(`[FIRECRAWL] Skipping ${game.team1Name} vs ${game.team2Name} - ${hoursUntilEvent.toFixed(1)}h away (outside 24h window)`);
          return; // Skip this game
        }
        
        if (actualCommenceTime) {
          console.log(`[FIRECRAWL] Matched ${game.team1Name} vs ${game.team2Name} -> Kickoff: ${actualCommenceTime.toISOString()}`);
        }
        
        // Generate Polymarket-style slug for direct URLs: nhl-min-edm-2026-01-31
        const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const generatedSlug = `${sportCode}-${game.team1Code}-${game.team2Code}-${dateStr}`.toLowerCase();
        
        // Phase 2: VALIDATE SCRAPED PRICES
        // Firecrawl prices should sum to ~100% for valid H2H markets
        const priceSum = game.team1Price + game.team2Price;
        if (priceSum < 0.90 || priceSum > 1.10) {
          console.log(`[FIRECRAWL] PRICE_VALIDATION_FAIL: ${game.team1Name} vs ${game.team2Name} - prices sum to ${(priceSum * 100).toFixed(0)}% (expected ~100%) - SKIPPING`);
          return; // Skip this game
        }
        
        // Determine tradeability based on token presence
        const isTradeable = !!(clobData.tokenIdYes && clobData.tokenIdNo);
        const untradeableReason = isTradeable ? null : 'MISSING_TOKENS';
        
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
            volume: volume,
            liquidity: liquidity,
            event_date: eventDate.toISOString(),
            bookmaker_commence_time: actualCommenceTime?.toISOString() || null, // PHASE 1a: Bookmaker authoritative time
            sport_category: sport,
            extracted_league: sport,
            market_type: 'h2h',
            status: 'active',
            monitoring_status: 'watching',
            source: 'firecrawl',
            polymarket_slug: generatedSlug,
            token_id_yes: clobData.tokenIdYes,   // Token IDs from Gamma lookup
            token_id_no: clobData.tokenIdNo,     // Token IDs from Gamma lookup
            tradeable: isTradeable,              // PHASE 3b: Mark tradeability
            untradeable_reason: untradeableReason, // PHASE 3b: Reason if untradeable
            last_price_update: now.toISOString(),
            last_bulk_sync: now.toISOString(),
          }, {
            onConflict: 'condition_id',
          });
        
        if (!fcError) {
          firecrawlUpserted++;
        }
      }));
    }
    
    // BACKFILL: Update existing Firecrawl/scrape-nba rows missing token IDs
    // This runs after main processing to populate previously cached rows
    const { data: missingTokenRows } = await supabase
      .from('polymarket_h2h_cache')
      .select('condition_id, team_home, team_away')
      .is('token_id_yes', null)
      .in('source', ['firecrawl', 'scrape-nba'])
      .eq('status', 'active')
      .limit(50);

    let backfilled = 0;
    if (missingTokenRows && missingTokenRows.length > 0) {
      for (const row of missingTokenRows) {
        if (!row.team_home || !row.team_away) continue;
        
        const clobData = lookupClobVolumeFromCache(row.team_home, row.team_away);
        if (clobData.tokenIdYes && clobData.tokenIdNo) {
          const { error: backfillError } = await supabase
            .from('polymarket_h2h_cache')
            .update({
              token_id_yes: clobData.tokenIdYes,
              token_id_no: clobData.tokenIdNo,
            })
            .eq('condition_id', row.condition_id);
          
          if (!backfillError) {
            backfilled++;
          }
        }
      }
      console.log(`[POLY-SYNC-24H] Backfilled ${backfilled} rows with missing token IDs`);
    }
    
    console.log(`[POLY-SYNC-24H] Firecrawl games upserted: ${firecrawlUpserted} (${firecrawlVolumeEnriched} enriched with volume)`);

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
      
      // REMOVED: CLOB token ID fallback was causing CPU timeout
      // Token IDs will be fetched by polymarket-monitor when needed
      
      // Extract threshold for totals/spreads/props
      const extractedThreshold = extractThreshold(question);

      // Extract event slug from Gamma API response (for direct Polymarket URLs)
      const eventSlug = event.slug || null;
      
      // PHASE 1b: Find bookmaker commence time for Gamma events using team matching
      let bookmakerCommenceTime: string | null = null;
      if (teamHome && teamAway) {
        const matchedTime = findOddsApiCommenceTime(teamHome, teamAway);
        if (matchedTime) {
          bookmakerCommenceTime = matchedTime.toISOString();
          console.log(`[POLY-SYNC-24H] Gamma → Bookmaker time: ${title} → ${bookmakerCommenceTime}`);
        }
      }
      
      // PHASE 3b: Mark tradeability based on token presence
      const isTradeable = !!(tokenIdYes && tokenIdNo);
      const untradeableReason = isTradeable ? null : 'MISSING_TOKENS';
      
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
          bookmaker_commence_time: bookmakerCommenceTime, // PHASE 1b: Bookmaker authoritative time
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
          tradeable: isTradeable,              // PHASE 3b: Mark tradeability
          untradeable_reason: untradeableReason, // PHASE 3b: Reason if untradeable
          polymarket_slug: eventSlug, // Store event slug for direct URLs
          status: 'active',
          monitoring_status: 'watching', // Mark for continuous monitoring
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

    // ============= CLOB PRICE REFRESH (CRITICAL) - EXTENDED TO ALL MARKETS =============
    // Fetch real executable prices from Polymarket CLOB API for ALL cached markets
    // This replaces stale Gamma/Firecrawl prices with live orderbook data
    console.log('[POLY-SYNC-24H] Starting CLOB price refresh for ALL cached markets with tokens...');
    
    const { data: h2hMarkets, error: fetchH2hError } = await supabase
      .from('polymarket_h2h_cache')
      .select('condition_id, token_id_yes, yes_price, source')
      .eq('status', 'active')
      .not('token_id_yes', 'is', null);
    
    if (fetchH2hError) {
      console.error('[POLY-SYNC-24H] Error fetching markets for CLOB refresh:', fetchH2hError);
    } else if (h2hMarkets && h2hMarkets.length > 0) {
      console.log(`[POLY-SYNC-24H] Refreshing CLOB prices for ${h2hMarkets.length} markets with token IDs`);
      
      // Collect all YES token IDs
      const tokenIdToCondition: Map<string, string> = new Map();
      const tokenIdToOldPrice: Map<string, number> = new Map();
      const allTokenIds: string[] = [];
      
      for (const market of h2hMarkets) {
        if (market.token_id_yes) {
          tokenIdToCondition.set(market.token_id_yes, market.condition_id);
          tokenIdToOldPrice.set(market.token_id_yes, market.yes_price || 0.5);
          allTokenIds.push(market.token_id_yes);
        }
      }
      
      if (allTokenIds.length > 0) {
        // Batch fetch CLOB prices
        const CLOB_API_BASE = 'https://clob.polymarket.com';
        const batchSize = 50;
        const allPrices: Record<string, { BUY?: string; SELL?: string }> = {};
        
        for (let i = 0; i < allTokenIds.length; i += batchSize) {
          const batch = allTokenIds.slice(i, i + batchSize);
          const requestBody = batch.map(token_id => ({
            token_id,
            side: 'BUY' as const
          }));
          
          try {
            const response = await fetch(`${CLOB_API_BASE}/prices`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            });
            
            if (response.ok) {
              const prices = await response.json();
              Object.assign(allPrices, prices);
            } else {
              console.warn(`[POLY-SYNC-24H] CLOB batch ${i} failed: ${response.status}`);
            }
          } catch (error) {
            console.warn(`[POLY-SYNC-24H] CLOB batch ${i} error:`, error);
          }
          
          // Small delay between batches
          if (i + batchSize < allTokenIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        console.log(`[POLY-SYNC-24H] CLOB API returned prices for ${Object.keys(allPrices).length} tokens`);
        
        // Process and update cache with real CLOB prices
        const priceUpdates: Array<{ 
          condition_id: string; 
          yes_price: number; 
          no_price: number; 
          best_bid: number; 
          best_ask: number;
          old_price: number;
        }> = [];
        
        for (const [tokenId, priceData] of Object.entries(allPrices)) {
          const conditionId = tokenIdToCondition.get(tokenId);
          if (!conditionId) continue;
          
          // BUY price = what you pay = best ask (this is the YES price)
          const buyPrice = parseFloat(priceData.BUY || '0');
          const sellPrice = parseFloat(priceData.SELL || '0');
          const oldPrice = tokenIdToOldPrice.get(tokenId) || 0.5;
          
          // Validate price is within sanity bounds (5¢ - 95¢)
          if (buyPrice >= 0.05 && buyPrice <= 0.95) {
            priceUpdates.push({
              condition_id: conditionId,
              yes_price: buyPrice,
              no_price: 1 - buyPrice,
              best_bid: sellPrice,
              best_ask: buyPrice,
              old_price: oldPrice,
            });
          } else if (buyPrice > 0) {
            console.log(`[POLY-SYNC-24H] CLOB price out of bounds: ${conditionId} price=${buyPrice.toFixed(2)} (skipping)`);
          }
        }
        
        console.log(`[POLY-SYNC-24H] Valid CLOB prices: ${priceUpdates.length}/${Object.keys(allPrices).length}`);
        
        // Update cache with real prices
        let clobUpdated = 0;
        let priceMismatches = 0;
        
        for (const update of priceUpdates) {
          // Check for significant price mismatch (>10% difference from cached price)
          const priceDiff = Math.abs(update.yes_price - update.old_price);
          if (priceDiff > 0.10) {
            priceMismatches++;
            console.log(`[POLY-SYNC-24H] PRICE MISMATCH: ${update.condition_id} cached=${(update.old_price * 100).toFixed(0)}¢ CLOB=${(update.yes_price * 100).toFixed(0)}¢ (diff=${(priceDiff * 100).toFixed(0)}¢)`);
          }
          
          const { error: updateError } = await supabase
            .from('polymarket_h2h_cache')
            .update({
              yes_price: update.yes_price,
              no_price: update.no_price,
              best_bid: update.best_bid,
              best_ask: update.best_ask,
              last_price_update: now.toISOString(),
              source: 'clob_verified', // Mark as CLOB-verified
            })
            .eq('condition_id', update.condition_id);
          
          if (!updateError) clobUpdated++;
        }
        
        console.log(`[POLY-SYNC-24H] CLOB REFRESH COMPLETE: ${clobUpdated} markets updated, ${priceMismatches} had >10% price mismatches`);
      }
    } else {
      console.log('[POLY-SYNC-24H] No markets with token IDs found for CLOB refresh');
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

    // Query total watching count from cache for accurate stats
    const { count: totalWatchingCount } = await supabase
      .from('polymarket_h2h_cache')
      .select('*', { count: 'exact', head: true })
      .eq('monitoring_status', 'watching')
      .eq('status', 'active');

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allEvents.length,
        qualifying_events: qualifying.length,
        qualifying_from_gamma: qualifying.length,
        qualifying_from_firecrawl: firecrawlGames.length,
        priority_breakdown: statsByPriority,
        firecrawl_upserted: firecrawlUpserted,
        upserted_to_cache: upserted,
        now_monitored: monitored,
        total_watching: totalWatchingCount || (upserted + firecrawlUpserted),
        expired: expiredCount,
        skipped_non_tradeable: skippedNonTradeable,
        duration_ms: duration,
        filter_stats: {
          no_end_date: statsNoEndDate,
          no_markets: statsNoMarkets,
          markets_by_type: statsByMarketType,
          date_sources: statsByDateSource,
          priority_breakdown: statsByPriority,
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
