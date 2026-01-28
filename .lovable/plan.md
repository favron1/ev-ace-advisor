
# Plan: Shift Market Focus to Short-Term H2H + Add News-Spike Mode

## Summary

This plan implements your approved changes with all required edits:
- **FocusMode parameter** (h2h_only | all | futures_only) - default h2h_only
- **Deprioritize futures** by default (keep code, skip unless explicitly requested)
- **Reorder sport priority**: NBA, UFC, Tennis, NFL, NHL, Soccer
- **News Spike Mode**: 5-minute high-frequency burst with 10-minute cooldown
- **Year-round tennis coverage**: All ATP/WTA tournaments (not just slams)
- **Configurable thresholds**: Staleness and edge overrides for spike mode only

---

## Files to Modify

| File | Purpose |
|------|---------|
| `supabase/functions/detect-signals/index.ts` | Add focusMode, configurable staleness/edge overrides |
| `supabase/functions/ingest-odds/index.ts` | Reorder H2H priority, expand tennis tournaments |
| `src/hooks/useAutoPolling.ts` | Add triggerNewsSpike(), cooldown logic |
| `src/components/terminal/ScanControlPanel.tsx` | Add News Spike button with countdown |
| `src/pages/Terminal.tsx` | Wire up news spike state |
| `src/types/scan-config.ts` | Expand available sports list |

---

## Implementation Details

### 1. detect-signals/index.ts - FocusMode + Configurable Thresholds

**Add new request parameters:**
```typescript
interface RequestBody {
  eventHorizonHours?: number;
  minEventHorizonHours?: number;
  minEdgeThreshold?: number;
  focusMode?: 'h2h_only' | 'all' | 'futures_only';  // NEW
  stalenessHoursOverride?: number;  // NEW - for spike mode
  minEdgeOverride?: number;  // NEW - for spike mode (1.5% during spike)
}
```

**Configuration logic:**
- Default `focusMode: 'h2h_only'` - skip futures processing loop
- Default staleness: 2 hours (unchanged)
- Default min edge: 2.0% (unchanged)
- Spike mode overrides: `stalenessHoursOverride: 1`, `minEdgeOverride: 1.5`

**Processing logic:**
```text
if focusMode === 'h2h_only':
  - Process H2H signals only
  - Skip championship futures loop entirely

if focusMode === 'all':
  - Process both H2H and futures (current behavior)

if focusMode === 'futures_only':
  - Skip H2H, only process futures
```

---

### 2. ingest-odds/index.ts - Sport Priority + Year-Round Tennis

**Reordered H2H sports list (priority order):**
```typescript
const h2hSports = [
  // TOP PRIORITY: Short-term, news-sensitive markets
  'basketball_nba',
  'mma_mixed_martial_arts',
  
  // TENNIS: All available tournaments for year-round coverage
  'tennis_atp_aus_open_singles',
  'tennis_atp_french_open',
  'tennis_atp_wimbledon',
  'tennis_atp_us_open',
  'tennis_atp_indian_wells',
  'tennis_atp_miami_open',
  'tennis_atp_monte_carlo_masters',
  'tennis_atp_madrid_open',
  'tennis_atp_italian_open',
  'tennis_atp_cincinnati_open',
  'tennis_atp_canadian_open',
  'tennis_atp_shanghai_masters',
  'tennis_atp_paris_masters',
  'tennis_atp_qatar_open',
  'tennis_atp_dubai',
  'tennis_atp_china_open',
  'tennis_wta_aus_open_singles',
  'tennis_wta_french_open',
  'tennis_wta_wimbledon',
  'tennis_wta_us_open',
  'tennis_wta_indian_wells',
  'tennis_wta_miami_open',
  'tennis_wta_madrid_open',
  'tennis_wta_italian_open',
  'tennis_wta_cincinnati_open',
  'tennis_wta_canadian_open',
  'tennis_wta_china_open',
  'tennis_wta_wuhan_open',
  'tennis_wta_qatar_open',
  'tennis_wta_dubai',
  
  // OTHER H2H
  'americanfootball_nfl',
  'icehockey_nhl',
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'basketball_euroleague',
];
```

**Note:** The Odds API does NOT have general `tennis_atp_singles` keys. Coverage is tournament-specific - the API only returns data when a tournament is "in season". By including all 30+ tournaments, we ensure year-round coverage (one is always running).

---

### 3. useAutoPolling.ts - News Spike Mode

**New state:**
```typescript
interface AutoPollingState {
  // ... existing fields
  newsSpikeActive: boolean;
  newsSpikeEndsAt: Date | null;
  spikeCountdown: string;
  cooldownActive: boolean;
  cooldownEndsAt: Date | null;
}
```

**New function: `triggerNewsSpike()`**
```text
1. Check if cooldown is active → if yes, return early with toast
2. Run immediate Watch Poll
3. Set newsSpikeActive = true
4. Set newsSpikeEndsAt = now + 5 minutes
5. Override active poll interval to 60s
6. Set stalenessHoursOverride = 1 (passed to detect-signals)
7. Set minEdgeOverride = 1.5 (passed to detect-signals)
8. Start countdown timer
9. After 5 minutes: auto-disable spike, start 10-minute cooldown
```

**Cooldown logic:**
- Cannot trigger News Spike for 10 minutes after previous spike ends
- Visual indicator shows cooldown remaining

---

### 4. ScanControlPanel.tsx - News Spike Button

**New UI element:**
```text
+------------------------------------------+
|  [🔥 News Spike]  |  Cooldown: --:--     |
+------------------------------------------+
```

**Button behavior:**
- Orange/red styling when available
- Disabled + gray when cooldown active or spike running
- Shows countdown during spike: "Spike Active: 4:32"
- Shows cooldown after spike: "Cooldown: 9:15"
- Tooltip: "Trigger 5-min high-frequency polling after news breaks"

---

### 5. Terminal.tsx - Wire Up Spike State

**Pass spike controls to components:**
```typescript
const {
  // ... existing
  triggerNewsSpike,
  newsSpikeActive,
  spikeCountdown,
  cooldownActive,
  cooldownCountdown,
} = useAutoPolling({...});

// Pass to ScanControlPanel
<ScanControlPanel
  // ... existing
  onTriggerNewsSpike={triggerNewsSpike}
  newsSpikeActive={newsSpikeActive}
  spikeCountdown={spikeCountdown}
  cooldownActive={cooldownActive}
  cooldownCountdown={cooldownCountdown}
/>
```

---

### 6. scan-config.ts - Expand Available Sports

**Updated AVAILABLE_SPORTS list:**
```typescript
export const AVAILABLE_SPORTS = [
  { key: 'basketball_nba', label: 'NBA Basketball', icon: '🏀' },
  { key: 'mma_mixed_martial_arts', label: 'MMA / UFC', icon: '🥊' },
  
  // Tennis Grand Slams
  { key: 'tennis_atp_aus_open_singles', label: 'ATP Australian Open', icon: '🎾' },
  { key: 'tennis_atp_french_open', label: 'ATP French Open', icon: '🎾' },
  { key: 'tennis_atp_wimbledon', label: 'ATP Wimbledon', icon: '🎾' },
  { key: 'tennis_atp_us_open', label: 'ATP US Open', icon: '🎾' },
  { key: 'tennis_wta_aus_open_singles', label: 'WTA Australian Open', icon: '🎾' },
  { key: 'tennis_wta_french_open', label: 'WTA French Open', icon: '🎾' },
  { key: 'tennis_wta_wimbledon', label: 'WTA Wimbledon', icon: '🎾' },
  { key: 'tennis_wta_us_open', label: 'WTA US Open', icon: '🎾' },
  
  // Tennis Masters 1000
  { key: 'tennis_atp_indian_wells', label: 'ATP Indian Wells', icon: '🎾' },
  { key: 'tennis_atp_miami_open', label: 'ATP Miami Open', icon: '🎾' },
  { key: 'tennis_atp_madrid_open', label: 'ATP Madrid Open', icon: '🎾' },
  { key: 'tennis_atp_italian_open', label: 'ATP Italian Open', icon: '🎾' },
  { key: 'tennis_atp_canadian_open', label: 'ATP Canadian Open', icon: '🎾' },
  { key: 'tennis_atp_cincinnati_open', label: 'ATP Cincinnati Open', icon: '🎾' },
  { key: 'tennis_atp_shanghai_masters', label: 'ATP Shanghai Masters', icon: '🎾' },
  { key: 'tennis_atp_paris_masters', label: 'ATP Paris Masters', icon: '🎾' },
  
  // Other sports
  { key: 'americanfootball_nfl', label: 'NFL Football', icon: '🏈' },
  { key: 'icehockey_nhl', label: 'NHL Hockey', icon: '🏒' },
  { key: 'soccer_epl', label: 'English Premier League', icon: '⚽' },
] as const;
```

---

## Technical Flow: News Spike Mode

```text
User sees injury news
        ↓
Clicks "🔥 News Spike"
        ↓
[1] Immediate Watch Poll (with spike overrides)
        ↓
[2] newsSpikeActive = true
    newsSpikeEndsAt = now + 5min
        ↓
[3] Active Poll every 60s with:
    - stalenessHoursOverride: 1h (stricter freshness)
    - minEdgeOverride: 1.5% (lower threshold for early visibility)
        ↓
[4] After 5 minutes:
    - Auto-disable spike
    - Start 10-minute cooldown
        ↓
[5] After cooldown:
    - News Spike button re-enabled
```

---

## Configuration Summary

| Setting | Default | During Spike |
|---------|---------|--------------|
| Focus Mode | h2h_only | h2h_only |
| Staleness Window | 2 hours | 1 hour |
| Min Edge Threshold | 2.0% | 1.5% |
| Active Poll Interval | 60s | 60s (forced) |
| Spike Duration | N/A | 5 minutes |
| Cooldown | N/A | 10 minutes |

---

## Expected Outcome

After implementation:
- System primarily surfaces short-term H2H signals (NBA games, UFC fights, Tennis matches)
- Futures are deprioritized by default (available via focusMode: 'all')
- Year-round tennis coverage with all ATP/WTA 1000+ tournaments
- News Spike Mode captures reaction gaps during information shocks
- 10-minute cooldown prevents API abuse
- Edge threshold and staleness temporarily relaxed during spikes for early signal visibility
