// ============================================================================
// CORE LOGIC v1.0 - FROZEN - DO NOT MODIFY
// ============================================================================
// This is the canonical baseline version of the External Scan & Signal Sourcing
// document. Any changes to signal detection thresholds require a new version.
// ============================================================================

export const CORE_LOGIC_V1_0_VERSION = "v1.0";

export const CORE_LOGIC_V1_0_FILENAME = `external_scan_signal_sourcing_${CORE_LOGIC_V1_0_VERSION}.md`;

// ============================================================================
// PROGRAMMABLE CONSTANTS - FROZEN
// ============================================================================
// These values are extracted from the document for use in the signal engine.
// DO NOT MODIFY - create a new version instead.
// ============================================================================

export const CORE_LOGIC_V1_0_CONSTANTS = {
  VERSION: 'v1.0' as const,
  
  // Stage 2: Movement Engine
  MOVEMENT_THRESHOLD: 0.06,       // 6.0% absolute implied probability change
  VELOCITY_THRESHOLD: 0.004,      // 0.4% per minute sustained move
  SHARP_CONSENSUS_MIN: 2,         // Minimum sharp books moving same direction
  TIME_WINDOW_MIN: 5,             // Minimum evaluation window (minutes)
  TIME_WINDOW_MAX: 15,            // Maximum evaluation window (minutes)
  
  // Stage 3: Candidate Builder
  COOLDOWN_MINUTES: 30,           // Minimum cooldown between signals per event
  COOLDOWN_MINUTES_MAX: 60,       // Maximum cooldown
  LIQUIDITY_PREFERENCE: 10000,    // $10K notional preferred
  
  // Stage 3.5: Signal State Gates
  S2_CONFIDENCE_MIN: 60,          // S2: EXECUTION_ELIGIBLE confidence floor
  S2_BOOK_PROB_MIN: 0.52,         // S2: book implied probability minimum (52%)
  S2_TIME_TO_START_MIN: 10,       // S2: minimum minutes to event start
  
  S1_CONFIDENCE_MIN: 45,          // S1: PROMOTE confidence floor
  S1_CONFIDENCE_MAX: 59,          // S1: PROMOTE confidence ceiling
  S1_BOOK_PROB_MIN: 0.48,         // S1: book implied probability minimum (48%)
  S1_BOOK_PROB_MAX: 0.519,        // S1: book implied probability ceiling (51.9%)
  S1_TIME_TO_START_MIN: 5,        // S1: minimum minutes to event start
  S1_TIME_TO_START_MAX: 9,        // S1: maximum minutes to event start
  
  // Stage 3.6: Auto-Promotion
  AUTO_PROMOTE_CONFIDENCE: 60,    // Confidence threshold for auto S1→S2
  AUTO_PROMOTE_LIQUIDITY: 10000,  // Liquidity threshold for auto S1→S2
  AUTO_PROMOTE_BOOKS: 3,          // Additional sharp book for auto S1→S2
  
  // Rate Limiting
  MAX_S2_PER_HOUR: 12,            // Global S2 signals per hour
  MAX_S2_PER_SPORT_PER_HOUR: 4,   // S2 signals per sport per hour
  
  // Failure/Degradation
  DEGRADED_CONFIDENCE_CAP: 65,    // Max confidence when Gamma is down
  DISAGREE_CONFIDENCE_PENALTY: 10, // Penalty when sources disagree
} as const;

// Base type for constants (version-agnostic)
export interface CoreLogicConstants {
  readonly VERSION: string;
  readonly MOVEMENT_THRESHOLD: number;
  readonly VELOCITY_THRESHOLD: number;
  readonly SHARP_CONSENSUS_MIN: number;
  readonly TIME_WINDOW_MIN: number;
  readonly TIME_WINDOW_MAX: number;
  readonly COOLDOWN_MINUTES: number;
  readonly COOLDOWN_MINUTES_MAX: number;
  readonly LIQUIDITY_PREFERENCE: number;
  readonly S2_CONFIDENCE_MIN: number;
  readonly S2_BOOK_PROB_MIN: number;
  readonly S2_TIME_TO_START_MIN: number;
  readonly S1_CONFIDENCE_MIN: number;
  readonly S1_CONFIDENCE_MAX: number;
  readonly S1_BOOK_PROB_MIN: number;
  readonly S1_BOOK_PROB_MAX: number;
  readonly S1_TIME_TO_START_MIN: number;
  readonly S1_TIME_TO_START_MAX: number;
  readonly AUTO_PROMOTE_CONFIDENCE: number;
  readonly AUTO_PROMOTE_LIQUIDITY: number;
  readonly AUTO_PROMOTE_BOOKS: number;
  readonly MAX_S2_PER_HOUR: number;
  readonly MAX_S2_PER_SPORT_PER_HOUR: number;
  readonly DEGRADED_CONFIDENCE_CAP: number;
  readonly DISAGREE_CONFIDENCE_PENALTY: number;
}

// ============================================================================
// DOCUMENT CONTENT - FROZEN
// ============================================================================

export const CORE_LOGIC_V1_0_DOCUMENT = `# External Scan & Signal Sourcing (5-Stage Flow)

**Version:** v1.0 (canonical)
**Status:** FROZEN - DO NOT MODIFY
**Change control:** Any threshold change requires a version bump (v1.1, v1.2, …).

This file defines the **externalized scanning + signal sourcing process**. It is intentionally isolated from the site/UI so frontend changes cannot break signal generation.

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
- **Absolute line move trigger:** ≥ **6.0%** implied probability change (book-derived)
- **Velocity trigger:** ≥ **0.4% per minute** sustained move
- **Consensus requirement:** ≥ **2 sharp books** moving in same direction
- **Time window:** rolling **5–15 min** evaluation window
- **Volume sanity check (books):** ignore micro-moves with negligible limits
- **Market filter:** reject draw-capable markets

**Output:** movement event (directional, timestamped, source-weighted)

---

### 3) Candidate Builder
- Build candidate events from movement events
- **De-duplication key:** league + teams + market + start_time
- **Cooldown:** suppress repeat signals for **30–60 min** per event
- **Confidence scoring (0–100):**
  - Book consensus strength (weight ↑ with Pinnacle/Betfair)
  - Move magnitude (6% baseline, scaled)
  - Velocity persistence
  - Polymarket liquidity / volume
- **Minimum liquidity preference (Poly analytics):** **$10K** notional preferred (confidence penalty below)

**Output:** candidate signal (confidence-scored)

---

### 3.5) Signal Quality Gates (State Promotion)
These gates ensure we **still get signals** while keeping noise out. Signals move through **explicit internal states**:

- **S1: PROMOTE** → signal is valid and worth downstream attention
- **S2: EXECUTION_ELIGIBLE** → execution worker is allowed to act
- **WATCH** → log only, no execution
- **REJECT** → discard

**S2: EXECUTION_ELIGIBLE gates (starting defaults, tunable):**
- **confidence ≥ 60**
- **sharp consensus ≥ 2 books** (already required by Stage 2)
- **book implied probability ≥ 52%**
- **time to start ≥ 10 min**
- **poly analytics available from ≥ 1 provider** (Gamma OR secondary)

**S1: PROMOTE (but not execution-eligible):**
- confidence 45–59 **OR**
- book prob 48–51.9% **OR**
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
- confidence rises to **≥ 60** due to additional book consensus or velocity persistence
- Polymarket liquidity rises to **≥ $10K notional**
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

## Expected Signal Volume (Sanity Check)
This section exists to ensure the system is **not over-constrained**.

**Expected averages (normal market conditions):**
- **S1: PROMOTE:** 8–25 per day (across NHL/NBA/NFL)
- **S2: EXECUTION_ELIGIBLE:** 2–8 per day

**High-volatility days (injuries, news, limits reopen):**
- S1: 30–60
- S2: 8–15

If S2 drops to ~0 for multiple days:
- review velocity threshold first (0.4%/min)
- then review book_prob floor (52%)

---

## Rate Limiting & Overfire Protection
- **Per-event cooldown:** 30–60 min (Stage 3)
- **Global throttle (starting defaults):**
  - max **12 S2_EXECUTION_ELIGIBLE** signals per hour (all sports combined)
  - max **4 S2_EXECUTION_ELIGIBLE** signals per sport per hour
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
This file is the **single source of truth** for scan + signal sourcing.
Execution logic lives elsewhere.`;
