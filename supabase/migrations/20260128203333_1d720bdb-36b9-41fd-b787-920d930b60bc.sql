-- Add default stake amount for slippage calculation
ALTER TABLE arbitrage_config 
ADD COLUMN IF NOT EXISTS default_stake_amount numeric DEFAULT 100;