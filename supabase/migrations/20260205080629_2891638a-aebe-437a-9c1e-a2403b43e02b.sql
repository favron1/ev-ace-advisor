-- Add unique constraint on team_mappings to prevent duplicate mappings
-- Key: lowercase source_name + sport_code must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_mappings_unique 
ON public.team_mappings(LOWER(source_name), sport_code);

-- Also add index for faster lookups by sport_code (used by getTeamMappings)
CREATE INDEX IF NOT EXISTS idx_team_mappings_sport_code 
ON public.team_mappings(sport_code);