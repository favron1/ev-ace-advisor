# EV Ace Advisor - Architecture

## Protection Tier System

This project uses a **tiered protection system** to prevent accidental changes to critical functionality.
Each tier requires explicit permission before modification.

---

## Tier 0: FROZEN CORE (Never Modify)

**Status**: 🔒 LOCKED - Do not modify under any circumstances without explicit "UNLOCK TIER 0" request

These are the mathematical and detection foundations. Changes here could break the entire system.

| File | Purpose | Last Verified |
|------|---------|---------------|
| `src/lib/execution-engine.ts` | Net EV calculation, cost estimation | 2026-01-31 |
| `supabase/functions/_shared/sports-config.ts` | Team maps, detection patterns | 2026-01-31 |

### Frozen Thresholds (DO NOT CHANGE)
```
Movement Gate:
- min_books_confirming: 2
- magnitude_threshold: max(0.02, 0.12 * baseline_prob)
- recency_bias: 70% of move in last 10 minutes

Execution Decision:
- platform_fee: 1% on profits
- min_net_edge_for_bet: 2%
- min_net_edge_for_strong_bet: 4%

Signal Classification:
- ELITE: movement_confirmed + net_edge >= 5%
- STRONG: movement_confirmed + net_edge >= 3%
- STATIC: no movement or low confidence
```

---

## Tier 1: PROTECTED CORE (Explicit Permission Required)

**Status**: 🛡️ PROTECTED - Requires explicit "MODIFY TIER 1" or "UPDATE DETECTION LOGIC" request

Signal detection and data syncing logic. These affect what signals appear but not the math.

| File | Purpose |
|------|---------|
| `supabase/functions/polymarket-monitor/index.ts` | Price comparison, edge detection, signal creation |
| `supabase/functions/polymarket-sync-24h/index.ts` | Syncs Polymarket markets |
| `supabase/functions/watch-mode-poll/index.ts` | Watch-tier polling |
| `supabase/functions/active-mode-poll/index.ts` | Active-tier polling |
| `supabase/functions/ingest-odds/index.ts` | Bookmaker data ingestion |
| `supabase/functions/refresh-signals/index.ts` | Updates existing signal prices |
| `supabase/functions/settle-bets/index.ts` | Settles bets after events |

### Protected Database Tables
- `signal_opportunities` - Signal storage
- `event_watch_state` - Movement tracking state
- `polymarket_h2h_cache` - Market cache
- `scan_config` - Polling configuration

---

## Tier 2: INTERFACE LAYER (Modify Carefully)

**Status**: ⚠️ CAUTION - Changes affect both frontend and backend

These are the contracts between layers. Modifications should be backwards-compatible.

| File | Purpose |
|------|---------|
| `src/types/arbitrage.ts` | Core type definitions |
| `src/types/scan-config.ts` | Scan configuration types |
| `src/hooks/useSignals.ts` | Data access hook |
| `src/lib/api/arbitrage.ts` | API wrapper for edge functions |

### Interface Rules
1. Never remove fields - only add or deprecate
2. New fields must be optional with sensible defaults
3. Type changes must be backwards-compatible

---

## Tier 3: PRESENTATION (Safe to Modify)

**Status**: ✅ OPEN - Can be modified freely for UI/UX improvements

These files display data but don't affect signal detection or calculations.

| Directory/File | Purpose |
|----------------|---------|
| `src/components/terminal/*` | Signal display components |
| `src/components/advisor/*` | Advisor panel UI |
| `src/components/settings/*` | Settings UI |
| `src/components/stats/*` | Statistics display |
| `src/pages/Terminal.tsx` | Main terminal page |
| `src/pages/Stats.tsx` | Statistics page |
| `src/pages/Settings.tsx` | Settings page |
| `src/pages/Auth.tsx` | Authentication page |
| `src/hooks/useNotifications.ts` | Notification handling |
| `src/hooks/useAutoPolling.ts` | Polling UI state |

### Presentation Rules
1. Never call edge functions directly - use api wrapper
2. Never modify signal data - only display it
3. Use type definitions from Interface Layer

---

## Tier 4: INFRASTRUCTURE (Standard Caution)

**Status**: 📦 STANDARD - Normal development caution

Configuration and utility files.

| File | Purpose |
|------|---------|
| `tailwind.config.ts` | Styling configuration |
| `index.html` | HTML entry point |
| `src/index.css` | Global styles |
| `vite.config.ts` | Build configuration |
| `supabase/config.toml` | Supabase configuration |

---

## Modification Protocol

### To modify Tier 0 (FROZEN):
1. User must say: "UNLOCK TIER 0: [specific reason]"
2. AI must explain exact changes and risks before proceeding
3. User must explicitly approve the modification
4. AI must re-verify all thresholds after change

### To modify Tier 1 (PROTECTED):
1. User must say: "MODIFY TIER 1" or reference specific detection/sync logic
2. AI must explain what behavior will change
3. AI should offer to test after deployment

### To modify Tier 2 (INTERFACE):
1. AI must warn about backwards-compatibility
2. Changes should be additive, not breaking
3. AI must update both sides if needed (types + usage)

### To modify Tier 3 (PRESENTATION):
1. No special permission needed
2. AI should confirm it's UI-only changes
3. Normal development workflow

---

## Current Working Configuration (2026-01-31)

### Scan Config Defaults
```
base_frequency_minutes: 30
watch_poll_interval_minutes: 5
active_poll_interval_seconds: 60
movement_threshold_pct: 3.0
hold_window_minutes: 2
samples_required: 3
max_simultaneous_active: 10
```

### Signal Thresholds
```
min_edge_percent: 3.0
min_confidence: 60
min_liquidity: 1000
max_exposure_per_event: 500
```

### Execution Gates (Hard Blocks)
```
- Team name mismatch with event
- Polymarket price >5 minutes stale
- Liquidity <$5,000
- Fair probability >=85% with >40% edge (artifact)
- System decision = 'NO_BET'
```

---

## Contract Version

**Version**: 1.1  
**Last Updated**: 2026-01-31

Changes to tiers or thresholds should increment this version.
