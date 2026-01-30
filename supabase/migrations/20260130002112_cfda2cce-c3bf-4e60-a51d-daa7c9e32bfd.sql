-- Drop the existing outcome check constraint and add one that includes 'in_play'
ALTER TABLE public.signal_logs DROP CONSTRAINT IF EXISTS signal_logs_outcome_check;

ALTER TABLE public.signal_logs ADD CONSTRAINT signal_logs_outcome_check 
  CHECK (outcome IS NULL OR outcome IN ('pending', 'in_play', 'win', 'loss', 'void'));