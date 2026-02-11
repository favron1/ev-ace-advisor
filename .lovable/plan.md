

# Show Real Prices Only -- Hide Placeholders

## What's happening now
The Poly YES column displays `polymarket_yes_price` which often contains stale or placeholder values even when no real Polymarket match exists. This is misleading.

## What will change
- The Poly YES column will use `polymarket_price` as the source of truth
- If `polymarket_price` is null, the column will show a dash (--) so you know you need to find the price manually
- Events where `polymarket_price` is null but `polymarket_yes_price` has a value will no longer display a misleading number

## Files to update

### 1. `src/pages/pipeline/Discover.tsx`
- Change the Poly YES column from `event.polymarket_yes_price` to `event.polymarket_price`
- The existing `formatPrice` function already returns "--" for null values, so blanks will display automatically
- Update the matched/unmatched filter to use `polymarket_price` instead of `polymarket_yes_price`

### 2. `src/pages/pipeline/Analyze.tsx`
- Same change: use `event.polymarket_price` for display and edge calculation
- Events without a real price won't show a fake edge percentage

### 3. `src/hooks/usePipelineData.ts`
- Update `getAnalysisEvents` filter to check `polymarket_price != null` instead of `polymarket_yes_price`
- Add `polymarket_price` to the `PipelineEvent` interface (it's already in the DB query via `select('*')` but not typed)

