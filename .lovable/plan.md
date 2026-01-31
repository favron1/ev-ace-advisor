

# Fix: Countdown Timer Bug + Add "Sync Polymarket" Button

## Problems Identified

### Problem 1: Wrong Countdown Timer
The screenshot shows "11h 37m to kickoff" for Michigan Wolverines vs Michigan State Spartans, but the game is actually LIVE. This causes:
- **Missed bets** - you see the signal but think you have 11 hours
- **Wrong urgency badge** - shows "NORMAL" instead of "CRITICAL" or "LIVE"

**Root Cause**: The `expires_at` field is set from `commence_time` in the backend, but this date is being stored incorrectly (likely from Gamma API's `endDate` instead of actual game time for college basketball).

### Problem 2: Missing "Sync Polymarket" Button
There's no way to just sync Polymarket markets without doing a full bookmaker comparison scan. You need:
- A quick sync to update slugs, prices, and kickoff times
- Full Scan for the complete edge detection workflow

---

## Solution Overview

### Fix 1: Add LIVE/STARTED State Detection
Instead of trusting `expires_at`, calculate whether the game has started by checking:
1. If `expires_at` is in the past → Show "LIVE" or "STARTED" badge
2. Disable execution buttons for started games
3. Keep the card visible but clearly marked as no longer tradeable

### Fix 2: Add "Sync Polymarket" Button
Add a new button in the Scan Control Panel that only calls `polymarket-sync-24h` without the monitor step. This:
- Updates all cached market slugs (for working links)
- Refreshes kickoff times from Odds API cross-reference
- Is faster than Full Scan (no bookmaker API calls)

### Fix 3: Backend - Improve Kickoff Time Accuracy
Update `polymarket-sync-24h` to prioritize Odds API `commence_time` when available (most accurate for actual game start) over Gamma API dates.

---

## Technical Changes

### 1. Frontend - SignalCard.tsx

**Add LIVE detection logic:**
```typescript
// Calculate if event has started
const hasStarted = signal.expires_at 
  ? new Date(signal.expires_at) <= new Date() 
  : false;

// Update countdown display
const countdown = hasStarted 
  ? { text: 'LIVE', urgent: true } 
  : formatCountdown(hoursUntilEvent);
```

**Update execution gate:**
```typescript
// Gate 0: Event already started
if (hasStarted) {
  return { allowed: false, reason: 'Game started' };
}
```

**Visual state for LIVE games:**
- Show "LIVE" or "STARTED" badge (pulsing red)
- Grey out execute button with "Game Started" message
- Keep card visible but clearly marked

### 2. Frontend - ScanControlPanel.tsx

**Add new "Sync Polymarket" button:**
```typescript
{onSyncPolymarket && (
  <Button 
    onClick={onSyncPolymarket}
    disabled={syncing || scanning}
    variant="outline"
    className="w-full gap-2"
    size="sm"
  >
    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
    Sync Polymarket
  </Button>
)}
```

Position it above the Watch Poll / Active Poll buttons.

### 3. Frontend - Terminal.tsx

**Add sync state and handler:**
```typescript
const [syncing, setSyncing] = useState(false);

const handleSyncPolymarket = async () => {
  setSyncing(true);
  try {
    const result = await supabase.functions.invoke('polymarket-sync-24h');
    toast({
      title: 'Polymarket Synced',
      description: `${result.data?.qualifying_events || 0} markets updated`,
    });
    await fetchSignals(); // Refresh signals to get new slugs
  } catch (err) {
    toast({ title: 'Sync failed', variant: 'destructive' });
  } finally {
    setSyncing(false);
  }
};
```

Pass to ScanControlPanel: `onSyncPolymarket={handleSyncPolymarket}`.

### 4. Frontend - useScanConfig.ts

No changes needed - the sync function is already available as `polymarket-sync-24h`.

### 5. Backend - polymarket-sync-24h (Already Fixed)

The backend already prioritizes Odds API for kick-off times (code at lines 376-401). The issue is the existing signals were created before this fix was deployed.

After running "Sync Polymarket":
- Kick-off times will be updated from Odds API
- Slugs will be populated for working links
- The countdown will show correctly

---

## UI Behavior Summary

| Signal State | Countdown Display | Execute Button | Card Visibility |
|--------------|-------------------|----------------|-----------------|
| >2h to start | "Xh Ym to kickoff" | Enabled | Normal |
| <2h to start | "Xm to kickoff" (pulsing red) | Enabled | Normal |
| Started | "LIVE" (pulsing red badge) | Disabled: "Game Started" | Visible but greyed |

---

## Files to Update

| File | Changes |
|------|---------|
| `src/components/terminal/SignalCard.tsx` | Add LIVE detection, update countdown logic, disable execution for started games |
| `src/components/terminal/ScanControlPanel.tsx` | Add "Sync Polymarket" button with props |
| `src/pages/Terminal.tsx` | Add `syncing` state and `handleSyncPolymarket` handler |

---

## After This Change

1. **Click "Sync Polymarket"** → Updates all market slugs and kickoff times
2. **Cards for started games** → Show "LIVE" badge, execution disabled
3. **"Trade on Poly" links** → Will work correctly using slugs
4. **Countdown timers** → Will show accurate time based on Odds API

