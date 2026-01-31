// Deep dive to find NBA H2H markets via all possible API approaches
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
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    results.today = today;
    
    // 1. Try getting all tags to find sports-specific ones
    const tagsResp = await fetch('https://gamma-api.polymarket.com/tags?limit=100');
    const tagsData = await tagsResp.json();
    const sportsTags = Array.isArray(tagsData) 
      ? tagsData.filter((t: any) => 
          t.label?.toLowerCase().includes('nba') || 
          t.label?.toLowerCase().includes('basketball') ||
          t.slug?.toLowerCase().includes('nba') ||
          t.slug?.toLowerCase().includes('basketball')
        ).map((t: any) => ({ id: t.id, label: t.label, slug: t.slug }))
      : [];
    results.basketballTags = sportsTags;
    
    // 2. Try fetching with 'sports_event_type' or other params
    const sportsEventsResp = await fetch('https://gamma-api.polymarket.com/events?tag_slug=sports&limit=200&closed=false&active=true');
    const sportsEvents = await sportsEventsResp.json();
    
    // Find any NBA H2H in sports events
    const nbaH2HEvents = Array.isArray(sportsEvents) 
      ? sportsEvents.filter((e: any) => {
          const title = (e.title || '').toLowerCase();
          const slug = (e.slug || '').toLowerCase();
          return (
            slug.includes('nba-') || 
            title.includes('celtics') ||
            title.includes('lakers') ||
            title.includes('knicks') ||
            title.includes('warriors')
          ) && !title.includes('championship') && !title.includes('mvp') && !title.includes('finals');
        })
      : [];
    
    results.nbaH2HFromSports = nbaH2HEvents.length;
    results.nbaH2HSample = nbaH2HEvents.slice(0, 5).map((e: any) => ({
      title: e.title,
      slug: e.slug,
      endDate: e.endDate,
      tags: e.tags?.map((t: any) => t.label || t.slug),
    }));
    
    // 3. Try markets endpoint with different filters
    const marketsResp = await fetch('https://gamma-api.polymarket.com/markets?tag_slug=nba&limit=50&closed=false&active=true');
    const marketsData = await marketsResp.json();
    
    // Look for H2H patterns in market questions
    const h2hMarkets = Array.isArray(marketsData)
      ? marketsData.filter((m: any) => {
          const q = (m.question || '').toLowerCase();
          return (q.includes(' vs ') || q.includes(' beat ') || q.includes(' win ')) && 
                 !q.includes('championship') && !q.includes('mvp') && !q.includes('finals');
        })
      : [];
    
    results.h2hMarketsFromAPI = h2hMarkets.length;
    results.h2hMarketsSample = h2hMarkets.slice(0, 5).map((m: any) => ({
      question: m.question,
      conditionId: m.conditionId,
      slug: m.slug,
      clobTokenIds: m.clobTokenIds,
    }));
    
    // 4. Try a broader search with no filtering
    const allRecentResp = await fetch('https://gamma-api.polymarket.com/events?limit=100&closed=false&active=true&order=startDate&ascending=true');
    const allRecent = await allRecentResp.json();
    
    // Filter for today's games with team names
    const todayGames = Array.isArray(allRecent)
      ? allRecent.filter((e: any) => {
          const startDate = e.startDate || e.start_date;
          if (!startDate) return false;
          return startDate.startsWith(today);
        })
      : [];
    
    results.todayGamesCount = todayGames.length;
    results.todayGamesSample = todayGames.slice(0, 10).map((e: any) => ({
      title: e.title,
      slug: e.slug,
      startDate: e.startDate || e.start_date,
    }));
    
    // 5. Try the /series endpoint which might have game-level data
    try {
      const seriesResp = await fetch('https://gamma-api.polymarket.com/series?limit=20');
      const seriesData = await seriesResp.json();
      results.seriesCount = Array.isArray(seriesData) ? seriesData.length : 0;
      results.seriesSample = Array.isArray(seriesData) 
        ? seriesData.slice(0, 3).map((s: any) => ({ name: s.name, slug: s.slug }))
        : [];
    } catch (e) {
      results.seriesError = e.message;
    }
    
    // 6. Check total counts by tag
    const sportTagsToCheck = ['nba', 'nhl', 'nfl', 'mlb', 'sports'];
    results.countsByTag = {};
    for (const tag of sportTagsToCheck) {
      const resp = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=${tag}&limit=1&closed=false&active=true`);
      const data = await resp.json();
      // The API doesn't return count, but we can check array length
      // For full count, we'd need to paginate
      results.countsByTag[tag] = Array.isArray(data) ? `${data.length}+ (sample)` : 'error';
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
