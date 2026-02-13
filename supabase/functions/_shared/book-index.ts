// ============================================================================
// BOOKMAKER INDEX
// ============================================================================
// Pre-indexes bookmaker data for O(1) lookups by league|teamSetKey.
// This is part of the Deterministic Canonical Matching System V2.
// DO NOT MODIFY unless explicitly requested.
// ============================================================================

import { resolveTeamName, teamId, makeTeamSetKey } from './canonicalize.ts';
import { SPORTS_CONFIG, SportCode } from './sports-config.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface BookEvent {
  event_name: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: any[];
  // Resolved canonical fields (added during indexing)
  _homeTeamResolved?: string;
  _awayTeamResolved?: string;
  _teamSetKey?: string;
}

export interface IndexStats {
  totalRows: number;
  indexed: number;
  failed: number;
  failedTeams: string[];
}

// ============================================================================
// INDEXING FUNCTION
// ============================================================================

/**
 * Build an index of bookmaker events for O(1) lookup.
 * 
 * Key format: "NHL|carolina_hurricanes|toronto_maple_leafs"
 * - NO dateKey in index (filter by time proximity in matcher)
 * - Order-independent (teamSetKey is always sorted)
 * 
 * @param rows - Array of bookmaker game data
 * @param sportCode - Sport code (e.g., 'nhl', 'nba')
 * @param teamMap - Optional team name mapping (uses SPORTS_CONFIG if not provided)
 * @returns Map from canonical key to array of matching BookEvents
 */
export function indexBookmakerEvents(
  rows: BookEvent[],
  sportCode: SportCode | string,
  teamMap?: Record<string, string>,
  userMappings?: Map<string, string>
): Map<string, BookEvent[]> {
  const idx = new Map<string, BookEvent[]>();
  const map = teamMap || SPORTS_CONFIG[sportCode as SportCode]?.teamMap || {};
  const league = SPORTS_CONFIG[sportCode as SportCode]?.name || sportCode.toUpperCase();
  
  let indexed = 0;
  let failed = 0;
  const failedTeams: string[] = [];
  
  for (const row of rows) {
    if (!row.home_team || !row.away_team) {
      failed++;
      continue;
    }
    
    // Resolve team names using teamMap + userMappings from DB
    const homeResolved = resolveTeamName(row.home_team, sportCode, map, userMappings);
    const awayResolved = resolveTeamName(row.away_team, sportCode, map, userMappings);
    
    if (!homeResolved) {
      failed++;
      if (!failedTeams.includes(row.home_team)) {
        failedTeams.push(row.home_team);
      }
      continue;
    }
    
    if (!awayResolved) {
      failed++;
      if (!failedTeams.includes(row.away_team)) {
        failedTeams.push(row.away_team);
      }
      continue;
    }
    
    // Generate canonical IDs and key
    const homeId = teamId(homeResolved);
    const awayId = teamId(awayResolved);
    const teamSetKey = makeTeamSetKey(homeId, awayId);
    const key = `${league}|${teamSetKey}`;
    
    // Attach resolved data to row for later use
    const enrichedRow: BookEvent = {
      ...row,
      _homeTeamResolved: homeResolved,
      _awayTeamResolved: awayResolved,
      _teamSetKey: teamSetKey,
    };
    
    // Add to index
    if (!idx.has(key)) {
      idx.set(key, []);
    }
    idx.get(key)!.push(enrichedRow);
    indexed++;
  }
  
  // Log indexing stats
  if (failed > 0 && failedTeams.length > 0) {
    console.log(`[BOOK-INDEX] ${league}: indexed ${indexed}, failed ${failed}. Unresolved teams: ${failedTeams.slice(0, 5).join(', ')}${failedTeams.length > 5 ? '...' : ''}`);
  } else {
    console.log(`[BOOK-INDEX] ${league}: indexed ${indexed}/${rows.length} games`);
  }
  
  return idx;
}

/**
 * Get indexing statistics for debugging.
 */
export function getIndexStats(
  rows: BookEvent[],
  sportCode: SportCode | string,
  teamMap?: Record<string, string>
): IndexStats {
  const map = teamMap || SPORTS_CONFIG[sportCode as SportCode]?.teamMap || {};
  
  let indexed = 0;
  let failed = 0;
  const failedTeams: string[] = [];
  
  for (const row of rows) {
    if (!row.home_team || !row.away_team) {
      failed++;
      continue;
    }
    
    const homeResolved = resolveTeamName(row.home_team, sportCode, map);
    const awayResolved = resolveTeamName(row.away_team, sportCode, map);
    
    if (!homeResolved || !awayResolved) {
      failed++;
      if (!homeResolved && !failedTeams.includes(row.home_team)) {
        failedTeams.push(row.home_team);
      }
      if (!awayResolved && !failedTeams.includes(row.away_team)) {
        failedTeams.push(row.away_team);
      }
    } else {
      indexed++;
    }
  }
  
  return {
    totalRows: rows.length,
    indexed,
    failed,
    failedTeams,
  };
}
