-- Create Polymarket H2H Cache table for sports markets
CREATE TABLE public.polymarket_h2h_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id text UNIQUE NOT NULL,
  event_title text NOT NULL,
  question text NOT NULL,
  
  -- Extracted match data (normalized for matching)
  team_home text,
  team_away text,
  team_home_normalized text,
  team_away_normalized text,
  sport_category text,
  event_date timestamp with time zone,
  
  -- Pricing (updated frequently)
  yes_price numeric NOT NULL,
  no_price numeric NOT NULL,
  volume numeric DEFAULT 0,
  liquidity numeric DEFAULT 0,
  
  -- Metadata
  status text DEFAULT 'active',
  last_price_update timestamp with time zone DEFAULT now(),
  last_bulk_sync timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polymarket_h2h_cache ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Polymarket H2H cache is publicly readable" 
ON public.polymarket_h2h_cache 
FOR SELECT 
USING (true);

-- Service role can manage the cache
CREATE POLICY "Service role can manage polymarket h2h cache" 
ON public.polymarket_h2h_cache 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create indexes for fast matching
CREATE INDEX idx_polymarket_h2h_cache_teams ON public.polymarket_h2h_cache (team_home_normalized, team_away_normalized);
CREATE INDEX idx_polymarket_h2h_cache_event_date ON public.polymarket_h2h_cache (event_date);
CREATE INDEX idx_polymarket_h2h_cache_status ON public.polymarket_h2h_cache (status);
CREATE INDEX idx_polymarket_h2h_cache_sport ON public.polymarket_h2h_cache (sport_category);