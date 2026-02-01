
# Fix Token Resolution: Restore Signal Pipeline

## Problem Diagnosis

Based on my investigation, I've identified **the critical issue** blocking signals:

### Current State
| Metric | Value |
|--------|-------|
| Watching markets | 281 |
| Markets with bookmaker time | 24 (8.5%) |
| Active signals | **0** |
| Recent bookmaker signals | 44,736 ✅ |
| Sharp book snapshots (1h) | 2,840 ✅ |

### Pipeline Funnel Analysis
From the monitor logs:
```
48 watching → 3 tokenized (45 blocked) → 3 matched → 0 edges → 0 signals
```

**Root Cause: Token Resolution Failure**

| Source | Total | With Tokens | Rate |
|--------|-------|-------------|------|
| api | 1,231 | 1,231 | 100% ✅ |
| gamma-api | 75 | 75 | 100% ✅ |
| firecrawl | 45 | 0 | **0%** ❌ |

The Firecrawl-scraped games (NBA, NHL) have **0% tokenization**. The backfill logic in `polymarket-sync-24h` uses `lookupClobVolumeFromCache()` which queries the pre-fetched Gamma API data - but **NBA/NHL games often don't have matching Gamma API events** (they use Firecrawl precisely because Gamma doesn't list them).

---

## Fix Strategy

### Option A: Proactive Token Repair in polymarket-monitor (Recommended)

Instead of relying on sync-24h backfill (which doesn't work), make the monitor **self-healing** by calling the tokenize-market service for untokenized markets.

**Changes to `polymarket-monitor/index.ts`:**

1. Before the HARD_GATE check, attempt token resolution for markets missing tokens
2. Call the existing `tokenize-market` edge function which has 4 extractors:
   - CLOB API direct
   - Gamma API search
   - Firecrawl HTML scrape
   - CLOB search API

This is the most robust approach because:
- Uses all 4 token extractors in priority order
- Only runs for markets that need it (not all 48)
- Self-heals on every poll cycle
- Existing tokenize-market function is proven to work

### Option B: Batch Token Repair Job (Alternative)

Create a scheduled job that runs independently to repair tokens:
- Query all `firecrawl` source markets with NULL tokens
- Call tokenize-market for each
- Update cache with results

Less ideal because it adds another scheduled task.

---

## Implementation Details

### File: `supabase/functions/polymarket-monitor/index.ts`

**Add near line 1536 (before HARD_GATE check):**

```typescript
// ============= TOKEN REPAIR PATH =============
// If market has no tokens, try to resolve them via tokenize-market
const MAX_TOKEN_REPAIRS_PER_RUN = 10;
let tokenRepairsThisRun = 0;

// ... inside the main event loop, before the HARD_GATE ...

if (!tokenIdYes && tokenRepairsThisRun < MAX_TOKEN_REPAIRS_PER_RUN) {
  // Try to repair tokens using the tokenize-market service
  const teamHome = cache?.team_home || '';
  const teamAway = cache?.team_away || '';
  const sport = cache?.extracted_league || 'sports';
  const conditionId = event.polymarket_condition_id;
  
  if (teamHome && teamAway) {
    console.log(`[POLY-MONITOR] TOKEN_REPAIR_ATTEMPT: ${teamHome} vs ${teamAway}`);
    tokenRepairsThisRun++;
    
    try {
      // Call tokenize-market edge function
      const tokenResult = await supabase.functions.invoke('tokenize-market', {
        body: {
          condition_id: conditionId,
          team_home: teamHome,
          team_away: teamAway,
          sport: sport,
          update_cache: true, // Auto-update cache on success
        }
      });
      
      if (tokenResult.data?.success) {
        // Use the newly resolved tokens
        tokenIdYes = tokenResult.data.token_id_yes;
        cache.token_id_yes = tokenIdYes;
        cache.token_id_no = tokenResult.data.token_id_no;
        console.log(`[POLY-MONITOR] TOKEN_REPAIR_SUCCESS: ${teamHome} vs ${teamAway} → ${tokenIdYes?.slice(0, 16)}...`);
      } else {
        console.log(`[POLY-MONITOR] TOKEN_REPAIR_FAILED: ${teamHome} vs ${teamAway} → ${tokenResult.data?.untradeable_reason || 'unknown'}`);
      }
    } catch (e) {
      console.log(`[POLY-MONITOR] TOKEN_REPAIR_ERROR: ${(e as Error).message}`);
    }
  }
}
```

### File: `supabase/functions/tokenize-market/index.ts`

**Add `update_cache` parameter support** to auto-update the h2h cache when tokens are resolved:

```typescript
// In the request handler, after successful tokenization:
if (body.update_cache && result.success && result.conditionId) {
  await supabase
    .from('polymarket_h2h_cache')
    .update({
      token_id_yes: result.tokenIdYes,
      token_id_no: result.tokenIdNo,
      token_source: result.tokenSource,
      tradeable: true,
      untradeable_reason: null,
      last_token_repair_at: new Date().toISOString(),
    })
    .eq('condition_id', result.conditionId);
}
```

---

## Expected Outcome

After implementation:

| Metric | Before | After |
|--------|--------|-------|
| Firecrawl token rate | 0% | 60-80% |
| Markets passing HARD_GATE | 3/48 | 30-40/48 |
| Potential signals | 0 | 5-15 (depending on edges) |

The monitor will self-heal on each 5-minute poll:
1. First poll: Repairs up to 10 markets
2. Second poll: Repairs another 10
3. By third poll: Most markets tokenized, signals can flow

---

## Technical Notes

- Rate limit: 10 repairs per poll prevents timeout
- Caching: Successfully repaired tokens are persisted to DB
- Fallback: Markets that can't be tokenized are marked untradeable (won't retry every cycle due to `last_token_repair_at`)
- The tokenize-market function already has a proven 4-tier extractor chain

