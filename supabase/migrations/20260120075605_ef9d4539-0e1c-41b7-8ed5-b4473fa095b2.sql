-- Create event status enum
CREATE TYPE public.event_status AS ENUM ('upcoming', 'live', 'completed');

-- Create bet result enum
CREATE TYPE public.bet_result AS ENUM ('pending', 'win', 'loss', 'void');

-- Create events table
CREATE TABLE public.events (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL CHECK (sport IN ('soccer', 'basketball', 'horse', 'greyhound', 'afl', 'nrl', 'tennis')),
  league TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  start_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  start_time_aedt TIMESTAMP WITH TIME ZONE NOT NULL,
  status public.event_status NOT NULL DEFAULT 'upcoming',
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create markets table
CREATE TABLE public.markets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  market_type TEXT NOT NULL,
  line DECIMAL,
  selection TEXT NOT NULL,
  odds_decimal DECIMAL NOT NULL,
  bookmaker TEXT NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create odds_snapshots table for CLV tracking
CREATE TABLE public.odds_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  bookmaker TEXT NOT NULL,
  odds_decimal DECIMAL NOT NULL,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create model_bets table
CREATE TABLE public.model_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE SET NULL,
  market_id TEXT REFERENCES public.markets(id) ON DELETE SET NULL,
  sport TEXT NOT NULL,
  league TEXT NOT NULL,
  event_name TEXT NOT NULL,
  selection_label TEXT NOT NULL,
  odds_taken DECIMAL NOT NULL,
  bookmaker TEXT NOT NULL,
  model_probability DECIMAL NOT NULL,
  implied_probability DECIMAL NOT NULL,
  edge DECIMAL NOT NULL,
  bet_score INTEGER NOT NULL CHECK (bet_score >= 0 AND bet_score <= 100),
  recommended_stake_units DECIMAL NOT NULL,
  rationale TEXT,
  engine TEXT NOT NULL DEFAULT 'team_sports',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closing_odds DECIMAL,
  clv DECIMAL,
  result public.bet_result NOT NULL DEFAULT 'pending',
  profit_loss_units DECIMAL,
  settled_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_events_sport_status ON public.events(sport, status);
CREATE INDEX idx_events_start_time_aedt ON public.events(start_time_aedt);
CREATE INDEX idx_markets_event_id ON public.markets(event_id);
CREATE INDEX idx_odds_snapshots_event_market ON public.odds_snapshots(event_id, market_id);
CREATE INDEX idx_model_bets_user_id ON public.model_bets(user_id);
CREATE INDEX idx_model_bets_result ON public.model_bets(result);
CREATE INDEX idx_model_bets_created_at ON public.model_bets(created_at);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_bets ENABLE ROW LEVEL SECURITY;

-- Events: publicly readable (odds data is public)
CREATE POLICY "Events are publicly readable"
ON public.events FOR SELECT
USING (true);

-- Markets: publicly readable
CREATE POLICY "Markets are publicly readable"
ON public.markets FOR SELECT
USING (true);

-- Odds snapshots: publicly readable
CREATE POLICY "Odds snapshots are publicly readable"
ON public.odds_snapshots FOR SELECT
USING (true);

-- Model bets: users can only see their own bets
CREATE POLICY "Users can view their own model bets"
ON public.model_bets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own model bets"
ON public.model_bets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own model bets"
ON public.model_bets FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own model bets"
ON public.model_bets FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updating events.updated_at
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();