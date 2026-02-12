

# Create Remaining Migration Tables

Run the remaining parts of the `20260213_sharp_lines.sql` migration that haven't been applied yet.

## What Already Exists
- `sharp_book_lines` table (created)
- `sharp_consensus` table (created)
- Related indexes for those two tables

## What Needs to Be Created

### 1. New Tables
- **`whale_wallets`** - Tracks known profitable Polymarket whale wallets (kch123, SeriouslySirius, DrPufferfish, etc.) with profit stats, win rates, and specializations
- **`whale_positions`** - Tracks current positions held by whale wallets, with foreign key to `whale_wallets`
- **`multi_leg_opportunities`** - Stores correlated betting opportunities across multiple markets for the same event

### 2. New Columns on `signal_opportunities`
Ten new columns for line shopping and Kelly sizing:
- `sharp_consensus_prob`, `sharp_line_edge`, `line_shopping_tier`
- `market_priority_score`, `market_type_bonus`, `liquidity_penalty`
- `kelly_fraction`, `suggested_stake_cents`, `max_kelly_stake_cents`, `bankroll_percentage`

### 3. Database View
- **`line_shopping_opportunities`** - Joins `signal_opportunities` with `sharp_consensus` to show real-time price discrepancies and line shopping tiers

### 4. Database Functions
- **`update_market_priority_scores()`** - Scores active signals based on market type (spreads get 1.5x, totals 1.2x)
- **`cleanup_old_sharp_lines()`** - Deletes sharp lines and consensus data older than 7 days

### 5. Seed Data
- Insert 5 known whale wallets (kch123, SeriouslySirius, DrPufferfish, gmanas, simonbanza)

### 6. RLS Policies
- Public read access on all new tables
- Service role write access on all new tables (same pattern as existing tables)

## Technical Details

The migration will be a single SQL script containing:

```text
1. CREATE TABLE whale_wallets (with CHECK constraints for confidence_tier)
2. CREATE TABLE whale_positions (with FK to whale_wallets, CHECK constraints)
3. CREATE TABLE multi_leg_opportunities (with CHECK on status)
4. ALTER TABLE signal_opportunities ADD COLUMN x10
5. CREATE indexes for whale_positions and multi_leg_opportunities
6. CREATE VIEW line_shopping_opportunities
7. CREATE FUNCTION update_market_priority_scores()
8. CREATE FUNCTION cleanup_old_sharp_lines()
9. ENABLE RLS + policies on all 3 new tables
10. INSERT seed whale wallets data
11. TABLE COMMENTS
```

No code changes needed beyond the migration -- the existing edge functions (`whale-tracker`, `correlated-leg-detector`, `line-shopping-detector`) and library files already reference these table structures.

