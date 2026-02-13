

## Deploy Edge Functions and Run Polymarket Sync

### Step 1: Deploy All Updated Edge Functions
Deploy the key edge functions that have been updated, particularly:
- `polymarket-sync-24h` (main sync with token repair)
- `polymarket-monitor` (self-healing token repair)
- `tokenize-market` (token ID resolution)
- `correlated-leg-detector` (just fixed the import issue)
- All other functions to ensure everything is current

### Step 2: Run Polymarket Sync
After deployment, invoke the `polymarket-sync-24h` function to pull fresh market data, token IDs, and volumes into the cache.

### Step 3: Verify the UI
Check where the "Sync Polymarket" button exists in the app:
- The `ScanControlPanel` component has a "Sync Polymarket" button on the Terminal page (route `/`)
- The Pipeline Discover page may also have sync functionality

### Step 4: Test the Flow
1. Trigger the sync via the edge function directly
2. Navigate to the Terminal and verify data loads
3. Check the Pipeline Discover view for updated markets

### Technical Notes
- Edge functions deploy automatically when code changes are saved, but we will explicitly trigger deployment to ensure the latest code is live
- The `polymarket-sync-24h` function handles: Gamma API discovery, Firecrawl scraping, token resolution, and CLOB price refresh
- Based on recent logs, the sync is already finding 523 events and caching 9 markets with CLOB price validation

