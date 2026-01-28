-- Add recommended_outcome column to store the specific team/player to bet on
ALTER TABLE signal_opportunities 
ADD COLUMN recommended_outcome text;

COMMENT ON COLUMN signal_opportunities.recommended_outcome IS 
  'The specific team/player/outcome to bet on (e.g., Utah Jazz)';