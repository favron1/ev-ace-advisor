# EV Ace Advisor - Architecture

## Two-Layer System

This project uses a strict separation between signal detection (Layer 1) 
and display (Layer 2) to prevent UI changes from breaking the core algorithm.

### Layer 1: Core Algorithm (PROTECTED)
- Edge functions that sync markets, calculate edges, create signals
- Execution engine that calculates net EV
- Shared config (team maps, detection patterns)
- **Rule**: Only modify when explicitly requested

### Layer 2: Presentation (SAFE TO MODIFY)
- React components that display signals
- Hooks that fetch and subscribe to data
- Styling, animations, UX improvements
- **Rule**: Safe to modify freely for UI improvements

### Interface Layer (CONTRACT)
- `src/types/arbitrage.ts` - Signal data shape
- `src/hooks/useSignals.ts` - Data access hook
- `src/lib/api/arbitrage.ts` - API wrapper
- Database tables define the schema

---

## File Inventory

### Layer 1 Files (DO NOT MODIFY without explicit request)

| File | Purpose |
|------|---------|
| `supabase/functions/polymarket-sync-24h/` | Syncs Polymarket markets, extracts slugs, kickoff times |
| `supabase/functions/polymarket-monitor/` | Compares prices, calculates edges, creates signals |
| `supabase/functions/ingest-odds/` | Fetches bookmaker data from Odds API |
| `supabase/functions/refresh-signals/` | Updates existing signal prices |
| `supabase/functions/settle-bets/` | Settles bets after events complete |
| `supabase/functions/_shared/sports-config.ts` | Team maps, detection patterns |
| `supabase/functions/_shared/firecrawl-scraper.ts` | Firecrawl integration |
| `src/lib/execution-engine.ts` | Net EV calculation, cost estimation |

### Layer 2 Files (Safe to modify)

| File | Purpose |
|------|---------|
| `src/components/terminal/*` | Signal display components |
| `src/pages/Terminal.tsx` | Main terminal page |
| `src/pages/Stats.tsx` | Statistics and history page |
| `src/pages/Settings.tsx` | User settings page |

### Interface Files (Modify carefully - affects both layers)

| File | Purpose |
|------|---------|
| `src/types/arbitrage.ts` | Core type definitions (v1.0) |
| `src/hooks/useSignals.ts` | Data access hook - bridge to Layer 1 |
| `src/lib/api/arbitrage.ts` | API wrapper - calls edge functions |

---

## Data Contract (Signal Fields Layer 2 Can Use)

From `signal_opportunities` table via `useSignals`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `event_name` | string | Game title |
| `recommended_outcome` | string | Team to bet on |
| `side` | 'YES' \| 'NO' | Which side to buy |
| `polymarket_price` | number | Current Polymarket price |
| `edge_percent` | number | Raw edge % |
| `confidence_score` | number | 0-100 confidence |
| `urgency` | enum | 'low', 'normal', 'high', 'critical' |
| `expires_at` | string | ISO timestamp of kickoff |
| `is_true_arbitrage` | boolean | Has Polymarket match |
| `polymarket_slug` | string | URL slug for direct links |
| `polymarket_volume` | number | Market volume in $ |
| `signal_tier` | enum | 'elite', 'strong', 'static' |
| `movement_confirmed` | boolean | Sharp movement detected |
| `movement_velocity` | number | Speed of price movement |
| `bookmaker_prob_fair` | number | Vig-free fair probability |
| `polymarket_condition_id` | string | Condition ID for CLOB API |

Layer 2 should ONLY read these fields. If a new field is needed, update Layer 1 first.

---

## Rules

1. **UI changes**: Touch Layer 2 files only
2. **Algorithm changes**: Explicitly request "modify Layer 1" or "update detection logic"
3. **New data fields**: Add to Layer 1 first, then consume in Layer 2
4. **Type changes**: Update `src/types/arbitrage.ts` carefully - this is the contract

---

## Contract Version

**Version**: 1.0  
**Last Updated**: 2026-01-31

Changes to the data contract should increment this version.
