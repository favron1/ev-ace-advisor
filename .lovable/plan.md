

# Fix: Remove Bookmaker-First Detection (Orphaned Signals)

## Root Cause Identified
The system has **two conflicting detection functions**:

| Function | Approach | Status |
|----------|----------|--------|
| `detect-signals` | Bookmaker-first → Creates orphaned signals | **WRONG - Still running** |
| `polymarket-monitor` | Polymarket-first → Only tradeable signals | **CORRECT - The intended flow** |

The 12 orphaned signals exist because `detect-signals` fetched bookmaker data for NBA/Tennis (which have no Polymarket H2H markets) and created signals with `is_true_arbitrage = false`.

---

## Technical Fix

### Step 1: Clean Up Orphaned Signals
Delete all signals that weren't matched to Polymarket (they're not tradeable):

```sql
DELETE FROM signal_opportunities 
WHERE is_true_arbitrage = false 
  AND status = 'active';
```

### Step 2: Prevent Future Orphans
Modify `detect-signals` to exit early and defer to `polymarket-monitor`. Add this guard at the top of the function:

```typescript
// DEPRECATED: This function uses bookmaker-first logic.
// Use polymarket-monitor instead which follows Polymarket-first architecture.
console.log('[DETECT-SIGNALS] DEPRECATED - Use polymarket-monitor instead');
return new Response(
  JSON.stringify({ 
    deprecated: true, 
    message: 'Use polymarket-monitor for Polymarket-first detection' 
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

### Step 3: Remove Any Scheduled Runs of `detect-signals`
Check for and remove any pg_cron jobs that call `detect-signals`:

```sql
SELECT * FROM cron.job WHERE command LIKE '%detect-signals%';
-- If found: SELECT cron.unschedule('job_name');
```

---

## How the Correct Flow Works

```text
polymarket-sync-24h (every 30min)
         │
         ▼
   polymarket_h2h_cache
   (Only Polymarket markets
    with teams/prices)
         │
         ▼
polymarket-monitor (every 5min)
   │
   ├── 1. Load markets from cache (Polymarket-first)
   ├── 2. Group by sport (NHL, EPL, etc.)
   ├── 3. Fetch bookmaker odds ONLY for those sports
   ├── 4. Match Polymarket → Bookmaker
   └── 5. Create signal ONLY if match found
         │
         ▼
   signal_opportunities
   (All signals have is_true_arbitrage = true)
```

---

## Expected Outcome
- No more orphaned signals (NBA/Tennis without Polymarket H2H)
- Signal feed shows only tradeable opportunities
- `detect-signals` is deprecated and returns early
- `polymarket-monitor` remains the sole detection path

