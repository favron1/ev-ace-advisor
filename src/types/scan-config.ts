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
  currentMode: 'manual' | 'baseline' | 'turbo';
  estimatedMonthlyCost: number;
}

export interface AdaptiveScanResult {
  scanType: 'manual' | 'baseline' | 'turbo';
  eventsScanned: number;
  signalsDetected: number;
  apiRequestsUsed: number;
  nearTermEvents: number; // Events within turbo window
  timestamp: string;
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
