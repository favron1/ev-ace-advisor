// ============================================================================
// SHARED FIRECRAWL SCRAPER MODULE
// ============================================================================
// Centralized scraping logic for Polymarket sports pages
// Uses SPORTS_CONFIG for dynamic sport support
// ============================================================================

import { 
  SPORTS_CONFIG, 
  SPORT_CODES, 
  type SportCode,
  getSportCodeFromLeague as getSportCodeFromLeagueConfig,
} from './sports-config.ts';

export interface ParsedGame {
  team1Code: string;
  team1Name: string;
  team1Price: number;
  team2Code: string;
  team2Name: string;
  team2Price: number;
  sport: SportCode;
}

// Re-export SportCode for consumers
export type { SportCode };

// Re-export getSportCodeFromLeague from config
export const getSportCodeFromLeague = getSportCodeFromLeagueConfig;

// Parse games from Firecrawl markdown response
export function parseGamesFromMarkdown(
  markdown: string, 
  teamMap: Record<string, string>,
  sport: SportCode
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

// Scrape Polymarket sport page via Firecrawl - now uses config
export async function scrapePolymarketGames(
  sport: SportCode,
  firecrawlApiKey: string
): Promise<ParsedGame[]> {
  const config = SPORTS_CONFIG[sport];
  if (!config) {
    console.error(`[FIRECRAWL] Unknown sport: ${sport}`);
    return [];
  }
  
  const sportUrl = config.polymarketUrl;
  const teamMap = config.teamMap;
  
  try {
    console.log(`[FIRECRAWL] Scraping ${config.name} from ${sportUrl}`);
    
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
      console.error(`[FIRECRAWL] ${config.name} scrape failed: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown) {
      console.log(`[FIRECRAWL] No markdown content for ${config.name}`);
      return [];
    }
    
    const games = parseGamesFromMarkdown(markdown, teamMap, sport);
    console.log(`[FIRECRAWL] Parsed ${games.length} ${config.name} games`);
    return games;
  } catch (error) {
    console.error(`[FIRECRAWL] ${config.name} error:`, error);
    return [];
  }
}

/**
 * Scrape ALL configured sports in parallel
 * Returns flattened array with sport metadata
 */
export async function scrapeAllSports(
  firecrawlApiKey: string
): Promise<Array<{ game: ParsedGame; sport: string; sportCode: SportCode }>> {
  const results = await Promise.all(
    SPORT_CODES.map(async (sportCode) => {
      const games = await scrapePolymarketGames(sportCode, firecrawlApiKey);
      return games.map(game => ({
        game,
        sport: SPORTS_CONFIG[sportCode].name,
        sportCode,
      }));
    })
  );
  
  return results.flat();
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
  sport: SportCode,
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
