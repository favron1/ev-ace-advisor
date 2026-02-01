-- Migration: Add core_logic_version tracking to signals
ALTER TABLE signal_opportunities 
ADD COLUMN IF NOT EXISTS core_logic_version TEXT DEFAULT 'v1.0';

ALTER TABLE signal_logs 
ADD COLUMN IF NOT EXISTS core_logic_version TEXT;

-- Index for version-based queries
CREATE INDEX IF NOT EXISTS idx_signals_version 
ON signal_opportunities(core_logic_version);

-- Backfill existing signals as v1.0
UPDATE signal_opportunities 
SET core_logic_version = 'v1.0' 
WHERE core_logic_version IS NULL;

UPDATE signal_logs 
SET core_logic_version = 'v1.0' 
WHERE core_logic_version IS NULL;