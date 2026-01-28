import { useState, useEffect, useCallback, useRef } from 'react';

interface AutoPollingState {
  isEnabled: boolean;
  isRunning: boolean;
  nextWatchPollAt: Date | null;
  nextActivePollAt: Date | null;
  pollsToday: number;
  watchCountdown: string;
  activeCountdown: string;
}

interface UseAutoPollingOptions {
  watchIntervalMs?: number;
  activeIntervalMs?: number;
  onWatchPoll: () => Promise<any>;
  onActivePoll: () => Promise<any>;
  activeCount: number;
  dailyUsagePercent: number;
  isPaused: boolean;
}

const STORAGE_KEY = 'auto-polling-enabled';

export function useAutoPolling({
  watchIntervalMs = 5 * 60 * 1000, // 5 minutes
  activeIntervalMs = 60 * 1000, // 60 seconds
  onWatchPoll,
  onActivePoll,
  activeCount,
  dailyUsagePercent,
  isPaused,
}: UseAutoPollingOptions) {
  const [state, setState] = useState<AutoPollingState>({
    isEnabled: localStorage.getItem(STORAGE_KEY) === 'true',
    isRunning: false,
    nextWatchPollAt: null,
    nextActivePollAt: null,
    pollsToday: parseInt(localStorage.getItem('polls-today') || '0'),
    watchCountdown: '--:--',
    activeCountdown: '--:--',
  });

  // Refs for interval handles
  const watchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Refs for callbacks - keeps them stable for interval effect
  const onWatchPollRef = useRef(onWatchPoll);
  const onActivePollRef = useRef(onActivePoll);

  // Refs for safeguard values - allows reading latest without being dependencies
  const dailyUsagePercentRef = useRef(dailyUsagePercent);
  const isPausedRef = useRef(isPaused);
  const activeCountRef = useRef(activeCount);
  const pollsTodayRef = useRef(state.pollsToday);

  // Keep callback refs updated
  useEffect(() => {
    onWatchPollRef.current = onWatchPoll;
    onActivePollRef.current = onActivePoll;
  }, [onWatchPoll, onActivePoll]);

  // Keep safeguard refs updated
  useEffect(() => {
    dailyUsagePercentRef.current = dailyUsagePercent;
    isPausedRef.current = isPaused;
    activeCountRef.current = activeCount;
  }, [dailyUsagePercent, isPaused, activeCount]);

  // Keep pollsToday ref updated
  useEffect(() => {
    pollsTodayRef.current = state.pollsToday;
  }, [state.pollsToday]);

  // Format countdown string
  const formatCountdown = (targetDate: Date | null): string => {
    if (!targetDate) return '--:--';
    const now = Date.now();
    const diff = targetDate.getTime() - now;
    if (diff <= 0) return '0:00';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Run watch poll with overlap protection - uses refs for stable reference
  const runWatchPollSafe = useCallback(async () => {
    if (isPollingRef.current) return;
    if (dailyUsagePercentRef.current > 90) {
      console.log('Auto-polling paused: approaching daily limit');
      return;
    }
    if (isPausedRef.current) {
      console.log('Auto-polling paused: scanning is paused');
      return;
    }

    isPollingRef.current = true;
    setState(s => ({ ...s, isRunning: true }));
    
    try {
      await onWatchPollRef.current();
      const newPollsToday = pollsTodayRef.current + 1;
      localStorage.setItem('polls-today', newPollsToday.toString());
      setState(s => ({ ...s, pollsToday: newPollsToday }));
    } finally {
      isPollingRef.current = false;
      setState(s => ({ 
        ...s, 
        isRunning: false,
        nextWatchPollAt: new Date(Date.now() + watchIntervalMs),
      }));
    }
  }, [watchIntervalMs]); // Only depends on interval timing

  // Run active poll with overlap protection - uses refs for stable reference
  const runActivePollSafe = useCallback(async () => {
    if (isPollingRef.current) return;
    if (activeCountRef.current === 0) return;
    if (dailyUsagePercentRef.current > 90) return;
    if (isPausedRef.current) return;

    isPollingRef.current = true;
    setState(s => ({ ...s, isRunning: true }));
    
    try {
      await onActivePollRef.current();
    } finally {
      isPollingRef.current = false;
      setState(s => ({ 
        ...s, 
        isRunning: false,
        nextActivePollAt: new Date(Date.now() + activeIntervalMs),
      }));
    }
  }, [activeIntervalMs]); // Only depends on interval timing

  // Enable auto-polling
  const enable = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setState(s => ({ 
      ...s, 
      isEnabled: true,
      nextWatchPollAt: new Date(Date.now() + watchIntervalMs),
      nextActivePollAt: activeCountRef.current > 0 ? new Date(Date.now() + activeIntervalMs) : null,
    }));
  }, [watchIntervalMs, activeIntervalMs]);

  // Disable auto-polling
  const disable = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'false');
    setState(s => ({ 
      ...s, 
      isEnabled: false,
      nextWatchPollAt: null,
      nextActivePollAt: null,
      watchCountdown: '--:--',
      activeCountdown: '--:--',
    }));
  }, []);

  // Toggle
  const toggle = useCallback(() => {
    if (state.isEnabled) {
      disable();
    } else {
      enable();
    }
  }, [state.isEnabled, enable, disable]);

  // Set up intervals when enabled - NO callback dependencies!
  useEffect(() => {
    if (!state.isEnabled) {
      // Clear intervals when disabled
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
      watchIntervalRef.current = null;
      activeIntervalRef.current = null;
      return;
    }

    // Set up watch interval
    watchIntervalRef.current = setInterval(runWatchPollSafe, watchIntervalMs);
    
    // Set up active interval (only if active events exist)
    if (activeCount > 0) {
      activeIntervalRef.current = setInterval(runActivePollSafe, activeIntervalMs);
    }

    // Set initial next poll times
    setState(s => ({
      ...s,
      nextWatchPollAt: new Date(Date.now() + watchIntervalMs),
      nextActivePollAt: activeCount > 0 ? new Date(Date.now() + activeIntervalMs) : null,
    }));

    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
    };
  }, [state.isEnabled, watchIntervalMs, activeIntervalMs, activeCount, ]);

  // Update active interval when activeCount changes
  useEffect(() => {
    if (!state.isEnabled) return;

    if (activeCount > 0 && !activeIntervalRef.current) {
      activeIntervalRef.current = setInterval(runActivePollSafe, activeIntervalMs);
      setState(s => ({
        ...s,
        nextActivePollAt: new Date(Date.now() + activeIntervalMs),
      }));
    } else if (activeCount === 0 && activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current);
      activeIntervalRef.current = null;
      setState(s => ({
        ...s,
        nextActivePollAt: null,
        activeCountdown: '--:--',
      }));
    }
  }, [activeCount, state.isEnabled, activeIntervalMs]);

  // Countdown timer update every second
  useEffect(() => {
    if (!state.isEnabled) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setState(s => ({
        ...s,
        watchCountdown: formatCountdown(s.nextWatchPollAt),
        activeCountdown: formatCountdown(s.nextActivePollAt),
      }));
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [state.isEnabled]);

  // Reset polls count at midnight
  useEffect(() => {
    const lastReset = localStorage.getItem('polls-last-reset');
    const today = new Date().toDateString();
    if (lastReset !== today) {
      localStorage.setItem('polls-today', '0');
      localStorage.setItem('polls-last-reset', today);
      setState(s => ({ ...s, pollsToday: 0 }));
    }
  }, []);

  return {
    ...state,
    enable,
    disable,
    toggle,
  };
}
