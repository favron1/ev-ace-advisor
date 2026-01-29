// Core types for the Prediction Market Arbitrage Engine

export interface PolymarketMarket {
  id: string;
  market_id: string;
  question: string;
  description?: string;
  category?: string;
  end_date?: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  status: 'active' | 'resolved' | 'closed';
  last_updated: string;
  created_at: string;
}

export interface BookmakerSignal {
  id: string;
  event_name: string;
  market_type: string;
  outcome: string;
  bookmaker: string;
  odds: number;
  implied_probability: number;
  previous_odds?: number;
  odds_movement?: number;
  movement_speed?: number;
  confirming_books: number;
  captured_at: string;
}

export interface SignalOpportunity {
  id: string;
  polymarket_market_id?: string;
  event_name: string;
  recommended_outcome?: string; // The specific team/player to bet on
  side: 'YES' | 'NO';
  polymarket_price: number;
  bookmaker_probability: number;
  edge_percent: number;
  confidence_score: number;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  signal_factors: SignalFactors;
  status: 'active' | 'expired' | 'executed' | 'dismissed';
  expires_at?: string;
  created_at: string;
  user_id?: string;
  // Enhanced fields for true arbitrage detection
  is_true_arbitrage?: boolean;
  polymarket_match_confidence?: number;
  polymarket_yes_price?: number;
  polymarket_volume?: number;
  polymarket_updated_at?: string;
  bookmaker_prob_fair?: number;
  signal_strength?: number;
  // Movement detection fields
  movement_confirmed?: boolean;
  movement_velocity?: number;
  signal_tier?: 'elite' | 'strong' | 'static';
}

export interface SignalFactors {
  movement_magnitude?: number;
  confirming_books?: number;
  movement_speed?: number;
  time_to_resolution?: number;
  liquidity_score?: number;
  market_maturity?: number;
  // Movement detection data
  movement_confirmed?: boolean;
  movement_velocity?: number;
  movement_direction?: 'shortening' | 'drifting';
  books_confirming_movement?: number;
  signal_tier?: 'elite' | 'strong' | 'static';
  // Directional signal labeling
  bet_direction?: 'BUY_YES' | 'BUY_NO';
}

export interface SignalLog {
  id: string;
  opportunity_id?: string;
  event_name: string;
  side: string;
  entry_price: number;
  edge_at_signal: number;
  confidence_at_signal: number;
  outcome?: 'win' | 'loss' | 'void' | 'pending';
  actual_result?: boolean;
  profit_loss?: number;
  created_at: string;
  settled_at?: string;
}

export interface ArbitrageConfig {
  id: string;
  user_id?: string;
  min_edge_percent: number;
  min_confidence: number;
  min_liquidity: number;
  max_exposure_per_event: number;
  time_to_resolution_hours: number;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Signal detection types
export interface OddsMovement {
  event_id: string;
  event_name: string;
  market_type: string;
  outcome: string;
  current_odds: number;
  previous_odds: number;
  change_percent: number;
  direction: 'shortening' | 'drifting';
  confirming_books: string[];
  timestamp: string;
}

export interface SignalDetectionResult {
  opportunities: SignalOpportunity[];
  movements_detected: number;
  outright_signals?: number;
  polymarkets_analyzed: number;
  signals_surfaced: number;
  timestamp: string;
}

// Execution Decision Layer Types
export interface ExecutionAnalysis {
  // Raw edge (what we calculate now)
  raw_edge_percent: number;
  
  // Estimated costs
  platform_fee_percent: number;      // 1% on profits
  estimated_spread_percent: number;  // Based on market liquidity
  estimated_slippage_percent: number; // Based on stake vs order book
  total_costs_percent: number;        // Sum of all costs
  
  // Net edge after costs
  net_edge_percent: number;
  
  // Liquidity assessment
  liquidity_tier: 'high' | 'medium' | 'low' | 'insufficient';
  max_stake_without_impact: number;  // $ amount
  
  // Final decision
  execution_decision: 'STRONG_BET' | 'BET' | 'MARGINAL' | 'NO_BET';
  decision_reason: string;
}

// Extended SignalOpportunity with execution analysis attached
export interface EnrichedSignal extends SignalOpportunity {
  execution?: ExecutionAnalysis;
  isNew?: boolean; // For real-time "new signal" animation
}
