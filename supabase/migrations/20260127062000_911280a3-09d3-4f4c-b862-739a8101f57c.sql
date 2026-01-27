-- =====================================================
-- RACING ENGINE v2.0 - LEARNING LOOP SCHEMA
-- Track bet results and model performance for retraining
-- =====================================================

-- Alter racing_model_predictions to add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'racing_model_predictions_event_runner_unique'
  ) THEN
    CREATE UNIQUE INDEX racing_model_predictions_event_runner_unique 
    ON public.racing_model_predictions (event_id, runner_id);
  END IF;
END
$$;

-- Add engine_version column to racing_model_predictions if not exists
ALTER TABLE public.racing_model_predictions
ADD COLUMN IF NOT EXISTS engine_version text DEFAULT 'racing_v1.0';

-- Create racing_model_performance table for learning loop
CREATE TABLE IF NOT EXISTS public.racing_model_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Time period
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  period_type text NOT NULL DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly'
  
  -- Overall metrics
  total_bets integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  voids integer NOT NULL DEFAULT 0,
  win_rate numeric,
  roi numeric,
  profit_units numeric NOT NULL DEFAULT 0,
  
  -- Value metrics
  avg_ev numeric,
  avg_edge numeric,
  avg_confidence numeric,
  avg_clv numeric, -- Closing Line Value
  
  -- Calibration
  brier_score numeric, -- Probability calibration (lower = better)
  log_loss numeric,
  
  -- By segment (JSONB for flexibility)
  by_sport jsonb DEFAULT '{}', -- { "horse": {...}, "greyhound": {...} }
  by_track jsonb DEFAULT '{}',
  by_distance jsonb DEFAULT '{}',
  by_angle jsonb DEFAULT '{}',
  by_confidence_band jsonb DEFAULT '{}',
  
  -- Model version
  model_version text NOT NULL,
  engine_version text NOT NULL,
  
  -- Timestamps
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(period_start, period_end, model_version)
);

-- Create racing_angle_performance for tracking individual angle effectiveness
CREATE TABLE IF NOT EXISTS public.racing_angle_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  angle_name text NOT NULL,
  sport text NOT NULL, -- 'horse', 'greyhound', 'both'
  
  -- Sample period
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  
  -- Performance
  times_triggered integer NOT NULL DEFAULT 0,
  bets_placed integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  profit_units numeric NOT NULL DEFAULT 0,
  roi numeric,
  hit_rate numeric, -- wins / bets_placed
  
  -- Calculated weight adjustment
  current_weight numeric NOT NULL DEFAULT 1.0, -- Multiplier for this angle
  suggested_weight numeric, -- Suggested based on performance
  
  -- Metadata
  model_version text NOT NULL,
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(angle_name, sport, period_start, model_version)
);

-- Add result tracking columns to racing_bets if needed
ALTER TABLE public.racing_bets
ADD COLUMN IF NOT EXISTS finish_position integer,
ADD COLUMN IF NOT EXISTS actual_result text, -- 'win', 'loss', 'void', 'pending'
ADD COLUMN IF NOT EXISTS ev_at_bet numeric,
ADD COLUMN IF NOT EXISTS model_version text;

-- Enable RLS on new tables
ALTER TABLE public.racing_model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_angle_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies - these are model analytics, publicly readable
CREATE POLICY "Racing model performance is viewable by everyone"
ON public.racing_model_performance
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage racing model performance"
ON public.racing_model_performance
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Racing angle performance is viewable by everyone"
ON public.racing_angle_performance
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage racing angle performance"
ON public.racing_angle_performance
FOR ALL
USING (true)
WITH CHECK (true);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_racing_model_perf_period 
ON public.racing_model_performance (period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_racing_angle_perf_angle 
ON public.racing_angle_performance (angle_name, sport);

CREATE INDEX IF NOT EXISTS idx_racing_bets_settled 
ON public.racing_bets (settled_at) WHERE settled_at IS NOT NULL;