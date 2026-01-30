-- Add source column to track data origin (API vs Firecrawl scrape)
ALTER TABLE public.polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api';

-- Add index for filtering by source
CREATE INDEX IF NOT EXISTS idx_polymarket_h2h_cache_source 
ON public.polymarket_h2h_cache(source);

-- Comment for documentation
COMMENT ON COLUMN public.polymarket_h2h_cache.source IS 'Data source: api (Gamma/CLOB API) or firecrawl (web scrape)';