import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScanConfig, ScanStatus, AdaptiveScanResult } from '@/types/scan-config';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_CONFIG: Partial<ScanConfig> = {
  base_frequency_minutes: 30,
  turbo_frequency_minutes: 5,
  adaptive_scanning_enabled: true,
  turbo_mode_enabled: false,
  scanning_paused: false,
  event_horizon_hours: 24,
  min_event_horizon_hours: 2,
  sharp_book_weighting_enabled: true,
  sharp_book_weight: 1.5,
  max_daily_requests: 100,
  max_monthly_requests: 1500,
  daily_requests_used: 0,
  monthly_requests_used: 0,
  total_scans_today: 0,
};

export function useScanConfig() {
  const [config, setConfig] = useState<ScanConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<ScanStatus>({
    isScanning: false,
    isPaused: false,
    dailyRequestsUsed: 0,
    dailyRequestsLimit: 100,
    monthlyRequestsUsed: 0,
    monthlyRequestsLimit: 1500,
    currentMode: 'manual',
    estimatedMonthlyCost: 0,
  });
  
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Fetch config on mount
  const fetchConfig = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('scan_config')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data as unknown as ScanConfig);
        updateStatus(data as unknown as ScanConfig);
      } else {
        // Create default config
        const { data: newConfig, error: createError } = await supabase
          .from('scan_config')
          .insert({ user_id: session.user.id, ...DEFAULT_CONFIG })
          .select()
          .single();

        if (createError) throw createError;
        setConfig(newConfig as unknown as ScanConfig);
        updateStatus(newConfig as unknown as ScanConfig);
      }
    } catch (err) {
      console.error('Failed to fetch scan config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = (cfg: ScanConfig) => {
    // Calculate estimated monthly cost based on frequency
    const scansPerDay = cfg.adaptive_scanning_enabled 
      ? 24 * 60 / cfg.base_frequency_minutes
      : 0;
    const estimatedMonthly = scansPerDay * 30 * 10; // ~10 requests per scan
    
    setStatus({
      isScanning: scanning,
      isPaused: cfg.scanning_paused,
      lastScanAt: cfg.last_scan_at ? new Date(cfg.last_scan_at) : undefined,
      nextScanAt: cfg.next_scheduled_scan_at ? new Date(cfg.next_scheduled_scan_at) : undefined,
      dailyRequestsUsed: cfg.daily_requests_used,
      dailyRequestsLimit: cfg.max_daily_requests,
      monthlyRequestsUsed: cfg.monthly_requests_used,
      monthlyRequestsLimit: cfg.max_monthly_requests,
      currentMode: cfg.scanning_paused ? 'manual' : (cfg.turbo_mode_enabled ? 'turbo' : 'baseline'),
      estimatedMonthlyCost: estimatedMonthly,
    });
  };

  // Update config
  const updateConfig = useCallback(async (updates: Partial<ScanConfig>) => {
    if (!config) return;

    try {
      const { data, error } = await supabase
        .from('scan_config')
        .update(updates)
        .eq('id', config.id)
        .select()
        .single();

      if (error) throw error;
      
      const updatedConfig = data as unknown as ScanConfig;
      setConfig(updatedConfig);
      updateStatus(updatedConfig);
      
      // Restart scheduler if frequency changed
      if (updates.base_frequency_minutes || updates.scanning_paused !== undefined) {
        restartScheduler(updatedConfig);
      }
      
      return updatedConfig;
    } catch (err) {
      console.error('Failed to update scan config:', err);
      throw err;
    }
  }, [config]);

  // Run a manual scan
  const runManualScan = useCallback(async (): Promise<AdaptiveScanResult | null> => {
    if (scanning) return null;
    if (!config) return null;

    // Check API limits
    if (config.daily_requests_used >= config.max_daily_requests) {
      toast({
        title: 'Daily Limit Reached',
        description: `You've used ${config.daily_requests_used}/${config.max_daily_requests} requests today.`,
        variant: 'destructive',
      });
      return null;
    }

    setScanning(true);
    setStatus(prev => ({ ...prev, isScanning: true }));

    try {
      // Run the full pipeline
      toast({ title: 'Scanning...', description: 'Fetching latest odds data' });
      
      const [polyResult, oddsResult] = await Promise.all([
        supabase.functions.invoke('fetch-polymarket', { body: {} }),
        supabase.functions.invoke('ingest-odds', { 
          body: { 
            eventHorizonHours: config.event_horizon_hours,
            sharpBookWeighting: config.sharp_book_weighting_enabled,
            sharpBookWeight: config.sharp_book_weight,
          } 
        }),
      ]);

      // Run detection
      const { data: detectResult, error: detectError } = await supabase.functions.invoke('detect-signals', {
        body: {
          eventHorizonHours: config.event_horizon_hours,
          minEventHorizonHours: config.min_event_horizon_hours,
        }
      });

      if (detectError) throw detectError;

      // Update usage counters
      const requestsUsed = 12; // Approximate: 10 sport endpoints + 2 functions
      await updateConfig({
        daily_requests_used: config.daily_requests_used + requestsUsed,
        monthly_requests_used: config.monthly_requests_used + requestsUsed,
        last_scan_at: new Date().toISOString(),
        total_scans_today: config.total_scans_today + 1,
      });

      const result: AdaptiveScanResult = {
        scanType: 'manual',
        eventsScanned: detectResult?.polymarkets_analyzed || 0,
        signalsDetected: detectResult?.signals_surfaced || 0,
        apiRequestsUsed: requestsUsed,
        nearTermEvents: 0,
        timestamp: new Date().toISOString(),
      };

      toast({
        title: 'Scan Complete',
        description: `Found ${result.signalsDetected} signals from ${result.eventsScanned} markets`,
      });

      return result;
    } catch (err) {
      console.error('Scan failed:', err);
      toast({
        title: 'Scan Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setScanning(false);
      setStatus(prev => ({ ...prev, isScanning: false }));
    }
  }, [config, scanning, toast, updateConfig]);

  // Toggle pause
  const togglePause = useCallback(async () => {
    if (!config) return;
    await updateConfig({ scanning_paused: !config.scanning_paused });
    toast({
      title: config.scanning_paused ? 'Scanning Resumed' : 'Scanning Paused',
    });
  }, [config, updateConfig, toast]);

  // Toggle turbo mode
  const toggleTurboMode = useCallback(async () => {
    if (!config) return;
    await updateConfig({ turbo_mode_enabled: !config.turbo_mode_enabled });
    toast({
      title: config.turbo_mode_enabled ? 'Turbo Mode Disabled' : 'Turbo Mode Enabled',
      description: config.turbo_mode_enabled 
        ? `Reverted to ${config.base_frequency_minutes}min intervals`
        : `Now scanning every ${config.turbo_frequency_minutes}min`,
    });
  }, [config, updateConfig, toast]);

  // Scheduler logic
  const restartScheduler = useCallback((cfg: ScanConfig) => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (cfg.scanning_paused || !cfg.adaptive_scanning_enabled) {
      return;
    }

    const intervalMinutes = cfg.turbo_mode_enabled 
      ? cfg.turbo_frequency_minutes 
      : cfg.base_frequency_minutes;

    scanIntervalRef.current = setInterval(() => {
      runManualScan();
    }, intervalMinutes * 60 * 1000);

    // Update next scan time
    const nextScan = new Date(Date.now() + intervalMinutes * 60 * 1000);
    supabase
      .from('scan_config')
      .update({ next_scheduled_scan_at: nextScan.toISOString() })
      .eq('id', cfg.id)
      .then(() => {
        setStatus(prev => ({ ...prev, nextScanAt: nextScan }));
      });
  }, [runManualScan]);

  // Reset daily counters at midnight
  const checkDailyReset = useCallback(async () => {
    if (!config) return;
    
    const lastReset = config.last_request_reset ? new Date(config.last_request_reset) : null;
    const now = new Date();
    
    if (!lastReset || lastReset.toDateString() !== now.toDateString()) {
      await updateConfig({
        daily_requests_used: 0,
        total_scans_today: 0,
        last_request_reset: now.toISOString(),
      });
    }
  }, [config, updateConfig]);

  useEffect(() => {
    fetchConfig();
    
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      checkDailyReset();
      if (config.adaptive_scanning_enabled && !config.scanning_paused) {
        restartScheduler(config);
      }
    }
  }, [config?.id]);

  return {
    config,
    status,
    loading,
    scanning,
    updateConfig,
    runManualScan,
    togglePause,
    toggleTurboMode,
    fetchConfig,
  };
}
