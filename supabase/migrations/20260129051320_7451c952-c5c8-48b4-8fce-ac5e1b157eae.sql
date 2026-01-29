-- Add partial unique index to prevent duplicate active signals at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_signal 
ON signal_opportunities (event_name, recommended_outcome) 
WHERE status = 'active';