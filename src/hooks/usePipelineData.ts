import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type PipelineStage = 'discovered' | 'matched' | 'analyzing' | 'watching' | 'executing' | 'settled';

export interface PipelineEvent {
  id: string;
  event_key: string;
  event_name: string;
  watch_state: string;
  pipeline_stage: PipelineStage;
  commence_time: string | null;
  current_probability: number | null;
  initial_probability: number | null;
  polymarket_yes_price: number | null;
  polymarket_price: number | null;
  polymarket_volume: number | null;
  polymarket_condition_id: string | null;
  polymarket_matched: boolean | null;
  bookmaker_source: string | null;
  bookmaker_market_key: string | null;
  last_poly_refresh: string | null;
  movement_pct: number;
  movement_velocity: number | null;
  samples_since_hold: number;
  updated_at: string;
  created_at: string;
  source: string | null;
  outcome: string | null;
}

export interface PipelineCounts {
  discovered: number;
  matched: number;
  analyzing: number;
  watching: number;
  executing: number;
  settled: number;
}

export function usePipelineData() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('event_watch_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setEvents((data || []) as unknown as PipelineEvent[]);
    } catch (err) {
      console.error('Failed to fetch pipeline data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const counts: PipelineCounts = useMemo(() => {
    const c: PipelineCounts = { discovered: 0, matched: 0, analyzing: 0, watching: 0, executing: 0, settled: 0 };
    events.forEach(e => {
      const stage = e.pipeline_stage as keyof PipelineCounts;
      if (c[stage] !== undefined) c[stage]++;
    });
    return c;
  }, [events]);

  const getEventsByStage = useCallback((stage: PipelineStage) => {
    return events.filter(e => e.pipeline_stage === stage);
  }, [events]);

  const getDiscoveryEvents = useCallback(() => {
    return events.filter(e => e.pipeline_stage === 'discovered' || e.pipeline_stage === 'matched');
  }, [events]);

  const getAnalysisEvents = useCallback(() => {
    return events.filter(e => 
      e.pipeline_stage === 'analyzing' || 
      (e.pipeline_stage === 'matched' && e.current_probability != null && e.polymarket_price != null)
    );
  }, [events]);

  const promoteEvents = useCallback(async (ids: string[], toStage: PipelineStage) => {
    const { error } = await supabase
      .from('event_watch_state')
      .update({ pipeline_stage: toStage })
      .in('id', ids);

    if (error) {
      toast({ title: 'Failed to promote events', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: `${ids.length} event(s) promoted to ${toStage}` });
    await fetchEvents();
    return true;
  }, [fetchEvents, toast]);

  const dismissEvents = useCallback(async (ids: string[]) => {
    const { error } = await supabase
      .from('event_watch_state')
      .update({ pipeline_stage: 'discovered', watch_state: 'dropped' })
      .in('id', ids);

    if (error) {
      toast({ title: 'Failed to dismiss', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: `${ids.length} event(s) dismissed` });
    await fetchEvents();
    return true;
  }, [fetchEvents, toast]);

  return {
    events,
    loading,
    counts,
    fetchEvents,
    getEventsByStage,
    getDiscoveryEvents,
    getAnalysisEvents,
    promoteEvents,
    dismissEvents,
  };
}
