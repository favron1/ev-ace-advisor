-- Add polymarket_slug column to polymarket_h2h_cache
ALTER TABLE polymarket_h2h_cache 
ADD COLUMN polymarket_slug TEXT;

-- Add polymarket_slug column to signal_opportunities
ALTER TABLE signal_opportunities 
ADD COLUMN polymarket_slug TEXT;