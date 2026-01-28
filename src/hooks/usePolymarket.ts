import { useState, useEffect, useCallback } from 'react';
import { arbitrageApi } from '@/lib/api/arbitrage';
import type { PolymarketMarket } from '@/types/arbitrage';

export function usePolymarket() {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await arbitrageApi.getPolymarketMarkets();
      setMarkets(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const getMarketsByCategory = useCallback((category: string) => {
    return markets.filter(m => m.category === category);
  }, [markets]);

  const getTopMarkets = useCallback((limit = 10) => {
    return [...markets]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit);
  }, [markets]);

  return {
    markets,
    loading,
    error,
    fetchMarkets,
    getMarketsByCategory,
    getTopMarkets,
  };
}
