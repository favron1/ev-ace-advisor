// Scan configuration types for adaptive scanning system

export interface ScanConfig {
  id: string;
  user_id: string;
  
  // Scan frequency settings
  base_frequency_minutes: number;
  turbo_frequency_minutes: number;
  adaptive_scanning_enabled: boolean;
  turbo_mode_enabled: boolean;
  scanning_paused: boolean;
  
  // Event horizon settings
  event_horizon_hours: number;
  min_event_horizon_hours: number;
  
  // Sharp book settings
  sharp_book_weighting_enabled: boolean;
  sharp_book_weight: number;
  
  // API limits
  max_daily_requests: number;
  max_monthly_requests: number;
  daily_requests_used: number;
  monthly_requests_used: number;
  last_request_reset?: string;
  
  // Scan tracking
  last_scan_at?: string;
  next_scheduled_scan_at?: string;
  total_scans_today: number;
  
  // NEW: Two-tier polling settings
  enabled_sports: string[];
  max_simultaneous_active: number;
  movement_threshold_pct: number;
  hold_window_minutes: number;
  samples_required: number;
  watch_poll_interval_minutes: number;
  active_poll_interval_seconds: number;
  active_window_minutes: number;
  
  created_at: string;
  updated_at: string;
}

export interface ScanStatus {
  isScanning: boolean;
  isPaused: boolean;
  lastScanAt?: Date;
  nextScanAt?: Date;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number;
  monthlyRequestsUsed: number;
  monthlyRequestsLimit: number;
  currentMode: 'manual' | 'baseline' | 'turbo' | 'watching' | 'active';
  estimatedMonthlyCost: number;
  activeEventsCount?: number;
  watchingEventsCount?: number;
}

export interface AdaptiveScanResult {
  scanType: 'manual' | 'baseline' | 'turbo' | 'watch' | 'active';
  eventsScanned: number;
  signalsDetected: number;
  apiRequestsUsed: number;
  nearTermEvents: number;
  timestamp: string;
  escalatedToActive?: number;
  confirmedEdges?: number;
}

// Signal state definitions for the new system
export type SignalState = 'watching' | 'active' | 'confirmed' | 'signal' | 'dropped';

export interface EventWatchState {
  id: string;
  event_key: string;
  event_name: string;
  outcome?: string;
  commence_time?: string;
  watch_state: SignalState;
  escalated_at?: string;
  active_until?: string;
  initial_probability: number;
  peak_probability: number;
  current_probability: number;
  movement_pct: number;
  movement_velocity: number;
  hold_start_at?: string;
  samples_since_hold: number;
  reverted: boolean;
  polymarket_matched: boolean;
  polymarket_market_id?: string;
  polymarket_price?: number;
  created_at: string;
  updated_at: string;
}

export interface ProbabilitySnapshot {
  id: string;
  event_key: string;
  event_name: string;
  outcome: string;
  fair_probability: number;
  captured_at: string;
  source: 'sharp' | 'consensus';
}

export interface MovementLog {
  id: string;
  event_key: string;
  event_name: string;
  movement_pct: number;
  velocity: number;
  hold_duration_seconds: number;
  samples_captured: number;
  final_state: string;
  polymarket_matched: boolean;
  edge_at_confirmation: number;
  actual_outcome?: boolean;
  profit_loss?: number;
  created_at: string;
}

// Sharp bookmakers that move first on informed money
export const SHARP_BOOKMAKERS = [
  'Pinnacle',
  'Betfair',
  'BetOnline.ag',
  'Bookmaker',
  'CRIS',
  'Circa Sports',
  'Lowvig.ag',
] as const;

export type SharpBookmaker = typeof SHARP_BOOKMAKERS[number];

// Available sports for polling
export const AVAILABLE_SPORTS = [
  { key: 'basketball_nba', label: 'NBA Basketball', icon: '🏀' },
  { key: 'americanfootball_nfl', label: 'NFL Football', icon: '🏈' },
  { key: 'icehockey_nhl', label: 'NHL Hockey', icon: '🏒' },
  { key: 'soccer_epl', label: 'English Premier League', icon: '⚽' },
  { key: 'mma_mixed_martial_arts', label: 'MMA / UFC', icon: '🥊' },
] as const;

export type AvailableSport = typeof AVAILABLE_SPORTS[number]['key'];
