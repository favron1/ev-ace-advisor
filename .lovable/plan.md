

# Core Logic Versioning System

## Overview

This plan implements a version-controlled Core Logic system that:
1. **Freezes v1.0** as the immutable canonical baseline
2. **Creates v1.1** as an experimental variant with documented changes
3. **Tags all signals** with `core_logic_version` for comparative analysis
4. **Enables side-by-side evaluation** of signal quality between versions

---

## Current State

| Component | Status |
|-----------|--------|
| Core Logic v1.0 Document | Exists in `src/lib/core-logic-document.ts` |
| Implementation | Matches v1.0 thresholds in `polymarket-monitor/index.ts` |
| Version Tracking | NOT IMPLEMENTED - signals don't record which version generated them |
| Multiple Versions | NOT SUPPORTED - single document only |

---

## Architecture

```text
+----------------------------------+
|     Core Logic Documents         |
+----------------------------------+
|                                  |
|  +-----------+   +-----------+   |
|  |   v1.0    |   |   v1.1    |   |
|  | (frozen)  |   | (active)  |   |
|  +-----------+   +-----------+   |
|        |               |         |
+--------|---------------|--------+
         |               |
         v               v
+----------------------------------+
|   polymarket-monitor/index.ts    |
|   (imports active version)       |
+----------------------------------+
         |
         v
+----------------------------------+
|  signal_opportunities table      |
|  +core_logic_version column      |
+----------------------------------+
```

---

## Phase 1: Database Schema Change

Add `core_logic_version` column to track signal origin:

```sql
-- Add version tracking column
ALTER TABLE signal_opportunities 
ADD COLUMN core_logic_version TEXT DEFAULT 'v1.0';

-- Add version to signal_logs for settlement tracking
ALTER TABLE signal_logs 
ADD COLUMN core_logic_version TEXT;
```

---

## Phase 2: Create Versioned Document Structure

### File: `src/lib/core-logic-v1.0.ts` (NEW - FROZEN)

Move current document to dedicated frozen file:
- Exact copy of current v1.0 content
- Header comment: `// FROZEN - DO NOT MODIFY`
- Export: `CORE_LOGIC_V1_0_DOCUMENT`

### File: `src/lib/core-logic-v1.1.ts` (NEW - EXPERIMENTAL)

Create experimental version with:
- "Changes from v1.0" section at top
- Same structure as v1.0
- Tunable parameters clearly marked

Example changes for v1.1:
```markdown
## Changes from v1.0

### Modified Thresholds (Experimental)
- Movement trigger: 6.0% -> **5.0%** (increased sensitivity)
- Velocity trigger: 0.4%/min -> **0.3%/min** (lower bar)
- S1 confidence floor: 45 -> **40** (capture more marginal signals)

### New Features
- Sport-specific threshold overrides
- Enhanced degradation modes
```

### File: `src/lib/core-logic-document.ts` (MODIFIED)

Refactor to:
1. Import both versions
2. Export `ACTIVE_CORE_LOGIC_VERSION = 'v1.1'`
3. Export version-aware accessors

```typescript
import { CORE_LOGIC_V1_0_DOCUMENT } from './core-logic-v1.0';
import { CORE_LOGIC_V1_1_DOCUMENT, CORE_LOGIC_V1_1_CONSTANTS } from './core-logic-v1.1';

export const ACTIVE_CORE_LOGIC_VERSION = 'v1.1';

export function getCoreLogicDocument(version: string) {
  return version === 'v1.0' ? CORE_LOGIC_V1_0_DOCUMENT : CORE_LOGIC_V1_1_DOCUMENT;
}

export function getCoreLogicConstants(version: string) {
  return version === 'v1.0' ? CORE_LOGIC_V1_0_CONSTANTS : CORE_LOGIC_V1_1_CONSTANTS;
}
```

---

## Phase 3: Extract Programmable Constants

### File: `src/lib/core-logic-v1.0.ts`

Add typed constants alongside the document:

```typescript
export const CORE_LOGIC_V1_0_CONSTANTS = {
  VERSION: 'v1.0',
  
  // Stage 2: Movement Engine
  MOVEMENT_THRESHOLD: 0.06,       // 6.0% absolute
  VELOCITY_THRESHOLD: 0.004,      // 0.4% per minute
  SHARP_CONSENSUS_MIN: 2,
  
  // Stage 3.5: Signal State Gates
  S2_CONFIDENCE_MIN: 60,
  S2_BOOK_PROB_MIN: 0.52,
  S2_TIME_TO_START_MIN: 10,
  S1_CONFIDENCE_MIN: 45,
  S1_BOOK_PROB_MIN: 0.48,
  
  // Stage 3: Rate Limiting
  COOLDOWN_MINUTES: 30,
  MAX_S2_PER_HOUR: 12,
  MAX_S2_PER_SPORT_PER_HOUR: 4,
  
  // Stage 3.6: Auto-Promotion
  LIQUIDITY_PREFERENCE: 10000,
} as const;
```

### File: `src/lib/core-logic-v1.1.ts`

Experimental constants with adjustments:

```typescript
export const CORE_LOGIC_V1_1_CONSTANTS = {
  VERSION: 'v1.1',
  
  // Stage 2: Movement Engine (TUNED)
  MOVEMENT_THRESHOLD: 0.05,       // 5.0% (lowered for sensitivity)
  VELOCITY_THRESHOLD: 0.003,      // 0.3% per minute (lowered)
  SHARP_CONSENSUS_MIN: 2,         // unchanged
  
  // Stage 3.5: Signal State Gates (TUNED)
  S2_CONFIDENCE_MIN: 55,          // lowered from 60
  S2_BOOK_PROB_MIN: 0.50,         // lowered from 52%
  S2_TIME_TO_START_MIN: 10,       // unchanged
  S1_CONFIDENCE_MIN: 40,          // lowered from 45
  S1_BOOK_PROB_MIN: 0.45,         // lowered from 48%
  
  // Stage 3: Rate Limiting (INCREASED)
  COOLDOWN_MINUTES: 20,           // reduced from 30
  MAX_S2_PER_HOUR: 20,            // increased from 12
  MAX_S2_PER_SPORT_PER_HOUR: 8,   // increased from 4
  
  // Stage 3.6: Auto-Promotion
  LIQUIDITY_PREFERENCE: 5000,     // lowered from 10K
} as const;
```

---

## Phase 4: Update Edge Function

### File: `supabase/functions/polymarket-monitor/index.ts`

Replace hardcoded `CORE_LOGIC` object with imported version:

```typescript
// At top of file
const ACTIVE_VERSION = 'v1.1';

// Use version-aware constants
const CORE_LOGIC = getCoreLogicConstants(ACTIVE_VERSION);
```

Add version to signal creation:

```typescript
const signalData = {
  // ... existing fields
  core_logic_version: ACTIVE_VERSION,  // NEW
  signal_factors: {
    // ... existing fields
    core_logic_version: ACTIVE_VERSION,  // Also in JSON for querying
  },
};
```

---

## Phase 5: Update UI for Version Display

### File: `src/pages/CoreLogic.tsx`

Add version selector:
- Tabs or dropdown to switch between v1.0 and v1.1
- v1.0 shows "FROZEN" badge
- v1.1 shows "EXPERIMENTAL" badge
- Download respects selected version

### File: `src/components/terminal/SignalCard.tsx`

Display version badge on signals:
- Small chip showing "v1.0" or "v1.1"
- Different colors for easy differentiation

---

## Phase 6: Stats Page Version Comparison

### File: `src/pages/Stats.tsx`

Add version comparison section:
- Filter signals by `core_logic_version`
- Side-by-side metrics: signal volume, win rate, average edge
- Helps evaluate which version performs better

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/core-logic-v1.0.ts` | Frozen v1.0 document + constants |
| `src/lib/core-logic-v1.1.ts` | Experimental v1.1 document + constants |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/core-logic-document.ts` | Refactor to import/export versions |
| `supabase/functions/polymarket-monitor/index.ts` | Import version constants, tag signals |
| `src/types/arbitrage.ts` | Add `core_logic_version` to types |
| `src/pages/CoreLogic.tsx` | Add version selector UI |
| `src/components/terminal/SignalCard.tsx` | Display version badge |
| Database migration | Add `core_logic_version` column |

---

## Database Migration

```sql
-- Migration: Add core_logic_version tracking
ALTER TABLE signal_opportunities 
ADD COLUMN IF NOT EXISTS core_logic_version TEXT DEFAULT 'v1.0';

ALTER TABLE signal_logs 
ADD COLUMN IF NOT EXISTS core_logic_version TEXT;

-- Index for version-based queries
CREATE INDEX IF NOT EXISTS idx_signals_version 
ON signal_opportunities(core_logic_version);

-- Backfill existing signals as v1.0
UPDATE signal_opportunities 
SET core_logic_version = 'v1.0' 
WHERE core_logic_version IS NULL;
```

---

## v1.1 Changes Summary (Proposed)

The experimental v1.1 version relaxes constraints to increase signal volume:

| Parameter | v1.0 | v1.1 | Rationale |
|-----------|------|------|-----------|
| Movement threshold | 6.0% | 5.0% | Catch smaller but significant moves |
| Velocity threshold | 0.4%/min | 0.3%/min | Lower bar for sustained moves |
| S2 confidence | >= 60 | >= 55 | Allow slightly lower confidence |
| S2 book prob | >= 52% | >= 50% | Include coinflip scenarios |
| S1 confidence | >= 45 | >= 40 | Wider S1 funnel |
| Cooldown | 30 min | 20 min | Faster signal refresh |
| Max S2/hour | 12 | 20 | Higher throughput |
| Liquidity pref | $10K | $5K | Include smaller markets |

---

## Expected Outcome

After implementation:
- **v1.0**: Preserved as immutable baseline, signals tagged `v1.0`
- **v1.1**: Active experimental version, signals tagged `v1.1`
- **Auditability**: Every signal shows which logic version generated it
- **Comparison**: Stats page enables v1.0 vs v1.1 performance analysis
- **Rollback**: Can revert to v1.0 by changing `ACTIVE_VERSION`

---

## Implementation Order

1. Database migration (add column)
2. Create `src/lib/core-logic-v1.0.ts` (frozen copy)
3. Create `src/lib/core-logic-v1.1.ts` (experimental variant)
4. Refactor `src/lib/core-logic-document.ts` (version switching)
5. Update `polymarket-monitor/index.ts` (use constants, tag signals)
6. Update `src/types/arbitrage.ts` (add version type)
7. Update `CoreLogic.tsx` (version selector)
8. Update `SignalCard.tsx` (version badge)
9. Update `Stats.tsx` (version comparison)

