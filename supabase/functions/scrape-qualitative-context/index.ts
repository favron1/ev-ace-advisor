import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TeamContext {
  team_name: string;
  news_items: string[];
  injury_updates: string[];
  manager_quotes: string[];
  contextual_flags: string[];
}

interface MatchQualitativeContext {
  event_id: string;
  home_team: string;
  away_team: string;
  home_context: TeamContext;
  away_context: TeamContext;
  match_context: string[];
  scraped_at: string;
}

// Extract contextual flags from scraped content
function extractContextualFlags(content: string, teamName: string): string[] {
  const flags: string[] = [];
  const lowerContent = content.toLowerCase();
  
  // Manager/coaching signals
  if (lowerContent.includes('new manager') || lowerContent.includes('new coach') || lowerContent.includes('appointed')) {
    flags.push('new_manager');
  }
  if (lowerContent.includes('sacked') || lowerContent.includes('fired') || lowerContent.includes('parted ways')) {
    flags.push('manager_pressure');
  }
  if (lowerContent.includes('interim') || lowerContent.includes('caretaker')) {
    flags.push('interim_manager');
  }
  
  // Form/momentum signals
  if (lowerContent.includes('winning streak') || lowerContent.includes('unbeaten run')) {
    flags.push('hot_streak');
  }
  if (lowerContent.includes('winless') || lowerContent.includes('losing streak') || lowerContent.includes('poor run')) {
    flags.push('cold_streak');
  }
  
  // Squad signals
  if (lowerContent.includes('injury crisis') || lowerContent.includes('injury-hit') || lowerContent.includes('depleted squad')) {
    flags.push('injury_crisis');
  }
  if (lowerContent.includes('fully fit') || lowerContent.includes('clean bill of health') || lowerContent.includes('full squad')) {
    flags.push('fully_fit');
  }
  if (lowerContent.includes('rested') || lowerContent.includes('rotated') || lowerContent.includes('fresh legs')) {
    flags.push('rested_squad');
  }
  
  // Match importance signals
  if (lowerContent.includes('must win') || lowerContent.includes('must-win') || lowerContent.includes('crucial')) {
    flags.push('must_win');
  }
  if (lowerContent.includes('derby') || lowerContent.includes('rivalry') || lowerContent.includes('fierce')) {
    flags.push('derby');
  }
  if (lowerContent.includes('relegation') || lowerContent.includes('survival')) {
    flags.push('relegation_battle');
  }
  if (lowerContent.includes('title race') || lowerContent.includes('championship race')) {
    flags.push('title_race');
  }
  
  // External factors
  if (lowerContent.includes('travel') || lowerContent.includes('long journey') || lowerContent.includes('away trip')) {
    flags.push('travel_fatigue');
  }
  if (lowerContent.includes('fans') || lowerContent.includes('supporters') || lowerContent.includes('atmosphere')) {
    if (lowerContent.includes('sold out') || lowerContent.includes('packed')) {
      flags.push('high_atmosphere');
    }
  }
  
  return [...new Set(flags)]; // Remove duplicates
}

// Extract injury-related content
function extractInjuryUpdates(content: string): string[] {
  const injuries: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('injury') || 
      lowerLine.includes('injured') || 
      lowerLine.includes('ruled out') ||
      lowerLine.includes('sidelined') ||
      lowerLine.includes('doubtful') ||
      lowerLine.includes('fitness') ||
      lowerLine.includes('hamstring') ||
      lowerLine.includes('knee') ||
      lowerLine.includes('ankle') ||
      lowerLine.includes('muscle')
    ) {
      const cleanLine = line.trim();
      if (cleanLine.length > 10 && cleanLine.length < 300) {
        injuries.push(cleanLine);
      }
    }
  }
  
  return injuries.slice(0, 5); // Limit to 5 most relevant
}

// Extract manager quotes
function extractManagerQuotes(content: string): string[] {
  const quotes: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('said') || 
      lowerLine.includes('says') || 
      lowerLine.includes('told') ||
      lowerLine.includes('believes') ||
      lowerLine.includes('expects') ||
      lowerLine.includes('manager') ||
      lowerLine.includes('coach') ||
      lowerLine.includes('boss')
    ) {
      // Look for quoted text
      const quoteMatch = line.match(/"([^"]+)"|'([^']+)'|"([^"]+)"/);
      if (quoteMatch) {
        const quote = quoteMatch[1] || quoteMatch[2] || quoteMatch[3];
        if (quote && quote.length > 20 && quote.length < 500) {
          quotes.push(quote);
        }
      }
    }
  }
  
  return quotes.slice(0, 3); // Limit to 3 quotes
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { events } = await req.json();
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No events provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping qualitative context for ${events.length} events...`);

    const results: MatchQualitativeContext[] = [];

    for (const event of events) {
      const { id, home_team, away_team, league } = event;
      
      console.log(`Processing: ${home_team} vs ${away_team}`);

      // Build search queries for each team
      const homeQuery = `${home_team} football team news injuries lineup ${league} 2025`;
      const awayQuery = `${away_team} football team news injuries lineup ${league} 2025`;
      const matchQuery = `${home_team} vs ${away_team} preview ${league} 2025`;

      let homeContent = '';
      let awayContent = '';
      let matchContent = '';

      // Parallel search requests
      try {
        const [homeResponse, awayResponse, matchResponse] = await Promise.all([
          fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: homeQuery,
              limit: 3,
              scrapeOptions: { formats: ['markdown'] }
            }),
          }),
          fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: awayQuery,
              limit: 3,
              scrapeOptions: { formats: ['markdown'] }
            }),
          }),
          fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: matchQuery,
              limit: 2,
              scrapeOptions: { formats: ['markdown'] }
            }),
          })
        ]);

        if (homeResponse.ok) {
          const homeData = await homeResponse.json();
          homeContent = (homeData.data || [])
            .map((r: any) => r.markdown || r.description || '')
            .join('\n\n');
        }

        if (awayResponse.ok) {
          const awayData = await awayResponse.json();
          awayContent = (awayData.data || [])
            .map((r: any) => r.markdown || r.description || '')
            .join('\n\n');
        }

        if (matchResponse.ok) {
          const matchData = await matchResponse.json();
          matchContent = (matchData.data || [])
            .map((r: any) => r.markdown || r.description || '')
            .join('\n\n');
        }
      } catch (searchError) {
        console.error(`Search error for ${home_team} vs ${away_team}:`, searchError);
      }

      // Extract structured information
      const homeContext: TeamContext = {
        team_name: home_team,
        news_items: homeContent.split('\n').filter(l => l.trim().length > 50).slice(0, 5),
        injury_updates: extractInjuryUpdates(homeContent),
        manager_quotes: extractManagerQuotes(homeContent),
        contextual_flags: extractContextualFlags(homeContent, home_team)
      };

      const awayContext: TeamContext = {
        team_name: away_team,
        news_items: awayContent.split('\n').filter(l => l.trim().length > 50).slice(0, 5),
        injury_updates: extractInjuryUpdates(awayContent),
        manager_quotes: extractManagerQuotes(awayContent),
        contextual_flags: extractContextualFlags(awayContent, away_team)
      };

      // Extract match-level context
      const matchContextFlags = extractContextualFlags(matchContent, '');
      const allContent = homeContent + '\n' + awayContent + '\n' + matchContent;
      
      // Check for derby indicators
      if (allContent.toLowerCase().includes('derby') || 
          allContent.toLowerCase().includes('rivalry') ||
          allContent.toLowerCase().includes('grudge match')) {
        if (!matchContextFlags.includes('derby')) {
          matchContextFlags.push('derby');
        }
      }

      results.push({
        event_id: id,
        home_team,
        away_team,
        home_context: homeContext,
        away_context: awayContext,
        match_context: matchContextFlags,
        scraped_at: new Date().toISOString()
      });

      console.log(`Completed: ${home_team} (${homeContext.contextual_flags.length} flags) vs ${away_team} (${awayContext.contextual_flags.length} flags)`);
    }

    console.log(`Qualitative scrape complete: ${results.length} events processed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        qualitative_context: results,
        summary: {
          events_processed: results.length,
          total_flags: results.reduce((sum, r) => 
            sum + r.home_context.contextual_flags.length + 
            r.away_context.contextual_flags.length + 
            r.match_context.length, 0
          ),
          scraped_at: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error scraping qualitative context:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
