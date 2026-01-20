import { RecommendedBet } from './model-betting';

export interface MyBet extends RecommendedBet {
  id: string;
  addedAt: string;
  lastCheckedAt: string | null;
  status: 'tracking' | 'placed' | 'won' | 'lost' | 'void';
  notes?: string;
}

export interface MyBetsState {
  bets: MyBet[];
  lastUpdated: string;
}
