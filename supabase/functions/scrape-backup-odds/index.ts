// ============================================================================
// BACKUP ODDS SCRAPER - Multi-Source Fallback for Missing Bookmaker Coverage
// ============================================================================
// Uses Firecrawl to scrape DraftKings, OddsChecker, or Action Network
// when The Odds API is missing game coverage
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapedGame {
  homeTeam: string;
  awayTeam: string;
  moneylineHome: number;      // American odds format (-150, +130)
  moneylineAway: number;
  gameTime: string;
  source: string;
}

interface ParsedSignal {
  event_name: string;
  market_type: string;
  outcome: string;
  bookmaker: string;
  odds: number;
  implied_probability: number;
  commence_time: string | null;
  source: string;
  is_sharp_book: boolean;
  confirming_books: number;
}

// Convert American odds to decimal
function americanToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

// Convert American odds to implied probability
function americanToImpliedProb(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

// Parse DraftKings markdown format - IMPROVED REGEX
// Looks for patterns like:
// WAS Wizards](url) at DET Pistons](url) followed by odds
function parseDraftKingsMarkdown(markdown: string, _sport: string): ScrapedGame[] {
  const games: ScrapedGame[] = [];
  
  // Split by game time markers "Today X:XX PM"
  const gameBlocks = markdown.split(/Today\s+\d{1,2}:\d{2}\s+[AP]M/);
  
  console.log(`[DK-PARSE] Found ${gameBlocks.length} blocks`);
  
  for (const block of gameBlocks) {
    // Skip blocks that don't look like game data (too short or no odds)
    if (block.length < 100 || !block.includes('+') || !block.includes('−')) continue;
    
    // Pattern: "[CODE Team]" appears twice with "at" between them
    // Format: WAS Wizards](url) ... at ... DET Pistons](url)
    const teamPattern = /([A-Z]{2,3})\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)\]/g;
    const teamMatches = [...block.matchAll(teamPattern)];
    
    // Need at least 2 team matches (away @ home)
    // But not too many (would indicate team list section, not a game)
    if (teamMatches.length >= 2 && teamMatches.length <= 4) {
      // Check for "at" between matches to confirm game structure
      if (!block.includes('\nat\n') && !block.includes(' at ')) continue;
      
      const awayTeam = teamMatches[0][2];
      const homeTeam = teamMatches[1][2];
      
      // Skip if either team is a known non-NBA entity
      const skipTerms = ['World', 'Championship', 'League', 'Cup', 'Open', 'Tour'];
      if (skipTerms.some(term => awayTeam.includes(term) || homeTeam.includes(term))) continue;
      
      // Find moneylines - look for 3-digit numbers
      // DK format: +550 (away) and −800 (home)
      const mlPattern = /([+−-])(\d{3,})/g;
      const allMl = [...block.matchAll(mlPattern)]
        .map(m => {
          const sign = m[1] === '+' ? 1 : -1;
          return sign * parseInt(m[2], 10);
        })
        .filter(ml => Math.abs(ml) >= 100 && Math.abs(ml) <= 2000);
      
      if (allMl.length >= 2 && awayTeam && homeTeam) {
        // First positive is away ML, largest negative is home ML
        const awayML = allMl.find(ml => ml > 0) || allMl[0];
        const homeML = allMl.filter(ml => ml < 0).sort((a, b) => a - b)[0] || allMl[1];
        
        games.push({
          homeTeam,
          awayTeam,
          moneylineHome: homeML,
          moneylineAway: awayML,
          gameTime: new Date().toISOString(),
          source: 'draftkings',
        });
        console.log(`[DK-PARSE] ${awayTeam} @ ${homeTeam}: ${awayML}/${homeML}`);
      }
    }
  }
  
  // Fallback: Try to extract directly from structured text
  // Pattern: Look for NBA team names directly
  if (games.length === 0) {
    console.log('[DK-PARSE] Trying fallback pattern...');
    
    // NBA team keywords
    const nbaTeams = [
      'Wizards', 'Pistons', 'Nets', 'Magic', 'Jazz', 'Hawks', 'Bulls', 'Raptors',
      'Hornets', 'Rockets', 'Spurs', 'Mavericks', 'Warriors', 'Suns', '76ers', 'Lakers',
      'Celtics', 'Heat', 'Knicks', 'Pacers', 'Bucks', 'Pelicans', 'Timberwolves',
      'Grizzlies', 'Trail Blazers', 'Clippers', 'Kings', 'Cavaliers', 'Nuggets', 'Thunder'
    ];
    
    for (const team1 of nbaTeams) {
      for (const team2 of nbaTeams) {
        if (team1 === team2) continue;
        
        // Look for "Team1...at...Team2" pattern
        const pattern = new RegExp(`${team1}[^]*?at[^]*?${team2}`, 'i');
        if (pattern.test(markdown)) {
          // Found a matchup, now find moneylines
          const idx = markdown.search(pattern);
          const afterText = markdown.substring(idx, idx + 500);
          
          const mlPattern = /([+−-])(\d{3,})/g;
          const mlMatches = [...afterText.matchAll(mlPattern)];
          
          const moneylines = mlMatches
            .map(m => {
              const sign = m[1] === '+' ? 1 : -1;
              return sign * parseInt(m[2], 10);
            })
            .filter(ml => Math.abs(ml) >= 100 && Math.abs(ml) <= 2000);
          
          if (moneylines.length >= 2 && !games.some(g => g.homeTeam === team2)) {
            games.push({
              homeTeam: team2,
              awayTeam: team1,
              moneylineHome: moneylines[1],
              moneylineAway: moneylines[0],
              gameTime: new Date().toISOString(),
              source: 'draftkings',
            });
            console.log(`[DK-PARSE-FB] Game: ${team1} @ ${team2}`);
          }
        }
      }
    }
  }
  
  return games;
}

// Parse OddsChecker markdown format
// Example: "Washington Wizards @ Detroit Pistons +600 -820"
function parseOddsCheckerMarkdown(markdown: string, sport: string): ScrapedGame[] {
  const games: ScrapedGame[] = [];
  
  // OddsChecker format: Team1 @ Team2 with moneylines
  // Pattern matches: "Team Name" followed by @ and another team name
  const gamePattern = /\[([A-Za-z\s]+)\s*\\?\n?\s*!?\[?([A-Za-z\s]+)?logo\]?\s*@\s*([A-Za-z\s]+)\]/gi;
  
  // Simpler pattern for the structured format we see
  const lines = markdown.split('\n');
  
  let currentAway: string | null = null;
  let currentHome: string | null = null;
  let moneylines: number[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for "@ Team" pattern indicating home team
    if (line.includes('@ ') && !line.includes('http')) {
      const atMatch = line.match(/@\s*([A-Za-z\s]+)/);
      if (atMatch) {
        currentHome = atMatch[1].trim();
      }
    }
    
    // Look for team name without @ (away team)
    const teamMatch = line.match(/^([A-Za-z]+\s+[A-Za-z]+)$/);
    if (teamMatch && !currentAway) {
      currentAway = teamMatch[1];
    }
    
    // Look for moneyline odds
    const mlMatch = line.match(/([+−-])(\d{3,})/);
    if (mlMatch) {
      const sign = mlMatch[1] === '+' ? 1 : -1;
      moneylines.push(sign * parseInt(mlMatch[2], 10));
    }
    
    // When we have both teams and at least 2 moneylines, save the game
    if (currentAway && currentHome && moneylines.length >= 2) {
      games.push({
        homeTeam: currentHome,
        awayTeam: currentAway,
        moneylineHome: moneylines[1],
        moneylineAway: moneylines[0],
        gameTime: new Date().toISOString(),
        source: 'oddschecker',
      });
      
      // Reset for next game
      currentAway = null;
      currentHome = null;
      moneylines = [];
    }
  }
  
  return games;
}

// Convert scraped games to bookmaker_signals format
function gamesToSignals(games: ScrapedGame[]): ParsedSignal[] {
  const signals: ParsedSignal[] = [];
  
  for (const game of games) {
    const eventName = `${game.homeTeam} vs ${game.awayTeam}`;
    
    // Home team signal
    signals.push({
      event_name: eventName,
      market_type: 'h2h',
      outcome: game.homeTeam,
      bookmaker: game.source,
      odds: americanToDecimal(game.moneylineHome),
      implied_probability: americanToImpliedProb(game.moneylineHome),
      commence_time: game.gameTime,
      source: 'scraped',
      is_sharp_book: false,
      confirming_books: 1,
    });
    
    // Away team signal
    signals.push({
      event_name: eventName,
      market_type: 'h2h',
      outcome: game.awayTeam,
      bookmaker: game.source,
      odds: americanToDecimal(game.moneylineAway),
      implied_probability: americanToImpliedProb(game.moneylineAway),
      commence_time: game.gameTime,
      source: 'scraped',
      is_sharp_book: false,
      confirming_books: 1,
    });
  }
  
  return signals;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: { sport?: string; source?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Default values
    }

    const sport = body.sport || 'nba';
    const sourcePreference = body.source || 'draftkings';
    
    // Target URLs based on source preference
    const sourceUrls: Record<string, string> = {
      draftkings: 'https://sportsbook.draftkings.com/leagues/basketball/nba',
      oddschecker: 'https://www.oddschecker.com/us/basketball/nba',
    };
    
    const targetUrl = sourceUrls[sourcePreference] || sourceUrls.draftkings;
    
    console.log(`[BACKUP-ODDS] Scraping ${sourcePreference} for ${sport}: ${targetUrl}`);
    
    // Call Firecrawl
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 5000, // Wait for dynamic content
      }),
    });
    
    if (!response.ok) {
      console.error(`[BACKUP-ODDS] Firecrawl failed: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Firecrawl failed: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown) {
      return new Response(
        JSON.stringify({ error: 'No content from scrape', games: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[BACKUP-ODDS] Got ${markdown.length} chars of markdown`);
    
    // Parse based on source
    let games: ScrapedGame[] = [];
    if (sourcePreference === 'draftkings') {
      games = parseDraftKingsMarkdown(markdown, sport);
    } else if (sourcePreference === 'oddschecker') {
      games = parseOddsCheckerMarkdown(markdown, sport);
    }
    
    console.log(`[BACKUP-ODDS] Parsed ${games.length} games from ${sourcePreference}`);
    
    // Convert to signals format
    const signals = gamesToSignals(games);
    
    // If we have signals, optionally insert into bookmaker_signals
    if (signals.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      const insertResponse = await fetch(
        `${supabaseUrl}/rest/v1/bookmaker_signals`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(signals),
        }
      );
      
      if (!insertResponse.ok) {
        console.error('[BACKUP-ODDS] Insert failed:', await insertResponse.text());
      } else {
        console.log(`[BACKUP-ODDS] Inserted ${signals.length} scraped signals`);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        source: sourcePreference,
        sport,
        gamesFound: games.length,
        signalsGenerated: signals.length,
        games: games.map(g => ({ home: g.homeTeam, away: g.awayTeam })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[BACKUP-ODDS] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});