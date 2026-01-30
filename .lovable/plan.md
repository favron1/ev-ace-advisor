

# Clean Up Non-Tradeable Markets

## Problem

The database contains **1,356 futures markets** that cannot be traded using the arbitrage engine:

| Market Type | Count | Why Non-Tradeable |
|-------------|-------|-------------------|
| MVP Awards | 200+ | No bookmaker API for player awards |
| DPOY/OPOY | 100+ | No bookmaker API for player awards |
| Championship Futures | 200+ | Too far out (Feb-July 2026) |
| Olympics 2026 | 50+ | No bookmaker API coverage |
| Hart Trophy | 20+ | NHL award - no API |
| Props (generic) | 75 | Mixed - some tradeable, most not |

These markets:
- Waste API monitoring resources
- Clutter the cache with non-actionable data
- Will **never** generate tradeable signals

## Solution

### 1. Delete Legacy Futures from Cache

Run a cleanup to remove all `market_type = 'futures'` entries:

```sql
-- Remove 1,356 non-tradeable futures
DELETE FROM polymarket_h2h_cache 
WHERE market_type = 'futures' 
  AND status = 'active';

-- Also remove associated watch states
DELETE FROM event_watch_state 
WHERE event_key LIKE 'poly_%'
  AND polymarket_question ILIKE ANY (ARRAY[
    '%mvp%', '%dpoy%', '%opoy%', '%champion%', 
    '%olympic%', '%award%', '%trophy%', '%coach%'
  ]);
```

### 2. Tighten Sync Filter

The sync already skips `marketType === 'futures'` (line 331), but add an **additional explicit keyword block** to catch edge cases:

```typescript
// NEW: Explicit keyword blocklist for non-tradeable markets
const NON_TRADEABLE_KEYWORDS = [
  /championship/i, /champion/i, /mvp/i, /dpoy/i, /opoy/i,
  /award/i, /trophy/i, /coach of the year/i,
  /olympic/i, /gold medal/i, /world series winner/i,
  /super bowl winner/i, /winner.*202[6-9]/i,
  /coach.*year/i, /rookie.*year/i
];

// Inside market loop, BEFORE upsert:
const isNonTradeable = NON_TRADEABLE_KEYWORDS.some(p => 
  p.test(question) || p.test(title)
);

if (isNonTradeable) {
  console.log(`[SKIP] Non-tradeable: ${question.substring(0, 50)}`);
  continue;
}
```

### 3. Keep Only Game-Specific Markets

After cleanup, the cache will contain:
- **H2H** (219) - Game matchups with bookmaker coverage
- **Totals** (35) - Over/Under for specific games
- **Spreads** (1) - Point spreads for specific games
- **Player Props** (12) - May keep for future expansion

---

## Files to Modify

1. **supabase/functions/polymarket-sync-24h/index.ts**
   - Add `NON_TRADEABLE_KEYWORDS` blocklist
   - Skip markets matching these patterns
   - Log skipped counts for transparency

---

## Expected Outcome

- Cache drops from **1,698 markets** to **~267 actionable markets**
- Monitoring focuses exclusively on game-specific edges
- No more Olympics, MVP, or Coach of the Year clutter
- Same 24h rolling window, just cleaner data

