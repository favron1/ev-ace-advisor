// ============================================================================
// CORE LOGIC v1.1 - EXPERIMENTAL
// ============================================================================
// This is the experimental version with tuned thresholds for increased signal
// volume. All changes from v1.0 are documented below.
// ============================================================================

export const CORE_LOGIC_V1_1_VERSION = "v1.1";

export const CORE_LOGIC_V1_1_FILENAME = `external_scan_signal_sourcing_${CORE_LOGIC_V1_1_VERSION}.md`;

// ============================================================================
// PROGRAMMABLE CONSTANTS - EXPERIMENTAL (TUNED)
// ============================================================================
// These values have been adjusted from v1.0 to increase signal volume while
// maintaining quality. Changes are marked with comments.
// ============================================================================

export const CORE_LOGIC_V1_1_CONSTANTS = {
  VERSION: 'v1.1' as const,
  
  // Stage 2: Movement Engine (TUNED)
  MOVEMENT_THRESHOLD: 0.05,       // 5.0% (lowered from 6.0% for sensitivity)
  VELOCITY_THRESHOLD: 0.003,      // 0.3%/min (lowered from 0.4%/min)
  SHARP_CONSENSUS_MIN: 2,         // Unchanged
  TIME_WINDOW_MIN: 5,             // Unchanged
  TIME_WINDOW_MAX: 15,            // Unchanged
  
  // Stage 3: Candidate Builder (TUNED)
  COOLDOWN_MINUTES: 20,           // Reduced from 30 for faster signal refresh
  COOLDOWN_MINUTES_MAX: 45,       // Reduced from 60
  LIQUIDITY_PREFERENCE: 5000,     // Lowered from $10K to include smaller markets
  
  // Stage 3.5: Signal State Gates (TUNED)
  S2_CONFIDENCE_MIN: 55,          // Lowered from 60 for more S2 signals
  S2_BOOK_PROB_MIN: 0.50,         // Lowered from 52% to include coinflips
  S2_TIME_TO_START_MIN: 10,       // Unchanged
  
  S1_CONFIDENCE_MIN: 40,          // Lowered from 45 for wider funnel
  S1_CONFIDENCE_MAX: 54,          // Adjusted to match new S2 floor
  S1_BOOK_PROB_MIN: 0.45,         // Lowered from 48%
  S1_BOOK_PROB_MAX: 0.499,        // Adjusted to match new S2 floor
  S1_TIME_TO_START_MIN: 5,        // Unchanged
  S1_TIME_TO_START_MAX: 9,        // Unchanged
  
  // Stage 3.6: Auto-Promotion (TUNED)
  AUTO_PROMOTE_CONFIDENCE: 55,    // Lowered from 60 to match new S2 floor
  AUTO_PROMOTE_LIQUIDITY: 5000,   // Lowered from $10K
  AUTO_PROMOTE_BOOKS: 3,          // Unchanged
  
  // Rate Limiting (INCREASED)
  MAX_S2_PER_HOUR: 20,            // Increased from 12 for higher throughput
  MAX_S2_PER_SPORT_PER_HOUR: 8,   // Increased from 4
  
  // Failure/Degradation (UNCHANGED)
  DEGRADED_CONFIDENCE_CAP: 65,    // Unchanged
  DISAGREE_CONFIDENCE_PENALTY: 10, // Unchanged
} as const;

// Import base type from v1.0 for consistency
import type { CoreLogicConstants } from './core-logic-v1.0';

// Re-export the base type
export type { CoreLogicConstants };

// ============================================================================
// DOCUMENT CONTENT - EXPERIMENTAL
// ============================================================================

export const CORE_LOGIC_V1_1_DOCUMENT = `# External Scan & Signal Sourcing (5-Stage Flow)

**Version:** v1.1 (experimental)
**Status:** ACTIVE - Currently deployed
**Base:** v1.0 (canonical)
**Change control:** All changes from v1.0 are documented below.

---

## Changes from v1.0

### Modified Thresholds (Experimental)

| Parameter | v1.0 | v1.1 | Rationale |
|-----------|------|------|-----------|
| Movement trigger | 6.0% | **5.0%** | Catch smaller but significant moves |
| Velocity trigger | 0.4%/min | **0.3%/min** | Lower bar for sustained moves |
| S2 confidence floor | ≥60 | **≥55** | Allow slightly lower confidence |
| S2 book prob floor | ≥52% | **≥50%** | Include coinflip scenarios |
| S1 confidence floor | ≥45 | **≥40** | Wider S1 funnel |
| S1 book prob floor | ≥48% | **≥45%** | Capture more marginal signals |
| Cooldown | 30-60 min | **20-45 min** | Faster signal refresh |
| Liquidity preference | $10K | **$5K** | Include smaller markets |
| Max S2/hour (global) | 12 | **20** | Higher throughput |
| Max S2/hour (sport) | 4 | **8** | Higher per-sport capacity |

### Expected Impact
- **S1 volume:** +40-60% (wider funnel)
- **S2 volume:** +50-80% (lower gates + higher caps)
- **Trade quality:** Monitor via v1.0 vs v1.1 comparison

---

## 5-Square Flow (Authoritative)

\`\`\`mermaid
flowchart LR
  A[1) Source Odds
(Multi-source ingest)] -->
  B[2) Movement Engine
(Line move + velocity + consensus)] -->
  C[3) Candidate Builder
(Score + dedupe)] -->
  D[4) Poly Match Request
(Metadata only — no execution)] -->
  E[5) State Promotion & Dispatch
(S1 → S2 gating)]
\`\`\`

---

## Stage Definitions (Contract)

### 1) Source Odds (Multi-Source Ingest)
- **Primary Polymarket analytics:** Gamma API (market list, prices, volume, trader stats)
- **Secondary Polymarket analytics:** Additional Polymarket analytics provider (redundancy + cross-checking)
- **Sharp bookmaker ingest:** Scrape as many sharp books as possible (e.g. Pinnacle, Betfair Exchange, Circa where available)
- Normalize teams, leagues, market types, timestamps
- Store raw snapshots per source (append-only, source-tagged)

**Output:** normalized multi-source snapshot (books + Polymarket analytics)

---

### 2) Movement Engine
- **Absolute line move trigger:** ≥ **5.0%** implied probability change (book-derived) *(v1.0: 6.0%)*
- **Velocity trigger:** ≥ **0.3% per minute** sustained move *(v1.0: 0.4%)*
- **Consensus requirement:** ≥ **2 sharp books** moving in same direction
- **Time window:** rolling **5–15 min** evaluation window
- **Volume sanity check (books):** ignore micro-moves with negligible limits
- **Market filter:** reject draw-capable markets

**Output:** movement event (directional, timestamped, source-weighted)

---

### 3) Candidate Builder
- Build candidate events from movement events
- **De-duplication key:** league + teams + market + start_time
- **Cooldown:** suppress repeat signals for **20–45 min** per event *(v1.0: 30-60 min)*
- **Confidence scoring (0–100):**
  - Book consensus strength (weight ↑ with Pinnacle/Betfair)
  - Move magnitude (5% baseline, scaled) *(v1.0: 6%)*
  - Velocity persistence
  - Polymarket liquidity / volume
- **Minimum liquidity preference (Poly analytics):** **$5K** notional preferred (confidence penalty below) *(v1.0: $10K)*

**Output:** candidate signal (confidence-scored)

---

### 3.5) Signal Quality Gates (State Promotion)
These gates ensure we **still get signals** while keeping noise out. Signals move through **explicit internal states**:

- **S1: PROMOTE** → signal is valid and worth downstream attention
- **S2: EXECUTION_ELIGIBLE** → execution worker is allowed to act
- **WATCH** → log only, no execution
- **REJECT** → discard

**S2: EXECUTION_ELIGIBLE gates (v1.1 tuned):**
- **confidence ≥ 55** *(v1.0: ≥60)*
- **sharp consensus ≥ 2 books** (already required by Stage 2)
- **book implied probability ≥ 50%** *(v1.0: ≥52%)*
- **time to start ≥ 10 min**
- **poly analytics available from ≥ 1 provider** (Gamma OR secondary)

**S1: PROMOTE (but not execution-eligible):**
- confidence 40–54 **OR** *(v1.0: 45-59)*
- book prob 45–49.9% **OR** *(v1.0: 48-51.9%)*
- time to start 5–9 min

**Hard REJECT:**
- draw-capable markets
- missing teams/league normalization
- no sharp books available (0)
- obviously stale timestamps / duplicated events

**Output:** \`signal_state = REJECT | WATCH | S1_PROMOTE | S2_EXECUTION_ELIGIBLE\`

---

### 3.6) Auto-Promotion Rules (No Re-scan Required)
**Auto-promotion** means a signal can move from **S1 → S2 automatically over time** as new data arrives — *without re-triggering the scan engine*.

**Auto-promote S1 → S2 if ANY occur before start time:**
- confidence rises to **≥ 55** due to additional book consensus or velocity persistence *(v1.0: ≥60)*
- Polymarket liquidity rises to **≥ $5K notional** *(v1.0: ≥$10K)*
- a 3rd sharp book joins the same directional move

**Constraints:**
- Auto-promotion only allowed if **time to start ≥ 10 min**
- Auto-promotion is one-way (S1 → S2 only)
- Promotion event is logged with timestamp and reason

**Purpose:** preserve signal flow while allowing the system to wait for confirmation instead of missing trades

---

### 4) Poly Match Request (No Execution)
- Prepare minimal payload for downstream matcher
- No Polymarket scraping or execution here

**Payload:**
- league / sport
- home_team / away_team (canonical)
- start_time_utc
- market_type (H2H / spread / total)
- book_prob, book_odds
- move_size, velocity, consensus
- confidence
- signal_id

---

### 5) State Promotion & Dispatch
Before dispatch, apply **Signal Quality Gates**:
- Only **S2_EXECUTION_ELIGIBLE** signals may be dispatched to execution
- **S1_PROMOTE** signals are written and monitored but not executed

If **S2_EXECUTION_ELIGIBLE**:
- Write to \`signals\` table (Supabase)
- Emit queue event / webhook
- Trigger downstream execution worker

If **S1_PROMOTE**:
- Write to \`signals_watch\` (or flagged in \`signals\`)
- No execution, no external alerts

**Output:** immutable signal record with explicit state


---

## Sport & Market Eligibility (Scanner Scope)
**Allowed (initial):**
- NHL, NBA, NFL
- Market types: **H2H (moneyline), totals (over/under), spreads**

**Forbidden (initial):**
- Draw markets (any 3-way)
- Futures/outrights
- Player props
- Live/in-play

---

## Expected Signal Volume (Sanity Check) - v1.1 Updated
This section exists to ensure the system is **not over-constrained**.

**Expected averages (normal market conditions) - v1.1:**
- **S1: PROMOTE:** 12–40 per day (across NHL/NBA/NFL) *(v1.0: 8-25)*
- **S2: EXECUTION_ELIGIBLE:** 4–15 per day *(v1.0: 2-8)*

**High-volatility days (injuries, news, limits reopen):**
- S1: 40–80 *(v1.0: 30-60)*
- S2: 12–25 *(v1.0: 8-15)*

If S2 drops to ~0 for multiple days:
- review velocity threshold first (0.3%/min)
- then review book_prob floor (50%)

---

## Rate Limiting & Overfire Protection - v1.1 Updated
- **Per-event cooldown:** 20–45 min (Stage 3) *(v1.0: 30-60 min)*
- **Global throttle (v1.1 tuned):**
  - max **20 S2_EXECUTION_ELIGIBLE** signals per hour (all sports combined) *(v1.0: 12)*
  - max **8 S2_EXECUTION_ELIGIBLE** signals per sport per hour *(v1.0: 4)*
  - WATCH signals are unlimited but stored with a 24h retention policy

---

## Failure & Degradation Rules
- **Gamma down:** continue in **books-only mode**; set \`poly_data_status = DEGRADED\` and cap confidence at 65
- **Secondary analytics down:** continue with Gamma; no penalty
- **Gamma vs secondary disagreement:** apply confidence penalty (−10) and mark \`poly_data_status = DISAGREE\`
- **<2 sharp books available:** suppress
- **Book scrape partial/outage:** require at least one of Pinnacle/Betfair; otherwise WATCH

---

## Design Guarantees
- UI is **read-only**
- Scanner never touches Polymarket UI or execution
- Execution worker can fail independently
- Signals are reproducible from stored snapshots

---

## Status
This file is the **active experimental version** for scan + signal sourcing.
Compare performance against v1.0 baseline via \`core_logic_version\` signal tagging.`;
