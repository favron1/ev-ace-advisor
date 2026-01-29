import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SignalLogEntry {
  id: string;
  opportunity_id: string | null;
  event_name: string;
  side: string;
  entry_price: number;
  edge_at_signal: number;
  confidence_at_signal: number;
  outcome: 'pending' | 'win' | 'loss' | 'void' | null;
  profit_loss: number | null;
  created_at: string;
  settled_at: string | null;
  stake_amount: number | null;
  polymarket_condition_id: string | null;
}

export interface DailyStats {
  date: string;
  bets_placed: number;
  total_staked: number;
  wins: number;
  losses: number;
  profit_loss: number;
  avg_edge: number;
}

export interface ExposureByMarket {
  condition_id: string;
  event_name: string;
  total_staked: number;
  bet_count: number;
  last_bet_at: string;
}

export interface OverallStats {
  total_bets: number;
  settled_bets: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_staked: number;
  total_profit_loss: number;
  avg_edge: number;
  avg_stake: number;
  roi: number;
}

export function useSignalStats() {
  const [logs, setLogs] = useState<SignalLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('signal_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (fetchError) throw fetchError;
      setLogs((data || []) as SignalLogEntry[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Overall stats
  const overallStats: OverallStats = useMemo(() => {
    const settled = logs.filter(l => l.outcome && l.outcome !== 'pending');
    const wins = settled.filter(l => l.outcome === 'win').length;
    const losses = settled.filter(l => l.outcome === 'loss').length;
    const totalStaked = logs.reduce((sum, l) => sum + (l.stake_amount || 0), 0);
    const totalPL = settled.reduce((sum, l) => sum + (l.profit_loss || 0), 0);
    const avgEdge = logs.length > 0 
      ? logs.reduce((sum, l) => sum + l.edge_at_signal, 0) / logs.length 
      : 0;
    const avgStake = logs.length > 0 ? totalStaked / logs.length : 0;

    return {
      total_bets: logs.length,
      settled_bets: settled.length,
      wins,
      losses,
      win_rate: settled.length > 0 ? (wins / settled.length) * 100 : 0,
      total_staked: totalStaked,
      total_profit_loss: totalPL,
      avg_edge: avgEdge,
      avg_stake: avgStake,
      roi: totalStaked > 0 ? (totalPL / totalStaked) * 100 : 0,
    };
  }, [logs]);

  // Daily breakdown
  const dailyStats: DailyStats[] = useMemo(() => {
    const byDate = new Map<string, SignalLogEntry[]>();
    
    logs.forEach(log => {
      const date = log.created_at.split('T')[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(log);
    });

    return Array.from(byDate.entries())
      .map(([date, dayLogs]) => {
        const settled = dayLogs.filter(l => l.outcome && l.outcome !== 'pending');
        const wins = settled.filter(l => l.outcome === 'win').length;
        const losses = settled.filter(l => l.outcome === 'loss').length;
        
        return {
          date,
          bets_placed: dayLogs.length,
          total_staked: dayLogs.reduce((sum, l) => sum + (l.stake_amount || 0), 0),
          wins,
          losses,
          profit_loss: settled.reduce((sum, l) => sum + (l.profit_loss || 0), 0),
          avg_edge: dayLogs.reduce((sum, l) => sum + l.edge_at_signal, 0) / dayLogs.length,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [logs]);

  // Exposure by market (last 24h)
  const exposureByMarket: ExposureByMarket[] = useMemo(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = logs.filter(l => l.created_at >= cutoff && l.polymarket_condition_id);
    
    const byMarket = new Map<string, ExposureByMarket>();
    
    recent.forEach(log => {
      const key = log.polymarket_condition_id!;
      if (!byMarket.has(key)) {
        byMarket.set(key, {
          condition_id: key,
          event_name: log.event_name,
          total_staked: 0,
          bet_count: 0,
          last_bet_at: log.created_at,
        });
      }
      const entry = byMarket.get(key)!;
      entry.total_staked += log.stake_amount || 0;
      entry.bet_count += 1;
      if (log.created_at > entry.last_bet_at) {
        entry.last_bet_at = log.created_at;
      }
    });

    return Array.from(byMarket.values()).sort((a, b) => b.total_staked - a.total_staked);
  }, [logs]);

  // Cumulative P/L for charting
  const cumulativePL: { date: string; cumulative: number; daily: number }[] = useMemo(() => {
    const sorted = [...dailyStats].sort((a, b) => a.date.localeCompare(b.date));
    let cumulative = 0;
    return sorted.map(day => {
      cumulative += day.profit_loss;
      return {
        date: day.date,
        cumulative,
        daily: day.profit_loss,
      };
    });
  }, [dailyStats]);

  // Get remaining safe stake for a specific market
  const getRemainingStake = useCallback((conditionId: string, maxStake: number): number => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const alreadyBet = logs
      .filter(l => l.polymarket_condition_id === conditionId && l.created_at >= cutoff)
      .reduce((sum, l) => sum + (l.stake_amount || 0), 0);
    
    return Math.max(0, maxStake - alreadyBet);
  }, [logs]);

  // Get today's total staked
  const todayStaked = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return logs
      .filter(l => l.created_at.startsWith(today))
      .reduce((sum, l) => sum + (l.stake_amount || 0), 0);
  }, [logs]);

  // Update a bet
  const updateBet = useCallback(async (id: string, updates: Partial<SignalLogEntry>) => {
    const { error } = await supabase
      .from('signal_logs')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error updating bet',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }

    toast({ title: 'Bet updated successfully' });
    await fetchLogs();
  }, [fetchLogs]);

  // Delete a bet
  const deleteBet = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('signal_logs')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error deleting bet',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }

    toast({ title: 'Bet deleted successfully' });
    await fetchLogs();
  }, [fetchLogs]);

  // Check pending bets for settlement
  const [checkingPending, setCheckingPending] = useState(false);
  
  const checkPendingBets = useCallback(async () => {
    setCheckingPending(true);
    try {
      const response = await supabase.functions.invoke('settle-bets', {
        body: { force: true },
      });

      if (response.error) throw response.error;

      const data = response.data;
      
      if (data.settled > 0) {
        toast({
          title: 'Bets settled',
          description: `${data.settled} bet(s) have been settled`,
        });
        await fetchLogs();
      } else {
        toast({
          title: 'No updates',
          description: 'No pending bets were ready for settlement',
        });
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check pending bets';
      toast({
        title: 'Error checking bets',
        description: message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setCheckingPending(false);
    }
  }, [fetchLogs]);

  return {
    logs,
    loading,
    error,
    overallStats,
    dailyStats,
    exposureByMarket,
    cumulativePL,
    todayStaked,
    getRemainingStake,
    refetch: fetchLogs,
    updateBet,
    deleteBet,
    checkPendingBets,
    checkingPending,
  };
}
