import { useState, useEffect, useCallback, useRef } from 'react';

interface NotificationsState {
  permission: NotificationPermission;
  enabled: boolean;
  hasUnviewedConfirmed: boolean;
  unviewedCount: number;
}

const STORAGE_KEY = 'notifications-enabled';
const SOUND_PATH = '/sounds/notification.mp3';

export function useNotifications() {
  const [state, setState] = useState<NotificationsState>({
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    enabled: localStorage.getItem(STORAGE_KEY) === 'true',
    hasUnviewedConfirmed: false,
    unviewedCount: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousConfirmedIdsRef = useRef<Set<string>>(new Set());

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(SOUND_PATH);
    audioRef.current.volume = 0.7;
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      console.warn('Notifications not supported in this browser');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      setState(s => ({ ...s, permission }));
      return permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }, []);

  // Send notification + play sound
  const notify = useCallback(async (title: string, body: string, options?: NotificationOptions) => {
    if (!state.enabled) return;

    // Play sound
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      } catch (error) {
        console.warn('Failed to play notification sound:', error);
      }
    }

    // Send browser notification if permission granted
    if (state.permission === 'granted' && typeof Notification !== 'undefined') {
      try {
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'signal-alert',
          requireInteraction: true,
          ...options,
        });

        // Auto-close after 30 seconds
        setTimeout(() => notification.close(), 30000);

        // Focus window on click
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }

    // Update unviewed state
    setState(s => ({
      ...s,
      hasUnviewedConfirmed: true,
      unviewedCount: s.unviewedCount + 1,
    }));
  }, [state.enabled, state.permission]);

  // Check for new confirmed events and notify
  const checkForNewConfirmed = useCallback((confirmedEvents: Array<{ id: string; event_name: string; movement_pct: number | null }>) => {
    const currentIds = new Set(confirmedEvents.map(e => e.id));
    const previousIds = previousConfirmedIdsRef.current;

    for (const event of confirmedEvents) {
      if (!previousIds.has(event.id)) {
        // New confirmed event detected!
        const movement = event.movement_pct?.toFixed(1) || '0';
        notify(
          `🎯 EDGE DETECTED`,
          `${event.event_name}\n+${movement}% movement confirmed. Execute now!`
        );
      }
    }

    previousConfirmedIdsRef.current = currentIds;
  }, [notify]);

  // Mark all as viewed
  const markViewed = useCallback(() => {
    setState(s => ({
      ...s,
      hasUnviewedConfirmed: false,
      unviewedCount: 0,
    }));
  }, []);

  // Enable notifications
  const enable = useCallback(async () => {
    // Request permission if not already granted
    if (state.permission !== 'granted') {
      const permission = await requestPermission();
      if (permission !== 'granted') {
        return false;
      }
    }

    localStorage.setItem(STORAGE_KEY, 'true');
    setState(s => ({ ...s, enabled: true }));
    return true;
  }, [state.permission, requestPermission]);

  // Disable notifications
  const disable = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'false');
    setState(s => ({ ...s, enabled: false }));
  }, []);

  // Toggle
  const toggle = useCallback(async () => {
    if (state.enabled) {
      disable();
      return true;
    } else {
      return await enable();
    }
  }, [state.enabled, enable, disable]);

  // Sync permission state on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && typeof Notification !== 'undefined') {
        setState(s => ({ ...s, permission: Notification.permission }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return {
    ...state,
    requestPermission,
    notify,
    checkForNewConfirmed,
    markViewed,
    enable,
    disable,
    toggle,
  };
}
