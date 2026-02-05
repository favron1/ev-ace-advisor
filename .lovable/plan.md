

# Close the Team Mapping Loop

## Problem

The `team_mappings` table and UI exist, but the matching engine doesn't use them. When you manually map "Wizards" → "Washington Wizards", that mapping is stored but ignored during the next batch import.

## Current Architecture (Broken Loop)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  MATCH FAILURE                                                          │
│  "Wiz" not found                                                        │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Logged to match_failures table                                         │
│  Shows in Unmatched Teams Panel                                         │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  YOU: Map "Wiz" → "Washington Wizards"                                  │
│  Saved to team_mappings table ✓                                         │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXT IMPORT: System tries to match "Wiz"...                            │
│  Still fails! ❌ team_mappings is never queried                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Solution: Complete the Self-Healing Loop

Modify `resolveTeamName()` in `canonicalize.ts` to query `team_mappings` table FIRST, before falling back to the hardcoded `teamMap`.

### New Resolution Order

1. **Check `team_mappings` table** (user-curated, highest priority)
2. **Check hardcoded `teamMap`** (abbreviations like "nyr", "lak")
3. **Nickname match** (last word matches)
4. **City match** (first word matches)
5. **Substring containment** (e.g., "Canadiens")

### Implementation Plan

#### Phase 1: Create Helper Function to Fetch Mappings

Create a new shared utility that queries `team_mappings` and builds a lookup cache.

File: `supabase/functions/_shared/team-mapping-cache.ts`

```typescript
// Fetch user-defined team mappings from database
// Cache for 5 minutes to avoid repeated queries

interface CachedMappings {
  data: Map<string, string>;  // source_name → canonical_name
  fetchedAt: number;
}

let cache: CachedMappings | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getTeamMappings(
  supabase: any, 
  sportCode: string
): Promise<Map<string, string>> {
  // Check cache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  // Fetch from database
  const { data } = await supabase
    .from('team_mappings')
    .select('source_name, canonical_name')
    .eq('sport_code', sportCode);

  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(row.source_name.toLowerCase(), row.canonical_name);
  }

  cache = { data: map, fetchedAt: Date.now() };
  return map;
}
```

#### Phase 2: Modify canonicalize.ts

Update `resolveTeamName()` to accept an optional `userMappings` parameter that takes precedence.

```typescript
export function resolveTeamName(
  rawName: string,
  sportCode: SportCode | string,
  teamMap?: Record<string, string>,
  userMappings?: Map<string, string>  // NEW: from team_mappings table
): string | null {
  const rawNorm = normalizeRaw(rawName);

  // Step 0 (NEW): Check user-defined mappings first
  if (userMappings?.has(rawNorm)) {
    return userMappings.get(rawNorm)!;
  }

  // ... rest of existing logic
}
```

#### Phase 3: Update watch-mode-poll

Before matching, fetch user mappings and pass to resolution function.

```typescript
import { getTeamMappings } from '../_shared/team-mapping-cache.ts';

// In the main handler:
const userMappings = await getTeamMappings(supabase, sportCode);

// Pass to matching function
const resolved = resolveTeamName(rawTeam, sportCode, teamMap, userMappings);
```

#### Phase 4: Update batch-market-import

Same pattern - fetch user mappings before processing.

### Database Change (Optional Enhancement)

Add a unique constraint to prevent duplicate mappings:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_mappings_unique 
ON team_mappings(LOWER(source_name), sport_code);
```

## Why This Is Better Than ML

| Approach | Pros | Cons |
|----------|------|------|
| **Lookup Table (This Plan)** | Instant, deterministic, you control mappings, no API costs | Requires initial data entry |
| **ML/Embedding Matching** | Auto-discovers some mappings | Slow, expensive, prone to errors, needs training data, overkill |

You already have the data (you know what teams are called). ML adds latency and uncertainty for no benefit.

## Self-Healing Flow (After Fix)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  MATCH FAILURE: "Wiz" not found                                         │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Logged to match_failures → Shows in UI                                 │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  YOU: Map "Wiz" → "Washington Wizards"                                  │
│  Saved to team_mappings ✓                                               │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXT IMPORT: Queries team_mappings first                               │
│  Finds "wiz" → "Washington Wizards" ✓                                   │
│  Match succeeds! Bookmaker data attached!                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/_shared/team-mapping-cache.ts` | **Create** - Cache layer for team_mappings queries |
| `supabase/functions/_shared/canonicalize.ts` | **Modify** - Add userMappings parameter to resolveTeamName |
| `supabase/functions/watch-mode-poll/index.ts` | **Modify** - Fetch and pass user mappings |
| `supabase/functions/batch-market-import/index.ts` | **Modify** - Fetch and pass user mappings |
| `supabase/migrations/xxx.sql` | **Create** - Add unique constraint to team_mappings |

## Bonus: Pre-Populate Common Aliases

Once this is working, I can help you bulk-import common team aliases into `team_mappings` so you don't have to manually add each one:

- "Wiz" → "Washington Wizards"
- "Clips" → "LA Clippers"
- "Dubs" → "Golden State Warriors"
- etc.

## Summary

- **Not ML** - Simple database lookup (faster, more reliable)
- **Closes the loop** - Your manual mappings will actually work
- **Self-healing** - Every mapping you add improves future matching
- **5 files** - Minimal changes to existing architecture

