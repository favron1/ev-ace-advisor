-- Add new tracking columns for enhanced edge calculation
ALTER TABLE signal_opportunities
ADD COLUMN IF NOT EXISTS polymarket_yes_price numeric,
ADD COLUMN IF NOT EXISTS polymarket_volume numeric,
ADD COLUMN IF NOT EXISTS polymarket_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS bookmaker_prob_fair numeric,
ADD COLUMN IF NOT EXISTS signal_strength numeric;