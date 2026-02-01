-- ============================================================================
-- CORE LOGIC V1.3: MATCH FAILURE OBSERVABILITY
-- ============================================================================
-- Tables to track and resolve team matching failures for improved match rates

-- Match failures table - logs every unmatched Polymarket event
CREATE TABLE public.match_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poly_event_title TEXT NOT NULL,
  poly_team_a TEXT NOT NULL,
  poly_team_b TEXT NOT NULL,
  poly_condition_id TEXT,
  sport_code TEXT,
  failure_reason TEXT NOT NULL DEFAULT 'no_canonical_match',
  resolution_status TEXT NOT NULL DEFAULT 'pending',
  resolved_mapping TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Team mappings table - user-curated alias resolutions
CREATE TABLE public.team_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  sport_code TEXT NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_name, sport_code)
);

-- Enable RLS
ALTER TABLE public.match_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies for match_failures
CREATE POLICY "Match failures are publicly readable"
  ON public.match_failures FOR SELECT USING (true);

CREATE POLICY "Service role can manage match failures"
  ON public.match_failures FOR ALL USING (true) WITH CHECK (true);

-- RLS policies for team_mappings
CREATE POLICY "Team mappings are publicly readable"
  ON public.team_mappings FOR SELECT USING (true);

CREATE POLICY "Service role can manage team mappings"
  ON public.team_mappings FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_match_failures_pending ON public.match_failures(resolution_status) WHERE resolution_status = 'pending';
CREATE INDEX idx_match_failures_sport ON public.match_failures(sport_code);
CREATE INDEX idx_team_mappings_lookup ON public.team_mappings(source_name, sport_code);