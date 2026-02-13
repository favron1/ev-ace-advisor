import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PortfolioStats {
  pnl24h: number;
  pnl30d: number;
  activeBets: number;
  winRate: number;
  totalProfit: number;
  totalBets: number;
}

export function usePortfolioData() {
  const [stats, setStats] = useState<PortfolioStats>({
    pnl24h: 0,
    pnl30d: 0,
    activeBets: 0,
    winRate: 0,
    totalProfit: 0,
    totalBets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolioData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get all signal logs
      const { data: logs, error: logsError } = await supabase
        .from('signal_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;

      if (!logs || logs.length === 0) {
        // No bet history, return zeros
        setStats({
          pnl24h: 0,
          pnl30d: 0,
          activeBets: 0,
          winRate: 0,
          totalProfit: 0,
          totalBets: 0,
        });
        setError(null);
        setLoading(false);
        return;
      }

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Calculate stats from signal logs
      let pnl24h = 0;
      let pnl30d = 0;
      let activeBets = 0;
      let wins = 0;
      let totalBets = 0;
      let totalProfit = 0;

      logs.forEach(log => {
        const logDate = new Date(log.created_at);
        const outcome = log.outcome;
        const stakeAmount = log.stake_amount || 100; // Default $100 if not specified
        const entryPrice = log.entry_price || 0.5;
        
        // Count active bets (pending outcome)
        if (outcome === 'pending' || !outcome) {
          activeBets++;
        }

        // Count total bets
        if (outcome !== null) {
          totalBets++;
        }

        // Calculate P&L for settled bets
        if (outcome === 'win') {
          wins++;
          const profit = stakeAmount * (1 / entryPrice - 1); // Calculate profit from odds
          totalProfit += profit;

          // Add to 24h and 30d totals if within timeframe
          if (logDate >= yesterday) {
            pnl24h += profit;
          }
          if (logDate >= thirtyDaysAgo) {
            pnl30d += profit;
          }
        } else if (outcome === 'loss') {
          const loss = -stakeAmount; // Lost the stake
          totalProfit += loss;

          if (logDate >= yesterday) {
            pnl24h += loss;
          }
          if (logDate >= thirtyDaysAgo) {
            pnl30d += loss;
          }
        }
      });

      const winRate = totalBets > 0 ? (wins / totalBets) * 100 : 0;

      setStats({
        pnl24h,
        pnl30d,
        activeBets,
        winRate,
        totalProfit,
        totalBets,
      });
      
      setError(null);
    } catch (err) {
      console.error('Failed to fetch portfolio data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  // Real-time subscription to signal_logs
  useEffect(() => {
    const channel = supabase
      .channel('portfolio_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signal_logs' },
        () => fetchPortfolioData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPortfolioData]);

  return {
    stats,
    loading,
    error,
    refresh: fetchPortfolioData,
  };
}