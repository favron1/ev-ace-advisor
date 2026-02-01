

# Implement Core Logic Document Page

## Overview

Create a locked, downloadable "Core Logic" page (`/core-logic`) that serves as the single source of truth for the External Scan & Signal Sourcing pipeline. This document is intentionally isolated from UI so frontend changes cannot break signal generation.

## What Will Be Built

### New Route: `/core-logic`

A dedicated page featuring:
- Full markdown rendering of the v1.0 canonical document
- **LOCKED status badge** - Visual indicator that this is read-only
- **Download button** - One-click export as `.md` file
- **Copy button** - Copy full content to clipboard
- **Version display** - Shows `v1.0 (canonical)` prominently
- Terminal-style design matching the app aesthetic

### Document as Code

The canonical document stored as a TypeScript constant:
- Can be imported and referenced from anywhere in the codebase
- Version tracking built-in
- Never auto-modified by UI or tooling

---

## Files to Create

### 1. `src/lib/core-logic-document.ts`

Stores the canonical markdown content:

```typescript
export const CORE_LOGIC_VERSION = "v1.0";
export const CORE_LOGIC_FILENAME = `external_scan_signal_sourcing_${CORE_LOGIC_VERSION}.md`;

export const CORE_LOGIC_DOCUMENT = `# External Scan & Signal Sourcing (5-Stage Flow)
...full markdown content...
`;
```

### 2. `src/components/core-logic/MarkdownRenderer.tsx`

Lightweight custom markdown parser supporting:
- Headings (h1-h6)
- Bold/italic text
- Unordered lists
- Code blocks (monospace styling)
- Horizontal rules
- Tables (basic)
- Paragraphs

No external markdown library - keeps bundle small and gives full control.

### 3. `src/pages/CoreLogic.tsx`

Main page component with:
- Header with back navigation and action buttons
- LOCKED badge + version badge
- Rendered markdown content
- Download and Copy functionality

---

## Files to Modify

### 1. `src/App.tsx`

Add new route:
```typescript
import CoreLogic from "./pages/CoreLogic";

// In Routes:
<Route path="/core-logic" element={<CoreLogic />} />
```

### 2. `src/components/terminal/Header.tsx`

Add navigation button with `BookOpen` icon:
```typescript
import { BookOpen } from 'lucide-react';

// In the button group:
<Button variant="ghost" size="icon" onClick={() => navigate('/core-logic')} title="Core Logic">
  <BookOpen className="h-4 w-4" />
</Button>
```

---

## Page Layout

```text
+------------------------------------------------------------------+
|  [←]  CORE LOGIC              [Copy] [Download] [Stats] [⚙] [↪] |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+  |
|  |  [LOCKED]                    v1.0 (canonical)              |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  # External Scan & Signal Sourcing (5-Stage Flow)                |
|                                                                  |
|  **Version:** v1.0 (canonical)                                   |
|  **Change control:** Any threshold change requires...            |
|                                                                  |
|  ---                                                             |
|                                                                  |
|  ## 5-Stage Flow (Authoritative)                                 |
|  1. Source Odds (multi-source ingest)                            |
|  2. Movement Engine (detect meaningful market moves)             |
|  3. Candidate Builder (score + dedupe)                           |
|  4. Polymarket Match Request (metadata only)                     |
|  5. State Promotion & Dispatch (execution permissioning)         |
|                                                                  |
|  ## Stage Definitions (Contract)                                 |
|  ### 1) Source Odds (Multi-Source Ingest)                        |
|  - Primary Polymarket analytics: Gamma API...                    |
|  ...                                                             |
+------------------------------------------------------------------+
```

---

## Key Thresholds Embedded (From Document)

These are now codified and referenceable:

| Threshold | Value | Stage |
|-----------|-------|-------|
| Movement trigger | >= 6.0% probability change | Stage 2 |
| Velocity trigger | >= 0.4% per minute | Stage 2 |
| Sharp consensus | >= 2 books | Stage 2 |
| S2 confidence | >= 60 | Stage 3.5 |
| S2 book probability | >= 52% | Stage 3.5 |
| S2 time to start | >= 10 min | Stage 3.5 |
| S1 confidence range | 45-59 | Stage 3.5 |
| S1 book probability | 48-51.9% | Stage 3.5 |
| Cooldown | 30-60 min | Stage 3 |
| Max S2 per hour | 12 (all sports) | Rate Limit |
| Max S2 per sport/hour | 4 | Rate Limit |
| Liquidity preference | >= $10K | Stage 3 |

---

## Download Functionality

When user clicks "Download":
1. Creates a Blob from `CORE_LOGIC_DOCUMENT`
2. Generates download with filename: `external_scan_signal_sourcing_v1.0.md`
3. Triggers browser download
4. User can edit externally and re-upload

## Copy Functionality

When user clicks "Copy":
1. Uses `navigator.clipboard.writeText()`
2. Shows toast confirmation "Copied to clipboard"
3. Full markdown available for pasting anywhere

---

## Design Decisions

1. **No edit in UI** - Document is read-only. Editing happens externally.
2. **Version tracking** - Version displayed prominently; changes require version bump.
3. **No live Mermaid** - Flow diagram kept as text/ASCII for export fidelity.
4. **Minimal parser** - Custom parser handles only the subset used in the document.
5. **Terminal styling** - Uses existing dark theme with cards and monospace fonts.

---

## Implementation Order

1. Create `src/lib/core-logic-document.ts` with full document content
2. Create `src/components/core-logic/MarkdownRenderer.tsx` component
3. Create `src/pages/CoreLogic.tsx` page
4. Update `src/App.tsx` to add `/core-logic` route
5. Update `src/components/terminal/Header.tsx` to add BookOpen nav icon

---

## Future Reference

Once implemented, this document can be imported anywhere:

```typescript
import { CORE_LOGIC_DOCUMENT, CORE_LOGIC_VERSION } from '@/lib/core-logic-document';

// Example: log current version
console.log(`Running Core Logic ${CORE_LOGIC_VERSION}`);

// Example: reference thresholds programmatically
// (thresholds are in the document text, not as separate constants)
```

