
# Universal Polymarket Scanner - Simplified Architecture

## The Problem

The current implementation has overly restrictive filters:
1. **polymarket-sync-24h**: Requires H2H patterns ("vs", "beat", "win") and specific team names
2. **polymarket-monitor**: Only fetches NBA H2H odds from bookmakers
3. **Result**: Missing totals, player props, UFC fights, tennis matches, soccer, and any market that doesn't match narrow H2H patterns

## The Solution

### Simple Rule: Capture ALL Polymarket Sports Events Within 24 Hours

No pattern matching. No H2H detection. Just:
- Is it tagged as Sports (or related category)?
- Does it have an end date within the next 24 hours?

Then let the monitor function figure out how to match it against bookmaker data.

---

## Implementation Plan

### 1. Rewrite polymarket-sync-24h (Discovery Function)

**Remove all these filters:**
- `isSportsEvent()` H2H pattern matching
- Team name extraction requirements
- `extractTeams()` function dependency
- `normalizeTeamName()` for filtering

**Keep only:**
```text
FILTER: isSportsCategory=true AND endDate <= NOW + 24 hours
```

**Store everything:**
- Market type detected from question (h2h, total, prop, etc.)
- Entity extracted (team name, player name)
- Sport detected (NBA, NFL, UFC, Tennis, Soccer)
- Full question/title for later matching

### 2. Rewrite polymarket-monitor (Polling Function)

**Current problem:** Only fetches `basketball_nba/odds/?markets=h2h`

**New approach:**
1. Group monitored events by detected sport
2. Fetch ALL relevant bookmaker endpoints:
   - NBA: `basketball_nba/odds/?markets=h2h,spreads,totals`
   - NFL: `americanfootball_nfl/odds/?markets=h2h,spreads,totals`
   - UFC: `mma_mixed_martial_arts/odds/?markets=h2h`
   - Tennis: `tennis_*/odds/?markets=h2h`
   - Soccer: `soccer_*/odds/?markets=h2h`
3. Match Polymarket questions against bookmaker data using fuzzy entity matching
4. Calculate edge and alert on positive EV

### 3. Scan Button Flow

When user clicks "Full Scan":
```text
1. Call polymarket-sync-24h
   - Fetch ALL Polymarket active events
   - Filter: Sports category + ends within 24h
   - Store ALL qualifying events in event_watch_state (state = 'monitored')

2. Call polymarket-monitor (automatically triggered after sync)
   - For each monitored event:
     a. Refresh Polymarket price (CLOB API)
     b. Detect sport + market type from question
     c. Fetch corresponding bookmaker odds
     d. Match and calculate edge
     e. If edge >= 2% net EV → create signal + SMS alert
   - Mark expired events (commence_time passed)

3. Continue polling every 5 minutes until event starts
```

---

## Technical Changes

### File: supabase/functions/polymarket-sync-24h/index.ts

**Key changes:**
1. Remove `isSportsEvent()` function with H2H patterns
2. Add simple `isSportsCategory()` that only checks tags
3. Add `detectMarketType()` to classify question (h2h, total, spread, prop)
4. Add `detectSport()` to identify sport from title
5. Store `market_type`, `detected_sport`, `extracted_entity` in cache/state

### File: supabase/functions/polymarket-monitor/index.ts

**Key changes:**
1. Remove hardcoded NBA-only fetch
2. Add `SPORT_ENDPOINTS` mapping with multiple market types:
   ```
   NBA → basketball_nba/?markets=h2h,spreads,totals
   NFL → americanfootball_nfl/?markets=h2h,spreads,totals
   UFC → mma_mixed_martial_arts/?markets=h2h
   ```
3. Group monitored events by detected sport
4. Fetch bookmaker data for each sport group
5. Enhanced matching: support totals, spreads, not just H2H
6. Same edge calculation and SMS alerting logic

### File: src/hooks/useScanConfig.ts

**Changes:**
1. Update `runManualScan()` to call `polymarket-sync-24h` first
2. Then call `polymarket-monitor` to check for edges
3. Clear separation: sync discovers, monitor detects

---

## Event Lifecycle (Simplified)

| State | Meaning | Transition |
|-------|---------|------------|
| `monitored` | Active polling target | Sync discovers event within 24h |
| `alerted` | Signal sent | Edge detected, SMS triggered |
| `expired` | Event started | commence_time passed |

No more: `watching`, `active`, `confirmed`, `signal` states.

---

## Market Type Detection

Analyze Polymarket question to classify:

| Pattern | Market Type |
|---------|-------------|
| "over", "under", "O/U", "total" | `total` |
| "spread", "handicap", "+/-" | `spread` |
| "vs", "beat", "win", "to win" | `h2h` |
| Player name + stat | `player_prop` |

---

## Sport Detection

Analyze title/question for keywords:

| Keywords | Sport API |
|----------|-----------|
| NBA, Lakers, Celtics... | `basketball_nba` |
| NFL, Chiefs, Eagles... | `americanfootball_nfl` |
| UFC, MMA, fighter names | `mma_mixed_martial_arts` |
| ATP, WTA, player names | `tennis_*` |
| Premier League, EPL, club names | `soccer_epl` |

---

## Expected Outcomes

1. **More events captured**: All sports, all market types within 24h
2. **Broader matching**: Totals, spreads, props - not just moneylines
3. **Same edge logic**: Still requires 2% net edge after fees
4. **Instant alerts**: SMS when criteria met
5. **Auto-expiry**: Events removed when they start

---

## Files to Modify

1. `supabase/functions/polymarket-sync-24h/index.ts` - Simplify to sports + 24h filter only
2. `supabase/functions/polymarket-monitor/index.ts` - Multi-sport, multi-market bookmaker fetching
3. `src/hooks/useScanConfig.ts` - Wire scan button to call sync then monitor
