-- Add market_type column to polymarket_h2h_cache for categorizing different market types
ALTER TABLE public.polymarket_h2h_cache 
ADD COLUMN market_type text DEFAULT 'h2h';

-- Add index for market_type filtering
CREATE INDEX idx_polymarket_h2h_cache_market_type ON public.polymarket_h2h_cache(market_type);

-- Comment for clarity
COMMENT ON COLUMN public.polymarket_h2h_cache.market_type IS 'Type of market: h2h, prop, total, spread, player';