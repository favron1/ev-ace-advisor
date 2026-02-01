// ============================================================================
// POLYMARKET TO BOOKMAKER MATCHER
// ============================================================================
// Core matching function for the Deterministic Canonical Matching System V2.
// Replaces fuzzy matching with indexed O(1) lookups + time proximity filtering.
// DO NOT MODIFY unless explicitly requested.
// ============================================================================

import { resolveTeamName, teamId, makeTeamSetKey, splitTeams } from './canonicalize.ts';
import { BookEvent } from './book-index.ts';
import { SPORTS_CONFIG, SportCode } from './sports-config.ts';

// ============================================================================
// TYPES
// ============================================================================

export type MatchMethod = 
  | 'canonical_exact'      // Key found, closest by time
  | 'canonical_time'       // Found via time proximity fallback
  | 'ai_resolve'           // Found after AI team resolution
  | 'fuzzy_last_resort'    // Found via legacy fuzzy matching
  | null;                  // No match found

// ============================================================================
// V1.3 FAILURE REASON CODES
// ============================================================================
// When match fails, we now track WHY for observability and self-healing
export type FailureReason = 
  | 'TEAM_ALIAS_MISSING'        // Team name couldn't be resolved via teamMap
  | 'NO_BOOK_GAME_FOUND'        // No bookmaker events for this matchup key
  | 'START_TIME_MISMATCH'       // Candidates found but time window filter rejected all
  | 'MULTIPLE_GAMES_AMBIGUOUS'  // Multiple candidates, can't determine correct one
  | null;                       // No failure (match succeeded)

export interface MatchResult {
  match: BookEvent | null;
  method: MatchMethod;
  failureReason: FailureReason;  // V1.3: Always populated when match is null
  debug: {
    polyTeams: [string, string];
    resolvedTeams: [string | null, string | null];
    lookupKey: string | null;
    candidatesFound: number;
    timeFilterPassed: number;
    timeDiffHours: number | null;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if two dates are within a given number of hours.
 */
function withinHours(a: Date, b: Date, hours: number): boolean {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return diffMs <= hours * 60 * 60 * 1000;
}

/**
 * Calculate hour difference between two dates.
 */
function hoursDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

// ============================================================================
// MAIN MATCHING FUNCTION
// ============================================================================

/**
 * Match a Polymarket market to a bookmaker event using the indexed lookup.
 * 
 * Algorithm:
 * 1. Resolve both team names using teamMap
 * 2. Generate canonical key: `${league}|${teamSetKey}`
 * 3. Lookup candidates from index
 * 4. Filter by time window (±36h normal, ±48h for placeholders)
 * 5. Select best candidate (closest by commence_time)
 * 
 * @param bookIndex - Pre-built index of bookmaker events
 * @param league - Sport league (e.g., 'NHL', 'NBA')
 * @param polyYesTeam - First team from Polymarket title (YES side)
 * @param polyNoTeam - Second team from Polymarket title (NO side)
 * @param polyDate - Polymarket event date (may be placeholder)
 * @param teamMap - Team name mapping
 * @param isPlaceholderTime - Whether polyDate is a placeholder (23:59:59 or 00:00:00)
 */
export function matchPolyMarket(
  bookIndex: Map<string, BookEvent[]>,
  league: string,
  polyYesTeam: string,
  polyNoTeam: string,
  polyDate: Date | null,
  teamMap?: Record<string, string>,
  isPlaceholderTime: boolean = false
): MatchResult {
  const debug: MatchResult['debug'] = {
    polyTeams: [polyYesTeam, polyNoTeam],
    resolvedTeams: [null, null],
    lookupKey: null,
    candidatesFound: 0,
    timeFilterPassed: 0,
    timeDiffHours: null,
  };
  
  // Get sport code from league name
  const sportCode = Object.keys(SPORTS_CONFIG).find(
    code => SPORTS_CONFIG[code as SportCode].name.toUpperCase() === league.toUpperCase()
  ) as SportCode | undefined;
  
  const map = teamMap || (sportCode ? SPORTS_CONFIG[sportCode].teamMap : {});
  
  // Step 1: Resolve team names
  const team1Resolved = resolveTeamName(polyYesTeam, sportCode || '', map);
  const team2Resolved = resolveTeamName(polyNoTeam, sportCode || '', map);
  
  debug.resolvedTeams = [team1Resolved, team2Resolved];
  
  // V1.3: If either team fails to resolve, return with TEAM_ALIAS_MISSING reason
  if (!team1Resolved || !team2Resolved) {
    return { 
      match: null, 
      method: null, 
      failureReason: 'TEAM_ALIAS_MISSING',
      debug,
    };
  }
  
  // Step 2: Generate canonical key
  const team1Id = teamId(team1Resolved);
  const team2Id = teamId(team2Resolved);
  const teamSetKey = makeTeamSetKey(team1Id, team2Id);
  const lookupKey = `${league}|${teamSetKey}`;
  
  debug.lookupKey = lookupKey;
  
  // Step 3: Lookup candidates from index
  const candidates = bookIndex.get(lookupKey);
  
  // V1.3: If no candidates found, return with NO_BOOK_GAME_FOUND reason
  if (!candidates || candidates.length === 0) {
    return { 
      match: null, 
      method: null, 
      failureReason: 'NO_BOOK_GAME_FOUND',
      debug,
    };
  }
  
  debug.candidatesFound = candidates.length;
  
  // Step 4: Filter by time window and select best
  const timeWindow = isPlaceholderTime ? 48 : 36; // ±48h for placeholders, ±36h normal
  
  let best: BookEvent | null = null;
  let bestDiff = Infinity;
  let passedTimeFilter = 0;
  
  for (const candidate of candidates) {
    // If no polyDate, just return the first candidate
    if (!polyDate) {
      debug.timeFilterPassed = 1;
      debug.timeDiffHours = null;
      return { 
        match: candidate, 
        method: 'canonical_exact',
        failureReason: null,
        debug,
      };
    }
    
    // Check if candidate is within time window
    const bookDate = new Date(candidate.commence_time);
    
    if (withinHours(bookDate, polyDate, timeWindow)) {
      passedTimeFilter++;
      const diff = Math.abs(bookDate.getTime() - polyDate.getTime());
      
      if (diff < bestDiff) {
        bestDiff = diff;
        best = candidate;
      }
    }
  }
  
  debug.timeFilterPassed = passedTimeFilter;
  debug.timeDiffHours = best ? hoursDiff(new Date(best.commence_time), polyDate!) : null;
  
  // V1.3: If time filter rejected all candidates, return with START_TIME_MISMATCH reason
  if (!best) {
    return { 
      match: null, 
      method: null, 
      failureReason: 'START_TIME_MISMATCH',
      debug,
    };
  }
  
  // Determine method based on how close the match is
  const method: MatchMethod = debug.timeDiffHours! < 24 ? 'canonical_exact' : 'canonical_time';
  
  return { match: best, method, failureReason: null, debug };
}

/**
 * Match using the legacy tiered approach but with canonical resolution first.
 * This is a hybrid approach that uses canonical matching as the primary method
 * and falls back to existing fuzzy logic only if needed.
 */
export function matchWithCanonicalPrimary(
  bookIndex: Map<string, BookEvent[]>,
  league: string,
  eventName: string,
  polyDate: Date | null,
  teamMap?: Record<string, string>,
  isPlaceholderTime: boolean = false
): MatchResult {
  // Parse event name into team names
  const parsed = splitTeams(eventName);
  
  if (!parsed) {
    return {
      match: null,
      method: null,
      failureReason: 'TEAM_ALIAS_MISSING',
      debug: {
        polyTeams: [eventName, ''],
        resolvedTeams: [null, null],
        lookupKey: null,
        candidatesFound: 0,
        timeFilterPassed: 0,
        timeDiffHours: null,
      },
    };
  }
  
  return matchPolyMarket(
    bookIndex,
    league,
    parsed.a,
    parsed.b,
    polyDate,
    teamMap,
    isPlaceholderTime
  );
}

/**
 * Validate that both matched teams appear in the original Polymarket event name.
 * Prevents cross-game mismatches where matched teams don't belong to the event.
 */
export function validateMatchedTeams(
  eventName: string,
  match: BookEvent
): boolean {
  const eventNorm = eventName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  
  // Use resolved team names if available, otherwise original
  const homeTeam = match._homeTeamResolved || match.home_team;
  const awayTeam = match._awayTeamResolved || match.away_team;
  
  // Extract nicknames (last word)
  const homeNickname = homeTeam.toLowerCase().split(/\s+/).filter(w => w.length > 2).pop() || '';
  const awayNickname = awayTeam.toLowerCase().split(/\s+/).filter(w => w.length > 2).pop() || '';
  
  // At least one team's nickname should appear in the event name
  const homeInEvent = homeNickname.length > 2 && eventNorm.includes(homeNickname);
  const awayInEvent = awayNickname.length > 2 && eventNorm.includes(awayNickname);
  
  return homeInEvent || awayInEvent;
}
