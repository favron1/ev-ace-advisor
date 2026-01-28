import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EventWatchState, ProbabilitySnapshot, MovementLog } from '@/types/scan-config';
import { useToast } from '@/hooks/use-toast';

interface UseWatchStateOptions {
  onNewConfirmed?: (events: EventWatchState[]) => void;
}

export function useWatchState(options?: UseWatchStateOptions) {
  const [watchingEvents, setWatchingEvents] = useState<EventWatchState[]>([]);
  const [activeEvents, setActiveEvents] = useState<EventWatchState[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<EventWatchState[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

  // Track previous confirmed IDs for notification detection
  const previousConfirmedIdsRef = useRef<Set<string>>(new Set());

  // Store callback in ref to avoid dependency issues that cause infinite loops
  const onNewConfirmedRef = useRef(options?.onNewConfirmed);
  useEffect(() => {
    onNewConfirmedRef.current = options?.onNewConfirmed;
  }, [options?.onNewConfirmed]);

  const fetchWatchStates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('event_watch_state')
        .select('*')
        .in('watch_state', ['watching', 'active', 'confirmed', 'signal'])
        .order('movement_pct', { ascending: false });

      if (error) throw error;

      const events = (data || []) as unknown as EventWatchState[];
      setWatchingEvents(events.filter(e => e.watch_state === 'watching'));
      setActiveEvents(events.filter(e => e.watch_state === 'active'));
      
      const newConfirmed = events.filter(e => e.watch_state === 'confirmed' || e.watch_state === 'signal');
      setConfirmedEvents(newConfirmed);

      // Check for new confirmed events and trigger callback via ref
      const previousIds = previousConfirmedIdsRef.current;
      const newlyConfirmed = newConfirmed.filter(e => !previousIds.has(e.id));
      
      if (newlyConfirmed.length > 0 && onNewConfirmedRef.current) {
        onNewConfirmedRef.current(newlyConfirmed);
      }

      // Update previous IDs ref
      previousConfirmedIdsRef.current = new Set(newConfirmed.map(e => e.id));
    } catch (err) {
      console.error('Failed to fetch watch states:', err);
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies - stable reference

  // Run Watch Mode poll
  const runWatchModePoll = useCallback(async () => {
    try {
      setPolling(true);
      toast({ title: 'Running Watch Mode poll...' });

      const { data, error } = await supabase.functions.invoke('watch-mode-poll', {
        body: {}
      });

      if (error) throw error;

      await fetchWatchStates();

      toast({
        title: 'Watch Mode Complete',
        description: `${data.snapshots_stored} snapshots, ${data.escalated_to_active} escalated`,
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Poll failed';
      toast({
        title: 'Watch Mode Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setPolling(false);
    }
  }, [fetchWatchStates, toast]);

  // Run Active Mode poll
  const runActiveModePoll = useCallback(async () => {
    if (activeEvents.length === 0) {
      toast({ 
        title: 'No Active Events', 
        description: 'Run Watch Mode first to detect candidates' 
      });
      return null;
    }

    try {
      setPolling(true);
      toast({ title: 'Running Active Mode poll...' });

      const { data, error } = await supabase.functions.invoke('active-mode-poll', {
        body: {}
      });

      if (error) throw error;

      await fetchWatchStates();

      toast({
        title: 'Active Mode Complete',
        description: `${data.confirmed} confirmed, ${data.signalOnly} signal-only, ${data.dropped} dropped`,
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Poll failed';
      toast({
        title: 'Active Mode Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setPolling(false);
    }
  }, [activeEvents.length, fetchWatchStates, toast]);

  // Get movement logs for learning
  const getMovementLogs = useCallback(async (limit = 50): Promise<MovementLog[]> => {
    try {
      const { data, error } = await supabase
        .from('movement_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as MovementLog[];
    } catch (err) {
      console.error('Failed to fetch movement logs:', err);
      return [];
    }
  }, []);

  // Get recent snapshots for an event
  const getEventSnapshots = useCallback(async (eventKey: string): Promise<ProbabilitySnapshot[]> => {
    try {
      const { data, error } = await supabase
        .from('probability_snapshots')
        .select('*')
        .eq('event_key', eventKey)
        .order('captured_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as ProbabilitySnapshot[];
    } catch (err) {
      console.error('Failed to fetch snapshots:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchWatchStates();
  }, [fetchWatchStates]);

  // Set up realtime subscription for watch state changes
  useEffect(() => {
    const channel = supabase
      .channel('watch-state-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_watch_state',
        },
        () => {
          fetchWatchStates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWatchStates]);

  return {
    watchingEvents,
    activeEvents,
    confirmedEvents,
    loading,
    polling,
    runWatchModePoll,
    runActiveModePoll,
    getMovementLogs,
    getEventSnapshots,
    fetchWatchStates,
    totalWatching: watchingEvents.length,
    totalActive: activeEvents.length,
    totalConfirmed: confirmedEvents.length,
  };
}
