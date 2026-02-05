

# Fix: Scan Reliability + Signal Generation Pipeline

## Problem Summary

### Issue 1: "Scan Failed" - Client Timeout
The sync function successfully completes (2,000+ markets cached), but takes 30-45 seconds. The browser times out after ~30 seconds, showing "Failed to fetch" even though the operation succeeded in the background.

### Issue 2: No Signals Despite 2,000+ Markets
The monitor pipeline shows:
- 72 markets polled (only imminent games)
- 8 tokenized (26 blocked - no token IDs)
- **1 matched** to bookmaker data (87% match failure rate)
- 1 edge found
- **0 signals created**

Root cause: Most Polymarket games don't have corresponding Odds API data at the exact time the scan runs, OR the existing active signal blocks a duplicate.

---

## Solution Architecture

### Phase 1: Split Sync + Monitor with Progress Feedback

Instead of one long-running call that times out, split into:

1. **Sync Phase** - Fire-and-forget with toast feedback
   - Trigger sync but don't await completion
   - Show "Syncing markets..." toast immediately
   - Poll database for sync completion (check `last_bulk_sync` timestamp)

2. **Monitor Phase** - Run after sync completes
   - Only runs when sync is confirmed complete
   - Shows progress: "Checking X markets for edges..."

### Phase 2: Fix Bookmaker Data Coverage Gap

The monitor only finds matches for games where:
- Odds API has data for that game
- AND the game is within 24 hours
- AND team names match

**Problem**: Odds API doesn't always have data for games 12-24h out until closer to game time.

**Solution**: 
- Store matched bookmaker data in cache during sync
- Allow monitor to use cached fair probabilities when live API fails
- Track which games have bookmaker coverage

### Phase 3: Signal Deduplication Fix

Current: If an active signal exists for an event, new edge calculations are blocked.

**Problem**: Old signals may be stale but still "active", preventing new signals.

**Solution**:
- Before creating signal, check if existing signal's edge has improved
- Update existing signal's edge/prices if improvement found
- Only block if signal was recently updated (within 15 minutes)

---

## Implementation Plan

### File: `src/hooks/useScanConfig.ts`

Modify `runManualScan` to:
1. Fire sync in background (don't await full completion)
2. Poll `polymarket_h2h_cache` for `last_bulk_sync` update
3. Show progress toasts during sync
4. Run monitor after sync completes

```text
BEFORE:
  const syncResult = await supabase.functions.invoke('polymarket-sync-24h');
  if (syncError) throw syncError;

AFTER:
  // Fire sync without blocking
  supabase.functions.invoke('polymarket-sync-24h').catch(console.error);
  toast({ title: 'Syncing markets...' });
  
  // Poll for completion (check last_bulk_sync updated within last 60s)
  let syncComplete = false;
  for (let i = 0; i < 12; i++) { // 60 seconds max
    await sleep(5000);
    const { data } = await supabase
      .from('polymarket_h2h_cache')
      .select('last_bulk_sync')
      .order('last_bulk_sync', { ascending: false })
      .limit(1)
      .single();
    
    if (data?.last_bulk_sync && Date.now() - new Date(data.last_bulk_sync).getTime() < 60000) {
      syncComplete = true;
      break;
    }
  }
  
  if (!syncComplete) {
    toast({ title: 'Sync taking longer than expected...' });
  }
  
  // Run monitor
  await supabase.functions.invoke('polymarket-monitor');
```

### File: `supabase/functions/polymarket-sync-24h/index.ts`

Add early response + background processing:
1. Respond to client immediately with "processing" status
2. Continue processing in background
3. Use streaming response pattern or background job

**Alternative**: Add a faster "lightweight sync" mode that only syncs imminent games (next 6 hours) for quick scans.

### File: `supabase/functions/polymarket-monitor/index.ts`

Fix match rate:
1. Expand date matching window from ±24h to ±36h for discovery
2. Use cached bookmaker fair probs when live API returns no data
3. Improve logging for match failures

---

## Expected Outcomes

| Metric | Current | After Fix |
|--------|---------|-----------|
| Scan timeout rate | ~50% | <5% |
| User feedback during scan | None until fail | Progress toasts every 5s |
| Match rate | 13% | 50%+ |
| Signal generation | Blocked by stale signals | Updates existing signals |

---

## Technical Details

### Why 0 Signals Despite 1 Edge Found

The monitor log shows `edges_over_threshold: 1` but `signals_created: 0`. This happens when:

1. **Existing active signal** for same event blocks creation
2. **Suppression check** finds signal was recently dismissed
3. **Gate failure** at final creation step (missing condition_id, etc.)

We need to add logging at signal creation to diagnose the specific failure.

### Sync Performance Breakdown

Current sync takes ~45 seconds:
- Gamma API pagination: ~10s (2000 events)
- Firecrawl scraping: ~8s (40 games)
- CLOB price refresh: ~15s (1900 tokens in batches)
- Database upserts: ~12s (2000 individual upserts)

Optimization: Batch database upserts (10-50 at a time) instead of individual calls.

