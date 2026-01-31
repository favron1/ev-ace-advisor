

# Protect the Core Algorithm: Layer 1 vs Layer 2 Separation

## Goal

Establish a clear architectural boundary between the **signal detection engine** (Layer 1 - protected) and the **UI/presentation layer** (Layer 2 - frequently changed). This prevents accidental breaks when making UI improvements.

---

## Current Architecture Analysis

### Layer 1: Core Algorithm (Backend - Protected)

These files contain the signal detection and edge calculation logic. They should ONLY be changed when explicitly requested:

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
| `src/types/arbitrage.ts` | Core type definitions |

### Layer 2: Presentation (Frontend - Frequently Changed)

These files display signals and handle user interaction. Safe to modify without affecting detection:

| File | Purpose |
|------|---------|
| `src/components/terminal/SignalCard.tsx` | Signal card display, countdown, badges |
| `src/components/terminal/SignalFeed.tsx` | Signal list container |
| `src/components/terminal/ScanControlPanel.tsx` | Scan buttons, automation toggles |
| `src/components/terminal/FiltersBar.tsx` | Filter controls |
| `src/components/terminal/ExecutionDecision.tsx` | Decision display component |
| `src/pages/Terminal.tsx` | Main terminal page |
| `src/hooks/useSignals.ts` | Fetches and subscribes to signals |
| `src/lib/api/arbitrage.ts` | API wrapper (calls edge functions) |

### Interface Layer: The Bridge

These define the contract between Layer 1 and Layer 2:

| File | Purpose |
|------|---------|
| `src/types/arbitrage.ts` | Type definitions (shared) |
| Database tables | `signal_opportunities`, `polymarket_h2h_cache` |

---

## Protection Mechanisms to Implement

### 1. Documentation Headers (Layer Markers)

Add clear headers to every file indicating which layer it belongs to:

**Layer 1 files get this header:**
```typescript
// ============================================================================
// LAYER 1: CORE ALGORITHM - PROTECTED
// ============================================================================
// This file is part of the signal detection engine.
// DO NOT MODIFY unless explicitly requested.
// Changes here affect signal detection, edge calculation, and data accuracy.
// ============================================================================
```

**Layer 2 files get this header:**
```typescript
// ============================================================================
// LAYER 2: PRESENTATION - SAFE TO MODIFY
// ============================================================================
// This file handles display and user interaction only.
// Safe to modify for UI improvements, styling, and UX changes.
// ============================================================================
```

### 2. Architecture Documentation File

Create `ARCHITECTURE.md` at project root with:
- Clear definition of Layer 1 vs Layer 2
- File inventory for each layer
- Rules for when to modify Layer 1
- Data contract (what fields Layer 2 can expect)

### 3. Type Contracts (Interface Layer)

Freeze the signal data contract in `src/types/arbitrage.ts`:
- Document every field that Layer 2 depends on
- Add version number to track contract changes
- Layer 2 should ONLY read fields defined in the type

### 4. API Contract Documentation

Document in `src/lib/api/arbitrage.ts`:
- What each edge function returns
- Expected response shapes
- Never call edge functions directly from components (always via hooks)

### 5. Read-Only Hook Pattern

Ensure `useSignals.ts` acts as the ONLY interface between Layer 2 and data:
- Layer 2 components should never call `supabase` directly
- All data access goes through the hook
- This creates a single point of control

---

## Files to Create/Update

| File | Action | Purpose |
|------|--------|---------|
| `ARCHITECTURE.md` | **CREATE** | Master architecture documentation |
| `supabase/functions/polymarket-sync-24h/index.ts` | Add header | Mark as Layer 1 |
| `supabase/functions/polymarket-monitor/index.ts` | Add header | Mark as Layer 1 |
| `supabase/functions/_shared/sports-config.ts` | Add header | Mark as Layer 1 |
| `src/lib/execution-engine.ts` | Add header | Mark as Layer 1 |
| `src/types/arbitrage.ts` | Add header + version | Interface layer contract |
| `src/components/terminal/SignalCard.tsx` | Add header | Mark as Layer 2 |
| `src/components/terminal/ScanControlPanel.tsx` | Add header | Mark as Layer 2 |
| `src/pages/Terminal.tsx` | Add header | Mark as Layer 2 |
| `src/hooks/useSignals.ts` | Add header + docs | Interface layer bridge |
| `src/lib/api/arbitrage.ts` | Add header + docs | API contract layer |

---

## ARCHITECTURE.md Contents

```markdown
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
- Database tables define the schema

## File Inventory

### Layer 1 Files (DO NOT MODIFY without explicit request)
- supabase/functions/polymarket-sync-24h/
- supabase/functions/polymarket-monitor/
- supabase/functions/ingest-odds/
- supabase/functions/refresh-signals/
- supabase/functions/settle-bets/
- supabase/functions/_shared/
- src/lib/execution-engine.ts

### Layer 2 Files (Safe to modify)
- src/components/terminal/*
- src/pages/Terminal.tsx
- src/pages/Stats.tsx
- src/pages/Settings.tsx

### Interface Files (Modify carefully - affects both layers)
- src/types/arbitrage.ts
- src/hooks/useSignals.ts
- src/lib/api/arbitrage.ts
```

---

## Data Contract (Signal Fields Layer 2 Can Use)

From `signal_opportunities` table via `useSignals`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `event_name` | string | Game title |
| `recommended_outcome` | string | Team to bet on |
| `side` | 'YES' or 'NO' | Which side to buy |
| `polymarket_price` | number | Current Polymarket price |
| `edge_percent` | number | Raw edge % |
| `confidence_score` | number | 0-100 confidence |
| `urgency` | enum | 'low', 'normal', 'high', 'critical' |
| `expires_at` | string | ISO timestamp of kickoff |
| `is_true_arbitrage` | boolean | Has Polymarket match |
| `polymarket_slug` | string | URL slug for direct links |
| `polymarket_volume` | number | Market volume in $ |
| `signal_tier` | enum | 'elite', 'strong', 'static' |

Layer 2 should ONLY read these fields. If a new field is needed, update Layer 1 first.

---

## Summary

After this implementation:
1. Every file has a clear Layer 1/2 marker
2. `ARCHITECTURE.md` serves as the reference document
3. When you ask for UI changes, I will only touch Layer 2 files
4. When you explicitly ask to modify the algorithm, I will touch Layer 1 files
5. The data contract is documented so we know what fields are safe to use

This creates a **firewall** between the detection engine and the presentation layer.

