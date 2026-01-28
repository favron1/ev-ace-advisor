-- Phase 1: Add Polymarket tracking columns to event_watch_state
ALTER TABLE public.event_watch_state 
ADD COLUMN IF NOT EXISTS polymarket_condition_id text,
ADD COLUMN IF NOT EXISTS polymarket_question text,
ADD COLUMN IF NOT EXISTS polymarket_yes_price numeric,
ADD COLUMN IF NOT EXISTS polymarket_volume numeric,
ADD COLUMN IF NOT EXISTS bookmaker_market_key text,
ADD COLUMN IF NOT EXISTS bookmaker_source text,
ADD COLUMN IF NOT EXISTS last_poly_refresh timestamp with time zone;

-- Add extracted entity columns to polymarket_h2h_cache for better matching
ALTER TABLE public.polymarket_h2h_cache
ADD COLUMN IF NOT EXISTS extracted_entity text,
ADD COLUMN IF NOT EXISTS extracted_league text,
ADD COLUMN IF NOT EXISTS extracted_threshold numeric;

-- Add Polymarket-first config columns to scan_config
ALTER TABLE public.scan_config
ADD COLUMN IF NOT EXISTS poly_sync_interval_hours integer DEFAULT 6,
ADD COLUMN IF NOT EXISTS min_poly_volume integer DEFAULT 5000,
ADD COLUMN IF NOT EXISTS enabled_market_types text[] DEFAULT ARRAY['futures', 'h2h', 'total'];

-- Performance indexes for Polymarket-first queries
CREATE INDEX IF NOT EXISTS idx_poly_cache_type_sport_vol 
ON public.polymarket_h2h_cache(market_type, sport_category, volume DESC)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_poly_cache_condition 
ON public.polymarket_h2h_cache(condition_id);

CREATE INDEX IF NOT EXISTS idx_watch_state_poly_condition 
ON public.event_watch_state(polymarket_condition_id) 
WHERE polymarket_condition_id IS NOT NULL;