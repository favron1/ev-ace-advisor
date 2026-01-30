
# Fix: Restore Bookmaker Odds Ingestion Pipeline

## Problem
New bets aren't coming through because the **sharp bookmaker data pipeline is broken**. The movement detection system that triggers signals requires fresh odds data to track probability changes, but no new data has been captured in over 8 hours.

## What Broke
1. The `ingest-odds` function (which fetches bookmaker odds and populates the `sharp_book_snapshots` table) is not scheduled to run automatically
2. Without fresh snapshots, the movement detection system can't calculate if sharp books are moving
3. Without movement detection, signals below 5% raw edge are filtered out as "No trigger"

## Technical Details
The detection system uses a "Dual Trigger" approach:
- **Edge Trigger**: Raw edge ≥ 5% (works without movement data)
- **Movement Trigger**: ≥2 sharp books moving same direction (requires fresh snapshots)

Most real arbitrage edges are 3-8%, which need the Movement Trigger to surface them.

## Fix Plan

### Step 1: Add pg_cron Job for `ingest-odds`
Schedule `ingest-odds` to run every 10 minutes to continuously populate the sharp book snapshots table:

```sql
SELECT cron.schedule(
  'ingest-odds-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='https://tjwqkbyyplaycvnjwqbh.supabase.co/functions/v1/ingest-odds',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

### Step 2: Run Immediate Ingestion
Manually trigger `ingest-odds` to populate fresh data immediately so the movement detection pipeline can start working.

### Step 3: Clean Up Stale Snapshots
Add a cleanup step to remove snapshots older than 2 hours (they're not useful for 30-minute movement windows):

```sql
DELETE FROM sharp_book_snapshots 
WHERE captured_at < NOW() - INTERVAL '2 hours';
```

## Expected Outcome
- Fresh sharp book data every 10 minutes
- Movement detection system can track probability shifts
- Edges in the 3-8% range will trigger signals again
- SMS alerts will resume for ELITE/STRONG signals

## API Quota Consideration
Each `ingest-odds` call uses ~15-20 Odds API requests (one per sport). At 6 runs/hour × 24 hours = 144 runs × ~17 requests = ~2,450 requests/day.

If you're on the free tier (500 requests/month), this will exceed limits quickly. You may need to:
1. Reduce frequency to every 30 minutes (864 requests/day)
2. Limit sports to NHL/NBA/Tennis only (~600 requests/day)
3. Upgrade Odds API plan
