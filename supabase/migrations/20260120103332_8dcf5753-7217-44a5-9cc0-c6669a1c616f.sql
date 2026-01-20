-- Create user_bets table for tracking user-selected bets from recommendations
CREATE TABLE public.user_bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Bet details
  event_name TEXT NOT NULL,
  league TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'soccer',
  selection TEXT NOT NULL,
  odds NUMERIC NOT NULL,
  bookmaker TEXT NOT NULL,
  start_time TIMESTAMPTZ,
  
  -- Model analysis
  model_probability NUMERIC,
  implied_probability NUMERIC,
  edge NUMERIC,
  bet_score INTEGER,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  stake_units NUMERIC,
  rationale TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'void', 'cashout')),
  result_odds NUMERIC,
  profit_loss NUMERIC,
  settled_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_bets ENABLE ROW LEVEL SECURITY;

-- Users can only see their own bets
CREATE POLICY "Users can view their own bets"
ON public.user_bets FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own bets
CREATE POLICY "Users can insert their own bets"
ON public.user_bets FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own bets
CREATE POLICY "Users can update their own bets"
ON public.user_bets FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own bets
CREATE POLICY "Users can delete their own bets"
ON public.user_bets FOR DELETE
USING (auth.uid() = user_id);

-- Index for faster user queries
CREATE INDEX idx_user_bets_user_id ON public.user_bets(user_id);
CREATE INDEX idx_user_bets_status ON public.user_bets(user_id, status);

-- Trigger for updated_at
CREATE TRIGGER update_user_bets_updated_at
BEFORE UPDATE ON public.user_bets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();