
Goal
- Make “LIVE / started” signals visible in the Signal Feed even when “Movement‑Confirmed Only” is enabled, and prevent the “empty feed” confusion when filters hide everything.

What’s happening now (confirmed from code + backend data)
- The Terminal page defaults `showMovementConfirmedOnly = true`.
- `useSignals.getFilteredSignals()` hides signals that are not movement-confirmed when that toggle is on.
- The Michigan signal was updated by the monitor into a STATIC / movement_confirmed=false state (edge logs show it), so it gets filtered out.
- Result: the signal still exists in the backend, but it’s excluded by the default filter, so it “disappears” from the feed.

Fix strategy (frontend-only, no schema changes)
1) Treat “LIVE” as a special case in filtering
- Update `src/hooks/useSignals.ts`:
  - In `getFilteredSignals()`, when `movementConfirmedOnly` is true, do NOT filter out a signal if it has already started (i.e., `expires_at <= now`).
  - This preserves the professional default (“only show confirmed signals”) while still surfacing started events so users can see “LIVE” and understand why execution is locked.

Implementation detail
- Compute `hasStarted` inside the filter function:
  - `const hasStarted = s.expires_at ? new Date(s.expires_at).getTime() <= Date.now() : false;`
- Then adjust the movement-confirmed filter block:
  - Current logic: filters out `tier === 'static' && !movement_confirmed`
  - New logic: apply that filter only if `!hasStarted`

2) Improve empty-state messaging so users know it’s filtering (not “no signals exist”)
- Update `src/components/terminal/SignalFeed.tsx` to support better UX when the feed is empty because of filters:
  - Add optional props like:
    - `totalSignals?: number` (count before filtering)
    - `onClearFilters?: () => void` (optional callback)
  - If `signals.length === 0` but `totalSignals && totalSignals > 0`, render a different empty state:
    - Title: “No signals match your filters”
    - Body: “Try turning off Movement‑Confirmed Only or lowering thresholds.”
    - Button: “Show all” (calls `onClearFilters`)
  - Keep the existing “No Active Signals” empty state for when total is truly 0.

3) Wire the “clear filters” action from Terminal
- Update `src/pages/Terminal.tsx`:
  - Compute `totalActiveSignals = signals.length` (this is the unfiltered, enriched set coming from `useSignals`)
  - Pass `totalSignals={totalActiveSignals}` into `SignalFeed`
  - Implement `onClearFilters` handler that resets:
    - `setShowMovementConfirmedOnly(false)`
    - `setShowBettableOnly(false)`
    - `setShowTrueEdgesOnly(false)`
    - `setMinEdge(0)`
    - `setMinConfidence(0)`
    - `setSelectedUrgency([])`
  - Pass `onClearFilters` to `SignalFeed`

4) Verify “LIVE” display remains correct and execution stays locked
- No changes needed in `SignalCard` for the LIVE badge itself; it already derives `hasStarted` from `expires_at` and shows a pulsing LIVE badge, and `canExecuteSignal()` already blocks execution when started.
- After the filter change, the Michigan signal should appear again (even if STATIC) and show LIVE + locked execution.

Edge cases handled
- If `expires_at` is missing: it will behave as before (still filterable). This is fine; only events with known kickoff time can be reliably treated as LIVE.
- If a signal flips between STRONG → STATIC while the game is ongoing: it will remain visible because `hasStarted` overrides movement-only filtering.
- If the backend later marks the signal status as `expired`: it will disappear because the API query only fetches `status=active`. That’s acceptable unless we decide we want a “Recently Started” section (separate enhancement).

Files to change (all frontend)
- `src/hooks/useSignals.ts` (filter logic: allow started events through movementConfirmedOnly)
- `src/components/terminal/SignalFeed.tsx` (better “filtered empty” UX + optional Clear Filters CTA)
- `src/pages/Terminal.tsx` (pass total count + implement clear filters handler)

Acceptance criteria
- With “Movement‑Confirmed Only” ON, a started game’s signal still appears in the feed and shows LIVE, with execution disabled.
- If filters hide all signals, the UI explicitly says filters are the reason and provides a one-click “Show all” action.
- No changes to backend schema or monitoring logic are required for this fix.