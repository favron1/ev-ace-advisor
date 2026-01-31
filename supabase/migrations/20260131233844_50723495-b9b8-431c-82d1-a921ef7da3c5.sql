-- Add tokenization tracking columns to polymarket_h2h_cache
ALTER TABLE public.polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS tradeable boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS untradeable_reason text,
ADD COLUMN IF NOT EXISTS token_source text,
ADD COLUMN IF NOT EXISTS token_confidence numeric,
ADD COLUMN IF NOT EXISTS last_token_repair_at timestamptz;

-- Create index for fast querying of tradeable markets
CREATE INDEX IF NOT EXISTS idx_polymarket_h2h_cache_tradeable 
ON public.polymarket_h2h_cache(tradeable) 
WHERE tradeable = true;

-- Mark all existing markets without tokens as untradeable
UPDATE public.polymarket_h2h_cache
SET tradeable = false,
    untradeable_reason = 'MISSING_TOKENS'
WHERE token_id_yes IS NULL
  AND tradeable IS NOT false;

-- Update markets WITH tokens to have proper token_source
UPDATE public.polymarket_h2h_cache
SET tradeable = true,
    token_source = COALESCE(source, 'api')
WHERE token_id_yes IS NOT NULL
  AND tradeable IS NULL;