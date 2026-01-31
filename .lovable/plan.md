# Implementation Plan: Deterministic Canonical Matching System (V2)

## ✅ IMPLEMENTATION COMPLETE (2026-01-31)

**New Files Created:**
- `supabase/functions/_shared/canonicalize.ts` - Team resolution + canonical ID generation
- `supabase/functions/_shared/book-index.ts` - O(1) indexed lookup by `league|teamSetKey`  
- `supabase/functions/_shared/match-poly-to-book.ts` - Core matcher with time proximity filter

**Updated Files:**
- `supabase/functions/polymarket-monitor/index.ts` - Uses new canonical system with fallback chain

---

## Problem Summary

Current match rate is ~26% (only 8-9/158 tradeable markets matching bookmaker data) because the system relies on:
- String similarity and fuzzy matching
- Order-dependent "Team A vs Team B" assumptions  
- Per-market brute-force scanning of bookmaker games
- Scattered team normalization logic that doesn't resolve raw names first

## Critical Improvements from Chat Feedback

The original plan had gaps that would cap match rate at 60-70%. This revised plan addresses:

1. **Resolve team name BEFORE slugging** - Raw input like "Leafs", "NYR", "LA Kings" must be resolved to official names first
2. **Index by `league|teamSetKey` only** - Remove `dateKey` from index key, filter by time proximity instead
3. **Wider time window for placeholders** - Use ±48h for placeholder times (vs 36h)
4. **Fuzzy as last resort with tagging** - Track match method for monitoring clean vs messy matches

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                    MATCHING PIPELINE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. RESOLVE TEAM NAMES (raw → official)                          │
│     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│     │ "Leafs"     │ --> │ teamMap     │ --> │ Toronto     │      │
│     │ "NYR"       │     │ lookup      │     │ Maple Leafs │      │
│     │ "LA Kings"  │     │             │     │             │      │
│     └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                                   │
│  2. CANONICALIZE (official name → team ID)                       │
│     ┌─────────────────────┐     ┌─────────────────────────┐      │
│     │ Toronto Maple Leafs │ --> │ toronto_maple_leafs     │      │
│     └─────────────────────┘     └─────────────────────────┘      │
│                                                                   │
│  3. INDEX LOOKUP (O(1) by league|teamSetKey)                     │
│     Key: "NHL|carolina_hurricanes|toronto_maple_leafs"           │
│     Value: [BookEvent1, BookEvent2, ...]                         │
│                                                                   │
│  4. TIME FILTER (select nearest within ±36-48h)                  │
│                                                                   │
│  5. FALLBACK (AI resolution → fuzzy last resort)                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Technical Changes

### New File 1: `supabase/functions/_shared/canonicalize.ts`

Core canonicalization utilities with the critical `resolveTeamName()` function.

```typescript
// Types
export type CanonicalEvent = {
  league: string;
  teamAId: string;        // Slugified official name
  teamBId: string;
  teamSetKey: string;     // Order-independent: "carolina_hurricanes|toronto_maple_leafs"
};

// Core functions to implement:

// 1. Slugify official team name
export function teamId(fullName: string): string
  // "Toronto Maple Leafs" -> "toronto_maple_leafs"

// 2. Order-independent team set key (CRITICAL: sorts alphabetically)
export function makeTeamSetKey(a: string, b: string): string
  // Always: a < b ? `${a}|${b}` : `${b}|${a}`

// 3. RESOLVE raw team name to official name using teamMap (NEW - CRITICAL)
export function resolveTeamName(
  rawName: string, 
  sportCode: string, 
  teamMap: Record<string, string>
): string | null
  // Steps:
  // 1. Normalize raw: lowercase, strip punctuation, trim
  // 2. Try exact match in teamMap values (official names)
  // 3. Try abbreviation lookup in teamMap keys
  // 4. Try nickname/city extraction from teamMap values
  // 5. Return null if no resolution

// 4. Parse "Team A vs Team B" or "Team A @ Team B"
export function splitTeams(title: string): { a: string; b: string } | null

// 5. Full canonicalization pipeline
export function canonicalizeEvent(
  league: string,
  team1Raw: string,
  team2Raw: string,
  teamMap: Record<string, string>
): CanonicalEvent | null
  // Returns null if either team fails to resolve
```

### New File 2: `supabase/functions/_shared/book-index.ts`

Pre-index bookmaker data once per scan for O(1) lookups.

**Key Change**: Index by `league|teamSetKey` only, NOT including dateKey.

```typescript
export type BookEvent = {
  event_name: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: any[];
};

export function indexBookmakerEvents(
  rows: BookEvent[],
  sportCode: string,
  teamMap: Record<string, string>
): Map<string, BookEvent[]>
  // Key format: "NHL|carolina_hurricanes|toronto_maple_leafs"
  // (NO dateKey - filter by time proximity in matcher)
  // Value: Array of matching book events
  
  // Process:
  // 1. For each bookmaker row
  // 2. Resolve home_team and away_team using resolveTeamName()
  // 3. If both resolve -> generate teamSetKey
  // 4. Add to index under key `${league}|${teamSetKey}`
```

### New File 3: `supabase/functions/_shared/match-poly-to-book.ts`

The core matching function that replaces current `findBookmakerMatch()`.

```typescript
export type MatchResult = {
  match: BookEvent | null;
  method: 'canonical_exact' | 'canonical_time' | 'ai_resolve' | 'fuzzy_last_resort' | null;
  debug?: {
    polyTeams: [string, string];
    resolvedTeams: [string | null, string | null];
    lookupKey: string | null;
    candidatesFound: number;
    timeFilterPassed: number;
  };
};

export function matchPolyMarket(
  bookIndex: Map<string, BookEvent[]>,
  league: string,
  polyYesTeam: string,
  polyNoTeam: string,
  polyDate: Date | null,
  teamMap: Record<string, string>,
  isPlaceholderTime: boolean = false
): MatchResult

// Algorithm:
// 1. Resolve both team names using resolveTeamName()
//    - If either fails -> return { match: null, method: null }
// 
// 2. Generate canonical key: `${league}|${makeTeamSetKey(team1Id, team2Id)}`
// 
// 3. Lookup candidates from index
//    - If no candidates -> return { match: null, method: null }
// 
// 4. Filter by time window:
//    - Normal times: ±36h from polyDate
//    - Placeholder times: ±48h from polyDate
// 
// 5. Select best candidate (closest by commence_time)
// 
// 6. Return match with method = 'canonical_exact' or 'canonical_time'
```

### Modified File: `supabase/functions/polymarket-monitor/index.ts`

Replace the current 4-tier matching with the new canonical system.

**Key Changes:**

#### A. Build book index ONCE at start of run (not per-market)

```typescript
// At ~line 1385, after fetching bookmaker data:

import { indexBookmakerEvents } from '../_shared/book-index.ts';
import { matchPolyMarket } from '../_shared/match-poly-to-book.ts';
import { SPORTS_CONFIG, getSportCodeFromLeague } from '../_shared/sports-config.ts';

// Build index ONCE per sport
const bookIndexes = new Map<string, Map<string, BookEvent[]>>();
for (const [sport, games] of allBookmakerData) {
  const sportCode = getSportCodeFromLeague(sport);
  if (sportCode) {
    const teamMap = SPORTS_CONFIG[sportCode].teamMap;
    bookIndexes.set(sport, indexBookmakerEvents(games, sportCode, teamMap));
  }
}
console.log(`[POLY-MONITOR] Built book indexes for ${bookIndexes.size} sports`);
```

#### B. Replace tiered matching with canonical lookup (lines ~1521-1618)

```typescript
// Replace TIER 1-4 with:

const sportCode = getSportCodeFromLeague(sport);
const teamMap = sportCode ? SPORTS_CONFIG[sportCode].teamMap : {};
const bookIndex = bookIndexes.get(sport);

if (!bookIndex) {
  funnelStats.skipped_no_bookmaker_data++;
  continue;
}

// Parse Polymarket title for team names
const titleParts = event.event_name.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*-\s*.*)?$/i);
const polyYesTeam = titleParts?.[1]?.trim() || '';
const polyNoTeam = titleParts?.[2]?.trim() || '';

const polyEventDate = cache?.event_date ? new Date(cache.event_date) : 
                      event.commence_time ? new Date(event.commence_time) : null;
const isPlaceholder = polyEventDate ? isPlaceholderPolymarketTime(polyEventDate) : false;

// CANONICAL MATCH (primary)
const { match: canonicalMatch, method, debug } = matchPolyMarket(
  bookIndex,
  sport,
  polyYesTeam,
  polyNoTeam,
  polyEventDate,
  teamMap,
  isPlaceholder
);

let match = canonicalMatch;
let matchMethod = method || 'none';

// Track funnel stats
if (method === 'canonical_exact') {
  funnelStats.canonical_exact++;
} else if (method === 'canonical_time') {
  funnelStats.canonical_time_fallback++;
}

// AI FALLBACK (only if canonical fails)
if (!match && bookmakerGames.length > 0) {
  const resolved = await resolveTeamNamesWithAI(event.event_name, sport);
  if (resolved) {
    const { match: aiMatch, method: aiMethod } = matchPolyMarket(
      bookIndex,
      sport,
      resolved.homeTeam,
      resolved.awayTeam,
      polyEventDate,
      teamMap,
      isPlaceholder
    );
    if (aiMatch) {
      match = aiMatch;
      matchMethod = 'ai_resolve';
      funnelStats.tier4_ai++;
    }
  }
}

// FUZZY LAST RESORT (only if both above fail)
if (!match && bookmakerGames.length > 0) {
  const fuzzyResult = findDirectOddsApiMatch(event.event_name, bookmakerGames, 0.5);
  if (fuzzyResult) {
    // Use existing findBookmakerMatch for final validation
    match = findBookmakerMatch(
      event.event_name,
      event.polymarket_question || '',
      marketType,
      [fuzzyResult.game],
      polyEventDate,
      polySlug
    );
    if (match) {
      matchMethod = 'fuzzy_last_resort';
      funnelStats.fuzzy_last_resort++;
    }
  }
}

if (match) {
  funnelStats.matched_total++;
}
```

#### C. Enhanced Funnel Stats

```typescript
let funnelStats = {
  watching_total: eventsToProcess.length,
  skipped_no_tokens: 0,
  skipped_no_bookmaker_data: 0,
  skipped_expired: 0,
  
  // NEW: Resolution stats
  poly_team_resolved: 0,      // Both teams resolved via teamMap
  poly_team_partial: 0,       // One team resolved
  poly_team_failed: 0,        // Neither team resolved
  
  // NEW: Index lookup stats  
  canonical_exact: 0,         // Key found, best by time
  canonical_time_fallback: 0, // Found via time proximity
  canonical_key_missing: 0,   // Key not in index
  
  // Existing
  tier4_ai: 0,
  fuzzy_last_resort: 0,       // NEW: Track fuzzy fallback usage
  
  matched_total: 0,
  edges_calculated: 0,
  edges_over_threshold: 0,
  signals_created: 0,
};

// At end of run:
console.log(`[POLY-MONITOR] FUNNEL_STATS:`, JSON.stringify(funnelStats));
```

### Edge Thresholds (lines ~1877)

Keep two-gate design for signal quality:

```typescript
const MIN_EDGE_SIGNAL = 0.03;  // 3% for signal creation (more opportunities)
const MIN_EDGE_EXECUTE = 0.05; // 5% net for execution recommendation

if (rawEdge >= MIN_EDGE_SIGNAL) {
  funnelStats.edges_over_threshold++;
  // Create signal...
  
  // Add execution recommendation based on net edge
  const isExecutable = netEdge >= MIN_EDGE_EXECUTE;
  console.log(`[POLY-MONITOR] ${isExecutable ? 'EXECUTE' : 'WATCH'}: ${event.event_name} raw=${(rawEdge*100).toFixed(1)}% net=${(netEdge*100).toFixed(1)}%`);
}
```

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `_shared/canonicalize.ts` | NEW | Team resolution + canonical ID generation |
| `_shared/book-index.ts` | NEW | O(1) indexed lookup by `league\|teamSetKey` |
| `_shared/match-poly-to-book.ts` | NEW | Core matcher with time proximity filter |
| `polymarket-monitor/index.ts` | MODIFY | Use new canonical system, fallback chain |

## Expected Match Rate Improvement

| Stage | Match Rate |
|-------|------------|
| Current (fuzzy) | ~26% |
| After team resolution | ~65-75% |
| With `league\|teamSetKey` index (no dateKey) | ~80-85% |
| With AI fallback | ~85-90% |
| With fuzzy last resort | ~90-95% |

## Key Differences from Original Plan

| Aspect | Original Plan | Revised Plan |
|--------|---------------|--------------|
| Team resolution | After teamId() | BEFORE teamId() via resolveTeamName() |
| Index key | `league\|dateKey\|teamSetKey` | `league\|teamSetKey` (no dateKey) |
| Time filtering | In key lookup | Post-lookup proximity filter |
| Placeholder window | ±36h | ±48h |
| Fuzzy matching | Tier 3 | Last resort with tagging |

## Testing Plan

1. Deploy updated functions
2. Run polymarket-monitor scan
3. Check logs for:
   - `FUNNEL_STATS` summary
   - `canonical_exact` vs `fuzzy_last_resort` ratio
   - Team resolution success rate
4. Verify match rate improvement (target: 70%+ immediately, 85%+ with AI fallback)

