
-- ============================================================================
-- 1. WHALE WALLETS TABLE
-- ============================================================================
CREATE TABLE public.whale_wallets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL UNIQUE,
  display_name text,
  total_profit numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  total_trades integer DEFAULT 0,
  avg_position_size numeric DEFAULT 0,
  specializations text[] DEFAULT '{}',
  confidence_tier text DEFAULT 'medium',
  last_active_at timestamptz DEFAULT now(),
  tracked_since timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. WHALE POSITIONS TABLE
-- ============================================================================
CREATE TABLE public.whale_positions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id uuid REFERENCES public.whale_wallets(id) ON DELETE CASCADE NOT NULL,
  market_id text NOT NULL,
  condition_id text,
  event_name text NOT NULL,
  side text NOT NULL,
  size numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  current_price numeric,
  unrealized_pnl numeric DEFAULT 0,
  status text DEFAULT 'open',
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. MULTI-LEG OPPORTUNITIES TABLE
-- ============================================================================
CREATE TABLE public.multi_leg_opportunities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  sport text,
  legs jsonb NOT NULL DEFAULT '[]',
  correlation_score numeric DEFAULT 0,
  combined_edge numeric DEFAULT 0,
  combined_probability numeric DEFAULT 0,
  status text DEFAULT 'active',
  detected_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. NEW COLUMNS ON signal_opportunities
-- ============================================================================
ALTER TABLE public.signal_opportunities
  ADD COLUMN IF NOT EXISTS sharp_consensus_prob numeric,
  ADD COLUMN IF NOT EXISTS sharp_line_edge numeric,
  ADD COLUMN IF NOT EXISTS line_shopping_tier text,
  ADD COLUMN IF NOT EXISTS market_priority_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_type_bonus numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS liquidity_penalty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kelly_fraction numeric,
  ADD COLUMN IF NOT EXISTS suggested_stake_cents integer,
  ADD COLUMN IF NOT EXISTS max_kelly_stake_cents integer,
  ADD COLUMN IF NOT EXISTS bankroll_percentage numeric;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
CREATE INDEX idx_whale_positions_wallet_id ON public.whale_positions(wallet_id);
CREATE INDEX idx_whale_positions_market_id ON public.whale_positions(market_id);
CREATE INDEX idx_whale_positions_status ON public.whale_positions(status);
CREATE INDEX idx_multi_leg_status ON public.multi_leg_opportunities(status);
CREATE INDEX idx_multi_leg_sport ON public.multi_leg_opportunities(sport);
CREATE INDEX idx_signal_opp_line_tier ON public.signal_opportunities(line_shopping_tier);
CREATE INDEX idx_signal_opp_priority ON public.signal_opportunities(market_priority_score DESC);

-- ============================================================================
-- 6. VIEW: line_shopping_opportunities
-- ============================================================================
CREATE OR REPLACE VIEW public.line_shopping_opportunities AS
SELECT
  so.id,
  so.event_name,
  so.side,
  so.polymarket_price,
  so.bookmaker_probability,
  so.edge_percent,
  so.confidence_score,
  so.sharp_consensus_prob,
  so.sharp_line_edge,
  so.line_shopping_tier,
  so.market_priority_score,
  so.kelly_fraction,
  so.suggested_stake_cents,
  so.status,
  so.created_at,
  sc.consensus_probability AS sharp_prob,
  sc.confidence_score AS sharp_confidence,
  sc.contributing_books,
  sc.market_type AS sharp_market_type,
  (so.polymarket_price - sc.consensus_probability) AS price_discrepancy
FROM public.signal_opportunities so
LEFT JOIN public.sharp_consensus sc
  ON so.event_name = sc.event_name
  AND so.side = sc.outcome
WHERE so.status = 'active';

-- ============================================================================
-- 7. FUNCTION: update_market_priority_scores()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_market_priority_scores()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.signal_opportunities
  SET
    market_type_bonus = CASE
      WHEN signal_factors->>'market_type' = 'spread' THEN 1.5
      WHEN signal_factors->>'market_type' = 'total' THEN 1.2
      ELSE 1.0
    END,
    market_priority_score = edge_percent * confidence_score *
      CASE
        WHEN signal_factors->>'market_type' = 'spread' THEN 1.5
        WHEN signal_factors->>'market_type' = 'total' THEN 1.2
        ELSE 1.0
      END
  WHERE status = 'active';
END;
$$;

-- ============================================================================
-- 8. FUNCTION: cleanup_old_sharp_lines()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_sharp_lines()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sharp_book_lines
  WHERE captured_at < now() - interval '7 days';

  DELETE FROM public.sharp_consensus
  WHERE calculated_at < now() - interval '7 days';
END;
$$;

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================
ALTER TABLE public.whale_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multi_leg_opportunities ENABLE ROW LEVEL SECURITY;

-- whale_wallets
CREATE POLICY "Whale wallets are publicly readable"
  ON public.whale_wallets FOR SELECT USING (true);
CREATE POLICY "Service role can manage whale wallets"
  ON public.whale_wallets FOR ALL USING (true) WITH CHECK (true);

-- whale_positions
CREATE POLICY "Whale positions are publicly readable"
  ON public.whale_positions FOR SELECT USING (true);
CREATE POLICY "Service role can manage whale positions"
  ON public.whale_positions FOR ALL USING (true) WITH CHECK (true);

-- multi_leg_opportunities
CREATE POLICY "Multi leg opportunities are publicly readable"
  ON public.multi_leg_opportunities FOR SELECT USING (true);
CREATE POLICY "Service role can manage multi leg opportunities"
  ON public.multi_leg_opportunities FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 10. SEED DATA: Known whale wallets
-- ============================================================================
INSERT INTO public.whale_wallets (wallet_address, display_name, total_profit, win_rate, total_trades, specializations, confidence_tier) VALUES
  ('kch123', 'kch123', 500000, 0.67, 1200, ARRAY['NBA', 'NFL', 'politics'], 'high'),
  ('SeriouslySirius', 'SeriouslySirius', 350000, 0.62, 800, ARRAY['crypto', 'politics'], 'high'),
  ('DrPufferfish', 'DrPufferfish', 280000, 0.58, 950, ARRAY['NBA', 'soccer'], 'medium'),
  ('gmanas', 'gmanas', 220000, 0.61, 600, ARRAY['NFL', 'politics'], 'medium'),
  ('simonbanza', 'simonbanza', 180000, 0.55, 450, ARRAY['soccer', 'tennis'], 'medium');

-- ============================================================================
-- 11. TABLE COMMENTS
-- ============================================================================
COMMENT ON TABLE public.whale_wallets IS 'Tracks known profitable Polymarket whale wallets with profit stats and specializations';
COMMENT ON TABLE public.whale_positions IS 'Current and historical positions held by tracked whale wallets';
COMMENT ON TABLE public.multi_leg_opportunities IS 'Correlated multi-leg betting opportunities across related markets';
COMMENT ON VIEW public.line_shopping_opportunities IS 'Joins signals with sharp consensus to show line shopping edges';
