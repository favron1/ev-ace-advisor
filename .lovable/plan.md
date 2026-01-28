

# Morning Workflow & System Enhancement Plan

## What Happened Overnight

Your system **WAS running correctly** - the pg_cron jobs executed all night, capturing 946 probability snapshots. However:

- **Maximum movement detected: 2.34%** (Toronto vs NY Knicks)
- **Your threshold: 6%**
- **Result: No events escalated to ACTIVE state**

Without escalation, no Polymarket comparison happens, and no SMS alerts are sent. This is **working as designed** - the system only alerts on significant movements.

---

## Why You Can't See Overnight Stats

The "Polls Today" counter uses **browser localStorage**, which only counts when your browser is open. The server-side pg_cron runs independently, but there's no UI showing server-side activity.

### Enhancement: Add Server-Side Poll Stats Display

Create a new stats card showing:
- Total snapshots captured (last 24h)
- Max movement detected overnight
- Number of events being monitored
- Last cron execution time

---

## Morning Workflow Recommendations

### Step 1: Click "Full Scan" Now
Yes, do this. It will:
- Ingest fresh bookmaker odds for ALL configured sports
- Run `detect-signals` to find new events within your 24-hour horizon
- Refresh the signal feed with updated urgency labels

This is useful because overnight events may have changed or new events entered the window.

### Step 2: Check for Tennis Grand Slam Events
It's currently the **Australian Open** - you should add Tennis to your enabled sports. Tennis has:
- Higher volatility (injuries, weather, surface conditions)
- More Polymarket coverage for Grand Slams
- Sharper bookmaker movement on late-breaking news

### Step 3: Consider Lowering Movement Threshold
Your 6% threshold is conservative. For near-term events (under 12h to start), consider:
- **4% threshold** for games starting within 6 hours
- This captures "second wave" movements after initial news breaks

### Step 4: Use News Spike Mode Strategically
When you see injury reports or lineup news:
1. Click "🔥 News Spike"
2. This immediately runs a Watch Poll
3. Activates 60-second polling for 5 minutes
4. Uses looser thresholds (1.5% edge, 1h staleness)

---

## When Will You Find Something Worth Betting On?

Based on typical patterns:

| Scenario | Likelihood | When |
|----------|------------|------|
| No significant news | Low | Edges appear randomly, 0-2 per week |
| Injury announcement | Medium | Within 30 min of news breaking |
| Late lineup change | High | 1-2 hours before game time |
| Weather impact (Tennis) | Medium | Day of match |
| Star player rest news | High | When announced (often evening before) |

**Best windows for edges:**
- 2-4 hours before NBA tip-off
- Morning of Tennis matches (Australian Open timezone advantage)
- Minutes after injury tweets from beat reporters

---

## Technical Implementation

### 1. Add Server-Side Stats Panel

Create a new component showing real cron activity:

```typescript
// New stats to fetch from database
const overnightStats = {
  totalSnapshots24h: 946,
  maxMovement: 2.34,
  eventsMonitored: 9,
  lastCronExecution: "2026-01-28 19:45:52",
};
```

Query: `SELECT COUNT(*), MAX(movement_pct) FROM probability_snapshots WHERE captured_at > NOW() - INTERVAL '24 hours'`

### 2. Add Movement Alert Threshold to Settings

Allow configuring different thresholds:
- Default: 6%
- Near-term (<6h): 4%
- News Spike: 1.5%

### 3. Add Tennis to Enabled Sports

Update `scan_config.enabled_sports` to include:
- `tennis_atp_aus_open_singles`
- `tennis_wta_aus_open_singles`

### 4. Add Overnight Activity Summary

On page load, query last 24h activity:
- Show "Overnight: 946 snapshots, 9 events, max move 2.3%"
- Helps you understand what happened while sleeping

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/terminal/StatsBar.tsx` | Add overnight activity stats |
| `src/pages/Terminal.tsx` | Fetch server-side poll stats on load |
| `src/hooks/useWatchState.ts` | Add query for overnight movement summary |
| `src/pages/Settings.tsx` | Add Tennis sports toggle |
| Database | Query for overnight stats |

---

## Immediate Actions (Now)

1. **Click "Full Scan"** - Refresh all bookmaker odds and signals
2. **Click "Watch Poll"** - Check current movement candidates
3. **Add Tennis** - Go to Settings, add Australian Open sports
4. **Enable Notifications** - Ensure browser notifications are ON
5. **Consider lowering threshold** - Change movement_threshold_pct from 6 to 4

---

## Expected Outcome

After these changes:
- You'll see overnight activity in the UI
- More events will qualify for ACTIVE monitoring (with 4% threshold)
- Tennis events will be included
- Better visibility into when edges might appear

**Reality check**: Even with perfect setup, tradable edges (3-8%) only appear during information shocks. On quiet nights with no news, 0 alerts is the expected outcome. The system is working - markets were just stable overnight.

