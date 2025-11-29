export interface RaceRunner {
  id: string;
  name: string;
  number: number;
  barrier: number;
  jockey?: string;
  trainer?: string;
  weight?: number;
  form: string;
  lastStarts: string[];
  odds: number;
  impliedProbability: number;
  actualProbability: number;
  edge: number;
  expectedValue: number;
  confidence: 'low' | 'moderate' | 'high';
  suggestedStakePercent: number;
  reasoning: string;
  meetsCriteria: boolean;
}

export interface Race {
  id: string;
  trackName: string;
  raceNumber: number;
  raceName: string;
  distance: number;
  raceClass: string;
  raceType: 'horse' | 'greyhound';
  startTime: string;
  trackCondition: string;
  weather: string;
  runners: RaceRunner[];
  status: 'upcoming' | 'live' | 'completed';
}

export interface RaceMeeting {
  id: string;
  trackName: string;
  state: string;
  country: string;
  meetingDate: string;
  raceType: 'horse' | 'greyhound';
  races: Race[];
  weather: string;
  trackCondition: string;
}

export interface RacingValueBet {
  id: string;
  raceId: string;
  raceName: string;
  trackName: string;
  raceNumber: number;
  raceType: 'horse' | 'greyhound';
  startTime: string;
  runnerName: string;
  runnerNumber: number;
  barrier: number;
  jockey?: string;
  trainer?: string;
  market: 'win' | 'place' | 'each_way';
  odds: number;
  impliedProbability: number;
  actualProbability: number;
  edge: number;
  expectedValue: number;
  fairOdds: number;
  confidence: 'low' | 'moderate' | 'high';
  suggestedStakePercent: number;
  reasoning: string;
  meetsCriteria: boolean;
  form: string;
  trackCondition: string;
  distance: number;
  raceClass: string;
}

export interface RacingAnalysis {
  meetings: RaceMeeting[];
  valueBets: RacingValueBet[];
  lastUpdated: string;
}
