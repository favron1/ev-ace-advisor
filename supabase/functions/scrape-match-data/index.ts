import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapedLayer {
  layer: string;
  sources: Array<{ title: string; url: string; content: string }>;
}

interface MatchData {
  match: string;
  sport: string;
  league: string;
  start_time: string;
  odds: Array<{
    market: string;
    odds: number;
    implied_probability: string;
    bookmaker: string;
  }>;
  data_layers: ScrapedLayer[];
}

async function scrapeLayer(
  firecrawlApiKey: string,
  matchKey: string,
  league: string,
  layerName: string,
  searchTerms: string
): Promise<ScrapedLayer> {
  const query = `${matchKey} ${league} ${searchTerms}`;
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 3,
        tbs: 'qdr:w', // Last week
        scrapeOptions: { formats: ['markdown'] }
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl failed for ${layerName}: ${response.status}`);
      return { layer: layerName, sources: [] };
    }

    const data = await response.json();
    const sources = data.data?.map((result: any) => ({
      title: result.title || '',
      url: result.url || '',
      content: result.markdown?.substring(0, 1500) || result.description || ''
    })) || [];

    return { layer: layerName, sources };
  } catch (error) {
    console.error(`Error scraping ${layerName}:`, error);
    return { layer: layerName, sources: [] };
  }
}

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
      .order('start_time_utc', { ascending: true });

    if (eventsError) throw new Error(eventsError.message);
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No upcoming events found. Click "Refresh Odds" first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events to scrape across all leagues`);

    // Define data layers with their search terms
    const dataLayers = [
      { name: 'PERFORMANCE & FORM', terms: 'recent form last 5 matches results statistics' },
      { name: 'LINEUPS & INJURIES', terms: 'team news injuries suspensions confirmed lineup squad' },
      { name: 'SCHEDULING & FATIGUE', terms: 'fixture congestion rest days travel schedule' },
      { name: 'WEATHER & VENUE', terms: 'weather forecast stadium pitch conditions' },
      { name: 'REFEREE TENDENCIES', terms: 'referee statistics cards fouls penalties official' },
      { name: 'MARKET SENTIMENT', terms: 'betting odds prediction tips expert picks consensus' },
    ];

    const scrapedResults: MatchData[] = [];

    for (const event of events) {
      const matchKey = `${event.home_team} vs ${event.away_team}`;
      console.log(`Scraping: ${matchKey}`);

      // Get best odds for this event
      const bestOdds: Record<string, { odds: number; bookmaker: string }> = {};
      for (const market of event.markets || []) {
        const key = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        if (!bestOdds[key] || odds > bestOdds[key].odds) {
          bestOdds[key] = { odds, bookmaker: market.bookmaker };
        }
      }

      // Scrape each data layer in parallel for this match
      const layerPromises = dataLayers.map(layer => 
        scrapeLayer(firecrawlApiKey, matchKey, event.league, layer.name, layer.terms)
      );

      const scrapedLayers = await Promise.all(layerPromises);

      scrapedResults.push({
        match: matchKey,
        sport: event.sport,
        league: event.league,
        start_time: event.start_time_aedt,
        odds: Object.entries(bestOdds).map(([key, data]) => ({
          market: key,
          odds: data.odds,
          implied_probability: (1 / data.odds * 100).toFixed(1) + '%',
          bookmaker: data.bookmaker
        })),
        data_layers: scrapedLayers
      });
    }

    // Format as institutional-grade output for Perplexity
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    
    const formattedOutput = `========================================================
INSTITUTIONAL SPORTS BETTING DATA EXPORT
Timestamp: ${timestamp} AEDT
Events: ${scrapedResults.length} matches | Window: Next ${window_hours} hours
========================================================

${scrapedResults.map((match, idx) => `
--------------------------------------------------------
EVENT ${idx + 1}: ${match.match}
--------------------------------------------------------
Sport: ${match.sport.toUpperCase()} | League: ${match.league}
Start Time (AEDT): ${new Date(match.start_time).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}

=== MARKET & ODDS DATA ===
${match.odds.map(o => `• ${o.market}: ${o.odds.toFixed(2)} (Implied: ${o.implied_probability}) @ ${o.bookmaker}`).join('\n')}

${match.data_layers.map(layer => `
=== ${layer.layer} ===
${layer.sources.length > 0 
  ? layer.sources.map(s => `
[${s.title}]
Source: ${s.url}
${s.content}
`).join('\n---\n')
  : 'No data available for this layer.'
}`).join('\n')}
`).join('\n\n========================================================\n\n')}

========================================================
END OF DATA EXPORT
========================================================

INSTRUCTIONS FOR ANALYSIS:
Use this data with the institutional betting system prompt to:
1. Calculate Model Probability for each selection
2. Compute Edge (Model − Implied)
3. Generate Bet Score (0-100) per the framework
4. Apply fractional Kelly staking (25% Kelly, max 1.5% bankroll per bet)
5. Return only bets with Bet Score ≥55 and positive EV
`;

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
