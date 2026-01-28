-- Add columns to track Polymarket match quality and true arbitrage status
ALTER TABLE signal_opportunities
ADD COLUMN IF NOT EXISTS polymarket_match_confidence numeric,
ADD COLUMN IF NOT EXISTS is_true_arbitrage boolean DEFAULT false;