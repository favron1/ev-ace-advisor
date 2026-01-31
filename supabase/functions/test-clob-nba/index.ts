// Try CLOB API to find NBA H2H markets
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const results: Record<string, any> = {};
    
    // 1. CLOB API - get all markets
    try {
      const clobResp = await fetch('https://clob.polymarket.com/markets');
      const clobData = await clobResp.json();
      
      results.clobTotalMarkets = clobData?.data?.length || 0;
      
      // Find NBA related markets
      const nbaMarkets = (clobData?.data || []).filter((m: any) => {
        const q = (m.question || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        return (q.includes('nba') || desc.includes('nba') || 
                q.includes('celtics') || q.includes('lakers') || 
                q.includes('knicks') || q.includes('warriors')) &&
               (q.includes(' vs ') || q.includes(' beat ') || q.includes(' win against'));
      });
      
      results.clobNBAH2H = nbaMarkets.length;
      results.clobNBASample = nbaMarkets.slice(0, 5).map((m: any) => ({
        question: m.question,
        conditionId: m.condition_id,
        tokens: m.tokens?.length,
      }));
    } catch (e) {
      results.clobError = e.message;
    }
    
    // 2. Try the strapi/graphql endpoint that sports pages might use
    try {
      const strapiResp = await fetch('https://strapi-matic.polymarket.com/markets?_limit=50&active=true&category_contains=sports', {
        headers: { 'Accept': 'application/json' }
      });
      const strapiData = await strapiResp.json();
      results.strapiMarkets = Array.isArray(strapiData) ? strapiData.length : 'not array';
    } catch (e) {
      results.strapiError = e.message;
    }
    
    // 3. Try the polymarket.com API that the sports page uses
    // This is the internal API endpoint pattern from polymarket.com
    try {
      const sportsApiResp = await fetch('https://polymarket.com/api/sports/nba/games', {
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageBot/1.0)'
        }
      });
      if (sportsApiResp.ok) {
        const sportsData = await sportsApiResp.json();
        results.sportsApiGames = sportsData?.length || 'has data';
        results.sportsApiSample = Array.isArray(sportsData) 
          ? sportsData.slice(0, 3) 
          : sportsData;
      } else {
        results.sportsApiStatus = sportsApiResp.status;
      }
    } catch (e) {
      results.sportsApiError = e.message;
    }
    
    // 4. Try the data-api endpoint
    try {
      const dataApiResp = await fetch('https://data-api.polymarket.com/markets?limit=50&active=true&tag_slug=nba');
      if (dataApiResp.ok) {
        const dataApiData = await dataApiResp.json();
        results.dataApiMarkets = Array.isArray(dataApiData) ? dataApiData.length : 'has data';
      } else {
        results.dataApiStatus = dataApiResp.status;
      }
    } catch (e) {
      results.dataApiError = e.message;
    }
    
    // 5. Let's also check the CLOB for NBA token patterns
    try {
      // Get all markets from CLOB and look for today's date in descriptions
      const today = new Date().toISOString().split('T')[0];
      const clobResp = await fetch('https://clob.polymarket.com/markets?limit=500');
      const clobData = await clobResp.json();
      
      // Find markets with team names that could be H2H
      const nbaTeams = ['celtics', 'lakers', 'knicks', 'warriors', 'nets', 'heat', 'bulls', 'hawks', 'bucks', 'suns', 'nuggets', 'timberwolves', 'thunder', 'mavericks', 'rockets', 'spurs', 'clippers', 'kings', 'pelicans', 'grizzlies', 'jazz', 'blazers', 'pistons', 'cavaliers', 'pacers', 'magic', 'wizards', 'hornets', 'raptors', '76ers', 'sixers'];
      
      const potentialH2H = (clobData?.data || []).filter((m: any) => {
        const q = (m.question || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        const combined = q + ' ' + desc;
        
        // Must have at least 2 team names (H2H) or vs pattern
        const teamMatches = nbaTeams.filter(t => combined.includes(t));
        return teamMatches.length >= 2 || combined.includes(' vs ');
      });
      
      results.potentialNBAH2H = potentialH2H.length;
      results.potentialH2HSample = potentialH2H.slice(0, 10).map((m: any) => ({
        question: m.question,
        conditionId: m.condition_id,
        active: m.active,
        closed: m.closed,
      }));
    } catch (e) {
      results.clobScanError = e.message;
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
