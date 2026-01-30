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
  outcome: 'pending' | 'in_play' | 'win' | 'loss' | 'void' | null;
  profit_loss: number | null;
  created_at: string;
  settled_at: string | null;
  stake_amount: number | null;
  polymarket_condition_id: string | null;
  recommended_outcome: string | null;
  live_price?: number | null;
  // Live score data
  live_score?: string | null;
  game_status?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  home_score?: string | null;
  away_score?: string | null;
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
        .select(`
          *,
          signal_opportunities!signal_logs_opportunity_id_fkey (
            recommended_outcome
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (fetchError) throw fetchError;
      
      // Flatten the joined data
      const logsWithOutcome = (data || []).map((log: Record<string, unknown>) => ({
        ...log,
        recommended_outcome: (log.signal_opportunities as { recommended_outcome?: string } | null)?.recommended_outcome || null,
      })) as SignalLogEntry[];
      
      // Fetch live prices and scores for in-play bets
      const inPlayLogs = logsWithOutcome.filter(l => l.outcome === 'in_play');
      if (inPlayLogs.length > 0) {
        // Fetch prices for bets with condition IDs
        const logsWithConditionId = inPlayLogs.filter(l => l.polymarket_condition_id);
        if (logsWithConditionId.length > 0) {
          const livePrices = await fetchLivePrices(logsWithConditionId.map(l => l.polymarket_condition_id!));
          
          logsWithOutcome.forEach(log => {
            if (log.outcome === 'in_play' && log.polymarket_condition_id) {
              log.live_price = livePrices[log.polymarket_condition_id] || null;
            }
          });
        }
        
        // Fetch live scores for all in-play bets
        const liveScores = await fetchLiveScores(inPlayLogs.map(l => l.event_name));
        
        // Track if any games have completed so we can trigger settlement
        let hasCompletedGames = false;
        
        logsWithOutcome.forEach(log => {
          if (log.outcome === 'in_play') {
            const score = liveScores[log.event_name];
            if (score) {
              log.live_score = score.score;
              log.game_status = score.status;
              log.home_team = score.home_team;
              log.away_team = score.away_team;
              log.home_score = score.home_score;
              log.away_score = score.away_score;
              
              // Check if this game has completed
              if (score.completed) {
                hasCompletedGames = true;
              }
            }
          }
        });
        
        // If any games completed, trigger settlement check in background
        if (hasCompletedGames) {
          console.log('Completed games detected, triggering settlement...');
          supabase.functions.invoke('settle-bets', { body: { force: true } })
            .then(res => {
              if (res.data?.settled > 0) {
                console.log(`Auto-settled ${res.data.settled} bets`);
              }
            })
            .catch(err => console.error('Auto-settlement failed:', err));
        }
      }
      
      setLogs(logsWithOutcome);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live prices from Polymarket for in-play bets
  const fetchLivePrices = async (conditionIds: string[]): Promise<Record<string, number>> => {
    const prices: Record<string, number> = {};
    
    // Batch fetch prices (limit concurrent requests)
    const batchSize = 5;
    for (let i = 0; i < conditionIds.length; i += batchSize) {
      const batch = conditionIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (conditionId) => {
        try {
          const response = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`);
          if (response.ok) {
            const markets = await response.json();
            if (markets?.[0]?.tokens) {
              const yesToken = markets[0].tokens.find((t: { outcome: string; price: number }) => 
                t.outcome.toLowerCase() === 'yes'
              );
              if (yesToken) {
                prices[conditionId] = yesToken.price;
              }
            }
          }
        } catch (err) {
          console.error(`Failed to fetch price for ${conditionId}:`, err);
        }
      }));
    }
    
    return prices;
  };

  // Fetch live scores from The Odds API via edge function
  const fetchLiveScores = async (eventNames: string[]): Promise<Record<string, { score: string; status: string; home_team: string; away_team: string; home_score: string; away_score: string; completed: boolean }>> => {
    const scores: Record<string, { score: string; status: string; home_team: string; away_team: string; home_score: string; away_score: string; completed: boolean }> = {};
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-live-scores', {
        body: { event_names: eventNames },
      });
      
      if (error) {
        console.error('Error fetching live scores:', error);
        return scores;
      }
      
      if (data?.scores) {
        for (const score of data.scores) {
          scores[score.event_name] = {
            score: score.home_score !== null && score.away_score !== null 
              ? `${score.home_score}-${score.away_score}` 
              : '',
            status: score.game_status || '',
            home_team: score.home_team || '',
            away_team: score.away_team || '',
            home_score: score.home_score || '',
            away_score: score.away_score || '',
            completed: score.completed || false,
          };
        }
      }
    } catch (err) {
      console.error('Failed to fetch live scores:', err);
    }
    
    return scores;
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh live scores every 30 seconds when there are in-play bets
  useEffect(() => {
    const hasInPlayBets = logs.some(l => l.outcome === 'in_play');
    if (!hasInPlayBets) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [logs, fetchLogs]);

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
        body: { force: true, recalculatePL: true },
      });

      if (response.error) throw response.error;

      const data = response.data;
      
      const messages: string[] = [];
      if (data.settled > 0) messages.push(`${data.settled} bet(s) settled`);
      if (data.plFixed > 0) messages.push(`${data.plFixed} P/L values corrected`);
      
      if (messages.length > 0) {
        toast({
          title: 'Bets updated',
          description: messages.join(', '),
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
