export interface ModelBet {
  id: string;
  user_id: string;
  event_id: string;
  market_id: string | null;
  sport: string;
  league: string;
  event_name: string;
  selection_label: string;
  odds_taken: number;
  bookmaker: string;
  model_probability: number;
  implied_probability: number;
  edge: number;
  bet_score: number;
  recommended_stake_units: number;
  rationale: string | null;
  engine: string;
  created_at: string;
  closing_odds: number | null;
  clv: number | null;
  result: 'pending' | 'win' | 'loss' | 'void';
  profit_loss_units: number | null;
  settled_at: string | null;
}

export interface RecommendedBet {
  event_id: string;
  market_id: string;
  sport: string;
  league: string;
  selection: string;
  selection_label: string;
  odds_decimal: number;
  bookmaker: string;
  model_probability: number;
  implied_probability: number;
  edge: number;
  bet_score: number;
  confidence: 'high' | 'medium' | 'low';
  recommended_stake_units: number;
  rationale: string;
}

export interface BettingModelInput {
  sports: string[];
  engine: 'team_sports' | 'horse' | 'greyhound';
  window_hours: number;
  bankroll_units: number;
  max_daily_exposure_pct: number;
  max_per_event_exposure_pct: number;
  max_bets: number;
}

export interface BettingModelResponse {
  recommended_bets: RecommendedBet[];
  portfolio_summary?: {
    total_stake_units: number;
    bankroll_units: number;
    expected_value_units: number;
  };
  events_analyzed: number;
  reason?: string;
  timestamp: string;
}

export interface BetLogFilters {
  sport?: string;
  result?: 'all' | 'pending' | 'win' | 'loss' | 'void';
  dateFrom?: string;
  dateTo?: string;
}

export interface BetStats {
  totalBets: number;
  wins: number;
  losses: number;
  pending: number;
  totalStaked: number;
  totalProfit: number;
  winRate: number;
  roi: number;
  avgEdge: number;
  avgBetScore: number;
  avgCLV: number;
}
