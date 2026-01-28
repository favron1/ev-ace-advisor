import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EventWatchState, ProbabilitySnapshot, MovementLog } from '@/types/scan-config';
import { useToast } from '@/hooks/use-toast';

export function useWatchState() {
  const [watchingEvents, setWatchingEvents] = useState<EventWatchState[]>([]);
  const [activeEvents, setActiveEvents] = useState<EventWatchState[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<EventWatchState[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

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
      setConfirmedEvents(events.filter(e => e.watch_state === 'confirmed' || e.watch_state === 'signal'));
    } catch (err) {
      console.error('Failed to fetch watch states:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
