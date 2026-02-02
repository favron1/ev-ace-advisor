

## Price Validation Audit - Summary

### What You Asked
You questioned whether we're getting correct Polymarket prices compared to what you see on the website.

### Finding: Polymarket Prices ARE Correct

I compared your screenshots to our database cache and confirmed the prices match within 1-2 cents:

| Game | Your Screenshot | Our Cache | Match |
|------|-----------------|-----------|-------|
| Sabres vs Panthers | BUF 47c / FLA 54c | 0.46 / 0.54 | Yes |
| Red Wings vs Avalanche | DET 35c / COL 66c | 0.34 / 0.66 | Yes |
| Senators vs Penguins | OTT 49c / PIT 52c | 0.48 / 0.52 | Yes |
| Islanders vs Capitals | NYI 47c / WSH 55c | 0.45 / 0.55 | Yes |
| Canadiens vs Wild | MTL 45c / MIN 56c | 0.44 / 0.56 | Yes |
| Blues vs Predators | STL 43c / NSH 58c | 0.42 / 0.58 | Yes |
| Jets vs Stars | WPG 40c / DAL 61c | 0.39 / 0.61 | Yes |
| Maple Leafs vs Flames | TOR 53c / CGY 48c | 0.52 / 0.48 | Yes |
| Canucks vs Utah | VAN 30c / UTAH 71c | 0.29 / 0.71 | Yes |

The CLOB price refresh is working correctly. Prices update regularly (last update: 07:19 UTC).

---

### Root Cause of "Negative Edges" Found

The reason for negative edges is **NOT incorrect Polymarket prices**. I found a bug in how `watch-mode-poll` calculates bookmaker fair probability for NHL games:

**The Bug: NHL 3-Way Odds Not Normalized to 2-Way**

Example - Red Wings vs Avalanche:
- Bookmaker raw data includes Draw: Colorado 54%, Detroit 26%, Draw 20%
- Current calculation: Detroit fair = 26% / 100% = 26%
- Polymarket price: 34c
- Calculated edge: 26% - 34% = **-8%** (wrong!)

Correct calculation (2-way normalized):
- Detroit fair = 26% / (26% + 54%) = **32.5%**
- Polymarket price: 34c
- Correct edge: 32.5% - 34% = **-1.5%** (still not actionable, but accurate)

The `refresh-signals` function already handles this correctly (filters out Draw/Tie for NHL), but `watch-mode-poll` does not.

---

### Fix Required

Add NHL 3-way to 2-way normalization in `watch-mode-poll` function, matching the logic already present in `refresh-signals`.

#### Technical Changes

**File: `supabase/functions/watch-mode-poll/index.ts`**

In the vig-free probability calculation section (around lines 706-728), add logic to:
1. Detect if the sport is NHL
2. Filter out any "Draw" or "Tie" outcomes from the probability map
3. Renormalize the remaining 2-way probabilities before calculating edge

This is a straightforward fix that replicates existing logic from `refresh-signals` into `watch-mode-poll`.

---

### Summary

1. Polymarket prices are correct (validated against your screenshots)
2. The issue is NHL 3-way odds not being converted to 2-way before edge calculation
3. This affects all NHL games and explains the large negative edges
4. Single-file fix required in `watch-mode-poll`

