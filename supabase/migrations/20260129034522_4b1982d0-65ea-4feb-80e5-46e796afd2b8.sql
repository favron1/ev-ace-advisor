-- Add CLOB API columns to polymarket_h2h_cache for executable pricing data
ALTER TABLE public.polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS token_id_yes text,
ADD COLUMN IF NOT EXISTS token_id_no text,
ADD COLUMN IF NOT EXISTS best_bid numeric,
ADD COLUMN IF NOT EXISTS best_ask numeric,
ADD COLUMN IF NOT EXISTS spread_pct numeric,
ADD COLUMN IF NOT EXISTS orderbook_depth numeric;