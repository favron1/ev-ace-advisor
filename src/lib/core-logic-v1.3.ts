// ============================================================================
// CORE LOGIC v1.3 - EXPERIMENTAL
// ============================================================================
// This version introduces Match Failure Flip - an observability layer that
// prevents silent signal drops due to unmatched team names.
// ============================================================================

export const CORE_LOGIC_V1_3_VERSION = "v1.3";

export const CORE_LOGIC_V1_3_FILENAME = `external_scan_signal_sourcing_${CORE_LOGIC_V1_3_VERSION}.md`;

// ============================================================================
// PROGRAMMABLE CONSTANTS - v1.3 (same thresholds as v1.1, new match behavior)
// ============================================================================

export const CORE_LOGIC_V1_3_CONSTANTS = {
  VERSION: 'v1.3' as const,
  
  // Stage 2: Movement Engine (same as v1.1)
  MOVEMENT_THRESHOLD: 0.05,
  VELOCITY_THRESHOLD: 0.003,
  SHARP_CONSENSUS_MIN: 2,
  TIME_WINDOW_MIN: 5,
  TIME_WINDOW_MAX: 15,
  
  // Stage 3: Candidate Builder (same as v1.1)
  COOLDOWN_MINUTES: 20,
  COOLDOWN_MINUTES_MAX: 45,
  LIQUIDITY_PREFERENCE: 5000,
  
  // Stage 3.5: Signal State Gates (same as v1.1)
  S2_CONFIDENCE_MIN: 55,
  S2_BOOK_PROB_MIN: 0.50,
  S2_TIME_TO_START_MIN: 10,
  
  S1_CONFIDENCE_MIN: 40,
  S1_CONFIDENCE_MAX: 54,
  S1_BOOK_PROB_MIN: 0.45,
  S1_BOOK_PROB_MAX: 0.499,
  S1_TIME_TO_START_MIN: 5,
  S1_TIME_TO_START_MAX: 9,
  
  // Stage 3.6: Auto-Promotion (same as v1.1)
  AUTO_PROMOTE_CONFIDENCE: 55,
  AUTO_PROMOTE_LIQUIDITY: 5000,
  AUTO_PROMOTE_BOOKS: 3,
  
  // Rate Limiting (same as v1.1)
  MAX_S2_PER_HOUR: 20,
  MAX_S2_PER_SPORT_PER_HOUR: 8,
  
  // Failure/Degradation (same as v1.1)
  DEGRADED_CONFIDENCE_CAP: 65,
  DISAGREE_CONFIDENCE_PENALTY: 10,
  
  // NEW in v1.3: Match Failure Behavior
  MATCH_FAILURE_FORCE_WATCH: true,
  MATCH_FAILURE_BLOCK_S2: true,
} as const;

// Import base type from v1.0 for consistency
import type { CoreLogicConstants } from './core-logic-v1.0';

// Re-export the base type
export type { CoreLogicConstants };

// ============================================================================
// DOCUMENT CONTENT - v1.3
// ============================================================================

export const CORE_LOGIC_V1_3_DOCUMENT = `# External Scan & Signal Sourcing (5-Stage Flow)

**Version:** v1.3 (experimental)  
**Status:** EXPERIMENTAL — Ready for deployment  
**Base:** v1.1 (experimental), v1.0 (canonical)  
**Change control:** v1.0 remains frozen. All changes from v1.1 are documented below.

---

## Changes from v1.1

### New Feature — Match Failure Flip (Observability Layer)

**Problem (v1.1 and earlier):**
- Unmatched team strings (e.g. abbreviations, misspellings) cause silent drops.
- Signals fail without visibility, reducing effective coverage.

**Solution (v1.3):**
- Flip default behavior from *silent drop* → *explicitly logged WATCH state*.
- Introduce persistent match-failure tracking and manual resolution.

**Key Behaviors (v1.3):**
- Unmatched teams are logged to \`match_failures\` table.
- Signals with unresolved team mappings are forced to **WATCH**, never executed.
- UI surfaces unresolved mappings for manual correction.
- Once mapped, future signals auto-resolve permanently.

This change improves signal retention, observability, and long-term system accuracy
without relaxing execution discipline.

---

## Modified Thresholds (unchanged from v1.1)

| Parameter | v1.0 | v1.1 / v1.3 |
|-----------|------|-------------|
| Movement trigger | 6.0% | 5.0% |
| Velocity trigger | 0.4%/min | 0.3%/min |
| S2 confidence | ≥60 | ≥55 |
| S2 book prob | ≥52% | ≥50% |
| S1 confidence | ≥45 | ≥40 |
| S1 book prob | ≥48% | ≥45% |
| Cooldown | 30–60 min | 20–45 min |
| Liquidity pref | $10K | $5K |
| Max S2/hr | 12 | 20 |
| Max S2/hr/sport | 4 | 8 |

---

## 5-Square Flow (Authoritative)

\`\`\`mermaid
flowchart LR
  A[1) Source Odds] -->
  B[2) Movement Engine] -->
  C[3) Candidate Builder] -->
  D[4) Poly Match + Team Resolution] -->
  E[5) State Promotion & Dispatch]
\`\`\`

---

## Stage Definitions (Contract)

### 1) Source Odds
(unchanged from v1.1)

---

### 2) Movement Engine
(unchanged from v1.1)

---

### 3) Candidate Builder
(unchanged from v1.1)

---

### 4) Poly Match + Team Resolution (UPDATED)

**New in v1.3:** team resolution is explicit and observable.

**Team Matching Outcomes:**
- **MATCHED:** canonical team mapping exists → continue pipeline
- **SUGGESTED:** fuzzy match found → surfaced in UI, not auto-applied
- **UNMATCHED:** no confident match

**v1.3 Rules:**
- UNMATCHED teams:
  - Logged/upserted into \`match_failures\`
  - Signal forced to **WATCH**
  - Execution explicitly blocked
- SUGGESTED matches:
  - Display suggestion only
  - Require manual confirmation
- Once resolved:
  - Mapping saved permanently
  - All future signals auto-match

This stage never executes trades.

---

### 5) Signal Quality Gates & Dispatch

Signal states remain:

- **S1_PROMOTE**
- **S2_EXECUTION_ELIGIBLE**
- **WATCH**
- **REJECT**

**Additional v1.3 Gate:**
- Any unresolved team mapping → **WATCH only** (hard block on S2)

All other gates unchanged from v1.1.

---

## Match Failure Tracking (NEW)

### match_failures Table (Conceptual)

Fields:
- league
- raw_team_string
- source (books / polymarket)
- count
- first_seen_at
- last_seen_at
- suggested_match (nullable)
- status (open | resolved | ignored)

Failures are aggregated by \`(league, raw_team_string)\` to avoid UI spam.

---

## Design Guarantees (Updated)

- No silent signal drops due to team mismatches
- No auto-guessing into canonical mappings
- Human-in-the-loop correction only
- Execution discipline preserved

---

## Status

This file defines **Core Logic v1.3**.
Signals must be tagged with \`core_logic_version = 'v1.3'\`.`;
