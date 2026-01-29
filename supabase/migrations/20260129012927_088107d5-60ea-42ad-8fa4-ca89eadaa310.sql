-- Add polymarket_condition_id column to signal_opportunities
ALTER TABLE signal_opportunities 
ADD COLUMN IF NOT EXISTS polymarket_condition_id TEXT;