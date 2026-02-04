
# Fix: Polymarket Price Accuracy Issues

## Problem Summary

Your signal shows **45¢** for the OKC vs Spurs game, but the actual Polymarket price is **23¢** for OKC (78¢ for Spurs). This is a significant data quality bug causing false edge calculations.

## Technical Root Causes

### 1. Firecrawl Scraper Parsing Wrong Prices
The Firecrawl markdown parser is extracting incorrect prices. The NBA games page has changed its format, and the regex pattern is no longer matching correctly.

**Current behavior**: Extracting "OKC55¢" when real price is "OKC23¢"

### 2. Token IDs Point to Old/Dead Markets
When the system searches for token IDs:
- Gamma API finds the event but reports "no H2H market with tokens"
- CLOB Search fallback returns tokens from a **2023 game** (which is finished)
- This explains the "No orderbook exists" error

### 3. NBA Markets Not Yet CLOB-Tradeable
Many NBA H2H markets are visible on the Polymarket UI but not yet enabled for CLOB API trading. This is a Polymarket platform limitation that makes these markets untradeable through their API.

---

## Implementation Plan

### Phase 1: Validate Token-Price Consistency (Critical)

**File**: `supabase/functions/polymarket-monitor/index.ts`

Add a validation check that detects stale/invalid tokens:

```text
Before using a token for pricing:
1. Fetch orderbook for token
2. If "No orderbook exists" → mark as untradeable
3. Skip signal creation for this market
```

This prevents creating signals with garbage 2023 data.

### Phase 2: Fix Firecrawl Price Extraction

**File**: `supabase/functions/_shared/firecrawl-scraper.ts`

Update the price parsing logic to handle the current Polymarket page format:

```text
1. Parse multiple price formats from markdown
2. Validate price pairs sum to ~100%
3. If prices don't validate, skip that market
```

### Phase 3: Add Token Freshness Validation

**File**: `supabase/functions/tokenize-market/index.ts`

When CLOB Search returns a result:

```text
1. Check if the market question contains a date
2. If date is older than 7 days → reject as stale
3. Only use tokens from current/upcoming games
```

### Phase 4: NBA Market Handling Strategy

For NBA markets where CLOB API isn't available:

```text
Option A: Use Firecrawl prices only (lower confidence)
- Create signals with is_clob_verified = false
- Display warning in UI: "Price from UI scrape, not CLOB"

Option B: Block NBA H2H signals until CLOB-tradeable
- Mark these as untradeable with reason "NBA_CLOB_NOT_AVAILABLE"
- Focus on NHL games which have proper CLOB support
```

---

## Expected Outcome

| Before Fix | After Fix |
|------------|-----------|
| Signal shows 45¢ (wrong) | Signal blocked (untradeable) or shows 23¢ (correct) |
| Uses 2023 token IDs | Validates token freshness |
| Creates signals for untradeable markets | Only creates signals for CLOB-verified markets |

---

## Files to Modify

| File | Changes |
|------|---------|
| `polymarket-monitor/index.ts` | Add token validation check before pricing |
| `tokenize-market/index.ts` | Add date filter to CLOB search results |
| `firecrawl-scraper.ts` | Fix price parsing regex patterns |
| `polymarket-sync-24h/index.ts` | Validate scraped prices before caching |
