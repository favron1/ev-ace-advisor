

# Polymarket-First Information Arbitrage System - Complete Rebuild

## Executive Summary

Your system needs a fundamental architectural redesign. Currently it's built around championship futures markets and uses an overly complex two-tier escalation system. The new specification requires a simpler, more effective approach: scan ALL Polymarket events within 24 hours, poll them continuously, detect bookmaker movement, and alert instantly when positive-EV opportunities appear.

---

## Current State Analysis

### What Exists Today

1. **sync-polymarket-h2h** - Bulk syncs Polymarket markets to cache (runs periodically)
2. **watch-mode-poll** - Tier 1 polling, detects movements, escalates to "active" state
3. **active-mode-poll** - Tier 2 polling, confirms edges before surfacing signals
4. **polymarket-first-scan** - Alternative scan function (similar to watch-mode-poll)
5. **pg_cron jobs** - watch-mode-poll every 5 min, active-mode-poll every 1 min

### Critical Problems

1. **Cache is stale** - Dominated by futures markets (704 NHL futures, 358 NBA futures), very few H2H within 24hr
2. **Overcomplicated flow** - Two-tier escalation adds latency when speed is critical
3. **Wrong data source** - Current sync fetches futures/championship markets, not game-by-game H2H
4. **No event lifecycle** - Events don't properly expire when games start
5. **Bookmaker matching for outrights** - Current code matches against championship winner odds, not H2H game odds

---

## New Architecture

### Single Polling Loop Design

```text
+------------------+     +------------------+     +------------------+
|  INITIAL SYNC    | --> |  POLLING LOOP    | --> |  SIGNAL DETECT   |
|  (every 15-30m)  |     |  (every 5 min)   |     |  (per cycle)     |
+------------------+     +------------------+     +------------------+
         |                        |                        |
   Fetch ALL Poly          For each monitored       Compare Poly vs
   events <24hr            event: refresh both       Bookmaker prob
         |                 Poly + Book prices              |
         v                        |                        v
   Store in cache                 v               If edge >= 2% AND
   (MONITORED state)       Calculate live edge       +EV after fees:
                                                  INSTANT SMS ALERT
```

### Key Changes

| Current | New |
|---------|-----|
| Two separate functions (watch + active) | Single unified polling function |
| Escalation states (watching → active → confirmed) | Binary state (MONITORED → EXPIRED) |
| Matches against championship outrights | Matches against H2H game odds |
| 2-stage confirmation delays signal | Instant alerting when criteria met |
| Futures-heavy cache | H2H only, 24hr window strictly enforced |

---

## Implementation Plan

### Phase 1: New Edge Function - polymarket-monitor

Create a new unified edge function that replaces watch-mode-poll and active-mode-poll:

**File:** `supabase/functions/polymarket-monitor/index.ts`

**Core Logic:**
```text
1. Load all MONITORED events from event_watch_state
2. For each event:
   a. Check if event has started → mark EXPIRED, skip
   b. Fetch fresh Polymarket price via CLOB/Gamma API
   c. Fetch fresh bookmaker H2H odds for same game
   d. Calculate edge = bookmaker_fair_prob - polymarket_price
   e. If edge >= 2% AND net_EV_positive:
      - Create signal_opportunity
      - Send SMS alert IMMEDIATELY
   f. Update event_watch_state with fresh prices
3. Return summary
```

**Bookmaker H2H Fetching:**
- Use `basketball_nba` endpoint with `markets=h2h` (not outrights)
- Match by team names in the game title
- Calculate fair probability by removing vig from decimal odds

### Phase 2: New Edge Function - polymarket-sync-24h

Create a dedicated sync function for the 24-hour window:

**File:** `supabase/functions/polymarket-sync-24h/index.ts`

**Core Logic:**
```text
1. Fetch ALL active Polymarket events from Gamma API
2. Filter to only events with end_date within next 24 hours
3. Filter to sports categories (NBA, NFL, NHL, UFC, Tennis, Soccer)
4. For each qualifying event:
   a. Extract team names from title/question
   b. Classify market type (prioritize H2H)
   c. Upsert to polymarket_h2h_cache with status='active'
   d. Create entry in event_watch_state with state='monitored'
5. Mark any events that have passed their end_date as 'expired'
6. Return sync summary
```

### Phase 3: Update pg_cron Schedule

**Remove existing jobs and create new ones:**

| Job Name | Schedule | Function |
|----------|----------|----------|
| polymarket-sync-24h | Every 30 minutes | Discovers new events entering 24hr window |
| polymarket-monitor | Every 5 minutes | Polls all monitored events, detects edges |

### Phase 4: Simplified Event Lifecycle

**event_watch_state states (simplified):**

| State | Meaning | Transition |
|-------|---------|------------|
| `monitored` | Active polling target | Entry: sync discovers event |
| `expired` | Event started or market closed | Exit: event_date passed |
| `alerted` | Signal sent (optional for tracking) | When SMS triggered |

### Phase 5: EV Calculation Enhancement

Update the signal detection to include full EV calculation before alerting:

```text
1. Raw Edge = bookmaker_fair_prob - polymarket_price
2. Platform Fee = 1% on profits (if winning)
3. Spread Cost = volume-based estimate (0.5% - 3%)
4. Slippage = stake/volume ratio estimate
5. Net Edge = Raw Edge - Total Costs
6. EV = Net Edge * stake_amount

Only alert if Net Edge >= 2% AND EV is clearly positive
```

### Phase 6: Enhanced SMS Alert Content

Update send-sms-alert to include full information:

```text
EDGE DETECTED: Lakers vs Celtics
Market: Lakers to Win
Polymarket: 45c ($125K vol)
Bookmaker Fair: 52%
Raw Edge: +7.0%
Net EV: +$14.20 on $200 stake
Time: 3h 15m until tipoff
ACT NOW - window may close
```

---

## Technical Details

### Bookmaker H2H API Call

**Current (WRONG):**
```
/v4/sports/basketball_nba_championship_winner/odds/?markets=outrights
```

**New (CORRECT):**
```
/v4/sports/basketball_nba/odds/?markets=h2h&regions=us,uk,eu
```

This returns tonight's games with moneyline odds for each team.

### Team Matching for H2H

The bookmaker API returns events like:
```json
{
  "home_team": "Los Angeles Lakers",
  "away_team": "Boston Celtics",
  "bookmakers": [{ "markets": [{ "outcomes": [...] }] }]
}
```

Match against Polymarket questions like:
- "Will the Lakers beat the Celtics?"
- "Lakers vs Celtics: Who wins?"

### Volume/Liquidity Thresholds

| Threshold | Value | Reason |
|-----------|-------|--------|
| Min Polymarket Volume | $10,000 | Ensures sufficient liquidity to execute |
| Min Bookmaker Books | 2 | Consensus requirement for sharp signal |
| Max Staleness | 5 minutes | Fresh prices critical for arbitrage |

---

## Files to Create/Modify

### New Files
1. `supabase/functions/polymarket-monitor/index.ts` - Unified polling function
2. `supabase/functions/polymarket-sync-24h/index.ts` - Rolling 24hr sync

### Files to Modify
1. `supabase/functions/send-sms-alert/index.ts` - Enhanced alert content
2. `src/lib/execution-engine.ts` - Add net EV calculation helper

### Files to Deprecate (keep but stop using)
1. `supabase/functions/watch-mode-poll/index.ts`
2. `supabase/functions/active-mode-poll/index.ts`
3. `supabase/functions/polymarket-first-scan/index.ts`

### Database Changes
1. Update pg_cron jobs via SQL INSERT
2. Clean up stale data in polymarket_h2h_cache
3. Reset event_watch_state for fresh start

---

## Expected Outcomes

1. **Simpler architecture** - One sync function, one poll function, instant alerts
2. **Faster detection** - No 2-stage confirmation delay
3. **Correct market focus** - H2H games within 24hr only
4. **Better matching** - Bookmaker H2H odds vs championship outrights
5. **Full EV visibility** - Alert includes net edge after fees
6. **Clean lifecycle** - Events expire automatically when games start

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| API rate limits | Batch requests, respect 500/day limit |
| False positives | Require 2+ bookmaker consensus |
| Stale prices | 5-minute polling cycle, timestamp checks |
| Missed events | 30-minute rolling sync catches new games |

