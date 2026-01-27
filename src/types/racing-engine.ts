// =====================================================
// RACING ENGINE v2.0 - TYPE DEFINITIONS
// Complete isolation from sports betting types
// =====================================================

export interface RacingEngineConfig {
  minEvThreshold: number;      // Minimum EV% to recommend (default 5%)
  minConfidence: number;       // Minimum confidence score (default 65)
  kellyFraction: number;       // Kelly staking fraction (default 0.10 = 10%)
  maxStakeUnits: number;       // Maximum stake per bet in units
  maxExposurePercent: number;  // Max exposure per race
}

export interface BettingAngle {
  name: string;
  type: 'greyhound' | 'horse' | 'both';
  triggered: boolean;
  adjustment: number;
  confidence: number;
  details: string;
}

export interface MarketIntelligence {
  consensusPrice: number;
  bestOdds: number;
  oddsMovement: 'drifting' | 'shortening' | 'stable';
  bookmakerCount: number;
  marketMaturity: 'early' | 'mid' | 'late';
  
  // Betfair fields (null until integration enabled)
  betfairBackPrice?: number;
  betfairLayPrice?: number;
  betfairVolume?: number;
  betfairVolumeChange?: number;
  smartMoneySignal?: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  clvProjection?: number;
}

export interface RacingRecommendation {
  // Race info
  raceId: string;
  track: string;
  trackCountry: string;
  raceNumber: number;
  raceName: string;
  sport: 'horse' | 'greyhound';
  startTime: string;
  hoursToRace: number;
  distance: number;
  trackCondition: string;
  
  // Runner info
  runnerId: string;
  runnerName: string;
  runnerNumber: number;
  barrier: number;
  recentForm: string[];
  runStyle: string | null;
  
  // Odds & value
  bestOdds: number;
  bestBookmaker: string;
  consensusOdds: number;
  fairOdds: number;
  
  // Model outputs
  modelProbability: number;
  impliedProbability: number;
  ev: number;
  evPercent: number;
  edge: number;
  edgePercent: number;
  confidence: number;
  
  // Staking
  stakeUnits: number;
  kellyOptimal: number;
  
  // Angles & reasoning
  angles: string[];
  angleDetails: string[];
  timing: 'optimal' | 'acceptable' | 'suboptimal';
  reasoning: string;
  
  // Market intel
  oddsMovement: 'drifting' | 'shortening' | 'stable';
  marketMaturity: 'early' | 'mid' | 'late';
  
  // Betfair fields (future)
  betfairConfirmed?: boolean | null;
  betfairSignal?: string | null;
  
  // Scoring
  betScore: number;
  rank: number;
  
  // Demo flag
  isDemo: boolean;
}

export interface RacingEngineResponse {
  success: boolean;
  engine_version: string;
  model_version: string;
  races_analyzed: number;
  total_runners_analyzed: number;
  recommendations: RacingRecommendation[];
  config: {
    minEvThreshold: number;
    minConfidence: number;
    kellyFraction: number;
  };
  betfair_status: 'enabled' | 'ready_to_integrate';
  data_source: 'demo' | 'live';
  generated_at: string;
  error?: string;
}

// =====================================================
// LEARNING LOOP TYPES
// =====================================================

export interface RacingBetResult {
  betId: string;
  eventId: string;
  runnerId: string;
  sport: 'horse' | 'greyhound';
  track: string;
  distance: number;
  
  // At-bet values
  oddsAtBet: number;
  modelProbAtBet: number;
  impliedProbAtBet: number;
  evAtBet: number;
  confidenceAtBet: number;
  anglesAtBet: string[];
  
  // Result
  finishPosition: number | null;
  isWinner: boolean;
  closingOdds: number | null;
  clv: number | null; // Closing Line Value
  profitLossUnits: number;
  
  // Learning metrics
  predictedProb: number;
  actualOutcome: 0 | 1;
  brierScore: number; // Lower is better
}

export interface ModelPerformanceMetrics {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  profitUnits: number;
  avgEv: number;
  avgClv: number;
  brierScore: number;
  
  // By segment
  byTrack: Record<string, { bets: number; roi: number; }>;
  byDistance: Record<string, { bets: number; roi: number; }>;
  byAngle: Record<string, { bets: number; roi: number; hitRate: number; }>;
  bySport: {
    horse: { bets: number; roi: number; };
    greyhound: { bets: number; roi: number; };
  };
}
