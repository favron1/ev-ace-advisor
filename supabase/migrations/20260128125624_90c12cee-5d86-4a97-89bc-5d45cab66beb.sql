-- Add focus_mode column to scan_config table
ALTER TABLE scan_config 
ADD COLUMN IF NOT EXISTS focus_mode text DEFAULT 'h2h_only';

-- Add comment explaining the column
COMMENT ON COLUMN scan_config.focus_mode IS 'Focus mode for market filtering: h2h_only (default), all, or futures_only';