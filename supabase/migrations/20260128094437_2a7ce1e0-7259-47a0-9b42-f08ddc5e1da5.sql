-- Phase 1: Create probability_snapshots table for time-series tracking
CREATE TABLE probability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  event_name text NOT NULL,
  outcome text NOT NULL,
  fair_probability numeric NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'sharp',
  CONSTRAINT unique_snapshot UNIQUE (event_key, outcome, captured_at)
);

-- Indexes for fast lookback queries
CREATE INDEX idx_snapshots_event_time ON probability_snapshots(event_key, captured_at DESC);
CREATE INDEX idx_snapshots_recent ON probability_snapshots(captured_at DESC);

-- Enable RLS
ALTER TABLE probability_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read access for snapshots
CREATE POLICY "Snapshots are publicly readable"
ON probability_snapshots FOR SELECT USING (true);

-- Service role can manage snapshots
CREATE POLICY "Service role can manage snapshots"
ON probability_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Phase 1.2: Create event_watch_state table for per-event escalation
CREATE TABLE event_watch_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_name text NOT NULL,
  outcome text,
  commence_time timestamptz,
  
  -- State tracking
  watch_state text DEFAULT 'watching',
  escalated_at timestamptz,
  active_until timestamptz,
  
  -- Movement tracking
  initial_probability numeric,
  peak_probability numeric,
  current_probability numeric,
  movement_pct numeric DEFAULT 0,
  movement_velocity numeric DEFAULT 0,
  
  -- Confirmation tracking
  hold_start_at timestamptz,
  samples_since_hold integer DEFAULT 0,
  reverted boolean DEFAULT false,
  
  -- Polymarket matching
  polymarket_matched boolean DEFAULT false,
  polymarket_market_id uuid,
  polymarket_price numeric,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE event_watch_state ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Event watch state is publicly readable"
ON event_watch_state FOR SELECT USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage event watch state"
ON event_watch_state FOR ALL USING (true) WITH CHECK (true);

-- Phase 1.3: Create movement_logs table for learning
CREATE TABLE movement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  event_name text NOT NULL,
  
  -- Movement data
  movement_pct numeric,
  velocity numeric,
  hold_duration_seconds integer,
  samples_captured integer,
  
  -- Outcome
  final_state text,
  polymarket_matched boolean,
  edge_at_confirmation numeric,
  
  -- Result (filled later)
  actual_outcome boolean,
  profit_loss numeric,
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE movement_logs ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Movement logs are publicly readable"
ON movement_logs FOR SELECT USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage movement logs"
ON movement_logs FOR ALL USING (true) WITH CHECK (true);

-- Phase 1.4: Update scan_config with sport scope controls
ALTER TABLE scan_config
ADD COLUMN IF NOT EXISTS enabled_sports text[] DEFAULT ARRAY['basketball_nba'],
ADD COLUMN IF NOT EXISTS max_simultaneous_active integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS movement_threshold_pct numeric DEFAULT 6.0,
ADD COLUMN IF NOT EXISTS hold_window_minutes integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS samples_required integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS watch_poll_interval_minutes integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS active_poll_interval_seconds integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS active_window_minutes integer DEFAULT 20;