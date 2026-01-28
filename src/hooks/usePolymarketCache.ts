import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PolymarketCacheEntry {
  id: string;
  condition_id: string;
  event_title: string;
  question: string;
  team_home: string | null;
  team_away: string | null;
  team_home_normalized: string | null;
  team_away_normalized: string | null;
  sport_category: string | null;
  event_date: string | null;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  status: string;
  last_price_update: string;
  last_bulk_sync: string;
  created_at: string;
}

export function usePolymarketCache() {
  const [cache, setCache] = useState<PolymarketCacheEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCache = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('polymarket_h2h_cache')
        .select('*')
        .eq('status', 'active')
        .order('volume', { ascending: false });
      
      if (fetchError) throw fetchError;
      setCache((data || []) as unknown as PolymarketCacheEntry[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cache');
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      setSyncing(true);
      toast({ title: 'Syncing Polymarket markets...', description: 'This may take 30-60 seconds.' });
      
      const { data, error: syncError } = await supabase.functions.invoke('sync-polymarket-h2h', {
        body: {}
      });
      
      if (syncError) throw syncError;
      
      await fetchCache();
      
      toast({
        title: 'Sync Complete',
        description: `Found ${data.sports_h2h_markets} sports H2H markets from ${data.total_events_fetched} events.`,
      });
      
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      toast({
        title: 'Sync Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setSyncing(false);
    }
  }, [fetchCache, toast]);

  const getMatchingMarket = useCallback((
    teamHome: string,
    teamAway: string
  ): PolymarketCacheEntry | null => {
    const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const homeNorm = normalizeForMatch(teamHome);
    const awayNorm = normalizeForMatch(teamAway);
    
    // Find market where both team names match (in either order)
    for (const entry of cache) {
      const cacheHome = entry.team_home_normalized ? normalizeForMatch(entry.team_home_normalized) : '';
      const cacheAway = entry.team_away_normalized ? normalizeForMatch(entry.team_away_normalized) : '';
      
      // Check both orderings
      const matchForward = cacheHome.includes(homeNorm) && cacheAway.includes(awayNorm);
      const matchReverse = cacheHome.includes(awayNorm) && cacheAway.includes(homeNorm);
      
      if (matchForward || matchReverse) {
        return entry;
      }
    }
    
    return null;
  }, [cache]);

  const getCacheStats = useCallback(() => {
    const bySport: Record<string, number> = {};
    let totalVolume = 0;
    
    for (const entry of cache) {
      const sport = entry.sport_category || 'unknown';
      bySport[sport] = (bySport[sport] || 0) + 1;
      totalVolume += entry.volume;
    }
    
    return {
      totalMarkets: cache.length,
      bySport,
      totalVolume,
      lastSync: cache[0]?.last_bulk_sync || null,
    };
  }, [cache]);

  useEffect(() => {
    fetchCache();
  }, [fetchCache]);

  return {
    cache,
    loading,
    syncing,
    error,
    fetchCache,
    triggerSync,
    getMatchingMarket,
    getCacheStats,
  };
}
