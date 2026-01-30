

# Clean Up Non-Tradeable Markets

## Current State

| Market Type | Count | With NULL League | Status |
|-------------|-------|------------------|--------|
| futures | 1,356 | 1,355 | DELETE - MVP, DPOY, Olympics, etc. |
| h2h | 219 | 12 | KEEP - game matchups |
| prop | 75 | 75 | DELETE - generic props |
| total | 35 | 33 | KEEP - over/under |
| player_prop | 12 | 12 | DELETE - no bookmaker API |
| spread | 1 | 0 | KEEP - handicap |

**Examples of futures to delete:**
- "Will Keon Ellis win the 2025–2026 NBA Defensive Player of the Year?"
- "Will the Philadelphia 76ers win the 2026 NBA Finals?"
- "Will Finland win the Men's Ice Hockey gold medal at the 2026 Winter Olympics?"

---

## Implementation Steps

### Step 1: Delete Legacy Non-Tradeable Markets from Database

Execute SQL to remove futures, props, and player_props that have no bookmaker coverage:

```sql
-- Remove futures (MVP, DPOY, Championship, Olympics, Hart Trophy)
DELETE FROM polymarket_h2h_cache 
WHERE market_type = 'futures' AND status = 'active';

-- Remove generic props (no bookmaker API)
DELETE FROM polymarket_h2h_cache 
WHERE market_type IN ('prop', 'player_prop') AND status = 'active';

-- Clean up orphaned watch states
DELETE FROM event_watch_state 
WHERE event_key LIKE 'poly_%'
  AND (
    polymarket_question ILIKE ANY (ARRAY[
      '%mvp%', '%dpoy%', '%opoy%', '%champion%', 
      '%olympic%', '%award%', '%trophy%', '%coach%',
      '%winner%2026%', '%division%winner%'
    ])
  );
```

**Impact**: Removes ~1,443 non-tradeable entries

### Step 2: Harden Sync Filter with Explicit Keyword Blocklist

Add a regex blocklist to `polymarket-sync-24h/index.ts` that catches edge cases the `marketType === 'futures'` check might miss:

```typescript
// NON_TRADEABLE_KEYWORDS - explicit blocklist for markets without bookmaker coverage
const NON_TRADEABLE_KEYWORDS = [
  /championship/i, /champion/i, /mvp/i, /dpoy/i, /opoy/i,
  /award/i, /trophy/i, /coach of the year/i,
  /olympic/i, /gold medal/i, /world series winner/i,
  /super bowl winner/i, /winner.*202[6-9]/i,
  /coach.*year/i, /rookie.*year/i, /division.*winner/i,
  /conference.*winner/i, /finals.*winner/i
];

// Inside market loop, BEFORE upsert (around line 376):
const combinedText = `${title} ${question}`;
const isNonTradeable = NON_TRADEABLE_KEYWORDS.some(p => p.test(combinedText));

if (isNonTradeable) {
  console.log(`[SKIP] Non-tradeable: ${question.substring(0, 50)}`);
  continue;
}
```

---

## Files to Modify

1. **supabase/functions/polymarket-sync-24h/index.ts**
   - Add `NON_TRADEABLE_KEYWORDS` constant after line 107
   - Add blocklist check in market loop before upsert (around line 376)
   - Add counter for skipped non-tradeable markets in stats

---

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Total markets | 1,698 | ~255 |
| Futures | 1,356 | 0 |
| Props | 87 | 0 |
| H2H | 219 | 219 |
| Totals | 35 | 35 |
| Spreads | 1 | 1 |

- Cache contains only actionable game-specific markets
- Future syncs automatically block non-tradeable categories
- Monitoring resources focused on edge detection, not clutter

