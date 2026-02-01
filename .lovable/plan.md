

# Plan: Complete v1.3 Implementation ✅ COMPLETED

## Overview
Fully implement Core Logic v1.3 "Match Failure Flip" - the observability layer that prevents silent signal drops and enables self-healing team mappings.

---

## Implementation Status ✅

```text
+------------------+----------------+-------------------+
|   Component      |   Expected     |    Actual         |
+------------------+----------------+-------------------+
| Version Tag      | v1.3           | v1.3 ✅           |
| match_failures   | Populated      | Logging enabled ✅|
| Silent drops     | Logged         | Logged ✅         |
| WATCH forcing    | Implemented    | Via failure log ✅|
| UI Panel         | Exists         | Created ✅        |
+------------------+----------------+-------------------+
```

---

## Completed Changes

### File: `supabase/functions/_shared/match-poly-to-book.ts`

Modify `matchPolyMarket()` to return failure reason codes when match fails:

**New return shape:**
```typescript
interface MatchResult {
  match: BookEvent | null;
  method: MatchMethod;
  failureReason?: FailureReason;  // NEW
  debug: { ... };
}

type FailureReason = 
  | 'NO_BOOK_GAME_FOUND'
  | 'TEAM_ALIAS_MISSING' 
  | 'START_TIME_MISMATCH'
  | 'MULTIPLE_GAMES_AMBIGUOUS';
```

**Logic changes:**
- If team resolution fails → `TEAM_ALIAS_MISSING`
- If lookup key yields 0 candidates → `NO_BOOK_GAME_FOUND`
- If time filter rejects all → `START_TIME_MISMATCH`

---

## Phase 2: Edge Function - Write to match_failures Table

### File: `supabase/functions/polymarket-monitor/index.ts`

**Add at top:**
```typescript
const CORE_LOGIC_VERSION = 'v1.3';  // Upgrade from v1.1
```

**Add helper function:**
```typescript
async function logMatchFailure(
  supabase: any,
  polyEvent: { 
    title: string; 
    teamA: string; 
    teamB: string; 
    conditionId: string; 
  },
  sportCode: string,
  failureReason: string,
  suggestedMatch?: string
) {
  await supabase.from('match_failures').upsert({
    poly_event_title: polyEvent.title,
    poly_team_a: polyEvent.teamA,
    poly_team_b: polyEvent.teamB,
    poly_condition_id: polyEvent.conditionId,
    sport_code: sportCode,
    failure_reason: failureReason,
    suggested_match: suggestedMatch,
    last_seen_at: new Date().toISOString(),
  }, {
    onConflict: 'poly_condition_id',
    ignoreDuplicates: false,
  });
}
```

**Modify matching loop:**
When `matchResult.match === null`:
1. Call `logMatchFailure()` with appropriate reason
2. Track in funnel stats by reason code
3. Continue to next market (no silent drop)

---

## Phase 3: v1.3 Behavior - Force WATCH + Block S2

When match fails due to `TEAM_ALIAS_MISSING`:
- Signal state = `WATCH` (never promote to S2)
- Log: `"[V1.3] TEAM_ALIAS_MISSING: forcing WATCH for {eventName}"`

When match fails due to `NO_BOOK_GAME_FOUND`:
- Track separately as "awaiting coverage"
- Do NOT count against match rate

---

## Phase 4: Split Metrics

Update funnel stats to distinguish:

```typescript
interface FunnelStats {
  // Existing
  watching_total: number;
  matched_total: number;
  
  // NEW for v1.3
  book_coverage_available: number;   // Markets where bookmakers have odds
  book_coverage_missing: number;     // No bookmaker data yet
  team_alias_failures: number;       // Has book data, but team name mismatch
  time_mismatch_failures: number;    // Has book data, times don't align
  
  // Calculated
  match_rate_covered: number;        // matched / book_coverage_available
}
```

Log these at end of scan:
```
[V1.3] COVERAGE: 45/66 markets have book data (68%)
[V1.3] MATCH_RATE_COVERED: 42/45 matched (93%)
[V1.3] FAILURES: 3 team_alias, 0 time_mismatch
```

---

## Phase 5: UI - Unmatched Teams Panel

### New File: `src/components/terminal/UnmatchedTeamsPanel.tsx`

**Features:**
- Query `match_failures` table for `resolution_status = 'pending'`
- Group by `(sport_code, poly_team_a)` to deduplicate
- Show occurrence count and last seen
- Allow user to type canonical team name
- On submit: insert into `team_mappings` + mark failure as resolved

**UI layout:**
```text
+------------------------------------------+
| Unmatched Teams Queue (3 pending)        |
+------------------------------------------+
| HIOST (NBA) - seen 12x                   |
| Suggested: Houston Rockets               |
| [Map to: ________________] [Save]        |
+------------------------------------------+
| MICH (NCAA) - seen 5x                    |
| Suggested: Michigan Wolverines           |
| [Map to: ________________] [Save]        |
+------------------------------------------+
```

### File: `src/pages/Terminal.tsx`

Add `<UnmatchedTeamsPanel />` to the terminal layout (collapsed by default).

---

## Phase 6: Edge Function - Use team_mappings Lookups

### File: `supabase/functions/_shared/canonicalize.ts`

Modify `resolveTeamName()` to:
1. First check hardcoded `teamMap`
2. Then query `team_mappings` table for learned aliases
3. Return resolved name or null

This makes manually-added mappings permanent and automatic.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/match-poly-to-book.ts` | Add failure reason codes |
| `supabase/functions/polymarket-monitor/index.ts` | Bump to v1.3, add `logMatchFailure()`, split metrics |
| `supabase/functions/watch-mode-poll/index.ts` | Add failure logging (mirrors monitor) |
| `supabase/functions/_shared/canonicalize.ts` | Query `team_mappings` for learned aliases |

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/terminal/UnmatchedTeamsPanel.tsx` | UI for resolving team mappings |

---

## Success Criteria

After implementation:
1. `match_failures` table populates with every unmatched market
2. Logs show `[V1.3]` prefix with split coverage/match metrics
3. Signals tagged with `core_logic_version = 'v1.3'`
4. UI panel shows pending failures and allows resolution
5. Resolved mappings persist and auto-apply to future scans

---

## Technical Notes

- **Database upsert key:** Use `poly_condition_id` as the unique key for `match_failures`
- **Increment counter:** On duplicate, increment `occurrence_count` and update `last_seen_at`
- **RLS:** `match_failures` uses service role for writes, public read - already configured
- **team_mappings query:** Cache results per scan to avoid N+1 queries

