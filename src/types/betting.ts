export type BetStatus = 'pending' | 'won' | 'lost' | 'void';
export type ConfidenceLevel = 'low' | 'moderate' | 'high';
export type MarketType = '1x2' | 'over_under' | 'btts' | 'handicap' | 'correct_score' | 'other';

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  league: string;
  match_date: string;
  home_form?: string;
  away_form?: string;
  home_goals_scored?: number;
  home_goals_conceded?: number;
  away_goals_scored?: number;
  away_goals_conceded?: number;
  home_xg?: number;
  away_xg?: number;
  head_to_head?: Record<string, unknown>;
}

export interface ValueBet {
  id: string;
  match_id?: string;
  match?: Match;
  market: MarketType;
  selection: string;
  offered_odds: number;
  fair_odds: number;
  implied_probability: number;
  actual_probability: number;
  expected_value: number;
  edge: number;
  confidence: ConfidenceLevel;
  min_odds: number;
  suggested_stake_percent: number;
  reasoning?: string;
  meets_criteria: boolean;
  is_active: boolean;
  created_at: string;
}

export interface BetHistory {
  id: string;
  user_id: string;
  value_bet_id?: string;
  match_description: string;
  selection: string;
  odds: number;
  stake: number;
  potential_return: number;
  status: BetStatus;
  profit_loss?: number;
  placed_at: string;
  settled_at?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name?: string;
  bankroll: number;
  total_bets: number;
  total_wins: number;
  total_profit: number;
}

export interface BetAnalysis {
  actualProbability: number;
  fairOdds: number;
  expectedValue: number;
  edge: number;
  confidence: ConfidenceLevel;
  suggestedStakePercent: number;
  reasoning: string;
  meetsCriteria: boolean;
}
