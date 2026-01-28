-- FULL DESTRUCTIVE RESET: Drop all legacy betting tables
DROP TABLE IF EXISTS public.racing_bets CASCADE;
DROP TABLE IF EXISTS public.racing_odds_snapshots CASCADE;
DROP TABLE IF EXISTS public.racing_markets CASCADE;
DROP TABLE IF EXISTS public.racing_runners CASCADE;
DROP TABLE IF EXISTS public.racing_model_predictions CASCADE;
DROP TABLE IF EXISTS public.racing_events CASCADE;
DROP TABLE IF EXISTS public.racing_track_bias CASCADE;
DROP TABLE IF EXISTS public.racing_angle_performance CASCADE;
DROP TABLE IF EXISTS public.racing_model_performance CASCADE;
DROP TABLE IF EXISTS public.model_bets CASCADE;
DROP TABLE IF EXISTS public.user_bets CASCADE;
DROP TABLE IF EXISTS public.bet_history CASCADE;
DROP TABLE IF EXISTS public.value_bets CASCADE;
DROP TABLE IF EXISTS public.odds_snapshots CASCADE;
DROP TABLE IF EXISTS public.markets CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.scrape_history CASCADE;
DROP TABLE IF EXISTS public.tennis_players CASCADE;
DROP TABLE IF EXISTS public.tennis_h2h CASCADE;

-- NEW SCHEMA: Prediction Market Arbitrage Engine

-- 1. Markets (Polymarket markets we're tracking)
CREATE TABLE public.polymarket_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT UNIQUE NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  category TEXT,
  end_date TIMESTAMPTZ,
  yes_price NUMERIC NOT NULL,
  no_price NUMERIC NOT NULL,
  volume NUMERIC DEFAULT 0,
  liquidity NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bookmaker Signals (odds movements from sharp books)
CREATE TABLE public.bookmaker_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  market_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  odds NUMERIC NOT NULL,
  implied_probability NUMERIC NOT NULL,
  previous_odds NUMERIC,
  odds_movement NUMERIC,
  movement_speed NUMERIC,
  confirming_books INTEGER DEFAULT 1,
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Signal Opportunities (detected arbitrage/mispricing signals)
CREATE TABLE public.signal_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  polymarket_market_id UUID REFERENCES public.polymarket_markets(id),
  event_name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('YES', 'NO')),
  polymarket_price NUMERIC NOT NULL,
  bookmaker_probability NUMERIC NOT NULL,
  edge_percent NUMERIC NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  signal_factors JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'executed', 'dismissed')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID
);

-- 4. Signal Logs (all signals for feedback loop)
CREATE TABLE public.signal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES public.signal_opportunities(id),
  event_name TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  edge_at_signal NUMERIC NOT NULL,
  confidence_at_signal INTEGER NOT NULL,
  outcome TEXT CHECK (outcome IN ('win', 'loss', 'void', 'pending')),
  actual_result BOOLEAN,
  profit_loss NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  settled_at TIMESTAMPTZ
);

-- 5. System Config (thresholds and settings)
CREATE TABLE public.arbitrage_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  min_edge_percent NUMERIC DEFAULT 3.0,
  min_confidence INTEGER DEFAULT 60,
  min_liquidity NUMERIC DEFAULT 1000,
  max_exposure_per_event NUMERIC DEFAULT 500,
  time_to_resolution_hours INTEGER DEFAULT 168,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polymarket_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmaker_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arbitrage_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Markets and signals are public read
CREATE POLICY "Polymarket markets are publicly readable" ON public.polymarket_markets FOR SELECT USING (true);
CREATE POLICY "Service role can manage polymarket markets" ON public.polymarket_markets FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Bookmaker signals are publicly readable" ON public.bookmaker_signals FOR SELECT USING (true);
CREATE POLICY "Service role can manage bookmaker signals" ON public.bookmaker_signals FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Signal opportunities are publicly readable" ON public.signal_opportunities FOR SELECT USING (true);
CREATE POLICY "Users can manage their own opportunities" ON public.signal_opportunities FOR ALL USING (auth.uid() = user_id OR user_id IS NULL) WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Signal logs are publicly readable" ON public.signal_logs FOR SELECT USING (true);
CREATE POLICY "Service role can manage signal logs" ON public.signal_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can view their own config" ON public.arbitrage_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own config" ON public.arbitrage_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_polymarket_markets_status ON public.polymarket_markets(status);
CREATE INDEX idx_bookmaker_signals_captured ON public.bookmaker_signals(captured_at DESC);
CREATE INDEX idx_signal_opportunities_status ON public.signal_opportunities(status);
CREATE INDEX idx_signal_opportunities_confidence ON public.signal_opportunities(confidence_score DESC);
CREATE INDEX idx_signal_logs_outcome ON public.signal_logs(outcome);