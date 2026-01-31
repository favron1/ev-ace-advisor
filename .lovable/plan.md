

# Implementation Plan: Funnel Logging + Matching Improvements

## Problem Diagnosis

Based on log analysis, the matching pipeline has several bottlenecks:

```text
Funnel Analysis (from logs):
+----------------------------------+-------+
| watching_total                   | 272   |
| skipped_no_tokens (Firecrawl)    | 114   |
| tradeable (with token_id)        | 158   |
+----------------------------------+-------+
| After TIME checks                       |
| - OUTSIDE_24H_WINDOW             | ~20+  |
| - DATE_DAY_MISMATCH              | ~10+  |
+----------------------------------+-------+
| matched_book_events              | 8     |
| edges_over_threshold             | ~1    |
| signals_created                  | 0     |
+----------------------------------+-------+
```

**Root Causes Identified:**

1. **Day calculation bug**: `daysDiffUTC(Jan 31, Feb 2) = 2` exceeds threshold of 1 - need to relax to 2 days for placeholder times
2. **OUTSIDE_24H_WINDOW too strict**: Games 25h away are being skipped (should allow 36h for discovery)
3. **Missing funnel logging**: No visibility into where tradeable markets fail matching
4. **MIN_EDGE at 5%**: Legitimate 1-3% edges being filtered out

## Technical Changes

### File: `supabase/functions/polymarket-monitor/index.ts`

### Change 1: Relax DATE_DAY_MISMATCH Threshold (line ~863)

Current threshold of 1 day is too strict. Increase to 2 days for placeholder times:

**Before:**
```typescript
const dd = daysDiffUTC(polymarketEventDate, bookmakerDate);
if (dd > 1) {
```

**After:**
```typescript
const dd = daysDiffUTC(polymarketEventDate, bookmakerDate);
if (dd > 2) {  // Allow same day, next day, or day after for placeholder times
```

### Change 2: Extend OUTSIDE_24H_WINDOW to 36 Hours (line ~878)

Allow games up to 36h away to be discovered (still checks edge thresholds later):

**Before:**
```typescript
if (hoursUntilStart < -0.5 || hoursUntilStart > 24) {
```

**After:**
```typescript
if (hoursUntilStart < -0.5 || hoursUntilStart > 36) {
```

### Change 3: Add Comprehensive Funnel Logging (after line ~1395)

Add counters to track exactly where matches fail:

```typescript
// ============= FUNNEL LOGGING =============
// Track exactly where matches fail for debugging
let funnelStats = {
  watching_total: eventsToProcess.length,
  skipped_no_tokens: 0,
  skipped_no_bookmaker_data: 0,
  skipped_expired: 0,
  skipped_date_mismatch: 0,
  skipped_time_window: 0,
  tier1_direct: 0,
  tier2_nickname: 0,
  tier3_fuzzy: 0,
  tier4_ai: 0,
  matched_total: 0,
  edges_calculated: 0,
  edges_over_threshold: 0,
  signals_created: 0,
};

// ... inside the processing loop, increment counters at each stage:
// - When NO_TOKEN_ID_SKIP: funnelStats.skipped_no_tokens++
// - When bookmakerGames.length === 0: funnelStats.skipped_no_bookmaker_data++
// - When DATE_DAY_MISMATCH: funnelStats.skipped_date_mismatch++
// - When OUTSIDE_24H_WINDOW: funnelStats.skipped_time_window++
// - When match succeeds: funnelStats.tier{N}_{method}++ and funnelStats.matched_total++

// At end of run:
console.log(`[POLY-MONITOR] FUNNEL_STATS:`, JSON.stringify(funnelStats));
```

### Change 4: Lower MIN_EDGE from 5% to 3% (around line ~1730)

Create signals for smaller but still profitable edges:

**Before:**
```typescript
const MIN_EDGE = 0.05;  // 5%
```

**After:**
```typescript
const MIN_EDGE = 0.03;  // 3% for signal creation (still validates edge quality)
```

### Change 5: Add Match Failure Logging in findBookmakerMatch()

After the team matching loop (around line ~1058), add logging when no match is found:

```typescript
// At end of findBookmakerMatch, before returning null:
console.log(`[POLY-MONITOR] MATCH_FAILED: "${eventName}" | tried ${bookmakerGames.length} games | dateSkips=X, timeSkips=X, teamMismatch=X`);
return null;
```

## Summary of Changes

| Location | Change | Purpose |
|----------|--------|---------|
| Line ~863 | `dd > 2` instead of `dd > 1` | Allow 2-day window for placeholder times |
| Line ~878 | `hoursUntilStart > 36` instead of `> 24` | Discover games up to 36h away |
| After line ~1395 | Add funnelStats counters | Track where matches fail |
| Line ~1730 | `MIN_EDGE = 0.03` | Surface smaller but valid edges |
| Line ~1058 | Add MATCH_FAILED logging | Debug why matches fail |

## Expected Improvement

| Metric | Before | After (expected) |
|--------|--------|------------------|
| DATE_DAY_MISMATCH skips | ~10+ | ~2-3 |
| OUTSIDE_24H_WINDOW skips | ~20+ | ~5-10 |
| Matched events | 8 | 30-50 |
| Edges surfaced | 1 | 5-15 |
| Signals created | 0 | 1-5 (with 3% threshold) |

## Testing

1. Deploy the updated function
2. Trigger a polymarket-monitor scan
3. Check logs for `FUNNEL_STATS` summary
4. Verify matched events increased
5. Check if signals are being created with 3% edges

