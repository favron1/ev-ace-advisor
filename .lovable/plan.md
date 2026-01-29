

# Consolidation: Remove Legacy Turbo Mode & Integrate Speed Controls

## Summary

Turbo Mode is a legacy feature from an older polling system that no longer applies to the current two-tier Watch/Active architecture. This plan removes it and gives direct control over Watch Poll speed instead.

## The Problem

| Setting | Default | Actually Controls |
|---------|---------|-------------------|
| `turbo_mode_enabled` | false | Legacy Full Scan scheduler only |
| `turbo_frequency_minutes` | 5m | Legacy Full Scan scheduler only |
| `watch_poll_interval_minutes` | 5m | **Actual Watch Poll** (the real system) |

**Result:** Toggling "Turbo Mode" ON changes nothing for Watch Poll—the system already polls every 5 minutes. It's confusing and useless.

---

## Changes Overview

### What Gets Removed
- **Turbo Mode Switch** in ScanControlPanel
- **Turbo Mode Badge** ("Turbo" status badge)
- **Turbo Frequency slider** in ScanSettingsPanel
- **toggleTurboMode function** in useScanConfig
- Type references to `turbo_mode_enabled` and `turbo_frequency_minutes`

### What Gets Added
- **Fast Mode Switch** — toggles Watch Poll between 5m (normal) and 2m (fast)
- **Fast Badge** — shows when Fast Mode is active
- Clearer UI language

---

## UI Before vs After

**Control Panel - Before:**
```
[Turbo Mode Switch] ← confusing, does nothing useful
Status: [Turbo] badge when enabled
```

**Control Panel - After:**
```
[Fast Mode Switch] ← toggles Watch Poll 5m → 2m
Status: [Fast] badge when enabled
```

**Settings Panel - Before:**
```
Legacy Scan Frequency:
  - Base Frequency: 30m slider
  - Turbo Frequency: 5m slider ← redundant

Two-Tier Polling:
  - Watch Poll Interval: 5m slider
```

**Settings Panel - After:**
```
Two-Tier Polling:
  - Watch Poll Interval: 2-15m slider
  (Legacy section removed entirely)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/scan-config.ts` | Remove `turbo_mode_enabled` from ScanConfig interface, remove `'turbo'` from currentMode type |
| `src/hooks/useScanConfig.ts` | Remove `toggleTurboMode`, add `toggleFastMode`, update DEFAULT_CONFIG, remove turbo logic from status |
| `src/components/terminal/ScanControlPanel.tsx` | Replace Turbo Switch with Fast Mode Switch, update badge logic |
| `src/components/terminal/ScanSettingsPanel.tsx` | Remove entire "Legacy Scan Frequency" card (Base Frequency + Turbo Frequency sliders) |
| `src/pages/Terminal.tsx` | Update handler from `onToggleTurbo` to `onToggleFastMode` |

---

## Technical Details

### New toggleFastMode Function (useScanConfig.ts)

```typescript
const toggleFastMode = useCallback(async () => {
  if (!config) return;
  const newInterval = config.watch_poll_interval_minutes === 2 ? 5 : 2;
  await updateConfig({ watch_poll_interval_minutes: newInterval });
  toast({
    title: newInterval === 2 ? 'Fast Mode Enabled' : 'Fast Mode Disabled',
    description: `Watch Poll now every ${newInterval} minutes`,
  });
}, [config, updateConfig, toast]);
```

### Updated Status Badge Logic (ScanControlPanel.tsx)

```tsx
// Before
status.currentMode === 'turbo' ? (
  <Badge className="bg-orange-500/20 text-orange-400">Turbo</Badge>
)

// After
config?.watch_poll_interval_minutes === 2 ? (
  <Badge className="bg-orange-500/20 text-orange-400">Fast</Badge>
)
```

### Updated Switch (ScanControlPanel.tsx)

```tsx
// Before
<Switch
  id="turbo-mode"
  checked={config?.turbo_mode_enabled || false}
  onCheckedChange={onToggleTurbo}
/>
<Label>Turbo Mode</Label>

// After
<Switch
  id="fast-mode"
  checked={config?.watch_poll_interval_minutes === 2}
  onCheckedChange={onToggleFastMode}
/>
<Label>Fast Mode (2m)</Label>
```

---

## Database Consideration

The `scan_config` table has `turbo_mode_enabled` and `turbo_frequency_minutes` columns. These will be left in place to avoid migration complexity—they simply won't be used. A future cleanup migration can remove them.

---

## What Stays Unchanged

- **News Spike Mode** — still triggers 60-second burst polling for 5 minutes
- **Watch Poll Interval slider** in settings — still adjustable from 2-15m
- **Active Poll Interval** — still 60 seconds for escalated events
- All movement detection, edge calculation, and signal logic

---

## Result

| User Action | Before | After |
|-------------|--------|-------|
| Toggle "Fast Mode" | Changed legacy scheduler (unused) | Changes Watch Poll from 5m → 2m |
| News Spike | Temporary 60s active polling | Unchanged |
| Settings → Watch Interval | Adjustable 2-15m | Adjustable 2-15m (auto-set to 2m if Fast enabled) |

