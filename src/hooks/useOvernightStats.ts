import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OvernightStats {
  totalSnapshots24h: number;
  maxMovementPct: number;
  eventsMonitored: number;
  lastSnapshotAt: Date | null;
}

export function useOvernightStats() {
  const [stats, setStats] = useState<OvernightStats>({
    totalSnapshots24h: 0,
    maxMovementPct: 0,
    eventsMonitored: 0,
    lastSnapshotAt: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      // Get snapshots from last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Fetch snapshot count and last snapshot time
      const { data: snapshots, error: snapshotError } = await supabase
        .from('probability_snapshots')
        .select('event_key, captured_at')
        .gte('captured_at', twentyFourHoursAgo)
        .order('captured_at', { ascending: false });

      if (snapshotError) throw snapshotError;

      // Get max movement from event_watch_state
      const { data: watchStates, error: watchError } = await supabase
        .from('event_watch_state')
        .select('movement_pct')
        .gte('updated_at', twentyFourHoursAgo)
        .order('movement_pct', { ascending: false })
        .limit(1);

      if (watchError) throw watchError;

      // Calculate unique events
      const uniqueEvents = new Set(snapshots?.map(s => s.event_key) || []);

      setStats({
        totalSnapshots24h: snapshots?.length || 0,
        maxMovementPct: watchStates?.[0]?.movement_pct || 0,
        eventsMonitored: uniqueEvents.size,
        lastSnapshotAt: snapshots?.[0]?.captured_at ? new Date(snapshots[0].captured_at) : null,
      });
    } catch (err) {
      console.error('Failed to fetch overnight stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}
