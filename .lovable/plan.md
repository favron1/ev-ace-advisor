

# Signal Feed Not Updating in Real-Time

## Problem Identified

You received an SMS alert about the Rangers vs. Islanders edge, and the signal **does exist** in the database with `status: active`. But it's not appearing in the feed because:

**The Signal Feed has no real-time updates.** It only loads signals:
1. When the page first loads
2. When you manually click the Refresh button
3. After running a manual scan

When the server-side polling (cron job) detects an edge and sends an SMS, it creates the signal in the database—but the frontend doesn't know to fetch it.

## Evidence

The signal is definitely in the database:
```
event_name: Rangers vs. Islanders
edge_percent: 9.34%
polymarket_volume: $979K
urgency: critical
status: active
```

## Solution: Add Real-Time Signal Updates

### Changes Required

**1. Enable Realtime on `signal_opportunities` table**

Add a database migration to include the table in Supabase Realtime:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.signal_opportunities;
```

**2. Update `useSignals.ts` hook**

Add a Supabase realtime channel subscription that listens for INSERT/UPDATE/DELETE events on `signal_opportunities`:
- On INSERT: Add the new signal to the local state
- On UPDATE: Update the signal in local state (e.g., status change)
- On DELETE: Remove the signal from local state

This way, when the cron job creates a new signal, your browser will receive it instantly without needing to refresh.

**3. Visual indicator for new signals**

Add a subtle animation or badge when a new signal arrives in real-time so you notice it immediately.

## Technical Details

### Current Flow (broken)
```text
+-------------------+     +-------------------+     +-------------------+
| Cron detects edge | --> | Inserts signal    | --> | Sends SMS         |
|                   |     | to database       |     |                   |
+-------------------+     +-------------------+     +-------------------+
                                  |
                                  v
                          (Frontend doesn't know)
```

### Fixed Flow
```text
+-------------------+     +-------------------+     +-------------------+
| Cron detects edge | --> | Inserts signal    | --> | Sends SMS         |
|                   |     | to database       |     |                   |
+-------------------+     +-------------------+     +-------------------+
                                  |
                                  v
                          +-------------------+
                          | Realtime channel  | --> Signal appears
                          | notifies frontend |     in feed instantly
                          +-------------------+
```

## Immediate Workaround

Until this is implemented, **refresh the page** or **click the refresh button** in the Signal Feed when you receive an SMS. The signal will appear.

## Files to Modify

1. `src/hooks/useSignals.ts` - Add Supabase realtime channel subscription
2. Database migration - Enable realtime for `signal_opportunities` table
3. `src/components/terminal/SignalFeed.tsx` - Optional: Add "new signal" animation

