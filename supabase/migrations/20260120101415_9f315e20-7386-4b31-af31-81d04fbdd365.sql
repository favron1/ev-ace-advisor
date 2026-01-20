-- Create table for scrape history
CREATE TABLE public.scrape_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sports TEXT[] NOT NULL,
  leagues TEXT[],
  window_hours INTEGER NOT NULL DEFAULT 72,
  matches_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  formatted_data TEXT,
  raw_data JSONB,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.scrape_history ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for edge function without auth)
CREATE POLICY "Anyone can insert scrape history"
ON public.scrape_history
FOR INSERT
WITH CHECK (true);

-- Allow anyone to read scrape history
CREATE POLICY "Anyone can view scrape history"
ON public.scrape_history
FOR SELECT
USING (true);

-- Create index for faster queries by date
CREATE INDEX idx_scrape_history_scraped_at ON public.scrape_history(scraped_at DESC);