// ============================================================================
// TOKENIZATION SERVICE - UI REPAIR PATH
// ============================================================================
// Multi-extractor tokenization service that resolves token IDs from any market reference.
// Priority order: CLOB API → Gamma API → Firecrawl HTML → CLOB Search → FAIL
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOB_API_BASE = 'https://clob.polymarket.com';
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Token extraction result
interface TokenResult {
  success: boolean;
  conditionId?: string;
  tokenIdYes?: string;
  tokenIdNo?: string;
  tokenSource?: 'clob' | 'gamma' | 'ui_network' | 'ui_dom' | 'clob_search';
  confidence?: number;
  tradeable: boolean;
  untradeableReason?: string;
  extractorLog?: string[];
}

// Extract token IDs from CLOB API (highest confidence)
async function extractFromClob(conditionId: string): Promise<TokenResult> {
  const log: string[] = [];
  
  try {
    log.push(`Trying CLOB API for condition_id: ${conditionId}`);
    const response = await fetch(`${CLOB_API_BASE}/markets/${conditionId}`);
    
    if (!response.ok) {
      log.push(`CLOB API returned ${response.status}`);
      return { success: false, tradeable: false, untradeableReason: 'CLOB_API_FAILED', extractorLog: log };
    }
    
    const data = await response.json();
    
    // Extract tokens from response
    const tokens = data.tokens || [];
    if (tokens.length < 2) {
      log.push(`CLOB returned only ${tokens.length} tokens`);
      return { success: false, tradeable: false, untradeableReason: 'INSUFFICIENT_TOKENS', extractorLog: log };
    }
    
    // Find YES and NO tokens by outcome field
    let tokenIdYes: string | undefined;
    let tokenIdNo: string | undefined;
    
    for (const token of tokens) {
      const outcome = (token.outcome || '').toLowerCase();
      if (outcome === 'yes' || outcome === 'true') {
        tokenIdYes = token.token_id;
      } else if (outcome === 'no' || outcome === 'false') {
        tokenIdNo = token.token_id;
      }
    }
    
    // Fallback: use array ordering if outcomes not labeled
    if (!tokenIdYes && tokens[0]?.token_id) {
      tokenIdYes = tokens[0].token_id;
      log.push('Using array index 0 for YES token');
    }
    if (!tokenIdNo && tokens[1]?.token_id) {
      tokenIdNo = tokens[1].token_id;
      log.push('Using array index 1 for NO token');
    }
    
    if (!tokenIdYes) {
      log.push('Could not identify YES token');
      return { success: false, tradeable: false, untradeableReason: 'YES_TOKEN_NOT_FOUND', extractorLog: log };
    }
    
    log.push(`SUCCESS: YES=${tokenIdYes?.slice(0, 16)}... NO=${tokenIdNo?.slice(0, 16)}...`);
    
    return {
      success: true,
      conditionId,
      tokenIdYes,
      tokenIdNo,
      tokenSource: 'clob',
      confidence: 100,
      tradeable: true,
      extractorLog: log,
    };
  } catch (error) {
    log.push(`CLOB API error: ${(error as Error).message}`);
    return { success: false, tradeable: false, untradeableReason: 'CLOB_API_ERROR', extractorLog: log };
  }
}

// Extract token IDs from Gamma API by searching for event
async function extractFromGamma(
  teamHome: string,
  teamAway: string,
  sport: string
): Promise<TokenResult> {
  const log: string[] = [];
  
  try {
    const tagSlug = sport.toLowerCase() === 'nba' ? 'nba' : 
                    sport.toLowerCase() === 'nhl' ? 'nhl' :
                    sport.toLowerCase() === 'nfl' ? 'nfl' :
                    sport.toLowerCase() === 'ncaa' ? 'ncaab' : 'sports';
    
    log.push(`Searching Gamma API with tag_slug=${tagSlug} for ${teamHome} vs ${teamAway}`);
    
    const response = await fetch(`${GAMMA_API_BASE}/events?tag_slug=${tagSlug}&closed=false&limit=200`);
    
    if (!response.ok) {
      log.push(`Gamma API returned ${response.status}`);
      return { success: false, tradeable: false, untradeableReason: 'GAMMA_API_FAILED', extractorLog: log };
    }
    
    const events = await response.json();
    log.push(`Gamma returned ${events.length} events`);
    
    // Normalize team names for matching
    const normalizeTeam = (name: string): string => 
      name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const homeNorm = normalizeTeam(teamHome);
    const awayNorm = normalizeTeam(teamAway);
    
    // Search for matching event
    for (const event of events) {
      const title = (event.title || '').toLowerCase();
      const eventNorm = normalizeTeam(event.title || '');
      
      // Check if both teams are mentioned
      const hasHome = eventNorm.includes(homeNorm) || title.includes(teamHome.toLowerCase());
      const hasAway = eventNorm.includes(awayNorm) || title.includes(teamAway.toLowerCase());
      
      // Also check by nickname
      const homeNickname = teamHome.split(' ').pop()?.toLowerCase() || '';
      const awayNickname = teamAway.split(' ').pop()?.toLowerCase() || '';
      const hasHomeNick = homeNickname.length > 2 && title.includes(homeNickname);
      const hasAwayNick = awayNickname.length > 2 && title.includes(awayNickname);
      
      if ((hasHome || hasHomeNick) && (hasAway || hasAwayNick)) {
        log.push(`Found matching event: "${event.title}"`);
        
        // Find the H2H market in this event
        const markets = event.markets || [];
        for (const market of markets) {
          if (market.marketType === 'winner' || market.marketType === 'h2h') {
            const clobTokenIds = market.clobTokenIds || [];
            
            if (clobTokenIds.length >= 2) {
              log.push(`SUCCESS from Gamma: condition=${market.conditionId}`);
              return {
                success: true,
                conditionId: market.conditionId,
                tokenIdYes: clobTokenIds[0],
                tokenIdNo: clobTokenIds[1],
                tokenSource: 'gamma',
                confidence: 95,
                tradeable: true,
                extractorLog: log,
              };
            }
            
            // Try tokens array
            const tokens = market.tokens || [];
            if (tokens.length >= 2) {
              log.push(`SUCCESS from Gamma (tokens array): condition=${market.conditionId}`);
              return {
                success: true,
                conditionId: market.conditionId,
                tokenIdYes: tokens[0]?.token_id || tokens[0],
                tokenIdNo: tokens[1]?.token_id || tokens[1],
                tokenSource: 'gamma',
                confidence: 90,
                tradeable: true,
                extractorLog: log,
              };
            }
          }
        }
        
        log.push('Matching event found but no H2H market with tokens');
      }
    }
    
    log.push('No matching event found in Gamma API');
    return { success: false, tradeable: false, untradeableReason: 'GAMMA_NO_MATCH', extractorLog: log };
  } catch (error) {
    log.push(`Gamma API error: ${(error as Error).message}`);
    return { success: false, tradeable: false, untradeableReason: 'GAMMA_API_ERROR', extractorLog: log };
  }
}

// Extract tokens from Firecrawl HTML scrape (__NEXT_DATA__)
async function extractFromFirecrawl(marketUrl: string): Promise<TokenResult> {
  const log: string[] = [];
  
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    log.push('FIRECRAWL_API_KEY not configured');
    return { success: false, tradeable: false, untradeableReason: 'FIRECRAWL_NOT_CONFIGURED', extractorLog: log };
  }
  
  try {
    log.push(`Scraping ${marketUrl} with Firecrawl`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: marketUrl,
        formats: ['html'],
        waitFor: 5000,
      }),
    });
    
    if (!response.ok) {
      log.push(`Firecrawl returned ${response.status}`);
      return { success: false, tradeable: false, untradeableReason: 'FIRECRAWL_FAILED', extractorLog: log };
    }
    
    const data = await response.json();
    const html = data.data?.html || data.html || '';
    
    if (!html) {
      log.push('No HTML content returned');
      return { success: false, tradeable: false, untradeableReason: 'NO_HTML_CONTENT', extractorLog: log };
    }
    
    log.push(`Got ${html.length} chars of HTML`);
    
    // Extract __NEXT_DATA__ JSON
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) {
      log.push('__NEXT_DATA__ script tag not found');
      return { success: false, tradeable: false, untradeableReason: 'NO_NEXT_DATA', extractorLog: log };
    }
    
    const nextDataJson = nextDataMatch[1];
    let nextData;
    try {
      nextData = JSON.parse(nextDataJson);
      log.push('Parsed __NEXT_DATA__ successfully');
    } catch {
      log.push('Failed to parse __NEXT_DATA__ JSON');
      return { success: false, tradeable: false, untradeableReason: 'INVALID_NEXT_DATA_JSON', extractorLog: log };
    }
    
    // Navigate to market data - try multiple known paths
    const paths = [
      ['props', 'pageProps', 'dehydratedState', 'queries'],
      ['props', 'pageProps', 'market'],
      ['props', 'pageProps', 'event'],
    ];
    
    let conditionId: string | undefined;
    let tokenIdYes: string | undefined;
    let tokenIdNo: string | undefined;
    
    for (const path of paths) {
      let current: any = nextData;
      for (const key of path) {
        current = current?.[key];
        if (!current) break;
      }
      
      if (Array.isArray(current)) {
        // Search in queries array
        for (const query of current) {
          const state = query?.state?.data;
          if (state?.conditionId && (state?.clobTokenIds || state?.tokens)) {
            conditionId = state.conditionId;
            const tokens = state.clobTokenIds || state.tokens;
            if (Array.isArray(tokens) && tokens.length >= 2) {
              tokenIdYes = typeof tokens[0] === 'string' ? tokens[0] : tokens[0]?.token_id;
              tokenIdNo = typeof tokens[1] === 'string' ? tokens[1] : tokens[1]?.token_id;
              log.push(`Found tokens in queries: condition=${conditionId}`);
              break;
            }
          }
        }
      } else if (current?.conditionId) {
        conditionId = current.conditionId;
        const tokens = current.clobTokenIds || current.tokens;
        if (Array.isArray(tokens) && tokens.length >= 2) {
          tokenIdYes = typeof tokens[0] === 'string' ? tokens[0] : tokens[0]?.token_id;
          tokenIdNo = typeof tokens[1] === 'string' ? tokens[1] : tokens[1]?.token_id;
          log.push(`Found tokens in ${path.join('.')}: condition=${conditionId}`);
        }
      }
      
      if (tokenIdYes && tokenIdNo) break;
    }
    
    // Last resort: regex search for token patterns in HTML
    if (!tokenIdYes) {
      const tokenPattern = /clobTokenIds["']?\s*:\s*\[["']([^"']+)["']\s*,\s*["']([^"']+)["']\]/i;
      const tokenMatch = html.match(tokenPattern);
      if (tokenMatch) {
        tokenIdYes = tokenMatch[1];
        tokenIdNo = tokenMatch[2];
        log.push(`Found tokens via regex: YES=${tokenIdYes?.slice(0, 16)}...`);
      }
      
      // Also try conditionId
      if (!conditionId) {
        const conditionPattern = /conditionId["']?\s*:\s*["']([^"']+)["']/i;
        const conditionMatch = html.match(conditionPattern);
        if (conditionMatch) {
          conditionId = conditionMatch[1];
          log.push(`Found conditionId via regex: ${conditionId}`);
        }
      }
    }
    
    if (!tokenIdYes || !conditionId) {
      log.push('Token IDs not found in __NEXT_DATA__ or HTML');
      return { success: false, tradeable: false, untradeableReason: 'TOKENS_NOT_IN_HTML', extractorLog: log };
    }
    
    log.push(`SUCCESS from Firecrawl: condition=${conditionId} YES=${tokenIdYes?.slice(0, 16)}...`);
    
    return {
      success: true,
      conditionId,
      tokenIdYes,
      tokenIdNo,
      tokenSource: 'ui_network',
      confidence: 80,
      tradeable: true,
      extractorLog: log,
    };
  } catch (error) {
    log.push(`Firecrawl error: ${(error as Error).message}`);
    return { success: false, tradeable: false, untradeableReason: 'FIRECRAWL_ERROR', extractorLog: log };
  }
}

// Search CLOB API for matching market by team names
async function extractFromClobSearch(
  teamHome: string,
  teamAway: string
): Promise<TokenResult> {
  const log: string[] = [];
  
  try {
    log.push(`Searching CLOB API for ${teamHome} vs ${teamAway}`);
    
    const response = await fetch(`${CLOB_API_BASE}/markets?limit=500`);
    
    if (!response.ok) {
      log.push(`CLOB search returned ${response.status}`);
      return { success: false, tradeable: false, untradeableReason: 'CLOB_SEARCH_FAILED', extractorLog: log };
    }
    
    const responseData = await response.json();
    // CLOB API returns { data: [...] } or just [...] 
    const markets = Array.isArray(responseData) ? responseData : (responseData.data || responseData.markets || []);
    log.push(`Got ${markets.length} markets from CLOB`);
    
    const normalizeTeam = (name: string): string => 
      name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const homeNorm = normalizeTeam(teamHome);
    const awayNorm = normalizeTeam(teamAway);
    const homeNickname = teamHome.split(' ').pop()?.toLowerCase() || '';
    const awayNickname = teamAway.split(' ').pop()?.toLowerCase() || '';
    
    for (const market of markets) {
      const question = (market.question || '').toLowerCase();
      const questionNorm = normalizeTeam(market.question || '');
      
      const hasHome = questionNorm.includes(homeNorm) || 
                      (homeNickname.length > 2 && question.includes(homeNickname));
      const hasAway = questionNorm.includes(awayNorm) || 
                      (awayNickname.length > 2 && question.includes(awayNickname));
      
      if (hasHome && hasAway) {
        const tokens = market.tokens || [];
        if (tokens.length >= 2 && market.condition_id) {
          log.push(`SUCCESS from CLOB search: "${market.question}"`);
          return {
            success: true,
            conditionId: market.condition_id,
            tokenIdYes: tokens[0]?.token_id || tokens[0],
            tokenIdNo: tokens[1]?.token_id || tokens[1],
            tokenSource: 'clob_search',
            confidence: 75,
            tradeable: true,
            extractorLog: log,
          };
        }
      }
    }
    
    log.push('No matching market found in CLOB search');
    return { success: false, tradeable: false, untradeableReason: 'CLOB_SEARCH_NO_MATCH', extractorLog: log };
  } catch (error) {
    log.push(`CLOB search error: ${(error as Error).message}`);
    return { success: false, tradeable: false, untradeableReason: 'CLOB_SEARCH_ERROR', extractorLog: log };
  }
}

// Main tokenization function - tries all extractors in priority order
async function tokenizeMarket(params: {
  conditionId?: string;
  marketUrl?: string;
  teamHome?: string;
  teamAway?: string;
  sport?: string;
}): Promise<TokenResult> {
  const allLogs: string[] = [];
  
  // Priority 1: CLOB API Direct (if we have condition_id)
  if (params.conditionId) {
    const clobResult = await extractFromClob(params.conditionId);
    allLogs.push(...(clobResult.extractorLog || []));
    
    if (clobResult.success) {
      return { ...clobResult, extractorLog: allLogs };
    }
  }
  
  // Priority 2: Gamma API (if we have team names)
  if (params.teamHome && params.teamAway) {
    const gammaResult = await extractFromGamma(
      params.teamHome,
      params.teamAway,
      params.sport || 'sports'
    );
    allLogs.push(...(gammaResult.extractorLog || []));
    
    if (gammaResult.success) {
      return { ...gammaResult, extractorLog: allLogs };
    }
  }
  
  // Priority 3: Firecrawl HTML (if we have market URL)
  if (params.marketUrl) {
    const fcResult = await extractFromFirecrawl(params.marketUrl);
    allLogs.push(...(fcResult.extractorLog || []));
    
    if (fcResult.success) {
      return { ...fcResult, extractorLog: allLogs };
    }
  }
  
  // Priority 4: CLOB Search (if we have team names)
  if (params.teamHome && params.teamAway) {
    const searchResult = await extractFromClobSearch(params.teamHome, params.teamAway);
    allLogs.push(...(searchResult.extractorLog || []));
    
    if (searchResult.success) {
      return { ...searchResult, extractorLog: allLogs };
    }
  }
  
  // All extractors failed
  allLogs.push('All extractors failed - marking as untradeable');
  return {
    success: false,
    tradeable: false,
    untradeableReason: 'ALL_EXTRACTORS_FAILED',
    extractorLog: allLogs,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { conditionId, marketUrl, teamHome, teamAway, sport, updateCache } = body;

    console.log('[TOKENIZE] Request:', { conditionId, marketUrl, teamHome, teamAway, sport });

    // Run tokenization
    const result = await tokenizeMarket({
      conditionId,
      marketUrl,
      teamHome,
      teamAway,
      sport,
    });

    console.log('[TOKENIZE] Result:', {
      success: result.success,
      source: result.tokenSource,
      confidence: result.confidence,
      tradeable: result.tradeable,
      reason: result.untradeableReason,
    });

    // Optionally update cache with token IDs
    if (updateCache && result.conditionId) {
      const now = new Date().toISOString();
      
      const updateData: Record<string, any> = {
        tradeable: result.tradeable,
        last_token_repair_at: now,
      };
      
      if (result.success) {
        updateData.token_id_yes = result.tokenIdYes;
        updateData.token_id_no = result.tokenIdNo;
        updateData.token_source = result.tokenSource;
        updateData.token_confidence = result.confidence;
        updateData.untradeable_reason = null;
      } else {
        updateData.untradeable_reason = result.untradeableReason;
      }
      
      const { error: updateError } = await supabase
        .from('polymarket_h2h_cache')
        .update(updateData)
        .eq('condition_id', result.conditionId);
      
      if (updateError) {
        console.error('[TOKENIZE] Cache update failed:', updateError);
      } else {
        console.log('[TOKENIZE] Cache updated for condition:', result.conditionId);
      }
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        conditionId: result.conditionId,
        tokenIdYes: result.tokenIdYes,
        tokenIdNo: result.tokenIdNo,
        tokenSource: result.tokenSource,
        confidence: result.confidence,
        tradeable: result.tradeable,
        untradeableReason: result.untradeableReason,
        extractorLog: result.extractorLog,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[TOKENIZE] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        tradeable: false,
        untradeableReason: 'INTERNAL_ERROR',
        error: (error as Error).message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
