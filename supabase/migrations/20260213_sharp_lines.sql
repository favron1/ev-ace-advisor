-- ============================================================================
-- SHARP LINES & LINE SHOPPING DATABASE SCHEMA
-- ============================================================================
-- Supports cross-platform line shopping (kch123 strategy)
-- Stores sharp bookmaker lines and consensus probabilities
-- ============================================================================

-- Sharp bookmaker lines table
CREATE TABLE IF NOT EXISTS sharp_book_lines (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  sport TEXT NOT NULL,
  market_type TEXT NOT NULL, -- 'h2h', 'spreads', 'totals'
  outcome TEXT NOT NULL,
  bookmaker TEXT NOT NULL, -- 'pinnacle', 'betfair_ex_eu', 'circa'
  odds DECIMAL(10,4) NOT NULL,
  implied_probability DECIMAL(10,6) NOT NULL,
  line_value DECIMAL(5,1), -- For spreads (e.g., -4.5)
  total_value DECIMAL(6,1), -- For totals (e.g., 225.5)
  event_start_time TIMESTAMP WITH TIME ZONE,
  is_sharp BOOLEAN DEFAULT true,
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT sharp_lines_unique UNIQUE (event_name, market_type, outcome, bookmaker)
);

-- Sharp consensus table (weighted averages of sharp books)
CREATE TABLE IF NOT EXISTS sharp_consensus (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  sport TEXT NOT NULL,
  market_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  consensus_probability DECIMAL(10,6) NOT NULL,
  confidence_score DECIMAL(5,2) NOT NULL, -- 0-100 based on book agreement
  contributing_books TEXT[] NOT NULL, -- Array of bookmaker names
  line_value DECIMAL(5,1), -- For spreads
  total_value DECIMAL(6,1), -- For totals
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint for consensus per market
  CONSTRAINT sharp_consensus_unique UNIQUE (event_name, market_type, outcome)
);

-- Multi-leg opportunities table (correlated bets)
CREATE TABLE IF NOT EXISTS multi_leg_opportunities (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  sport TEXT NOT NULL,
  event_start_time TIMESTAMP WITH TIME ZONE,
  legs JSONB NOT NULL, -- Array of signal IDs and details
  total_edge_estimate DECIMAL(5,2),
  correlation_score DECIMAL(3,2), -- 0.0-1.0
  risk_concentration DECIMAL(5,2), -- Max loss if all legs fail
  kelly_sizing_recommendation DECIMAL(5,2),
  recommended_bankroll_pct DECIMAL(4,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'executed', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Whale wallets tracking
CREATE TABLE IF NOT EXISTS whale_wallets (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  whale_name TEXT,
  total_profit BIGINT, -- In USD cents for precision
  win_rate DECIMAL(5,4), -- 0.0000-1.0000
  specialization TEXT, -- 'nhl', 'nba', 'multi-sport', etc.
  confidence_tier TEXT NOT NULL DEFAULT 'emerging' 
    CHECK (confidence_tier IN ('elite', 'strong', 'emerging', 'inactive')),
  avg_position_size BIGINT, -- Average bet size in USD cents
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Whale positions tracking
CREATE TABLE IF NOT EXISTS whale_positions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES whale_wallets(wallet_address),
  market_id TEXT NOT NULL,
  market_question TEXT,
  event_name TEXT,
  sport TEXT,
  position_type TEXT NOT NULL CHECK (position_type IN ('YES', 'NO')),
  shares DECIMAL(15,6) NOT NULL,
  avg_price DECIMAL(8,6) NOT NULL,
  current_value BIGINT, -- Current value in USD cents
  profit_loss BIGINT, -- Unrealized P&L in USD cents
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_new_position BOOLEAN DEFAULT true,
  position_confidence TEXT DEFAULT 'medium' 
    CHECK (position_confidence IN ('high', 'medium', 'low')),
  
  -- Unique constraint to prevent duplicate position tracking
  CONSTRAINT whale_positions_unique UNIQUE (wallet_address, market_id, position_type)
);

-- Enhanced signal opportunities (add line shopping fields)
ALTER TABLE signal_opportunities 
ADD COLUMN IF NOT EXISTS sharp_consensus_prob DECIMAL(10,6),
ADD COLUMN IF NOT EXISTS sharp_line_edge DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS line_shopping_tier TEXT 
  CHECK (line_shopping_tier IN ('premium', 'value', 'fair', 'avoid', NULL)),
ADD COLUMN IF NOT EXISTS market_priority_score DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS market_type_bonus DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS liquidity_penalty DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS kelly_fraction DECIMAL(8,6),
ADD COLUMN IF NOT EXISTS suggested_stake_cents BIGINT, -- Recommended stake in cents
ADD COLUMN IF NOT EXISTS max_kelly_stake_cents BIGINT, -- Full Kelly stake in cents
ADD COLUMN IF NOT EXISTS bankroll_percentage DECIMAL(5,2); -- % of bankroll

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sharp_lines_event_market 
  ON sharp_book_lines(event_name, market_type, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_sharp_lines_sport_time 
  ON sharp_book_lines(sport, event_start_time);

CREATE INDEX IF NOT EXISTS idx_sharp_consensus_event 
  ON sharp_consensus(event_name, market_type, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whale_positions_wallet_recent 
  ON whale_positions(wallet_address, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_whale_positions_market 
  ON whale_positions(market_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_multi_leg_sport_time 
  ON multi_leg_opportunities(sport, event_start_time, status);

-- Create view for line shopping opportunities
CREATE OR REPLACE VIEW line_shopping_opportunities AS
SELECT 
  so.id,
  so.event_name,
  so.side,
  so.polymarket_price,
  so.edge_percent as raw_edge,
  sc.consensus_probability as sharp_prob,
  sc.confidence_score as sharp_confidence,
  sc.contributing_books,
  (so.polymarket_price - sc.consensus_probability) as price_vs_sharp,
  CASE 
    WHEN (so.polymarket_price - sc.consensus_probability) > 0.05 THEN 'premium'
    WHEN (so.polymarket_price - sc.consensus_probability) > 0.03 THEN 'value'  
    WHEN ABS(so.polymarket_price - sc.consensus_probability) <= 0.03 THEN 'fair'
    ELSE 'avoid'
  END as line_shopping_tier,
  so.created_at
FROM signal_opportunities so
LEFT JOIN sharp_consensus sc ON (
  so.event_name = sc.event_name 
  AND sc.market_type = 'h2h' -- Default to moneyline for now
)
WHERE so.status = 'active';

-- Function to update market priority scores
CREATE OR REPLACE FUNCTION update_market_priority_scores()
RETURNS void AS $$
BEGIN
  UPDATE signal_opportunities 
  SET market_priority_score = CASE
    WHEN recommended_outcome LIKE '%spread%' OR event_name LIKE '%-%' THEN edge_percent * 1.5
    WHEN recommended_outcome LIKE '%total%' OR event_name LIKE '%O %' OR event_name LIKE '%U %' THEN edge_percent * 1.2
    ELSE edge_percent * 1.0 -- Moneyline baseline
  END,
  market_type_bonus = CASE
    WHEN recommended_outcome LIKE '%spread%' THEN 0.5
    WHEN recommended_outcome LIKE '%total%' THEN 0.2
    ELSE 0.0
  END
  WHERE status = 'active' AND market_priority_score IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean old sharp lines (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_sharp_lines()
RETURNS void AS $$
BEGIN
  DELETE FROM sharp_book_lines 
  WHERE captured_at < NOW() - INTERVAL '7 days';
  
  DELETE FROM sharp_consensus 
  WHERE calculated_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Insert known whale wallets
INSERT INTO whale_wallets (wallet_address, whale_name, total_profit, win_rate, specialization, confidence_tier, avg_position_size) VALUES
('0x6a7...33ee', 'kch123', 1110000000, 0.5300, 'nhl_cbb_nfl', 'elite', 50000000), -- $11.1M profit, $500k avg
('0x...seriouslysirius', 'SeriouslySirius', 329000000, 0.5330, 'multi-sport', 'elite', 30000000), -- $3.29M profit
('0x...drpufferfish', 'DrPufferfish', 206000000, 0.5090, 'soccer', 'elite', 25000000), -- $2.06M profit
('0x...gmanas', 'gmanas', 197000000, 0.5180, 'multi-sport', 'strong', 15000000), -- $1.97M profit, bot-like
('0x...simonbanza', 'simonbanza', 104000000, 0.5760, 'trading', 'strong', 20000000) -- $1.04M profit, swing trader
ON CONFLICT (wallet_address) DO NOTHING;

-- Comments
COMMENT ON TABLE sharp_book_lines IS 'Raw odds from sharp bookmakers for line shopping comparison';
COMMENT ON TABLE sharp_consensus IS 'Weighted consensus probabilities from sharp books representing "true" odds';
COMMENT ON TABLE multi_leg_opportunities IS 'Correlated betting opportunities across multiple markets for same event';
COMMENT ON TABLE whale_wallets IS 'Known profitable Polymarket whale wallet addresses for copy trading';
COMMENT ON TABLE whale_positions IS 'Current positions held by tracked whale wallets';
COMMENT ON VIEW line_shopping_opportunities IS 'Real-time view of Polymarket vs Sharp book price discrepancies';