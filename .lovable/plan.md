
## Plan: Fix Polymarket-First Scan Flow

### Problem Identified

The "Full Scan" button calls `detect-signals` which works **backwards**:
1. Fetches bookmaker signals first
2. Tries to match them against Polymarket cache
3. Signals without Polymarket match get `is_true_arbitrage: false` → hidden from feed

The correct **Polymarket-First** architecture already exists in `polymarket-monitor`, but the UI isn't wired to use it properly for the main scan.

---

### Root Cause

When you click "Full Scan":
- It calls `ingest-odds` (bookmaker data) → then `detect-signals`
- `detect-signals` starts from bookmaker data and tries to find Polymarket matches
- If Polymarket has no market for an event, the signal is created but hidden

The "Watch Poll" button correctly uses `polymarket-monitor` which starts from Polymarket markets, but:
- It only processes markets with `monitoring_status = 'watching'`
- New markets aren't automatically set to watching

---

### Solution: Rewire Full Scan to be Polymarket-First

**Step 1: Update Full Scan to sync Polymarket first, then monitor**

Modify the scan flow to:
1. Call `polymarket-sync-24h` to refresh the market cache
2. Call `polymarket-monitor` to check edges against bookmaker data
3. Remove the bookmaker-first `detect-signals` path for H2H

**Step 2: Auto-set new markets to "watching"**

In `polymarket-sync-24h`, automatically set `monitoring_status = 'watching'` for newly discovered markets within 24h (already partially implemented).

**Step 3: Update UI messaging**

Change the toast messages to reflect the Polymarket-first flow:
- "Syncing Polymarket markets..."
- "Checking X markets for edges..."

---

### Technical Changes

**File: `src/hooks/useSignals.ts`**

Update `runDetection`:
```typescript
const runDetection = useCallback(async () => {
  // Step 1: Sync Polymarket markets (24h window)
  toast({ title: 'Syncing Polymarket markets...' });
  const syncResult = await supabase.functions.invoke('polymarket-sync-24h', {});
  
  // Step 2: Run monitor to check edges
  toast({ title: 'Checking for edges...' });
  const monitorResult = await supabase.functions.invoke('polymarket-monitor', {});
  
  await fetchSignals();
  
  toast({
    title: 'Scan Complete',
    description: `Found ${monitorResult.data?.edges_found || 0} opportunities from ${syncResult.data?.total_markets || 0} markets.`,
  });
}, []);
```

**File: `supabase/functions/polymarket-sync-24h/index.ts`**

Ensure newly synced markets are set to watching:
```typescript
// In the upsert section, add:
monitoring_status: 'watching', // Auto-watch all markets in 24h window
```

**File: `supabase/functions/polymarket-monitor/index.ts`**

The monitor already works correctly (Polymarket-first), just needs to be called after sync.

---

### What This Fixes

| Before | After |
|--------|-------|
| Finds 2 bookmaker edges, no Polymarket match → hidden | Starts from Polymarket, only shows tradeable edges |
| Toast says "2 opportunities" but feed is empty | Toast accurately reflects tradeable edges found |
| Manual sync required to see Polymarket markets | Full Scan auto-syncs Polymarket first |

---

### Implementation Steps

1. **Modify `useSignals.ts`** - Update `runDetection` to call sync → monitor
2. **Update `polymarket-sync-24h`** - Auto-set `monitoring_status = 'watching'` for new markets
3. **Update toast messages** - Reflect the Polymarket-first flow
4. **Optional**: Rename button from "Full Scan" to "Scan Markets" for clarity
