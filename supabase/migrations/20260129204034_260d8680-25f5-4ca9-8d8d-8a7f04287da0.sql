-- Add monitoring_status column for unified "Scan Once, Monitor Continuously" architecture
ALTER TABLE polymarket_h2h_cache 
ADD COLUMN IF NOT EXISTS monitoring_status text DEFAULT 'idle';

-- Add index for efficient querying by monitoring status
CREATE INDEX IF NOT EXISTS idx_polymarket_h2h_cache_monitoring_status 
ON polymarket_h2h_cache(monitoring_status);

-- Update existing active markets to 'watching' status
UPDATE polymarket_h2h_cache 
SET monitoring_status = 'watching' 
WHERE status = 'active';