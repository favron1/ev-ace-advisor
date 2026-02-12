
-- Sharp book lines table (raw lines from individual sharp books)
CREATE TABLE public.sharp_book_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  sport text NOT NULL,
  market_type text NOT NULL,
  outcome text NOT NULL,
  bookmaker text NOT NULL,
  odds numeric NOT NULL,
  implied_probability numeric NOT NULL,
  line_value numeric,
  total_value numeric,
  event_start_time timestamp with time zone,
  is_sharp boolean DEFAULT true,
  captured_at timestamp with time zone DEFAULT now(),
  UNIQUE(event_name, market_type, outcome, bookmaker)
);

ALTER TABLE public.sharp_book_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sharp book lines are publicly readable"
  ON public.sharp_book_lines FOR SELECT USING (true);

CREATE POLICY "Service role can manage sharp book lines"
  ON public.sharp_book_lines FOR ALL USING (true) WITH CHECK (true);

-- Sharp consensus table (weighted consensus from multiple sharp books)
CREATE TABLE public.sharp_consensus (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  market_type text NOT NULL,
  outcome text NOT NULL,
  consensus_probability numeric NOT NULL,
  confidence_score numeric NOT NULL,
  contributing_books text[] DEFAULT '{}',
  line_value numeric,
  total_value numeric,
  calculated_at timestamp with time zone DEFAULT now(),
  UNIQUE(event_name, market_type, outcome)
);

ALTER TABLE public.sharp_consensus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sharp consensus is publicly readable"
  ON public.sharp_consensus FOR SELECT USING (true);

CREATE POLICY "Service role can manage sharp consensus"
  ON public.sharp_consensus FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_sharp_book_lines_event ON public.sharp_book_lines(event_name, market_type);
CREATE INDEX idx_sharp_consensus_event ON public.sharp_consensus(event_name, market_type);
CREATE INDEX idx_sharp_book_lines_captured ON public.sharp_book_lines(captured_at);
