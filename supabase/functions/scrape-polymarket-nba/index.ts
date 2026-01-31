// ============================================================================
// NBA MARKET SCRAPER - H2H + OVER/UNDER
// ============================================================================
// Scrapes polymarket.com/sports/nba/games to extract:
// 1. H2H (moneyline) markets with token IDs
// 2. Over/Under (totals) markets with token IDs
// Uses Firecrawl for JavaScript-rendered content extraction
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// NBA team code to full name mapping
const NBA_TEAM_MAP: Record<string, string> = {
  'atl': 'Atlanta Hawks', 'bos': 'Boston Celtics', 'bkn': 'Brooklyn Nets',
  'cha': 'Charlotte Hornets', 'chi': 'Chicago Bulls', 'cle': 'Cleveland Cavaliers',
  'dal': 'Dallas Mavericks', 'den': 'Denver Nuggets', 'det': 'Detroit Pistons',
  'gsw': 'Golden State Warriors', 'hou': 'Houston Rockets', 'ind': 'Indiana Pacers',
  'lac': 'LA Clippers', 'lal': 'Los Angeles Lakers', 'mem': 'Memphis Grizzlies',
  'mia': 'Miami Heat', 'mil': 'Milwaukee Bucks', 'min': 'Minnesota Timberwolves',
  'nop': 'New Orleans Pelicans', 'nyk': 'New York Knicks', 'okc': 'Oklahoma City Thunder',
  'orl': 'Orlando Magic', 'phi': 'Philadelphia 76ers', 'phx': 'Phoenix Suns',
  'por': 'Portland Trail Blazers', 'sac': 'Sacramento Kings', 'sas': 'San Antonio Spurs',
  'tor': 'Toronto Raptors', 'uta': 'Utah Jazz', 'was': 'Washington Wizards',
};

interface ExtractedMarket {
  type: 'h2h' | 'total';
  team1?: string;
  team2?: string;
  team1Code?: string;
  team2Code?: string;
  team1Price?: number;
  team2Price?: number;
  overPrice?: number;
  underPrice?: number;
  threshold?: number;
  conditionId?: string;
  tokenIdYes?: string;
  tokenIdNo?: string;
  slug?: string;
  gameDate?: string;
}

// Parse H2H markets from markdown: "LAL52¢ BOS48¢"
function parseH2HMarkets(markdown: string): ExtractedMarket[] {
  const markets: ExtractedMarket[] = [];
  const pricePattern = /([a-z]{2,4})(\d+)¢/gi;
  const matches = [...markdown.matchAll(pricePattern)];
  
  for (let i = 0; i < matches.length - 1; i += 2) {
    const team1Match = matches[i];
    const team2Match = matches[i + 1];
    
    if (team1Match && team2Match) {
      const team1Code = team1Match[1].toLowerCase();
      const team2Code = team2Match[1].toLowerCase();
      const team1Price = parseInt(team1Match[2], 10) / 100;
      const team2Price = parseInt(team2Match[2], 10) / 100;
      
      const team1Name = NBA_TEAM_MAP[team1Code];
      const team2Name = NBA_TEAM_MAP[team2Code];
      
      if (team1Name && team2Name) {
        markets.push({
          type: 'h2h',
          team1: team1Name,
          team2: team2Name,
          team1Code,
          team2Code,
          team1Price,
          team2Price,
        });
      }
    }
  }
  
  return markets;
}

// Parse Over/Under markets: "Over 220.5 52¢" or "O220.5 52¢ U220.5 48¢"
function parseTotalMarkets(markdown: string): ExtractedMarket[] {
  const markets: ExtractedMarket[] = [];
  
  // Pattern 1: "Over 220.5 (52¢)" or "Over 220.5: 52¢"
  const overUnderPattern = /(?:over|o)\s*(\d+\.?\d*)\s*[:\(]?\s*(\d+)¢.*?(?:under|u)\s*\1\s*[:\(]?\s*(\d+)¢/gi;
  const matches1 = [...markdown.matchAll(overUnderPattern)];
  
  for (const match of matches1) {
    const threshold = parseFloat(match[1]);
    const overPrice = parseInt(match[2], 10) / 100;
    const underPrice = parseInt(match[3], 10) / 100;
    
    if (!isNaN(threshold) && threshold > 100) { // NBA totals are typically 200-250
      markets.push({
        type: 'total',
        threshold,
        overPrice,
        underPrice,
      });
    }
  }
  
  // Pattern 2: Separate lines "O220.5 52¢" and "U220.5 48¢"
  const separatePattern = /(?:o|over)\s*(\d+\.?\d*)\s*(\d+)¢/gi;
  const separateMatches = [...markdown.matchAll(separatePattern)];
  
  for (const match of separateMatches) {
    const threshold = parseFloat(match[1]);
    const overPrice = parseInt(match[2], 10) / 100;
    
    // Look for matching under
    const underPattern = new RegExp(`(?:u|under)\\s*${threshold}\\s*(\\d+)¢`, 'gi');
    const underMatch = markdown.match(underPattern);
    
    if (underMatch && !isNaN(threshold) && threshold > 100) {
      const underPriceMatch = underMatch[0].match(/(\d+)¢/);
      const underPrice = underPriceMatch ? parseInt(underPriceMatch[1], 10) / 100 : 1 - overPrice;
      
      // Avoid duplicates
      const exists = markets.some(m => m.type === 'total' && m.threshold === threshold);
      if (!exists) {
        markets.push({
          type: 'total',
          threshold,
          overPrice,
          underPrice,
        });
      }
    }
  }
  
  return markets;
}

// Extract game slugs and dates from URLs in the markdown
function extractGameMetadata(markdown: string): Map<string, { slug: string; date: string }> {
  const metadata = new Map<string, { slug: string; date: string }>();
  
  // Pattern: /sports/nba/games/lal-bos-2026-01-31 or similar
  const slugPattern = /\/sports\/nba\/games\/([a-z]{3})-([a-z]{3})-(\d{4}-\d{2}-\d{2})/gi;
  const matches = [...markdown.matchAll(slugPattern)];
  
  for (const match of matches) {
    const team1 = match[1].toLowerCase();
    const team2 = match[2].toLowerCase();
    const date = match[3];
    const key = `${team1}_${team2}`;
    
    metadata.set(key, {
      slug: `nba-${team1}-${team2}-${date}`,
      date,
    });
  }
  
  return metadata;
}

// Extract condition IDs and token IDs from HTML script tags
// Polymarket embeds market data as JSON in script tags
interface MarketData {
  conditionId: string;
  tokenIdYes: string | null;
  tokenIdNo: string | null;
  team1Code: string;
  team2Code: string;
  question: string;
  marketType: 'h2h' | 'total';
}

function extractMarketsFromHTML(html: string): MarketData[] {
  const markets: MarketData[] = [];
  
  // Look for Next.js data or embedded JSON with market info
  // Pattern 1: __NEXT_DATA__ script tag
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      // Navigate to markets in Next.js page props
      const pageData = data?.props?.pageProps || data?.props || {};
      extractMarketsFromObject(pageData, markets);
    } catch (e) {
      console.log('[HTML-PARSE] Failed to parse __NEXT_DATA__');
    }
  }
  
  // Pattern 2: Look for conditionId and clobTokenIds patterns
  const conditionPattern = /\"conditionId\"\s*:\s*\"(0x[a-f0-9]+)\"/gi;
  const conditionMatches = [...html.matchAll(conditionPattern)];
  
  for (const match of conditionMatches) {
    const conditionId = match[1];
    
    // Look for associated token IDs near this condition ID
    const context = html.substring(Math.max(0, match.index! - 500), Math.min(html.length, match.index! + 1500));
    
    // Extract token IDs from clobTokenIds array
    const tokenMatch = context.match(/\"clobTokenIds\"\s*:\s*\[\s*\"(\d+)\"\s*,\s*\"(\d+)\"\s*\]/);
    const tokenIdYes = tokenMatch?.[1] || null;
    const tokenIdNo = tokenMatch?.[2] || null;
    
    // Extract question
    const questionMatch = context.match(/\"question\"\s*:\s*\"([^\"]+)\"/);
    const question = questionMatch?.[1] || '';
    
    // Determine market type and team codes
    const isTotal = question.toLowerCase().includes('over') || question.toLowerCase().includes('under');
    
    // Try to find team codes in the slug
    const slugMatch = context.match(/nba-([a-z]{3})-([a-z]{3})/i);
    const team1Code = slugMatch?.[1]?.toLowerCase() || '';
    const team2Code = slugMatch?.[2]?.toLowerCase() || '';
    
    if (conditionId && (tokenIdYes || team1Code)) {
      markets.push({
        conditionId,
        tokenIdYes,
        tokenIdNo,
        team1Code,
        team2Code,
        question,
        marketType: isTotal ? 'total' : 'h2h',
      });
    }
  }
  
  return markets;
}

function extractMarketsFromObject(obj: any, markets: MarketData[], depth = 0): void {
  if (depth > 10 || !obj || typeof obj !== 'object') return;
  
  if (obj.conditionId && typeof obj.conditionId === 'string') {
    let tokenIdYes = null;
    let tokenIdNo = null;
    
    if (obj.clobTokenIds && Array.isArray(obj.clobTokenIds)) {
      tokenIdYes = obj.clobTokenIds[0] || null;
      tokenIdNo = obj.clobTokenIds[1] || null;
    }
    if (obj.tokens && Array.isArray(obj.tokens)) {
      tokenIdYes = obj.tokens[0]?.token_id || obj.tokens[0] || null;
      tokenIdNo = obj.tokens[1]?.token_id || obj.tokens[1] || null;
    }
    
    const question = obj.question || '';
    const isTotal = question.toLowerCase().includes('over') || question.toLowerCase().includes('under');
    
    // Extract team codes from slug or question
    const slugMatch = (obj.slug || '').match(/nba-([a-z]{3})-([a-z]{3})/i);
    const team1Code = slugMatch?.[1]?.toLowerCase() || '';
    const team2Code = slugMatch?.[2]?.toLowerCase() || '';
    
    markets.push({
      conditionId: obj.conditionId,
      tokenIdYes,
      tokenIdNo,
      team1Code,
      team2Code,
      question,
      marketType: isTotal ? 'total' : 'h2h',
    });
  }
  
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        extractMarketsFromObject(item, markets, depth + 1);
      }
    } else if (typeof obj[key] === 'object') {
      extractMarketsFromObject(obj[key], markets, depth + 1);
    }
  }
}
// Fetch CLOB token IDs for a condition
async function fetchClobTokenIds(conditionId: string): Promise<{ tokenIdYes: string | null; tokenIdNo: string | null }> {
  try {
    const response = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
    if (!response.ok) return { tokenIdYes: null, tokenIdNo: null };
    
    const data = await response.json();
    const tokens = data.tokens || [];
    
    return {
      tokenIdYes: tokens[0]?.token_id || null,
      tokenIdNo: tokens[1]?.token_id || null,
    };
  } catch {
    return { tokenIdYes: null, tokenIdNo: null };
  }
}

// Search CLOB API for NBA H2H markets by team names
async function searchClobForNBAMarket(team1: string, team2: string): Promise<{
  conditionId: string | null;
  tokenIdYes: string | null;
  tokenIdNo: string | null;
}> {
  try {
    // Get team nicknames for search
    const team1Nick = team1.split(' ').pop()?.toLowerCase() || '';
    const team2Nick = team2.split(' ').pop()?.toLowerCase() || '';
    
    // CLOB API: Get all markets and filter
    const response = await fetch('https://clob.polymarket.com/markets?limit=500');
    if (!response.ok) return { conditionId: null, tokenIdYes: null, tokenIdNo: null };
    
    const data = await response.json();
    const markets = data.data || data || [];
    
    for (const market of markets) {
      const question = (market.question || '').toLowerCase();
      const desc = (market.description || '').toLowerCase();
      const combined = `${question} ${desc}`;
      
      // Check if it's an NBA H2H market
      const isNBA = combined.includes('nba') || 
                    Object.values(NBA_TEAM_MAP).some(name => combined.includes(name.toLowerCase().split(' ').pop()!));
      
      const hasTeam1 = combined.includes(team1Nick);
      const hasTeam2 = combined.includes(team2Nick);
      const isH2H = (combined.includes(' beat ') || combined.includes(' win ') || combined.includes(' vs ')) &&
                    !combined.includes('over') && !combined.includes('under') && !combined.includes('championship');
      
      if (isNBA && hasTeam1 && hasTeam2 && isH2H && !market.closed && market.active !== false) {
        const tokens = market.tokens || [];
        return {
          conditionId: market.condition_id || market.conditionId,
          tokenIdYes: tokens[0]?.token_id || null,
          tokenIdNo: tokens[1]?.token_id || null,
        };
      }
    }
    
    return { conditionId: null, tokenIdYes: null, tokenIdNo: null };
  } catch (e) {
    console.log('[CLOB-SEARCH] Error:', e);
    return { conditionId: null, tokenIdYes: null, tokenIdNo: null };
  }
}

// Search Gamma API for market by team names
async function findGammaMarket(team1: string, team2: string, marketType: 'h2h' | 'total', threshold?: number): Promise<{
  conditionId: string | null;
  tokenIdYes: string | null;
  tokenIdNo: string | null;
  volume: number;
  slug: string | null;
}> {
  try {
    // Use team nicknames for search
    const team1Nick = team1.split(' ').pop()?.toLowerCase() || '';
    const team2Nick = team2.split(' ').pop()?.toLowerCase() || '';
    
    const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=nba&limit=50`;
    const response = await fetch(url);
    if (!response.ok) return { conditionId: null, tokenIdYes: null, tokenIdNo: null, volume: 0, slug: null };
    
    const events = await response.json();
    
    for (const event of events) {
      const title = (event.title || '').toLowerCase();
      const matchesTeam1 = title.includes(team1Nick);
      const matchesTeam2 = title.includes(team2Nick);
      
      if (matchesTeam1 && matchesTeam2) {
        // Find appropriate market within event
        const markets = event.markets || [];
        
        for (const market of markets) {
          const question = (market.question || '').toLowerCase();
          const gammaType = (market.sportsMarketType || '').toLowerCase();
          
          // Match H2H
          if (marketType === 'h2h' && (gammaType === 'moneyline' || gammaType === 'h2h' || gammaType === 'winner' || question.includes(' beat '))) {
            let tokenIdYes = null;
            let tokenIdNo = null;
            
            // Extract token IDs
            if (market.clobTokenIds) {
              let tokenIds = market.clobTokenIds;
              if (typeof tokenIds === 'string') {
                try { tokenIds = JSON.parse(tokenIds); } catch {}
              }
              if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
                tokenIdYes = tokenIds[0];
                tokenIdNo = tokenIds[1];
              }
            }
            
            return {
              conditionId: market.conditionId || market.id,
              tokenIdYes,
              tokenIdNo,
              volume: parseFloat(market.volume || '0') || 0,
              slug: event.slug || null,
            };
          }
          
          // Match Total
          if (marketType === 'total' && threshold) {
            const isTotal = gammaType.includes('total') || 
                           question.includes('over') || 
                           question.includes('under');
            const hasThreshold = question.includes(threshold.toString());
            
            if (isTotal && hasThreshold) {
              let tokenIdYes = null;
              let tokenIdNo = null;
              
              if (market.clobTokenIds) {
                let tokenIds = market.clobTokenIds;
                if (typeof tokenIds === 'string') {
                  try { tokenIds = JSON.parse(tokenIds); } catch {}
                }
                if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
                  tokenIdYes = tokenIds[0];
                  tokenIdNo = tokenIds[1];
                }
              }
              
              return {
                conditionId: market.conditionId || market.id,
                tokenIdYes,
                tokenIdNo,
                volume: parseFloat(market.volume || '0') || 0,
                slug: event.slug || null,
              };
            }
          }
        }
      }
    }
    
    return { conditionId: null, tokenIdYes: null, tokenIdNo: null, volume: 0, slug: null };
  } catch (e) {
    console.error('[GAMMA-SEARCH] Error:', e);
    return { conditionId: null, tokenIdYes: null, tokenIdNo: null, volume: 0, slug: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[SCRAPE-NBA] Starting NBA H2H + O/U market scrape...');

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Scrape main NBA games page
    console.log('[SCRAPE-NBA] Fetching polymarket.com/sports/nba/games via Firecrawl...');
    
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://polymarket.com/sports/nba/games',
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 5000, // Wait for JavaScript to render
      }),
    });

    if (!scrapeResponse.ok) {
      throw new Error(`Firecrawl failed: ${scrapeResponse.status}`);
    }

    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';

    console.log(`[SCRAPE-NBA] Got ${markdown.length} chars markdown, ${html.length} chars HTML`);

    // Parse markets from markdown
    const h2hMarkets = parseH2HMarkets(markdown);
    const totalMarkets = parseTotalMarkets(markdown);
    const gameMetadata = extractGameMetadata(markdown);

    console.log(`[SCRAPE-NBA] Parsed ${h2hMarkets.length} H2H markets, ${totalMarkets.length} total markets`);

    // Enrich markets with Gamma API data and upsert
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    let h2hUpserted = 0;
    let totalUpserted = 0;
    let h2hWithTokens = 0;
    let totalWithTokens = 0;

    // Pre-fetch CLOB markets once for efficiency (avoid 33 API calls)
    let clobMarketsCache: any[] = [];
    try {
      const clobResp = await fetch('https://clob.polymarket.com/markets?limit=500');
      if (clobResp.ok) {
        const clobData = await clobResp.json();
        clobMarketsCache = clobData.data || clobData || [];
        console.log(`[SCRAPE-NBA] Pre-fetched ${clobMarketsCache.length} CLOB markets for token ID lookup`);
      }
    } catch (e) {
      console.log('[SCRAPE-NBA] CLOB pre-fetch failed, continuing without');
    }

    // Helper: Search pre-fetched CLOB cache for NBA market
    function findClobMarket(team1: string, team2: string): { conditionId: string | null; tokenIdYes: string | null; tokenIdNo: string | null } {
      const team1Nick = team1.split(' ').pop()?.toLowerCase() || '';
      const team2Nick = team2.split(' ').pop()?.toLowerCase() || '';
      
      for (const market of clobMarketsCache) {
        const question = (market.question || '').toLowerCase();
        const desc = (market.description || '').toLowerCase();
        const combined = `${question} ${desc}`;
        
        const hasTeam1 = combined.includes(team1Nick);
        const hasTeam2 = combined.includes(team2Nick);
        const isH2H = (combined.includes(' beat ') || combined.includes(' win ') || combined.includes(' vs ')) &&
                      !combined.includes('over') && !combined.includes('under') && !combined.includes('championship');
        
        if (hasTeam1 && hasTeam2 && isH2H && !market.closed && market.active !== false) {
          const tokens = market.tokens || [];
          return {
            conditionId: market.condition_id || market.conditionId,
            tokenIdYes: tokens[0]?.token_id || null,
            tokenIdNo: tokens[1]?.token_id || null,
          };
        }
      }
      return { conditionId: null, tokenIdYes: null, tokenIdNo: null };
    }

    // Process H2H markets
    for (const market of h2hMarkets) {
      if (!market.team1 || !market.team2) continue;
      
      const key = `${market.team1Code}_${market.team2Code}`;
      const meta = gameMetadata.get(key) || gameMetadata.get(`${market.team2Code}_${market.team1Code}`);
      
      // Search Gamma API for this market
      const gammaData = await findGammaMarket(market.team1, market.team2, 'h2h');
      
      // Fallback: Search CLOB cache if Gamma didn't find it
      let clobData = { conditionId: null as string | null, tokenIdYes: null as string | null, tokenIdNo: null as string | null };
      if (!gammaData.conditionId) {
        clobData = findClobMarket(market.team1, market.team2);
      }
      
      const conditionId = gammaData.conditionId || clobData.conditionId || `nba_h2h_${market.team1Code}_${market.team2Code}_${now.toISOString().split('T')[0]}`;
      const eventDate = meta?.date || now.toISOString().split('T')[0];
      const slug = gammaData.slug || meta?.slug || `nba-${market.team1Code}-${market.team2Code}-${eventDate}`;
      
      // Get token IDs from any source
      let tokenIdYes = gammaData.tokenIdYes || clobData.tokenIdYes;
      let tokenIdNo = gammaData.tokenIdNo || clobData.tokenIdNo;
      
      // Last resort: Fetch from CLOB API directly if we have a real condition ID
      if (!tokenIdYes && gammaData.conditionId) {
        const clobTokens = await fetchClobTokenIds(gammaData.conditionId);
        tokenIdYes = clobTokens.tokenIdYes;
        tokenIdNo = clobTokens.tokenIdNo;
      }
      
      if (tokenIdYes) h2hWithTokens++;

      // Determine tradeability based on token presence
      const isTradeable = !!tokenIdYes;
      const untradeableReason = isTradeable ? null : 'MISSING_TOKENS';

      const { error } = await supabase
        .from('polymarket_h2h_cache')
        .upsert({
          condition_id: conditionId,
          event_title: `${market.team1} vs ${market.team2}`,
          question: `Will ${market.team1} beat ${market.team2}?`,
          team_home: market.team1,
          team_away: market.team2,
          team_home_normalized: market.team1?.toLowerCase(),
          team_away_normalized: market.team2?.toLowerCase(),
          yes_price: market.team1Price || 0.5,
          no_price: market.team2Price || 0.5,
          volume: gammaData.volume,
          event_date: `${eventDate}T23:59:59Z`,
          sport_category: 'NBA',
          extracted_league: 'NBA',
          market_type: 'h2h',
          token_id_yes: tokenIdYes,
          token_id_no: tokenIdNo,
          token_source: tokenIdYes ? (gammaData.tokenIdYes ? 'gamma' : 'clob') : null,
          tradeable: isTradeable,
          untradeable_reason: untradeableReason,
          polymarket_slug: slug,
          status: 'active',
          monitoring_status: 'watching',
          source: 'scrape-nba',
          last_price_update: now.toISOString(),
          last_bulk_sync: now.toISOString(),
        }, { onConflict: 'condition_id' });

      if (!error) h2hUpserted++;
    }

    // Associate totals with games and upsert
    // For now, we link totals to games by their position in the page
    for (let i = 0; i < Math.min(totalMarkets.length, h2hMarkets.length); i++) {
      const total = totalMarkets[i];
      const game = h2hMarkets[i];
      
      if (!total.threshold || !game?.team1 || !game?.team2) continue;
      
      const gammaData = await findGammaMarket(game.team1, game.team2, 'total', total.threshold);
      
      const conditionId = gammaData.conditionId || `nba_total_${game.team1Code}_${game.team2Code}_${total.threshold}_${now.toISOString().split('T')[0]}`;
      const eventDate = now.toISOString().split('T')[0];
      const slug = gammaData.slug || `nba-${game.team1Code}-${game.team2Code}-total-${total.threshold}-${eventDate}`;
      
      let tokenIdYes = gammaData.tokenIdYes;
      let tokenIdNo = gammaData.tokenIdNo;
      
      if (!tokenIdYes && gammaData.conditionId) {
        const clobTokens = await fetchClobTokenIds(gammaData.conditionId);
        tokenIdYes = clobTokens.tokenIdYes;
        tokenIdNo = clobTokens.tokenIdNo;
      }
      
      if (tokenIdYes) totalWithTokens++;

      // Determine tradeability for totals
      const isTradeable = !!tokenIdYes;
      const untradeableReason = isTradeable ? null : 'MISSING_TOKENS';

      const { error } = await supabase
        .from('polymarket_h2h_cache')
        .upsert({
          condition_id: conditionId,
          event_title: `${game.team1} vs ${game.team2} - Total Points`,
          question: `Will ${game.team1} vs ${game.team2} go Over ${total.threshold}?`,
          team_home: game.team1,
          team_away: game.team2,
          team_home_normalized: game.team1?.toLowerCase(),
          team_away_normalized: game.team2?.toLowerCase(),
          yes_price: total.overPrice || 0.5,
          no_price: total.underPrice || 0.5,
          volume: gammaData.volume,
          event_date: `${eventDate}T23:59:59Z`,
          sport_category: 'NBA',
          extracted_league: 'NBA',
          market_type: 'total',
          extracted_threshold: total.threshold,
          token_id_yes: tokenIdYes,
          token_id_no: tokenIdNo,
          token_source: tokenIdYes ? 'gamma' : null,
          tradeable: isTradeable,
          untradeable_reason: untradeableReason,
          polymarket_slug: slug,
          status: 'active',
          monitoring_status: 'watching',
          source: 'scrape-nba',
          last_price_update: now.toISOString(),
          last_bulk_sync: now.toISOString(),
        }, { onConflict: 'condition_id' });

      if (!error) totalUpserted++;
    }

    const duration = Date.now() - startTime;
    console.log(`[SCRAPE-NBA] Complete: ${h2hUpserted} H2H (${h2hWithTokens} with tokens), ${totalUpserted} totals (${totalWithTokens} with tokens) in ${duration}ms`);

    return new Response(JSON.stringify({
      success: true,
      h2h_parsed: h2hMarkets.length,
      h2h_upserted: h2hUpserted,
      h2h_with_tokens: h2hWithTokens,
      totals_parsed: totalMarkets.length,
      totals_upserted: totalUpserted,
      totals_with_tokens: totalWithTokens,
      duration_ms: duration,
      sample_h2h: h2hMarkets.slice(0, 3),
      sample_totals: totalMarkets.slice(0, 3),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SCRAPE-NBA] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
