
# Automated Polling + Notifications System - Complete Implementation Plan

## Overview

This plan implements a **fully automated "set and forget" workflow** with two key features:

1. **Auto-Polling Engine** - Runs Watch Poll every 5 minutes and Active Poll every 60 seconds automatically
2. **Notification System** - Alerts you immediately when a CONFIRMED EDGE signal is detected

After implementation, your daily workflow becomes:
1. Open app in the morning
2. Toggle "Auto-Poll" ON
3. Toggle "Notifications" ON
4. Go about your day
5. Receive alerts when edges are confirmed
6. Execute trades promptly
7. Close app at end of day

---

## Feature 1: Auto-Polling Engine

### What It Does
- Runs **Watch Mode Poll** every 5 minutes automatically (collects baseline data, detects movement)
- Runs **Active Mode Poll** every 60 seconds automatically (only when active events exist)
- Pauses intelligently when approaching API limits or when browser tab is hidden
- Shows countdown timers so you know when the next poll will run

### New Hook: `useAutoPolling.ts`

```text
Core Logic:
1. When enabled, start two intervals:
   - watchInterval = setInterval(runWatchModePoll, 5 minutes)
   - activeInterval = setInterval(runActiveModePoll, 60 seconds)
   
2. Safeguards:
   - Skip poll if already polling (prevent overlap)
   - Pause if daily API usage > 90%
   - Pause if scanning_paused = true in config
   - Pause if document.visibilityState === 'hidden' (optional)
   
3. State tracking:
   - nextWatchPollAt: Date
   - nextActivePollAt: Date
   - pollsToday: number
   - isAutoPolling: boolean
```

### UI Changes to Scan Control Panel

```text
┌─────────────────────────────────────────┐
│ 🔄 Automation & Alerts                  │
│                                         │
│ Auto-Polling: [==== Toggle ON ====]     │
│ Notifications: [==== Toggle ON ====]    │
│                                         │
│ Watch Poll:  Next in 3:42               │
│ Active Poll: Next in 0:28               │
│                                         │
│ Status: ● Running (12 polls today)      │
└─────────────────────────────────────────┘
```

---

## Feature 2: Notification System

### What It Does
- Sends **browser push notification** when a signal reaches CONFIRMED state
- Plays **audio alert** sound so you hear it even if not looking at screen
- Shows **visual indicator** in the header (pulsing red dot)
- Works even when browser tab is in background

### New Hook: `useNotifications.ts`

```text
Core Logic:
1. requestPermission() - Ask browser for notification permission
2. notify(title, body) - Send notification + play sound
3. Track permission state: 'default' | 'granted' | 'denied'

Features:
- Browser Notification API integration
- Audio playback using HTMLAudioElement
- Permission state persistence in localStorage
- Respects user toggle for notifications
```

### Triggering Notifications

The existing realtime subscription in `useWatchState.ts` will be enhanced:

```text
Current:
- Subscription fires on any change
- Calls fetchWatchStates() to refresh UI

Enhanced:
- Track previous confirmed events in a ref
- Compare new confirmed events with previous
- If new confirmed event detected → call notify()
- Pass event details: "EDGE DETECTED: Lakers vs Celtics +3.2%"
```

### Audio Alert

A new sound file `public/sounds/notification.mp3` will be added - a short, attention-grabbing ping.

### Visual Alert in Header

```text
Current Header:
┌────────────────────────────────────┐
│ ⚡ SIGNAL TERMINAL   [Run] [⚙️] [↪]│
└────────────────────────────────────┘

Enhanced Header:
┌────────────────────────────────────┐
│ ⚡ SIGNAL TERMINAL 🔴 [Run] [⚙️] [↪]│
└────────────────────────────────────┘
                     ↑
              Pulsing red dot when
              unviewed confirmed signals exist
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useAutoPolling.ts` | Browser interval management for automated polling |
| `src/hooks/useNotifications.ts` | Browser notification permission and sending |
| `public/sounds/notification.mp3` | Alert sound file |

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWatchState.ts` | Add notification trigger on new confirmed events |
| `src/components/terminal/ScanControlPanel.tsx` | Add Auto-Polling toggle, countdown timers, Notifications toggle |
| `src/components/terminal/Header.tsx` | Add visual alert indicator for unviewed confirmed signals |
| `src/pages/Terminal.tsx` | Integrate both hooks and coordinate state |

---

## Technical Implementation Details

### 1. useAutoPolling.ts

```typescript
interface AutoPollingState {
  isEnabled: boolean;
  isRunning: boolean;
  nextWatchPollAt: Date | null;
  nextActivePollAt: Date | null;
  pollsToday: number;
  watchCountdown: string; // "4:32" format
  activeCountdown: string; // "0:28" format
}

// Key functions:
// - enable() / disable() - toggle automation
// - Interval management with cleanup on unmount
// - Countdown timer updates every second
// - Integration with existing runWatchModePoll/runActiveModePoll
```

### 2. useNotifications.ts

```typescript
interface NotificationsState {
  permission: NotificationPermission;
  enabled: boolean;
  hasUnviewedConfirmed: boolean;
}

// Key functions:
// - requestPermission() - prompt user for browser permission
// - notify(title, body, options) - send notification + play sound
// - markViewed() - clear the unviewed indicator
// - Toggle enabled state with localStorage persistence
```

### 3. Notification Trigger in useWatchState.ts

```typescript
// Add ref to track previous confirmed events
const previousConfirmedRef = useRef<Set<string>>(new Set());

// In realtime subscription handler:
const newConfirmed = events.filter(e => e.watch_state === 'confirmed');
const previousIds = previousConfirmedRef.current;

for (const event of newConfirmed) {
  if (!previousIds.has(event.id)) {
    // This is a NEW confirmed event!
    notify(
      `EDGE DETECTED: ${event.event_name}`,
      `+${event.movement_pct.toFixed(1)}% movement confirmed. Execute now!`
    );
  }
}

// Update ref for next comparison
previousConfirmedRef.current = new Set(newConfirmed.map(e => e.id));
```

---

## Safeguards Built In

| Safeguard | Description |
|-----------|-------------|
| **API Limit Protection** | Auto-pause polling when daily usage > 90% |
| **Overlap Prevention** | Skip poll if previous poll still running |
| **Tab Visibility** | Optional pause when tab is hidden (saves resources) |
| **Manual Override** | Clicking manual poll buttons works even with auto-polling on |
| **Graceful Cleanup** | All intervals cleared on unmount/disable |
| **Permission Handling** | Graceful fallback if notifications denied |

---

## User Experience Flow

```text
Morning:
┌─────────────────────────────────────────────────────┐
│ 1. Open app                                         │
│ 2. Toggle Auto-Polling ON                           │
│ 3. Toggle Notifications ON (grants permission)      │
│ 4. Minimize or switch to other work                 │
└─────────────────────────────────────────────────────┘
                           ↓
During Day (Automated):
┌─────────────────────────────────────────────────────┐
│ • Watch Poll runs every 5 minutes                   │
│ • Snapshots build up, movement detected             │
│ • Events escalate to ACTIVE                         │
│ • Active Poll runs every 60 seconds                 │
│ • Persistence confirmed → CONFIRMED EDGE            │
└─────────────────────────────────────────────────────┘
                           ↓
Alert Received:
┌─────────────────────────────────────────────────────┐
│ 🔔 Browser notification appears                     │
│ 🔊 Sound plays                                      │
│ 🔴 Header shows pulsing indicator                   │
│                                                     │
│ → You click notification or return to tab           │
│ → Review the confirmed signal                       │
│ → Execute on Polymarket                             │
└─────────────────────────────────────────────────────┘
                           ↓
Evening:
┌─────────────────────────────────────────────────────┐
│ Toggle OFF or close browser                         │
│ Repeat tomorrow                                     │
└─────────────────────────────────────────────────────┘
```

---

## Summary

This implementation gives you a complete hands-off monitoring system:

| Feature | Benefit |
|---------|---------|
| Auto Watch Poll (5 min) | Builds movement history automatically |
| Auto Active Poll (60 sec) | Confirms persistence without manual clicks |
| Browser Notifications | Alerts even when tab is in background |
| Sound Alerts | You hear it even if not looking |
| Visual Indicator | See at a glance if new edges exist |
| Smart Safeguards | Won't exceed API limits or waste resources |

After implementation, you truly can open the app once in the morning, enable automation, and be notified instantly when tradable edges are confirmed.
