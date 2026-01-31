
# 3-Step Fix Plan: Polymarket Tokenization Pipeline

## Executive Summary

The system has **two critical data failures** that create garbage signals:

| Problem | Current State | Impact |
|---------|---------------|--------|
| **Missing Token IDs** | NBA/CBB from Firecrawl/scrape-nba: 0-5% token coverage | Markets fallback to 0.50 prices, unusable |
| **Fair Probability Outlier Bug** | 92% threshold blocks valid sharp data | Creates false 32% edges on heavy favorites |
| **Low Match Rate** | 11% of events match to bookmaker data | 89% of potential opportunities missed |

**Root Cause:** Firecrawl/scrape-nba extract **visible prices** (e.g., "lal76¢") from markdown, but **never extract token IDs**. Without token IDs, the system cannot:
1. Fetch real-time CLOB executable prices
2. Validate price accuracy
3. Determine which contract is YES vs NO

## Database Evidence

```text
Source          | Total | Has Tokens | Token %
----------------|-------|------------|--------
api (Gamma)     | 1,279 |      1,279 | 100%
gamma-api       |    81 |         81 | 100%
firecrawl       |    51 |          0 | 0%      ← BROKEN
scrape-nba      |    37 |          2 | 5%      ← BROKEN
```

---

## Step 1: Build Tokenization Service (UI Repair Path)

**Goal:** Every discovered market ends in one of two states: `TOKENIZED` or `UNTRADEABLE`

### 1.1 Create New Edge Function: `tokenize-market`

A dedicated service to resolve token IDs from any market reference.

```text
INPUT:
  - market_url OR slug OR condition_id OR team names

OUTPUT:
  - condition_id
  - token_id_yes
  - token_id_no
  - token_source: 'clob' | 'gamma' | 'ui_network' | 'ui_dom'
  - confidence: 0-100
  - OR: { tradeable: false, untradeable_reason: 'MISSING_TOKENS' }
```

### 1.2 Extraction Priority Order

The function will try multiple extractors in order:

```text
Priority 1: CLOB API Direct
  └─ GET https://clob.polymarket.com/markets/{condition_id}
  └─ Returns: { tokens: [{ token_id, outcome }] }
  └─ Confidence: 100%

Priority 2: Gamma API Lookup (by team names)
  └─ GET https://gamma-api.polymarket.com/events?tag_slug=nba
  └─ Search for matching event, extract clobTokenIds
  └─ Confidence: 95%

Priority 3: Firecrawl HTML + __NEXT_DATA__ Extraction
  └─ Scrape market page with Firecrawl (formats: ['html'])
  └─ Parse <script id="__NEXT_DATA__">
  └─ Extract conditionId, clobTokenIds from JSON
  └─ Confidence: 80%

Priority 4: CLOB Search (batch)
  └─ GET https://clob.polymarket.com/markets?limit=500
  └─ Search by team nicknames in question/description
  └─ Confidence: 75%

FALLBACK: Mark untradeable
  └─ { tradeable: false, untradeable_reason: 'MISSING_TOKENS' }
```

### 1.3 Database Schema Addition

Add new fields to `polymarket_h2h_cache`:

```sql
ALTER TABLE polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS tradeable boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS untradeable_reason text,
ADD COLUMN IF NOT EXISTS token_source text,
ADD COLUMN IF NOT EXISTS token_confidence numeric,
ADD COLUMN IF NOT EXISTS last_token_repair_at timestamptz;
```

### 1.4 Hard Rule Enforcement

**No tokens = No price = No signal**

At the earliest point in `polymarket-monitor`, before any price calculation:

```typescript
// HARD GATE: Cannot trade without token IDs
if (!cache?.token_id_yes) {
  await supabase.from('polymarket_h2h_cache').update({
    tradeable: false,
    untradeable_reason: 'MISSING_TOKENS'
  }).eq('condition_id', conditionId);
  
  funnelStats.blocked_no_tokens++;
  continue; // Skip to next market
}
```

---

## Step 2: Kill Garbage Signals + Add Funnel Visibility

**Goal:** Eliminate 0.50/0.999 placeholders and make failures measurable

### 2.1 Remove All Placeholder Price Logic

Currently in multiple files, the system falls back to `0.5` when data is missing:

**scrape-polymarket-prices (line 179):**
```typescript
// REMOVE: Placeholder fallback
yes_price: game.team1Price,  // This is from markdown, not CLOB
```

**polymarket-monitor (line 1489):**
```typescript
// REMOVE: Placeholder fallback
let livePolyPrice = cache?.yes_price || event.polymarket_yes_price || 0.5;
```

Replace with strict token-gated logic:
```typescript
// STRICT: No token = skip entirely (already handled by gate above)
const tokenIdYes = cache?.token_id_yes;
if (!tokenIdYes || !clobPrices.has(tokenIdYes)) {
  console.log('[FUNNEL] SKIP: No executable price for', event.event_name);
  funnelStats.no_executable_price++;
  continue;
}
const livePolyPrice = clobPrices.get(tokenIdYes)!.ask;
```

### 2.2 Implement Funnel Counters

Add comprehensive tracking to `polymarket-monitor`:

```typescript
interface FunnelStats {
  // Discovery
  discovered_markets: number;
  
  // Tokenization Gate
  tokenized: number;
  blocked_no_tokens: number;
  
  // Matching
  matched_to_bookmaker: number;
  match_tier1_canonical: number;
  match_tier2_nickname: number;
  match_tier3_fuzzy: number;
  skipped_no_bookmaker: number;
  
  // Pricing
  priced_from_clob: number;
  rejected_garbage_price: number;
  
  // Sanity
  passed_sanity: number;
  failed_sanity_outlier: number;
  
  // Signal
  positive_ev: number;
  signaled: number;
}
```

**Summary Log Output:**
```text
[POLY-MONITOR] FUNNEL_SUMMARY
  NBA:  64 discovered → 62 tokenized → 40 matched → 33 priced → 28 sane → 6 +EV → 2 signaled
  NHL: 142 discovered → 142 tokenized → 130 matched → 125 priced → 118 sane → 8 +EV → 3 signaled
```

### 2.3 Update Firecrawl Scrapers

Modify `scrape-polymarket-prices` and `scrape-polymarket-nba` to:

1. **Request HTML format** (not just markdown) to access `__NEXT_DATA__`
2. **Call tokenization service** before upserting
3. **Mark untradeable** if tokens cannot be resolved

```typescript
// NEW FLOW in scrape-polymarket-prices
const firecrawlData = await fetch('...', {
  body: JSON.stringify({
    url: sportUrl,
    formats: ['markdown', 'html'],  // ADD HTML
    waitFor: 5000,
  })
});

const html = firecrawlData.data?.html || '';

// Extract token IDs from __NEXT_DATA__
const tokenData = extractTokensFromNextData(html);

// Only upsert if we have tokens
if (tokenData.tokenIdYes) {
  await supabase.from('polymarket_h2h_cache').upsert({
    // ... existing fields
    token_id_yes: tokenData.tokenIdYes,
    token_id_no: tokenData.tokenIdNo,
    token_source: 'ui_network',
    tradeable: true,
  });
} else {
  // Mark as needing repair
  await supabase.from('polymarket_h2h_cache').upsert({
    // ... existing fields
    tradeable: false,
    untradeable_reason: 'TOKENS_NOT_FOUND_IN_HTML',
  });
}
```

---

## Step 3: Fix Accuracy Bugs

**Goal:** Stop false edges and stop blocking real edges

### 3.1 Fair Probability Outlier Bug

**Problem:** After converting 3-way markets (H2H + Draw) to 2-way, favorites can legitimately reach 95%+. The 92% threshold blocks valid sharp data.

**Current Code (polymarket-monitor, line 1132):**
```typescript
if (fairProb > 0.92 || fairProb < 0.08) {
  // BLOCKS: Carolina at 92.7% (legitimate heavy favorite)
  continue;
}
```

**Fix:** Raise thresholds and add minimum sharp count:

```typescript
// UPDATED: Raised for post-normalization H2H markets
const OUTLIER_HIGH = 0.96;  // Up from 0.92
const OUTLIER_LOW = 0.04;   // Down from 0.08
const MIN_SHARP_COUNT = 2;  // Require 2+ sharp books before outlier rejection

// Count how many sharp books agree
const sharpCount = bookmakers.filter(b => 
  SHARP_BOOKS.includes(b.key) && 
  fairProb >= OUTLIER_LOW && 
  fairProb <= OUTLIER_HIGH
).length;

if (fairProb > OUTLIER_HIGH || fairProb < OUTLIER_LOW) {
  if (sharpCount >= MIN_SHARP_COUNT) {
    // Trust the sharps even if it looks extreme
    console.log('[FAIR_PROB] Extreme but sharp-confirmed:', fairProb);
  } else {
    console.log('[FAIR_PROB] OUTLIER_REJECTED:', bookmaker.key, fairProb);
    continue;
  }
}
```

### 3.2 Low Match Rate (Team Name Resolution)

**Problem:** Only 11% of events match. Missing aliases cause canonical matching to fail.

**Current Aliases (sync-polymarket-h2h, line 56-122):**
- Has: `'washington capitals': ['capitals', 'caps']`
- Missing: `'wsh'`, `'wash'`, `'washington'`

**Fix:** Expand alias tables in `_shared/canonicalize.ts`:

```typescript
const NHL_ALIASES = {
  'carolina hurricanes': ['hurricanes', 'canes', 'car', 'carolina'],
  'washington capitals': ['capitals', 'caps', 'wsh', 'wash', 'washington'],
  'san jose sharks': ['sharks', 'sjs', 'san jose', 'sj sharks'],
  'calgary flames': ['flames', 'cgy', 'calgary'],
  // ... etc
};

const NBA_ALIASES = {
  'los angeles lakers': ['lakers', 'lal', 'la lakers', 'los angeles'],
  'boston celtics': ['celtics', 'bos', 'boston'],
  // ... etc
};
```

**Add Match Failure Logging:**
```typescript
if (!matchedGame) {
  console.log('[MATCH_FAIL]', {
    polyEvent: event.event_name,
    searchTerms: [homeNorm, awayNorm],
    topCandidates: bookmakerGames.slice(0, 3).map(g => g.home_team + ' vs ' + g.away_team),
    reason: 'no_alias_match'
  });
}
```

---

## Implementation Order

```text
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Stop the Bleeding (Day 1)                              │
│                                                                 │
│ ✓ Add database columns: tradeable, untradeable_reason,         │
│   token_source, token_confidence                                │
│ ✓ Add hard gate in polymarket-monitor: no tokens = skip        │
│ ✓ Remove all 0.50 placeholder fallback logic                   │
│ ✓ Expire existing garbage signals                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Build Tokenization Pipeline (Day 2-3)                  │
│                                                                 │
│ ✓ Create tokenize-market edge function                          │
│ ✓ Implement multi-extractor priority chain                     │
│ ✓ Update scrape-polymarket-nba to extract HTML + tokens        │
│ ✓ Add funnel counters and summary logging                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Fix Accuracy Bugs (Day 4)                              │
│                                                                 │
│ ✓ Raise outlier threshold to 96%/4%                            │
│ ✓ Add minimum sharp count requirement                          │
│ ✓ Expand team alias tables                                      │
│ ✓ Add match failure logging                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Expected Outcomes

| Metric | Current | After Phase 1 | After Phase 3 |
|--------|---------|---------------|---------------|
| NBA token coverage | 5% | 0% (marked untradeable) | 80%+ |
| Garbage signals | Many | 0 | 0 |
| Match rate | 11% | 11% | 50%+ |
| False positive edges | High | 0 | 0 |
| False negative edges | High | Same | Near 0 |

---

## Cleanup SQL (Run After Phase 1)

```sql
-- Expire all signals from untokenized markets
UPDATE signal_opportunities
SET status = 'expired',
    signal_factors = COALESCE(signal_factors, '{}'::jsonb) || 
      '{"expired_reason": "untokenized_market"}'::jsonb
WHERE polymarket_condition_id IN (
  SELECT condition_id 
  FROM polymarket_h2h_cache 
  WHERE token_id_yes IS NULL
)
AND status = 'active';

-- Mark all untokenized firecrawl/scrape-nba markets as untradeable
UPDATE polymarket_h2h_cache
SET tradeable = false,
    untradeable_reason = 'MISSING_TOKENS'
WHERE token_id_yes IS NULL
  AND source IN ('firecrawl', 'scrape-nba');
```

---

## Technical Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/tokenize-market/index.ts` | **NEW** - Multi-extractor tokenization service |
| `supabase/functions/polymarket-monitor/index.ts` | Add hard gate, funnel counters, fix outlier threshold |
| `supabase/functions/scrape-polymarket-nba/index.ts` | Add HTML extraction, call tokenizer |
| `supabase/functions/scrape-polymarket-prices/index.ts` | Add HTML extraction, call tokenizer |
| `supabase/functions/_shared/canonicalize.ts` | Expand team aliases |
| Database migration | Add new columns to `polymarket_h2h_cache` |

