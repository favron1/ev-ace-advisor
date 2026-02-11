
-- Add pipeline_stage column to event_watch_state
ALTER TABLE public.event_watch_state 
ADD COLUMN pipeline_stage text NOT NULL DEFAULT 'discovered';

-- Backfill existing rows based on current state
UPDATE public.event_watch_state 
SET pipeline_stage = CASE
  WHEN watch_state = 'expired' THEN 'settled'
  WHEN watch_state = 'confirmed' THEN 'watching'
  WHEN polymarket_matched = true AND current_probability IS NOT NULL THEN 'matched'
  ELSE 'discovered'
END;

-- Index for fast stage filtering
CREATE INDEX idx_event_watch_state_pipeline_stage ON public.event_watch_state(pipeline_stage);
