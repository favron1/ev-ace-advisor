-- Add unique constraint on poly_condition_id for proper upsert behavior
CREATE UNIQUE INDEX IF NOT EXISTS match_failures_condition_id_unique 
  ON match_failures (poly_condition_id) 
  WHERE poly_condition_id IS NOT NULL;

-- Add index for faster pending resolution queries
CREATE INDEX IF NOT EXISTS match_failures_resolution_status_idx 
  ON match_failures (resolution_status) 
  WHERE resolution_status = 'pending';