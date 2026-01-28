# Polymarket-First Arbitrage System - Implementation Status

## ✅ Completed Implementation

### New Edge Functions (Deployed)
1. **polymarket-sync-24h** - Rolling 24hr sync that discovers new Polymarket events
   - Fetches ALL active events from Gamma API
   - Filters to H2H sports markets within 24hr window
   - Creates `monitored` entries in `event_watch_state`
   - Scheduled: every 30 minutes via pg_cron

2. **polymarket-monitor** - Unified polling function
   - Polls all monitored events every 5 minutes
   - Fetches live Polymarket prices (CLOB API)
   - Fetches bookmaker H2H odds (Odds API)
   - Calculates net edge after fees/spread/slippage
   - Triggers instant SMS alert if net edge ≥ 2%
   - Scheduled: every 5 minutes via pg_cron

3. **send-sms-alert** - Enhanced to support structured alerts
   - Now accepts structured data (event, prices, EV) 
   - Builds rich alert messages with full EV breakdown

### pg_cron Jobs (Active)
| Job | Schedule | Function |
|-----|----------|----------|
| polymarket-sync-24h | */30 * * * * | Discovers events |
| polymarket-monitor-5min | */5 * * * * | Polls & alerts |

### Deprecated (Removed from cron)
- watch-mode-poll (job removed)
- active-mode-poll (job removed)

## Architecture Flow

```
┌────────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│  polymarket-sync   │────▶│ event_watch_state   │────▶│ polymarket-monitor│
│  (every 30 min)    │     │ (monitored events)  │     │ (every 5 min)     │
└────────────────────┘     └─────────────────────┘     └───────────────────┘
         │                                                       │
   Fetch Gamma API                                         ┌─────▼─────┐
   Filter <24hr H2H                                        │  For each │
   Upsert to cache                                         │  event:   │
                                                           ├───────────┤
                                                           │ 1. Poly   │
                                                           │    price  │
                                                           │ 2. Book   │
                                                           │    odds   │
                                                           │ 3. Calc   │
                                                           │    edge   │
                                                           └─────┬─────┘
                                                                 │
                                            if net_edge >= 2% ───▼
                                                     ┌───────────────────┐
                                                     │   SMS ALERT       │
                                                     │   + Signal DB     │
                                                     └───────────────────┘
```

## Signal Detection Logic

```
Raw Edge = bookmaker_fair_prob - polymarket_price
Platform Fee = raw_edge * 0.01 (1% on profits)
Spread Cost = 0.5% - 3% based on volume
Slippage = 0.2% - 3% based on stake/volume ratio
Net Edge = Raw Edge - Platform Fee - Spread - Slippage

Alert if: Net Edge ≥ 2% AND Polymarket Volume ≥ $10K
```

## Current Status

The system is now running with the new simplified architecture:
- **One sync function** discovers events entering the 24hr window
- **One monitor function** polls all monitored events and alerts instantly
- No more two-tier escalation (watching → active → confirmed)
- Instant SMS alerts when positive-EV opportunities detected

**Note:** Initial sync found 0 qualifying H2H events because Polymarket currently has limited short-term sports H2H markets. The system will automatically pick up new events as they enter the 24-hour window.
