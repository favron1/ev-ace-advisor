
# Plan: Remove Tennis & Focus on Core 4 Sports

## Summary
Clean up all tennis references and other unwanted sports from the system to focus exclusively on:
- **NHL** (Hockey)
- **NBA** (Basketball)  
- **NCAA CBB** (College Basketball)
- **NFL** (Football)

## Current State (The Problem)

Tennis references exist in **6 files** across the codebase:
1. `src/types/scan-config.ts` - 30+ tennis tournament keys in AVAILABLE_SPORTS
2. `supabase/functions/ingest-odds/index.ts` - 40+ tennis keys in h2hSports array
3. `supabase/functions/polymarket-sync-24h/index.ts` - Tennis fallback pattern in detectSport()
4. `supabase/functions/polymarket-monitor/index.ts` - Tennis fallback pattern
5. `supabase/functions/sync-polymarket-h2h/index.ts` - Tennis keywords in SPORTS_KEYWORDS
6. `supabase/functions/fetch-live-scores/index.ts` - Tennis sport key mapping

The shared `_shared/sports-config.ts` is **already correct** - it only has NHL, NBA, NFL, CBB. The problem is the individual functions have their own hardcoded sport lists that include tennis.

---

## Changes

### File 1: `src/types/scan-config.ts`
**Remove** all tennis, UFC, MMA, and soccer entries from `AVAILABLE_SPORTS`.

Keep only:
```typescript
export const AVAILABLE_SPORTS = [
  { key: 'basketball_nba', label: 'NBA Basketball', icon: '🏀' },
  { key: 'basketball_ncaab', label: 'NCAA Basketball', icon: '🏀' },
  { key: 'americanfootball_nfl', label: 'NFL Football', icon: '🏈' },
  { key: 'icehockey_nhl', label: 'NHL Hockey', icon: '🏒' },
] as const;
```

---

### File 2: `supabase/functions/ingest-odds/index.ts`
**Remove** all tennis keys, soccer, euroleague, MMA from the `h2hSports` array.

Keep only:
```typescript
const h2hSports = [
  'basketball_nba',
  'basketball_ncaab',
  'americanfootball_nfl',
  'icehockey_nhl',
];
```

---

### File 3: `supabase/functions/polymarket-sync-24h/index.ts`
**Remove** Tennis, EPL, MLB, UCL, LaLiga, SerieA, Bundesliga, Boxing, Golf, F1 patterns from `fallbackPatterns`.

Keep only UFC/MMA if detected via shared config, or remove entirely since core 4 are already in shared config.

---

### File 4: `supabase/functions/polymarket-monitor/index.ts`
**Remove** Tennis, EPL, MLB, UCL, LaLiga, SerieA, Bundesliga, Boxing patterns from `fallbackPatterns`.

---

### File 5: `supabase/functions/sync-polymarket-h2h/index.ts`
**Remove** tennis keywords from `SPORTS_KEYWORDS`:
- Remove: `tennis`, `australian open`, `french open`, `wimbledon`, `us open`, `atp`, `wta`, `djokovic`, `sinner`, `alcaraz`, `medvedev`, `zverev`, etc.

Also remove soccer keywords: `premier league`, `epl`, `la liga`, `champions league`, `real madrid`, `barcelona`, etc.

---

### File 6: `supabase/functions/fetch-live-scores/index.ts`  
**Remove** tennis sport key fallback logic.

---

## Technical Details

### Files Modified

| File | Action |
|------|--------|
| `src/types/scan-config.ts` | Trim AVAILABLE_SPORTS to 4 sports |
| `supabase/functions/ingest-odds/index.ts` | Trim h2hSports array to 4 sports |
| `supabase/functions/polymarket-sync-24h/index.ts` | Remove tennis/soccer fallback patterns |
| `supabase/functions/polymarket-monitor/index.ts` | Remove tennis/soccer fallback patterns |
| `supabase/functions/sync-polymarket-h2h/index.ts` | Clean SPORTS_KEYWORDS to core 4 only |
| `supabase/functions/fetch-live-scores/index.ts` | Remove tennis fallback |

### Resulting Sport Coverage

After cleanup, the system will **only** detect and monitor:

| Sport | Odds API Key | Polymarket URL |
|-------|--------------|----------------|
| NHL | `icehockey_nhl` | polymarket.com/sports/nhl/games |
| NBA | `basketball_nba` | polymarket.com/sports/nba/games |
| NCAA CBB | `basketball_ncaab` | polymarket.com/sports/cbb/games |
| NFL | `americanfootball_nfl` | polymarket.com/sports/nfl/games |

### Edge Functions to Redeploy

After code changes, these functions will auto-deploy:
1. `ingest-odds`
2. `polymarket-sync-24h`
3. `polymarket-monitor`
4. `sync-polymarket-h2h`
5. `fetch-live-scores`

---

## Expected Outcome

- Signal feed only shows NHL, NBA, NCAA, NFL events
- Cache only stores markets for core 4 sports
- No wasted API calls on tennis tournaments
- Cleaner logs and faster scans
