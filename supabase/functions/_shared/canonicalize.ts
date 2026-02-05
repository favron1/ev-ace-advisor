// ============================================================================
// CANONICALIZATION UTILITIES
// ============================================================================
// Core utilities for deterministic team matching between Polymarket and bookmakers.
// This is part of the Deterministic Canonical Matching System V2.
// DO NOT MODIFY unless explicitly requested.
// ============================================================================

import { SPORTS_CONFIG, SportCode } from './sports-config.ts';

// ============================================================================
// NORMALIZATION HELPER (exported for use by team-mapping-cache)
// ============================================================================

/**
 * Normalize a raw team name for matching.
 * Strips punctuation, lowercases, and trims.
 */
export function normalizeRaw(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// TYPES
// ============================================================================

export type CanonicalEvent = {
  league: string;
  teamAId: string;        // Slugified official name (alphabetically first)
  teamBId: string;        // Slugified official name (alphabetically second)
  teamSetKey: string;     // Order-independent: "carolina_hurricanes|toronto_maple_leafs"
  teamAFull: string;      // Original resolved full name
  teamBFull: string;      // Original resolved full name
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Slugify a team name into a canonical ID.
 * "Toronto Maple Leafs" -> "toronto_maple_leafs"
 */
export function teamId(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, '_')          // Spaces to underscores
    .trim();
}

/**
 * Create an order-independent team set key.
 * Always sorts alphabetically so "Team B|Team A" and "Team A|Team B" produce the same key.
 */
export function makeTeamSetKey(teamIdA: string, teamIdB: string): string {
  return teamIdA < teamIdB ? `${teamIdA}|${teamIdB}` : `${teamIdB}|${teamIdA}`;
}

/**
 * Extract nickname (last word) from a team name.
 * "Toronto Maple Leafs" -> "leafs"
 */
function extractNickname(fullName: string): string {
  const parts = fullName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return parts[parts.length - 1] || '';
}

/**
 * Extract city (first word(s)) from a team name.
 * "Toronto Maple Leafs" -> "toronto"
 * "Los Angeles Kings" -> "los angeles"
 */
function extractCity(fullName: string): string {
  const parts = fullName.split(/\s+/);
  if (parts.length <= 1) return parts[0]?.toLowerCase() || '';
  
  // Check if last word is the nickname
  const potentialNickname = parts[parts.length - 1];
  if (potentialNickname.length > 2) {
    return parts.slice(0, -1).join(' ').toLowerCase();
  }
  return parts[0].toLowerCase();
}

/**
 * CRITICAL: Resolve a raw team name to its official name using the teamMap.
 * This MUST happen BEFORE slugifying to handle abbreviations, nicknames, and partial names.
 * 
 * Resolution order:
 * 1. Exact match in teamMap values (official names)
 * 2. Exact match in teamMap keys (abbreviations like "nyr", "lak")
 * 3. Nickname match (last word matches)
 * 4. City match (first word(s) match)
 * 5. Substring containment (e.g., "Canadiens" in "Montreal Canadiens")
 * 
 * @param userMappings - Optional Map from team_mappings table (highest priority)
 * @returns The official full team name, or null if no resolution found
 */
export function resolveTeamName(
  rawName: string,
  sportCode: SportCode | string,
  teamMap?: Record<string, string>,
  userMappings?: Map<string, string>
): string | null {
  if (!rawName || rawName.trim().length === 0) return null;
  
  const rawNorm = normalizeRaw(rawName);
  
  // Step 0 (HIGHEST PRIORITY): Check user-defined mappings from team_mappings table
  // This is the self-healing mechanism - manual corrections take precedence
  if (userMappings && userMappings.size > 0) {
    const userResolved = userMappings.get(rawNorm);
    if (userResolved) {
      return userResolved;
    }
  }
  
  // Get teamMap from config if not provided
  const map = teamMap || SPORTS_CONFIG[sportCode as SportCode]?.teamMap || {};
  if (Object.keys(map).length === 0) return null;
  
  const officialNames = Object.values(map);
  
  // 1. Exact match in official names (values)
  for (const official of officialNames) {
    const officialNorm = normalizeRaw(official);
    if (officialNorm === rawNorm) {
      return official;
    }
  }
  
  // 2. Exact match in abbreviations (keys)
  for (const [abbr, official] of Object.entries(map)) {
    if (abbr.toLowerCase() === rawNorm) {
      return official;
    }
  }
  
  // 3. Nickname match (last word)
  const rawNickname = extractNickname(rawName);
  if (rawNickname.length > 2) {
    for (const official of officialNames) {
      const officialNickname = extractNickname(official);
      if (officialNickname === rawNickname) {
        return official;
      }
    }
  }
  
  // 4. City match (first word(s))
  const rawCity = extractCity(rawName);
  if (rawCity.length > 2) {
    for (const official of officialNames) {
      const officialCity = extractCity(official);
      if (officialCity === rawCity) {
        return official;
      }
    }
  }
  
  // 5. Substring containment (e.g., "Canadiens" in "Montreal Canadiens")
  if (rawNorm.length > 4) {
    for (const official of officialNames) {
      const officialNorm = normalizeRaw(official);
      // Check if raw is contained in official or vice versa
      if (officialNorm.includes(rawNorm) || rawNorm.includes(officialNorm)) {
        return official;
      }
    }
  }
  
  // 6. Try matching any word in raw against nicknames
  const rawWords = rawNorm.split(' ').filter(w => w.length > 3);
  for (const word of rawWords) {
    for (const official of officialNames) {
      const officialNickname = extractNickname(official);
      if (officialNickname === word) {
        return official;
      }
    }
  }
  
  return null;
}

/**
 * Parse "Team A vs Team B" or "Team A @ Team B" style titles.
 * Returns the two team names in order (first team, second team).
 */
export function splitTeams(title: string): { a: string; b: string } | null {
  // Match patterns like "Team A vs Team B", "Team A vs. Team B", "Team A @ Team B"
  const match = title.match(/^(.+?)\s+(?:vs\.?|@|v\.?)\s+(.+?)(?:\s*[-–—]\s*.*)?$/i);
  if (!match) return null;
  
  return {
    a: match[1].trim(),
    b: match[2].trim(),
  };
}

/**
 * Full canonicalization pipeline.
 * Resolves both team names and generates a canonical event object.
 * Returns null if either team fails to resolve.
 */
export function canonicalizeEvent(
  league: string,
  team1Raw: string,
  team2Raw: string,
  teamMap?: Record<string, string>
): CanonicalEvent | null {
  // Get sport code from league name
  const sportCode = Object.keys(SPORTS_CONFIG).find(
    code => SPORTS_CONFIG[code as SportCode].name.toUpperCase() === league.toUpperCase()
  ) as SportCode | undefined;
  
  const map = teamMap || (sportCode ? SPORTS_CONFIG[sportCode].teamMap : {});
  
  // Resolve both team names to official names
  const team1Full = resolveTeamName(team1Raw, sportCode || '', map);
  const team2Full = resolveTeamName(team2Raw, sportCode || '', map);
  
  // Both teams must resolve for a valid canonical event
  if (!team1Full || !team2Full) {
    return null;
  }
  
  // Generate canonical IDs
  const team1Id = teamId(team1Full);
  const team2Id = teamId(team2Full);
  
  // Alphabetically order for consistent key
  const [teamAId, teamBId] = team1Id < team2Id ? [team1Id, team2Id] : [team2Id, team1Id];
  const [teamAFull, teamBFull] = team1Id < team2Id ? [team1Full, team2Full] : [team2Full, team1Full];
  
  return {
    league,
    teamAId,
    teamBId,
    teamSetKey: `${teamAId}|${teamBId}`,
    teamAFull,
    teamBFull,
  };
}

/**
 * Build a reverse lookup map for fast team resolution.
 * Maps nicknames, cities, and abbreviations to official names.
 */
export function buildResolutionMap(teamMap: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  
  for (const [abbr, official] of Object.entries(teamMap)) {
    // Add abbreviation
    map.set(abbr.toLowerCase(), official);
    
    // Add normalized official name
    map.set(normalizeRaw(official), official);
    
    // Add nickname
    const nickname = extractNickname(official);
    if (nickname.length > 2) {
      map.set(nickname, official);
    }
    
    // Add city
    const city = extractCity(official);
    if (city.length > 2) {
      map.set(city, official);
    }
  }
  
  return map;
}
