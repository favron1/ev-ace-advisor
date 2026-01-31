
# Fix Plan: Fuzzy Match Team Ordering Bug

## Problem Summary

The backend is mapping the wrong team to YES/NO when the fuzzy match fallback is used. The bug occurs because:

1. Polymarket title says "Canadiens vs. Sabres" → YES=Canadiens, NO=Sabres
2. Fuzzy match finds the bookmaker game "Buffalo Sabres vs Montréal Canadiens" (home/away order)
3. The code **reconstructs** the event name using bookmaker's home/away order
4. `findBookmakerMatch` then parses "Buffalo Sabres vs Montréal Canadiens" and sets YES=Sabres, NO=Canadiens
5. Result: Completely inverted mapping

### Evidence from logs:
```
MATCH: failed for "Canadiens vs. Sabres" → YES="Canadiens", NO="Sabres" (yesIdx=-1, noIdx=-1)
FUZZY MATCH: "Canadiens vs. Sabres" → Buffalo Sabres vs Montréal Canadiens (100% sim)
MATCH: exact for "Buffalo Sabres vs Montréal Canadiens" → YES=Buffalo Sabres(idx0), NO=Montréal Canadiens(idx1)
```

## The Fix

The fuzzy match result should **only provide the matched bookmaker game** - not determine team order. The YES/NO assignment must ALWAYS come from the original Polymarket title.

### Technical Changes

**File**: `supabase/functions/polymarket-monitor/index.ts`

#### Change 1: Pass Original Event Name to `findBookmakerMatch`

Update the fuzzy match code path (lines 1447-1461) to pass the **original** Polymarket event name, not the reconstructed bookmaker order:

**Current (buggy)**:
```typescript
if (fuzzyResult) {
  match = findBookmakerMatch(
    `${fuzzyResult.homeTeam} vs ${fuzzyResult.awayTeam}`,  // ← Uses bookmaker order!
    event.polymarket_question || '',
    ...
  );
}
```

**Fixed**:
```typescript
if (fuzzyResult) {
  match = findBookmakerMatch(
    event.event_name,  // ← Always use original Polymarket title
    event.polymarket_question || '',
    marketType,
    [fuzzyResult.game],  // ← Pass only the matched game
    polyEventDate,
    polySlug
  );
  if (match) {
    matchMethod = 'fuzzy';
  }
}
```

#### Change 2: Apply Same Fix to AI Resolution Path (lines 1468-1482)

**Current (buggy)**:
```typescript
match = findBookmakerMatch(
  `${resolved.homeTeam} vs ${resolved.awayTeam}`,  // ← Uses AI-resolved order!
  ...
);
```

**Fixed**:
```typescript
// AI resolution should just find which game - not determine order
match = findBookmakerMatch(
  event.event_name,  // ← Always use original Polymarket title
  event.polymarket_question || '',
  marketType,
  bookmakerGames.filter(g => 
    normalizeName(`${g.home_team} ${g.away_team}`).includes(normalizeName(resolved.homeTeam)) ||
    normalizeName(`${g.home_team} ${g.away_team}`).includes(normalizeName(resolved.awayTeam))
  ),
  polyEventDate,
  polySlug
);
```

#### Change 3: Apply Same Fix to Nickname Expansion Path (lines 1430-1443)

**Current (buggy)**:
```typescript
match = findBookmakerMatch(
  `${expanded.homeTeam} vs ${expanded.awayTeam}`,  // ← Uses expanded order!
  ...
);
```

**Fixed**:
```typescript
match = findBookmakerMatch(
  event.event_name,  // ← Always use original Polymarket title
  event.polymarket_question || '',
  marketType,
  bookmakerGames,
  polyEventDate,
  polySlug
);
```

#### Change 4: Improve `findBookmakerMatch` Team Matching

The token-overlap matching at lines 885-920 needs to handle partial names (like "Canadiens" matching "Montréal Canadiens"). Update the token overlap to also check substring containment:

```typescript
// TIER 2: Token overlap OR substring containment
if (yesOutcomeIndex === -1 || noOutcomeIndex === -1) {
  // First try substring matching (handles "Canadiens" in "Montréal Canadiens")
  const substringMatch = (needle: string, haystack: string) => {
    const n = norm(needle);
    return market.outcomes.findIndex((o: any) => {
      const h = norm(o.name);
      return h.includes(n) || n.includes(h);
    });
  };
  
  if (yesOutcomeIndex === -1) {
    yesOutcomeIndex = substringMatch(polyYesTeam, '');
    if (yesOutcomeIndex !== -1) matchMethod = 'substring';
  }
  if (noOutcomeIndex === -1) {
    noOutcomeIndex = substringMatch(polyNoTeam, '');
    // Ensure not same as YES match
    if (noOutcomeIndex === yesOutcomeIndex) {
      noOutcomeIndex = market.outcomes.findIndex((o: any, i: number) => 
        i !== yesOutcomeIndex && norm(o.name).includes(norm(polyNoTeam))
      );
    }
    if (noOutcomeIndex !== -1 && matchMethod !== 'substring') matchMethod = 'substring';
  }
  
  // Fall back to token overlap if substring didn't work
  // ... existing token overlap code ...
}
```

## Summary of Changes

| Location | Change |
|----------|--------|
| Line 1451 | Use `event.event_name` instead of `fuzzyResult.homeTeam vs fuzzyResult.awayTeam` |
| Line 1469-1470 | Use `event.event_name` instead of `resolved.homeTeam vs resolved.awayTeam` |
| Line 1439-1440 | Use `event.event_name` instead of `expanded.homeTeam vs expanded.awayTeam` |
| Lines 885-920 | Add substring containment as intermediate tier before token overlap |

## Expected Results

After this fix:
- "Canadiens vs. Sabres" will always parse as YES=Canadiens, NO=Sabres
- Fuzzy/AI/Nickname matching will find the right **game** but preserve Polymarket **order**
- The signal will correctly show "Bet on Canadiens" when YES side has edge
- No more inverted mappings

## Database Cleanup

After deployment, run this query to expire the incorrectly-mapped signals:

```sql
UPDATE signal_opportunities 
SET status = 'expired' 
WHERE event_name ILIKE '%canadiens%' AND status = 'active'
```
