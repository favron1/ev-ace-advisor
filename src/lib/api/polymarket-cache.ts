import { supabase } from '@/integrations/supabase/client';

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
}

export interface SyncResult {
  success: boolean;
  total_events_fetched: number;
  sports_h2h_markets: number;
  skipped: {
    non_sports: number;
    futures: number;
    no_teams: number;
  };
  duration_ms: number;
}

export const polymarketCacheApi = {
  // Fetch all cached markets
  async getCache(): Promise<PolymarketCacheEntry[]> {
    const { data, error } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .eq('status', 'active')
      .order('volume', { ascending: false });
    
    if (error) throw error;
    return (data || []) as unknown as PolymarketCacheEntry[];
  },

  // Trigger a full sync
  async triggerSync(): Promise<SyncResult> {
    const { data, error } = await supabase.functions.invoke('sync-polymarket-h2h', {
      body: {}
    });
    
    if (error) throw error;
    return data as SyncResult;
  },

  // Fetch fresh price for a specific market by condition_id
  async refreshPrice(conditionId: string): Promise<{ yesPrice: number; noPrice: number } | null> {
    try {
      const url = `https://gamma-api.polymarket.com/markets/${conditionId}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch price for ${conditionId}: ${response.status}`);
        return null;
      }
      
      const market = await response.json();
      
      if (market.outcomePrices) {
        const prices = typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices;
        
        if (Array.isArray(prices) && prices.length >= 2) {
          const yesPrice = parseFloat(prices[0]) || 0.5;
          const noPrice = parseFloat(prices[1]) || 0.5;
          
          // Update cache
          await supabase
            .from('polymarket_h2h_cache')
            .update({ 
              yes_price: yesPrice, 
              no_price: noPrice,
              last_price_update: new Date().toISOString()
            })
            .eq('condition_id', conditionId);
          
          return { yesPrice, noPrice };
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error refreshing price:', err);
      return null;
    }
  },

  // Find matching market by team names (fuzzy)
  async findMatchingMarket(
    teamHome: string,
    teamAway: string
  ): Promise<PolymarketCacheEntry | null> {
    const cache = await this.getCache();
    
    const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const homeNorm = normalizeForMatch(teamHome);
    const awayNorm = normalizeForMatch(teamAway);
    
    for (const entry of cache) {
      const cacheHome = entry.team_home_normalized ? normalizeForMatch(entry.team_home_normalized) : '';
      const cacheAway = entry.team_away_normalized ? normalizeForMatch(entry.team_away_normalized) : '';
      
      // Check both orderings
      const matchForward = (cacheHome.includes(homeNorm) || homeNorm.includes(cacheHome)) &&
                          (cacheAway.includes(awayNorm) || awayNorm.includes(cacheAway));
      const matchReverse = (cacheHome.includes(awayNorm) || awayNorm.includes(cacheHome)) &&
                          (cacheAway.includes(homeNorm) || homeNorm.includes(cacheAway));
      
      if (matchForward || matchReverse) {
        return entry;
      }
    }
    
    return null;
  },

  // Get cache statistics
  async getCacheStats(): Promise<{
    totalMarkets: number;
    bySport: Record<string, number>;
    totalVolume: number;
    lastSync: string | null;
  }> {
    const cache = await this.getCache();
    
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
  },
};
