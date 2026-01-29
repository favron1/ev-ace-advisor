-- Add stake_amount column to signal_logs for exposure tracking
ALTER TABLE public.signal_logs 
ADD COLUMN stake_amount numeric DEFAULT NULL;

-- Add condition_id for grouping by market
ALTER TABLE public.signal_logs 
ADD COLUMN polymarket_condition_id text DEFAULT NULL;

-- Add index for daily exposure queries
CREATE INDEX idx_signal_logs_created_date ON public.signal_logs (created_at DESC);