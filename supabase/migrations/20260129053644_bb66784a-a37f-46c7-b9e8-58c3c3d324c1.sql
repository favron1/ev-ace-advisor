-- Create sharp_book_snapshots table for time-series tracking of individual sharp book prices
CREATE TABLE public.sharp_book_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_key TEXT NOT NULL,
    event_name TEXT NOT NULL,
    outcome TEXT NOT NULL,
    bookmaker TEXT NOT NULL,
    implied_probability NUMERIC NOT NULL,
    raw_odds NUMERIC,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient time-series queries
CREATE INDEX idx_sharp_book_snapshots_lookup 
ON public.sharp_book_snapshots (event_key, bookmaker, captured_at DESC);

-- Create index for cleanup queries
CREATE INDEX idx_sharp_book_snapshots_cleanup 
ON public.sharp_book_snapshots (captured_at);

-- Enable RLS
ALTER TABLE public.sharp_book_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Sharp book snapshots are publicly readable" 
ON public.sharp_book_snapshots 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage sharp book snapshots" 
ON public.sharp_book_snapshots 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add new columns to signal_opportunities for movement tracking
ALTER TABLE public.signal_opportunities
ADD COLUMN movement_confirmed BOOLEAN DEFAULT false,
ADD COLUMN movement_velocity NUMERIC,
ADD COLUMN signal_tier TEXT DEFAULT 'static';

-- Create cleanup function for old snapshots (keeps last 24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_old_sharp_book_snapshots()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.sharp_book_snapshots
    WHERE captured_at < now() - interval '24 hours';
END;
$$;