-- Add source column to track data origin (Phase 1 of multi-source strategy)
ALTER TABLE bookmaker_signals 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'odds_api';

-- Add index for faster source filtering
CREATE INDEX IF NOT EXISTS idx_bookmaker_signals_source 
ON bookmaker_signals(source);

-- Add comment explaining the column
COMMENT ON COLUMN bookmaker_signals.source IS 'Data origin: odds_api (primary) or scraped (backup DraftKings/other)';