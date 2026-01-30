// ============================================================================
// SHARED FIRECRAWL SCRAPER MODULE
// ============================================================================
// Centralized scraping logic for Polymarket NBA, NFL, and NCAA games
// Used by: polymarket-sync-24h, active-mode-poll, polymarket-monitor
// ============================================================================

// NBA team code to full name mapping
export const NBA_TEAM_MAP: Record<string, string> = {
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

// NFL team code to full name mapping
export const NFL_TEAM_MAP: Record<string, string> = {
  'ari': 'Arizona Cardinals', 'atl': 'Atlanta Falcons', 'bal': 'Baltimore Ravens',
  'buf': 'Buffalo Bills', 'car': 'Carolina Panthers', 'chi': 'Chicago Bears',
  'cin': 'Cincinnati Bengals', 'cle': 'Cleveland Browns', 'dal': 'Dallas Cowboys',
  'den': 'Denver Broncos', 'det': 'Detroit Lions', 'gb': 'Green Bay Packers',
  'hou': 'Houston Texans', 'ind': 'Indianapolis Colts', 'jax': 'Jacksonville Jaguars',
  'kc': 'Kansas City Chiefs', 'lac': 'LA Chargers', 'lar': 'LA Rams',
  'lv': 'Las Vegas Raiders', 'mia': 'Miami Dolphins', 'min': 'Minnesota Vikings',
  'ne': 'New England Patriots', 'no': 'New Orleans Saints', 'nyg': 'New York Giants',
  'nyj': 'New York Jets', 'phi': 'Philadelphia Eagles', 'pit': 'Pittsburgh Steelers',
  'sf': 'San Francisco 49ers', 'sea': 'Seattle Seahawks', 'tb': 'Tampa Bay Buccaneers',
  'ten': 'Tennessee Titans', 'was': 'Washington Commanders',
};

// NHL team code to full name mapping
export const NHL_TEAM_MAP: Record<string, string> = {
  'ana': 'Anaheim Ducks', 'ari': 'Arizona Coyotes', 'bos': 'Boston Bruins',
  'buf': 'Buffalo Sabres', 'cgy': 'Calgary Flames', 'car': 'Carolina Hurricanes',
  'chi': 'Chicago Blackhawks', 'col': 'Colorado Avalanche', 'cbj': 'Columbus Blue Jackets',
  'dal': 'Dallas Stars', 'det': 'Detroit Red Wings', 'edm': 'Edmonton Oilers',
  'fla': 'Florida Panthers', 'la': 'Los Angeles Kings', 'lak': 'Los Angeles Kings',
  'min': 'Minnesota Wild', 'mtl': 'Montreal Canadiens', 'nsh': 'Nashville Predators',
  'njd': 'New Jersey Devils', 'nyi': 'New York Islanders', 'nyr': 'New York Rangers',
  'ott': 'Ottawa Senators', 'phi': 'Philadelphia Flyers', 'pit': 'Pittsburgh Penguins',
  'sjs': 'San Jose Sharks', 'sea': 'Seattle Kraken', 'stl': 'St. Louis Blues',
  'tb': 'Tampa Bay Lightning', 'tbl': 'Tampa Bay Lightning', 'tor': 'Toronto Maple Leafs',
  'van': 'Vancouver Canucks', 'vgk': 'Vegas Golden Knights', 'wsh': 'Washington Capitals',
  'wpg': 'Winnipeg Jets', 'uta': 'Utah Hockey Club',
};

// NCAA team code mapping (common abbreviations)
export const NCAA_TEAM_MAP: Record<string, string> = {
  'duke': 'Duke Blue Devils', 'unc': 'North Carolina Tar Heels',
  'uk': 'Kentucky Wildcats', 'ku': 'Kansas Jayhawks',
  'ucla': 'UCLA Bruins', 'usc': 'USC Trojans',
  'bama': 'Alabama Crimson Tide', 'aub': 'Auburn Tigers',
  'gonz': 'Gonzaga Bulldogs', 'purdue': 'Purdue Boilermakers',
  'uconn': 'UConn Huskies', 'hou': 'Houston Cougars',
  'tenn': 'Tennessee Volunteers', 'arz': 'Arizona Wildcats',
  'msu': 'Michigan State Spartans', 'mich': 'Michigan Wolverines',
  'osu': 'Ohio State Buckeyes', 'wisc': 'Wisconsin Badgers',
  'iowa': 'Iowa Hawkeyes', 'ill': 'Illinois Fighting Illini',
  'ark': 'Arkansas Razorbacks', 'fla': 'Florida Gators',
  'lsu': 'LSU Tigers', 'tex': 'Texas Longhorns',
  'bay': 'Baylor Bears', 'tcu': 'TCU Horned Frogs',
};

export interface ParsedGame {
  team1Code: string;
  team1Name: string;
  team1Price: number;
  team2Code: string;
  team2Name: string;
  team2Price: number;
  sport: 'nba' | 'nfl' | 'cbb' | 'nhl';
}

// Parse games from Firecrawl markdown response
export function parseGamesFromMarkdown(
  markdown: string, 
  teamMap: Record<string, string>,
  sport: 'nba' | 'nfl' | 'cbb' | 'nhl'
): ParsedGame[] {
  const games: ParsedGame[] = [];
  const pricePattern = /([a-z]{2,5})(\d+)¢/gi;
  const matches = [...markdown.matchAll(pricePattern)];
  
  for (let i = 0; i < matches.length - 1; i += 2) {
    const team1Match = matches[i];
    const team2Match = matches[i + 1];
    
    if (team1Match && team2Match) {
      const team1Code = team1Match[1].toLowerCase();
      const team2Code = team2Match[1].toLowerCase();
      const team1Price = parseInt(team1Match[2], 10) / 100;
      const team2Price = parseInt(team2Match[2], 10) / 100;
      
      const team1Name = teamMap[team1Code] || team1Code.toUpperCase();
      const team2Name = teamMap[team2Code] || team2Code.toUpperCase();
      
      // Only add if we recognize at least one team
      if (teamMap[team1Code] || teamMap[team2Code]) {
        games.push({ 
          team1Code, team1Name, team1Price, 
          team2Code, team2Name, team2Price,
          sport 
        });
      }
    }
  }
  
  return games;
}

// Get the URL for a sport's games page
export function getSportUrl(sport: 'nba' | 'nfl' | 'cbb' | 'nhl'): string {
  switch (sport) {
    case 'nba': return 'https://polymarket.com/sports/nba/games';
    case 'nfl': return 'https://polymarket.com/sports/nfl/games';
    case 'cbb': return 'https://polymarket.com/sports/cbb/games';
    case 'nhl': return 'https://polymarket.com/sports/nhl/games';
  }
}

// Get the team map for a sport
export function getTeamMapForSport(sport: 'nba' | 'nfl' | 'cbb' | 'nhl'): Record<string, string> {
  switch (sport) {
    case 'nba': return NBA_TEAM_MAP;
    case 'nfl': return NFL_TEAM_MAP;
    case 'cbb': return NCAA_TEAM_MAP;
    case 'nhl': return NHL_TEAM_MAP;
  }
}

// Get sport code from extracted league
export function getSportCodeFromLeague(league: string | null): 'nba' | 'nfl' | 'cbb' | 'nhl' | null {
  if (!league) return null;
  const l = league.toUpperCase();
  if (l === 'NBA') return 'nba';
  if (l === 'NFL') return 'nfl';
  if (l === 'NCAA' || l === 'CBB') return 'cbb';
  if (l === 'NHL') return 'nhl';
  return null;
}

// Scrape Polymarket sport page via Firecrawl
export async function scrapePolymarketGames(
  sport: 'nba' | 'nfl' | 'cbb' | 'nhl',
  firecrawlApiKey: string
): Promise<ParsedGame[]> {
  const sportUrl = getSportUrl(sport);
  const teamMap = getTeamMapForSport(sport);
  
  try {
    console.log(`[FIRECRAWL] Scraping ${sport.toUpperCase()} from ${sportUrl}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: sportUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.error(`[FIRECRAWL] ${sport} scrape failed: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown) {
      console.log(`[FIRECRAWL] No markdown content for ${sport}`);
      return [];
    }
    
    const games = parseGamesFromMarkdown(markdown, teamMap, sport);
    console.log(`[FIRECRAWL] Parsed ${games.length} ${sport.toUpperCase()} games`);
    return games;
  } catch (error) {
    console.error(`[FIRECRAWL] ${sport} error:`, error);
    return [];
  }
}

// Find matching game by team names (fuzzy matching)
export function findMatchingGame(
  games: ParsedGame[],
  teamHome: string | null,
  teamAway: string | null
): ParsedGame | null {
  if (!teamHome && !teamAway) return null;
  
  const normalizeTeam = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  const homeNorm = teamHome ? normalizeTeam(teamHome) : '';
  const awayNorm = teamAway ? normalizeTeam(teamAway) : '';
  
  for (const game of games) {
    const team1Norm = normalizeTeam(game.team1Name);
    const team2Norm = normalizeTeam(game.team2Name);
    
    // Check if teams match (order may differ)
    const homeMatches = homeNorm && (
      team1Norm.includes(homeNorm) || homeNorm.includes(team1Norm) ||
      team2Norm.includes(homeNorm) || homeNorm.includes(team2Norm)
    );
    
    const awayMatches = awayNorm && (
      team1Norm.includes(awayNorm) || awayNorm.includes(team1Norm) ||
      team2Norm.includes(awayNorm) || awayNorm.includes(team2Norm)
    );
    
    // At least one team should match
    if (homeMatches || awayMatches) {
      return game;
    }
  }
  
  return null;
}

// Refresh prices for a specific market via Firecrawl
export async function refreshPriceViaFirecrawl(
  sport: 'nba' | 'nfl' | 'cbb' | 'nhl',
  teamHome: string | null,
  teamAway: string | null,
  firecrawlApiKey: string
): Promise<{ yesPrice: number; noPrice: number } | null> {
  const games = await scrapePolymarketGames(sport, firecrawlApiKey);
  
  if (games.length === 0) return null;
  
  const matchedGame = findMatchingGame(games, teamHome, teamAway);
  
  if (matchedGame) {
    // Determine which team is "home" (YES side)
    const homeNorm = teamHome?.toLowerCase() || '';
    const team1Norm = matchedGame.team1Name.toLowerCase();
    
    // If team1 matches home, use team1 as YES side
    if (team1Norm.includes(homeNorm) || homeNorm.includes(team1Norm)) {
      return {
        yesPrice: matchedGame.team1Price,
        noPrice: matchedGame.team2Price,
      };
    } else {
      // Otherwise team2 is home/YES side
      return {
        yesPrice: matchedGame.team2Price,
        noPrice: matchedGame.team1Price,
      };
    }
  }
  
  return null;
}
