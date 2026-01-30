-- Create table for AI advisor recommendations
CREATE TABLE public.ai_advisor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type TEXT NOT NULL, -- 'pattern_analysis', 'threshold_recommendation', 'strategy_alert'
  insight_category TEXT, -- 'market_type', 'liquidity', 'edge_threshold', 'league_focus'
  recommendation TEXT NOT NULL, -- The actual advice
  supporting_data JSONB, -- Stats that led to this conclusion
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT DEFAULT 'active', -- 'active', 'applied', 'dismissed'
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ai_advisor_logs ENABLE ROW LEVEL SECURITY;

-- Public read access (single-user system)
CREATE POLICY "AI advisor logs are publicly readable"
ON public.ai_advisor_logs FOR SELECT
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage ai advisor logs"
ON public.ai_advisor_logs FOR ALL
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_advisor_logs_created ON public.ai_advisor_logs(created_at DESC);
CREATE INDEX idx_advisor_logs_status ON public.ai_advisor_logs(status);
CREATE INDEX idx_advisor_logs_priority ON public.ai_advisor_logs(priority);