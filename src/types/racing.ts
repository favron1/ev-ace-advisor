export interface RunnerValueRating {
  actualProbability: number;
  impliedProbability: number;
  offeredOdds: number;
  ev: number;
  meetsCriteria: boolean;
}

export interface RaceRunner {
  runnerName: string;
  runnerNumber: number;
  trapOrBarrier: number;
  jockey?: string;
  trainer?: string;
  weightKg?: number;
  recentForm: string[];
  lastRaceTime?: string;
  surfacePref?: string;
  classLastRace?: string;
  daysSinceLastRun?: number;
  earlySpeed?: 'High' | 'Medium' | 'Low';
  runningStyle?: 'Front-runner' | 'Stalker' | 'Closer' | 'Rail' | 'Wide';
  valueRating: RunnerValueRating;
  confidenceLevel: 'High' | 'Moderate' | 'Low';
  suggestedBetPercent: string;
  marketType: 'Win' | 'Place' | 'Each-Way';
  reasoning: string;
}

export interface Race {
  raceId: string;
  track: string;
  sport: 'horse' | 'greyhound';
  date: string;
  time: string;
  raceType: string;
  distanceM: number;
  trackCondition: string;
  weather: string;
  raceNumber: number;
  runners: RaceRunner[];
  status: 'upcoming' | 'live' | 'completed';
}

export interface RaceMeeting {
  id: string;
  track: string;
  state: string;
  country: string;
  date: string;
  sport: 'horse' | 'greyhound';
  races: Race[];
  weather: string;
  trackCondition: string;
}

export interface RacingBestBet {
  raceId: string;
  match: string;
  runner: string;
  runnerNumber: number;
  trapOrBarrier: number;
  jockey?: string;
  trainer?: string;
  market: 'Win' | 'Place' | 'Each-Way';
  sport: 'horse' | 'greyhound';
  track: string;
  raceNumber: number;
  raceTime: string;
  distanceM: number;
  trackCondition: string;
  weather: string;
  raceType: string;
  recentForm: string[];
  earlySpeed?: string;
  runningStyle?: string;
  daysSinceLastRun?: number;
  surfacePref?: string;
  classLastRace?: string;
  ev: number;
  meetsCriteria: boolean;
  minOdds: number;
  offeredOdds: number;
  actualProbability: number;
  impliedProbability: number;
  fairOdds: number;
  edge: number;
  confidence: 'High' | 'Moderate' | 'Low';
  suggestedBetPercent: string;
  reasoning: string;
}

export interface RacingAnalysis {
  date: string;
  sport: 'all' | 'horse' | 'greyhound';
  races: Race[];
  bestBets: RacingBestBet[];
  lastUpdated: string;
  totalRacesAnalyzed: number;
}
