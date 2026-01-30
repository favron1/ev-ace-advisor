import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SportBreakdown {
  sport: string;
  displayName: string;
  watching: number;
  triggered: number;
  apiCount: number;
  firecrawlCount: number;
}

export interface WatchedMarket {
  id: string;
  eventName: string;
  sport: string;
  source: 'api' | 'firecrawl';
  volume: number;
  yesPrice: number;
  noPrice: number;
  hasEdge: boolean;
  edgePercent?: number;
  status: 'watching' | 'triggered' | 'idle';
}

export interface ScanResult {
  timestamp: Date;
  marketsChecked: number;
  edgesFound: number;
  signalsCreated: number;
}

export interface MarketWatchStats {
  totalWatching: number;
  totalTriggered: number;
  totalEdgesFound: number;
  totalInCache: number;
  bySport: SportBreakdown[];
  watchedMarkets: WatchedMarket[];
  recentScans: ScanResult[];
  loading: boolean;
}

// Map sport_category values to display names
const SPORT_DISPLAY_NAMES: Record<string, string> = {
  'icehockey_nhl': 'NHL',
  'hockey_nhl': 'NHL',
  'nhl': 'NHL',
  'basketball_nba': 'NBA',
  'nba': 'NBA',
  'basketball_ncaab': 'NCAA',
  'ncaab': 'NCAA',
  'americanfootball_nfl': 'NFL',
  'nfl': 'NFL',
};

function normalizeSport(sport: string | null): string {
  if (!sport) return 'Other';
  const lower = sport.toLowerCase();
  
  // Check for known sport patterns
  if (lower.includes('nhl') || lower.includes('hockey')) return 'NHL';
  if (lower.includes('nba') || (lower.includes('basketball') && !lower.includes('ncaa'))) return 'NBA';
  if (lower.includes('ncaa') || lower.includes('ncaab')) return 'NCAA';
  if (lower.includes('nfl') || lower.includes('football')) return 'NFL';
  
  return SPORT_DISPLAY_NAMES[lower] || sport;
}

export function useMarketWatch() {
  const [stats, setStats] = useState<MarketWatchStats>({
    totalWatching: 0,
    totalTriggered: 0,
    totalEdgesFound: 0,
    totalInCache: 0,
    bySport: [],
    watchedMarkets: [],
    recentScans: [],
    loading: true,
  });

  const fetchMarketData = useCallback(async () => {
    try {
      // Fetch all markets from cache
      const { data: markets, error: marketsError } = await supabase
        .from('polymarket_h2h_cache')
        .select('id, event_title, sport_category, source, volume, yes_price, no_price, monitoring_status')
        .order('volume', { ascending: false });

      if (marketsError) throw marketsError;

      // Fetch active signals for edge detection
      const { data: signals, error: signalsError } = await supabase
        .from('signal_opportunities')
        .select('event_name, edge_percent, created_at')
        .eq('status', 'active');

      if (signalsError) throw signalsError;

      // Create edge lookup map
      const edgeMap = new Map<string, number>();
      signals?.forEach(s => {
        edgeMap.set(s.event_name.toLowerCase(), s.edge_percent);
      });

      // Process markets
      const sportMap = new Map<string, SportBreakdown>();
      const watchedMarkets: WatchedMarket[] = [];
      let totalWatching = 0;
      let totalTriggered = 0;

      markets?.forEach(market => {
        const sport = normalizeSport(market.sport_category);
        const status = (market.monitoring_status || 'idle') as 'watching' | 'triggered' | 'idle';
        const source = (market.source || 'api') as 'api' | 'firecrawl';
        const eventNameLower = market.event_title.toLowerCase();
        const edgePercent = edgeMap.get(eventNameLower);

        // Update sport breakdown
        if (!sportMap.has(sport)) {
          sportMap.set(sport, {
            sport,
            displayName: sport,
            watching: 0,
            triggered: 0,
            apiCount: 0,
            firecrawlCount: 0,
          });
        }
        const sportStats = sportMap.get(sport)!;

        if (status === 'watching') {
          sportStats.watching++;
          totalWatching++;
          if (source === 'api') sportStats.apiCount++;
          else sportStats.firecrawlCount++;
        } else if (status === 'triggered') {
          sportStats.triggered++;
          totalTriggered++;
        }

        // Add to watched markets list (only watching/triggered)
        if (status === 'watching' || status === 'triggered') {
          watchedMarkets.push({
            id: market.id,
            eventName: market.event_title,
            sport,
            source,
            volume: market.volume || 0,
            yesPrice: market.yes_price,
            noPrice: market.no_price,
            hasEdge: !!edgePercent && edgePercent > 0,
            edgePercent,
            status,
          });
        }
      });

      // Sort sports by watching count
      const bySport = Array.from(sportMap.values())
        .filter(s => s.watching > 0 || s.triggered > 0)
        .sort((a, b) => b.watching - a.watching);

      // Build recent scans from signals grouped by hour
      const scanMap = new Map<string, ScanResult>();
      signals?.forEach(s => {
        const hour = new Date(s.created_at).toISOString().slice(0, 13); // YYYY-MM-DDTHH
        if (!scanMap.has(hour)) {
          scanMap.set(hour, {
            timestamp: new Date(s.created_at),
            marketsChecked: totalWatching,
            edgesFound: 0,
            signalsCreated: 0,
          });
        }
        const scan = scanMap.get(hour)!;
        scan.edgesFound++;
        scan.signalsCreated++;
      });

      const recentScans = Array.from(scanMap.values())
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 5);

      setStats({
        totalWatching,
        totalTriggered,
        totalEdgesFound: signals?.length || 0,
        totalInCache: markets?.length || 0,
        bySport,
        watchedMarkets,
        recentScans,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching market watch data:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('market-watch-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polymarket_h2h_cache' },
        () => fetchMarketData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signal_opportunities' },
        () => fetchMarketData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMarketData]);

  return {
    ...stats,
    refresh: fetchMarketData,
  };
}
