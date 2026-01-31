// Quick test function to debug Gamma API NBA H2H discovery
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
    // First, get the NBA tag ID from /sports endpoint
    const sportsResp = await fetch('https://gamma-api.polymarket.com/sports');
    const sportsData = await sportsResp.json();
    
    // Find NBA in sports data
    let nbaTagId: string | null = null;
    let nbaSeries: any[] = [];
    
    for (const sport of sportsData) {
      if (sport.slug === 'nba' || sport.name?.toLowerCase().includes('nba')) {
        nbaTagId = sport.tagId || sport.tag_id;
        nbaSeries = sport.series || [];
        console.log('Found NBA:', JSON.stringify(sport, null, 2));
        break;
      }
    }
    
    // Try different query approaches to find NBA H2H
    const results: Record<string, any> = {
      nbaTagId,
      nbaSeries: nbaSeries.length,
    };
    
    // Approach 1: Tag slug
    const tagSlugResp = await fetch('https://gamma-api.polymarket.com/events?tag_slug=nba&active=true&closed=false&limit=20');
    const tagSlugData = await tagSlugResp.json();
    results.tagSlugCount = Array.isArray(tagSlugData) ? tagSlugData.length : 0;
    results.tagSlugSample = Array.isArray(tagSlugData) ? tagSlugData.slice(0, 3).map((e: any) => ({
      title: e.title,
      slug: e.slug,
      endDate: e.endDate,
      marketsCount: e.markets?.length || 0,
    })) : [];
    
    // Approach 2: If we have a tag ID, use it
    if (nbaTagId) {
      const tagIdResp = await fetch(`https://gamma-api.polymarket.com/events?tag_id=${nbaTagId}&active=true&closed=false&limit=20`);
      const tagIdData = await tagIdResp.json();
      results.tagIdCount = Array.isArray(tagIdData) ? tagIdData.length : 0;
      results.tagIdSample = Array.isArray(tagIdData) ? tagIdData.slice(0, 3).map((e: any) => ({
        title: e.title,
        slug: e.slug,
        endDate: e.endDate,
      })) : [];
    }
    
    // Approach 3: Slug contains 'nba-'
    const slugContainsResp = await fetch('https://gamma-api.polymarket.com/events?slug_contains=nba-&active=true&closed=false&limit=20');
    const slugContainsData = await slugContainsResp.json();
    results.slugContainsCount = Array.isArray(slugContainsData) ? slugContainsData.length : 0;
    results.slugContainsSample = Array.isArray(slugContainsData) ? slugContainsData.slice(0, 5).map((e: any) => ({
      title: e.title,
      slug: e.slug,
      endDate: e.endDate,
      markets: e.markets?.slice(0, 2).map((m: any) => ({
        question: m.question,
        conditionId: m.conditionId,
        clobTokenIds: m.clobTokenIds,
      })),
    })) : [];
    
    // Approach 4: Search for today's date in slug
    const today = new Date().toISOString().split('T')[0];
    const todayResp = await fetch(`https://gamma-api.polymarket.com/events?slug_contains=${today}&active=true&closed=false&limit=50`);
    const todayData = await todayResp.json();
    results.todaySlugCount = Array.isArray(todayData) ? todayData.length : 0;
    
    // Filter today's data for NBA
    const nbaToday = Array.isArray(todayData) 
      ? todayData.filter((e: any) => e.slug?.includes('nba-'))
      : [];
    results.nbaTodayCount = nbaToday.length;
    results.nbaTodaySample = nbaToday.slice(0, 5).map((e: any) => ({
      title: e.title,
      slug: e.slug,
      markets: e.markets?.map((m: any) => ({
        question: m.question,
        conditionId: m.conditionId,
        clobTokenIds: m.clobTokenIds?.slice(0, 2),
      })),
    }));

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
