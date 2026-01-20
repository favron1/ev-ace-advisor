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

interface TeamStats {
  team: string;
  recent_form?: string;
  goals_scored_last_5?: number;
  goals_conceded_last_5?: number;
  xg_for?: number;
  xg_against?: number;
  league_position?: number;
  home_away_record?: string;
  days_rest?: number;
  key_injuries?: string[];
  key_transfers?: string[];
}

interface MatchData {
  match: string;
  sport: string;
  league: string;
  start_time: string;
  home_team_stats: TeamStats;
  away_team_stats: TeamStats;
  odds: Array<{
    market: string;
    selection: string;
    odds: number;
    implied_probability: string;
    bookmaker: string;
  }>;
  data_layers: ScrapedLayer[];
}

// Search with domain filtering for quality stats sources
async function scrapeWithDomains(
  firecrawlApiKey: string,
  query: string,
  domains: string[],
  limit: number = 3
): Promise<Array<{ title: string; url: string; content: string }>> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        tbs: 'qdr:w', // Last week
        scrapeOptions: { formats: ['markdown'] }
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.data?.map((result: any) => ({
      title: result.title || '',
      url: result.url || '',
      content: result.markdown?.substring(0, 2000) || result.description || ''
    })) || [];
  } catch (error) {
    console.error(`Error scraping:`, error);
    return [];
  }
}

// Scrape team-specific stats
async function scrapeTeamStats(
  firecrawlApiKey: string,
  team: string,
  league: string
): Promise<{ form: ScrapedLayer; stats: ScrapedLayer }> {
  // Form and recent results
  const formQuery = `"${team}" ${league} last 5 matches results form WDLWL 2024-25`;
  const formSources = await scrapeWithDomains(firecrawlApiKey, formQuery, [], 2);
  
  // xG and advanced stats
  const statsQuery = `"${team}" xG expected goals goals scored conceded statistics 2024-25`;
  const statsSources = await scrapeWithDomains(firecrawlApiKey, statsQuery, [], 2);

  return {
    form: { layer: `${team} FORM`, sources: formSources },
    stats: { layer: `${team} STATS`, sources: statsSources }
  };
}

// Calculate days since last match
function calculateDaysRest(lastMatchDate: string | null): number | null {
  if (!lastMatchDate) return null;
  const last = new Date(lastMatchDate);
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
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
      .order('start_time_utc', { ascending: true })
      .limit(10); // Limit to avoid API rate limits

    if (eventsError) throw new Error(eventsError.message);
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No upcoming events found. Click "Refresh Odds" first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events to scrape`);

    const scrapedResults: MatchData[] = [];

    for (const event of events) {
      const matchKey = `${event.home_team} vs ${event.away_team}`;
      console.log(`Scraping structured stats: ${matchKey}`);

      // Get best odds for this event
      const oddsArray: MatchData['odds'] = [];
      const processedSelections = new Set<string>();
      
      for (const market of event.markets || []) {
        const selectionKey = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        
        if (!processedSelections.has(selectionKey)) {
          processedSelections.add(selectionKey);
          oddsArray.push({
            market: market.market_type,
            selection: market.selection,
            odds,
            implied_probability: (1 / odds * 100).toFixed(1) + '%',
            bookmaker: market.bookmaker
          });
        }
      }

      // Parallel scraping for each team and match context
      const [
        homeTeamData,
        awayTeamData,
        injuriesData,
        h2hData,
        newsData
      ] = await Promise.all([
        // Home team stats
        scrapeTeamStats(firecrawlApiKey, event.home_team, event.league),
        // Away team stats
        scrapeTeamStats(firecrawlApiKey, event.away_team, event.league),
        // Injuries & suspensions
        scrapeWithDomains(
          firecrawlApiKey,
          `"${event.home_team}" OR "${event.away_team}" injuries suspensions team news lineup ${event.league}`,
          [],
          3
        ),
        // Head to head
        scrapeWithDomains(
          firecrawlApiKey,
          `"${event.home_team}" vs "${event.away_team}" head to head record history recent meetings`,
          [],
          2
        ),
        // Latest news & transfers affecting XI
        scrapeWithDomains(
          firecrawlApiKey,
          `"${event.home_team}" OR "${event.away_team}" transfer news starting eleven squad changes ${event.league}`,
          [],
          2
        )
      ]);

      // Build structured data layers
      const dataLayers: ScrapedLayer[] = [
        homeTeamData.form,
        homeTeamData.stats,
        awayTeamData.form,
        awayTeamData.stats,
        { layer: 'INJURIES & SUSPENSIONS', sources: injuriesData },
        { layer: 'HEAD TO HEAD', sources: h2hData },
        { layer: 'TRANSFERS & NEWS', sources: newsData }
      ];

      // Initialize team stats structures
      const homeTeamStats: TeamStats = { team: event.home_team };
      const awayTeamStats: TeamStats = { team: event.away_team };

      scrapedResults.push({
        match: matchKey,
        sport: event.sport,
        league: event.league,
        start_time: event.start_time_aedt,
        home_team_stats: homeTeamStats,
        away_team_stats: awayTeamStats,
        odds: oddsArray,
        data_layers: dataLayers
      });
    }

    // Format as institutional-grade output for Perplexity
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    
    const formattedOutput = `========================================================
INSTITUTIONAL SPORTS BETTING DATA EXPORT
Timestamp: ${timestamp} AEDT
Events: ${scrapedResults.length} matches | Window: Next ${window_hours} hours
========================================================

CRITICAL ANALYSIS REQUIREMENTS:
For each team, extract and structure the following from the scraped data:
1. TEAM RATING: League position, points per game, overall strength
2. RECENT FORM: Last 5 match results (W/D/L sequence)
3. GOALS FOR/AGAINST: Last 5 matches scoring record
4. EXPECTED GOALS (xG): xG for and against if available
5. HOME/AWAY STRENGTH: Performance split by venue
6. DAYS REST: Days since last competitive match
7. KEY ABSENCES: Starting XI players out (injuries/suspensions)
8. TRANSFER IMPACT: New signings or departures affecting squad

USE THESE STRUCTURED STATS to calculate Model Probability that differs from Implied Probability.
Without structured stats, you cannot identify true edge over the market.

${scrapedResults.map((match, idx) => {
  const eventDate = new Date(match.start_time);
  const formattedDate = eventDate.toLocaleString('en-AU', { 
    timeZone: 'Australia/Sydney', 
    weekday: 'short', 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  return `
================================================================
EVENT ${idx + 1}: ${match.match}
================================================================
Sport: ${match.sport.toUpperCase()} | League: ${match.league}
Kickoff: ${formattedDate} AEDT

--- MARKET ODDS ---
${match.odds.map(o => `${o.selection}: ${o.odds.toFixed(2)} (Implied: ${o.implied_probability}) @ ${o.bookmaker}`).join('\n')}

${match.data_layers.map(layer => {
  if (layer.sources.length === 0) return '';
  return `
--- ${layer.layer} ---
${layer.sources.map(s => `
[${s.title}]
${s.content}
`).join('\n')}`;
}).filter(Boolean).join('\n')}
`;
}).join('\n')}

========================================================
ANALYSIS FRAMEWORK
========================================================
For each match, you MUST extract from the above data:

| Metric | Home Team | Away Team |
|--------|-----------|-----------|
| League Position | ? | ? |
| Last 5 Form | WWDLW | LDWDL |
| Goals Scored (L5) | X | X |
| Goals Conceded (L5) | X | X |
| xG For | X.XX | X.XX |
| xG Against | X.XX | X.XX |
| Days Rest | X | X |
| Key Absences | List | List |

Then calculate:
1. Model Probability per outcome (based on team strength differential)
2. Edge = Model Prob - Implied Prob
3. Bet Score (0-100) using the institutional framework
4. Kelly stake (25% Kelly, capped at 1.5u)

Only recommend bets with Bet Score ≥55 and positive expected value.
========================================================
END OF DATA EXPORT
========================================================
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
