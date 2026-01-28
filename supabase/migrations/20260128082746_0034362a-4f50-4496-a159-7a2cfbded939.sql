-- Create scan configuration table for adaptive scanning settings
CREATE TABLE public.scan_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Scan frequency settings
  base_frequency_minutes integer NOT NULL DEFAULT 30,
  turbo_frequency_minutes integer NOT NULL DEFAULT 5,
  adaptive_scanning_enabled boolean NOT NULL DEFAULT true,
  turbo_mode_enabled boolean NOT NULL DEFAULT false,
  scanning_paused boolean NOT NULL DEFAULT false,
  
  -- Event horizon settings
  event_horizon_hours integer NOT NULL DEFAULT 24,
  min_event_horizon_hours integer NOT NULL DEFAULT 2,
  
  -- Sharp book settings
  sharp_book_weighting_enabled boolean NOT NULL DEFAULT true,
  sharp_book_weight numeric NOT NULL DEFAULT 1.5,
  
  -- API limits
  max_daily_requests integer NOT NULL DEFAULT 100,
  max_monthly_requests integer NOT NULL DEFAULT 1500,
  daily_requests_used integer NOT NULL DEFAULT 0,
  monthly_requests_used integer NOT NULL DEFAULT 0,
  last_request_reset timestamp with time zone,
  
  -- Scan tracking
  last_scan_at timestamp with time zone,
  next_scheduled_scan_at timestamp with time zone,
  total_scans_today integer NOT NULL DEFAULT 0,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.scan_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own scan config"
  ON public.scan_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own scan config"
  ON public.scan_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_scan_config_updated_at
  BEFORE UPDATE ON public.scan_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add sharp_books column to bookmaker_signals for tracking
ALTER TABLE public.bookmaker_signals 
ADD COLUMN IF NOT EXISTS is_sharp_book boolean DEFAULT false;

-- Add commence_time to bookmaker_signals for time-to-event filtering
ALTER TABLE public.bookmaker_signals 
ADD COLUMN IF NOT EXISTS commence_time timestamp with time zone;