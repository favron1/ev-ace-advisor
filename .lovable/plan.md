

## Fix: Remove Misclassified QPR Cache Entries

### Root Cause Identified

The QPR vs. Coventry City signal keeps regenerating because:

1. The market was synced on Jan 29-30 with the **old detection patterns**
2. The unanchored `rangers` regex matched "Queens Park Rangers" → tagged as `NHL`
3. This sport tag is **persisted in `polymarket_h2h_cache`**:
   - `extracted_league: NHL`
   - `sport_category: NHL`
4. The updated detection patterns only affect **new** market discovery
5. The monitor reads cached `sport_category: NHL`, fetches NHL odds, matches "New York Rangers", creates bogus signal

### Data Evidence

```
polymarket_h2h_cache:
  event_title: Queens Park Rangers FC vs. Coventry City FC
  extracted_league: NHL   ← WRONG
  sport_category: NHL     ← WRONG
  monitoring_status: watching/triggered
```

### Solution

Delete the misclassified cache entries to stop them from being monitored:

```sql
DELETE FROM polymarket_h2h_cache 
WHERE event_title ILIKE '%queens park rangers%';
```

Also expire any active signals:

```sql
UPDATE signal_opportunities 
SET status = 'expired' 
WHERE event_name ILIKE '%queens park rangers%'
   OR event_name ILIKE '%coventry%';
```

### Files Modified

None — this is a data cleanup only.

### Expected Outcome

1. QPR markets removed from monitoring queue
2. No new signals generated for this match
3. Future English football markets will be ignored (no detection pattern match) until full soccer support is added

### Architectural Note

The detection pattern fix deployed earlier prevents **future** misclassification. This data cleanup resolves the **existing** cached entries that were already tagged incorrectly.

