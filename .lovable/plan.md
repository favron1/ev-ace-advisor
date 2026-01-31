

# Fix Plan: Restore Signal Generation

## Problem Diagnosis Summary

Based on database queries and edge function logs, there are **two critical blockers** preventing signal generation:

### Blocker A: Bookmaker Data is Broken (401 Errors)

The `ingest-odds` function is failing with **401 Unauthorized** errors on all H2H API calls:

```
Failed to fetch basketball_nba: 401
Failed to fetch basketball_ncaab: 401
Failed to fetch americanfootball_nfl: 401
Failed to fetch icehockey_nhl: 401
→ Generated 0 total signals
```

This means no fresh H2H bookmaker data is being ingested, so `polymarket-monitor` has nothing to compare against for edge calculation.

**Root Cause**: The `ODDS_API_KEY` is either expired, invalid, or has exceeded its quota. The Odds API free tier allows 500 requests/month.

### Blocker B: Token IDs Missing for 121/518 H2H Markets

The cache breakdown by source shows:
| Source | Total | Missing Token IDs |
|--------|-------|------------------|
| `firecrawl` | 88 | **88 (100%)** |
| `scrape-nba` | 31 | **30 (97%)** |
| `api` | 268 | 3 (1%) |
| `gamma-api` | 131 | 0 (0%) |

The `lookupClobVolumeFromCache` function extracts volume/liquidity/conditionId but **never extracts token IDs** from the matched Gamma event. This causes `NO_TOKEN_ID_SKIP` in `polymarket-monitor`:

```text
Current return: { volume, liquidity, conditionId }
Missing: tokenIdYes, tokenIdNo
```

---

## Technical Fix Plan

### Fix 1: Update ODDS_API_KEY (User Action Required)

The current API key is returning 401 errors. You need to:

1. Go to [The Odds API Dashboard](https://the-odds-api.com/)
2. Check if your API key is still valid and has remaining quota
3. If expired/exceeded, generate a new key
4. Update the secret using the Lovable secrets management

### Fix 2: Extract Token IDs in `lookupClobVolumeFromCache`

**File**: `supabase/functions/polymarket-sync-24h/index.ts`

**Current code** (lines 617-654):
```typescript
function lookupClobVolumeFromCache(
  team1Name: string,
  team2Name: string
): { volume: number; liquidity: number; conditionId: string | null } {
  // ... matching logic ...
  if (matchesTeam1 && matchesTeam2) {
    const market = event.markets?.[0];
    if (market) {
      const volume = parseFloat(market.volume || event.volume || '0') || 0;
      const liquidity = parseFloat(market.liquidity || event.liquidity || '0') || 0;
      const conditionId = market.conditionId || market.id || event.id;
      
      if (volume > 0) {
        return { volume, liquidity, conditionId };  // ❌ Missing token IDs!
      }
    }
  }
  return { volume: 0, liquidity: 0, conditionId: null };
}
```

**Updated code** - extract token IDs from Gamma market metadata:
```typescript
function lookupClobVolumeFromCache(
  team1Name: string,
  team2Name: string
): { 
  volume: number; 
  liquidity: number; 
  conditionId: string | null;
  tokenIdYes: string | null;  // NEW
  tokenIdNo: string | null;   // NEW
} {
  // ... same matching logic ...
  if (matchesTeam1 && matchesTeam2) {
    const market = event.markets?.[0];
    if (market) {
      const volume = parseFloat(market.volume || event.volume || '0') || 0;
      const liquidity = parseFloat(market.liquidity || event.liquidity || '0') || 0;
      const conditionId = market.conditionId || market.id || event.id;
      
      // NEW: Extract token IDs from Gamma market metadata
      let tokenIdYes: string | null = null;
      let tokenIdNo: string | null = null;
      
      // Path 1: clobTokenIds array
      if (market.clobTokenIds) {
        let tokenIds = market.clobTokenIds;
        if (typeof tokenIds === 'string') {
          try { tokenIds = JSON.parse(tokenIds); } catch {}
        }
        if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
          tokenIdYes = tokenIds[0] || null;
          tokenIdNo = tokenIds[1] || null;
        }
      }
      // Path 2: tokens array
      if (!tokenIdYes && market.tokens && Array.isArray(market.tokens)) {
        tokenIdYes = market.tokens[0]?.token_id || market.tokens[0] || null;
        tokenIdNo = market.tokens[1]?.token_id || market.tokens[1] || null;
      }
      // Path 3: outcomes array
      if (!tokenIdYes && market.outcomes && Array.isArray(market.outcomes)) {
        tokenIdYes = market.outcomes[0]?.clobTokenId || null;
        tokenIdNo = market.outcomes[1]?.clobTokenId || null;
      }
      
      if (volume > 0) {
        return { volume, liquidity, conditionId, tokenIdYes, tokenIdNo };
      }
    }
  }
  return { volume: 0, liquidity: 0, conditionId: null, tokenIdYes: null, tokenIdNo: null };
}
```

### Fix 3: Use Extracted Token IDs in Firecrawl Upsert

**File**: `supabase/functions/polymarket-sync-24h/index.ts` (lines 660-730)

Update the Firecrawl game processing to include token IDs:

```typescript
const clobData = lookupClobVolumeFromCache(game.team1Name, game.team2Name);
if (clobData.volume > 0) {
  volume = clobData.volume;
  liquidity = clobData.liquidity;
  firecrawlVolumeEnriched++;
  
  if (clobData.conditionId) {
    conditionId = clobData.conditionId;
  }
}

// Update upsert to include token IDs from Gamma lookup
const { error: fcError } = await supabase
  .from('polymarket_h2h_cache')
  .upsert({
    condition_id: conditionId,
    // ... existing fields ...
    token_id_yes: clobData.tokenIdYes,  // NEW
    token_id_no: clobData.tokenIdNo,    // NEW
  }, {
    onConflict: 'condition_id',
  });
```

### Fix 4: Add Diagnostic Logging to `ingest-odds`

**File**: `supabase/functions/ingest-odds/index.ts`

Add a hard check at the start to catch API key issues immediately:

```typescript
// At line 142, after checking for oddsApiKey:
if (!oddsApiKey) {
  return new Response(
    JSON.stringify({ error: 'ODDS_API_KEY not configured' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// NEW: Test API key validity with a lightweight call
const testUrl = `https://api.the-odds-api.com/v4/sports/?apiKey=${oddsApiKey}`;
const testResponse = await fetch(testUrl);
if (!testResponse.ok) {
  console.error(`[INGEST-ODDS] API_KEY_INVALID: Status ${testResponse.status}`);
  return new Response(
    JSON.stringify({ 
      error: 'ODDS_API_KEY invalid or quota exceeded',
      status: testResponse.status,
      remaining_requests: testResponse.headers.get('x-requests-remaining'),
    }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
console.log(`[INGEST-ODDS] API key valid. Remaining requests: ${testResponse.headers.get('x-requests-remaining')}`);
```

### Fix 5: Backfill Token IDs for Existing Cache Rows

Create a one-off backfill that updates existing Firecrawl/scrape-nba rows with token IDs from Gamma:

```typescript
// Add to end of polymarket-sync-24h after main processing:
// BACKFILL: Update rows missing token IDs
const { data: missingTokenRows } = await supabase
  .from('polymarket_h2h_cache')
  .select('condition_id, team_home, team_away')
  .is('token_id_yes', null)
  .in('source', ['firecrawl', 'scrape-nba'])
  .limit(50);

let backfilled = 0;
if (missingTokenRows) {
  for (const row of missingTokenRows) {
    const clobData = lookupClobVolumeFromCache(row.team_home, row.team_away);
    if (clobData.tokenIdYes && clobData.tokenIdNo) {
      await supabase
        .from('polymarket_h2h_cache')
        .update({
          token_id_yes: clobData.tokenIdYes,
          token_id_no: clobData.tokenIdNo,
        })
        .eq('condition_id', row.condition_id);
      backfilled++;
    }
  }
}
console.log(`[POLY-SYNC-24H] Backfilled ${backfilled} rows with missing token IDs`);
```

---

## Summary of Changes

| Priority | File | Change |
|----------|------|--------|
| **CRITICAL** | User Action | Update `ODDS_API_KEY` - current key returns 401 |
| High | `polymarket-sync-24h/index.ts` | Modify `lookupClobVolumeFromCache` to extract token IDs |
| High | `polymarket-sync-24h/index.ts` | Include token IDs in Firecrawl/scrape-nba upserts |
| Medium | `ingest-odds/index.ts` | Add API key validation with quota logging |
| Medium | `polymarket-sync-24h/index.ts` | Add backfill logic for existing rows missing token IDs |

---

## Expected Results After Fix

1. `ingest-odds` will either work (if API key is renewed) or fail fast with clear error
2. `polymarket-sync-24h` will populate token IDs for all sources
3. `polymarket-monitor` will stop hitting `NO_TOKEN_ID_SKIP`
4. Signals will start generating again

---

## Verification Steps

After deployment:
1. Check `ingest-odds` logs for successful H2H data fetch
2. Run query to confirm token ID coverage:
   ```sql
   SELECT source, count(*), 
     sum(case when token_id_yes is null then 1 else 0 end) as missing
   FROM polymarket_h2h_cache 
   WHERE market_type = 'h2h' 
   GROUP BY source;
   ```
3. Trigger `polymarket-monitor` and check for new signals
4. Verify logs show matches instead of `0 matched`

