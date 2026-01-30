import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Team code to full name mapping for NBA
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

interface ParsedGame {
  team1Code: string;
  team1Name: string;
  team1Price: number;
  team2Code: string;
  team2Name: string;
  team2Price: number;
}

function parseNbaGamesFromMarkdown(markdown: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  
  // Pattern to match price blocks like "tor48¢" or "lal76¢"
  // The format shows teams with their prices in cents
  const pricePattern = /([a-z]{3})(\d+)¢/gi;
  const matches = [...markdown.matchAll(pricePattern)];
  
  console.log(`Found ${matches.length} price matches in markdown`);
  
  // Group prices in pairs (home team, away team)
  for (let i = 0; i < matches.length - 1; i += 2) {
    const team1Match = matches[i];
    const team2Match = matches[i + 1];
    
    if (team1Match && team2Match) {
      const team1Code = team1Match[1].toLowerCase();
      const team2Code = team2Match[1].toLowerCase();
      const team1Price = parseInt(team1Match[2], 10) / 100; // Convert cents to decimal
      const team2Price = parseInt(team2Match[2], 10) / 100;
      
      const team1Name = NBA_TEAM_MAP[team1Code] || team1Code.toUpperCase();
      const team2Name = NBA_TEAM_MAP[team2Code] || team2Code.toUpperCase();
      
      // Only add if we have valid team codes
      if (NBA_TEAM_MAP[team1Code] || NBA_TEAM_MAP[team2Code]) {
        games.push({
          team1Code,
          team1Name,
          team1Price,
          team2Code,
          team2Name,
          team2Price,
        });
      }
    }
  }
  
  return games;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body for options
    let sport = 'nba';
    try {
      const body = await req.json();
      sport = body.sport || 'nba';
    } catch {
      // Default to NBA if no body
    }

    const sportUrl = sport === 'cbb' 
      ? 'https://polymarket.com/sports/cbb/games'
      : 'https://polymarket.com/sports/nba/games';

    console.log(`Scraping ${sport.toUpperCase()} games from ${sportUrl}`);

    // Call Firecrawl API to scrape the page
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: sportUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000, // Wait for JS to render
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorData = await firecrawlResponse.json();
      console.error('Firecrawl API error:', errorData);
      return new Response(
        JSON.stringify({ success: false, error: `Firecrawl error: ${errorData.error || firecrawlResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlData = await firecrawlResponse.json();
    const markdown = firecrawlData.data?.markdown || firecrawlData.markdown || '';
    
    console.log(`Received ${markdown.length} chars of markdown`);
    
    if (!markdown) {
      return new Response(
        JSON.stringify({ success: false, error: 'No content scraped from page' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse games from markdown
    const games = parseNbaGamesFromMarkdown(markdown);
    console.log(`Parsed ${games.length} games`);

    if (games.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          games_found: 0, 
          games_upserted: 0,
          message: 'No games found in scraped content. This could mean no games are scheduled or the page format changed.',
          raw_preview: markdown.substring(0, 500)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert games to cache
    const now = new Date().toISOString();
    let upsertedCount = 0;

    for (const game of games) {
      // Create a unique condition_id based on team matchup
      const conditionId = `firecrawl_${sport}_${game.team1Code}_${game.team2Code}`;
      
      const { error: upsertError } = await supabase
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
          sport_category: sport.toUpperCase(),
          market_type: 'h2h',
          status: 'active',
          source: 'firecrawl',
          last_price_update: now,
          last_bulk_sync: now,
        }, {
          onConflict: 'condition_id'
        });

      if (upsertError) {
        console.error(`Error upserting game ${conditionId}:`, upsertError);
      } else {
        upsertedCount++;
      }
    }

    console.log(`Successfully upserted ${upsertedCount}/${games.length} games`);

    return new Response(
      JSON.stringify({
        success: true,
        sport: sport.toUpperCase(),
        games_found: games.length,
        games_upserted: upsertedCount,
        games: games.map(g => ({
          matchup: `${g.team1Name} vs ${g.team2Name}`,
          prices: { [g.team1Code]: g.team1Price, [g.team2Code]: g.team2Price }
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-polymarket-prices:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
