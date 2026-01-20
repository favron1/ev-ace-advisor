import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { sports = ['soccer'], window_hours = 72 } = await req.json();

    // Query upcoming events
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`*, markets (*)`)
      .in('sport', sports)
      .eq('status', 'upcoming')
      .gte('start_time_utc', now.toISOString())
      .lte('start_time_utc', windowEnd.toISOString())
      .order('start_time_utc', { ascending: true })
      .limit(10);

    if (eventsError) throw new Error(eventsError.message);
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No upcoming events found. Click "Refresh Odds" first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events to scrape`);

    // Scrape data for each match
    const scrapedResults: any[] = [];

    for (const event of events.slice(0, 8)) {
      const matchKey = `${event.home_team} vs ${event.away_team}`;
      const searchQuery = `${event.home_team} vs ${event.away_team} ${event.league} preview injuries team news form`;

      console.log(`Scraping: ${searchQuery}`);

      try {
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 5,
            tbs: 'qdr:w',
            scrapeOptions: { formats: ['markdown'] }
          }),
        });

        if (!response.ok) {
          console.error(`Firecrawl failed for ${matchKey}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const content = data.data?.map((result: any) => ({
          title: result.title,
          url: result.url,
          content: result.markdown?.substring(0, 2000) || result.description
        })) || [];

        // Get best odds for this event
        const bestOdds: Record<string, { odds: number; bookmaker: string }> = {};
        for (const market of event.markets || []) {
          const key = `${market.market_type}_${market.selection}`;
          const odds = parseFloat(market.odds_decimal);
          if (!bestOdds[key] || odds > bestOdds[key].odds) {
            bestOdds[key] = { odds, bookmaker: market.bookmaker };
          }
        }

        scrapedResults.push({
          match: matchKey,
          sport: event.sport,
          league: event.league,
          start_time: event.start_time_aedt,
          odds: Object.entries(bestOdds).map(([key, data]) => ({
            market: key,
            odds: data.odds,
            implied_probability: (1 / data.odds).toFixed(4),
            bookmaker: data.bookmaker
          })),
          scraped_data: content
        });

      } catch (error) {
        console.error(`Error scraping ${matchKey}:`, error);
      }
    }

    // Format as copyable text for Perplexity
    const formattedOutput = `# Sports Betting Data - ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}

${scrapedResults.map(match => `
## ${match.match}
**Sport:** ${match.sport} | **League:** ${match.league}
**Start Time (AEDT):** ${match.start_time}

### Current Odds
${match.odds.map((o: any) => `- ${o.market}: ${o.odds} (implied: ${(parseFloat(o.implied_probability) * 100).toFixed(1)}%) @ ${o.bookmaker}`).join('\n')}

### Scraped Research Data
${match.scraped_data.map((s: any) => `
**${s.title}**
Source: ${s.url}
${s.content}
`).join('\n---\n')}
`).join('\n\n========================================\n\n')}`;

    return new Response(
      JSON.stringify({
        matches_scraped: scrapedResults.length,
        formatted_data: formattedOutput,
        raw_data: scrapedResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-match-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
