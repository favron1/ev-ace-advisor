import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BetRecord {
  id: string;
  event_name: string;
  selection: string;
  odds: number;
  edge: number | null;
  bet_score: number | null;
  stake_units: number | null;
  profit_loss: number | null;
  status: string;
  sport: string;
  league: string;
  start_time: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface AnalyticsStats {
  totalBets: number;
  settledBets: number;
  pendingBets: number;
  wins: number;
  losses: number;
  totalStaked: number;
  totalProfitLoss: number;
  winRate: number;
  roi: number;
  avgEdge: number;
  avgOdds: number;
  avgBetScore: number;
  bestWin: number;
  worstLoss: number;
}

export interface DailyPerformance {
  date: string;
  bets: number;
  wins: number;
  losses: number;
  profitLoss: number;
  cumulativePL: number;
}

export interface LeaguePerformance {
  league: string;
  bets: number;
  wins: number;
  losses: number;
  profitLoss: number;
  winRate: number;
}

export function useAnalytics() {
  const [bets, setBets] = useState<BetRecord[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [dailyPerformance, setDailyPerformance] = useState<DailyPerformance[]>([]);
  const [leaguePerformance, setLeaguePerformance] = useState<LeaguePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to view analytics');
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('user_bets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const allBets = (data || []) as BetRecord[];
      setBets(allBets);

      // Calculate stats
      const settledBets = allBets.filter(b => b.status === 'won' || b.status === 'lost');
      const wins = allBets.filter(b => b.status === 'won');
      const losses = allBets.filter(b => b.status === 'lost');
      const pending = allBets.filter(b => b.status === 'pending' || b.status === 'tracking');

      const totalStaked = settledBets.reduce((sum, b) => sum + (b.stake_units || 0), 0);
      const totalPL = settledBets.reduce((sum, b) => sum + (b.profit_loss || 0), 0);
      const avgEdge = settledBets.length > 0 
        ? settledBets.reduce((sum, b) => sum + (b.edge || 0), 0) / settledBets.length 
        : 0;
      const avgOdds = settledBets.length > 0 
        ? settledBets.reduce((sum, b) => sum + b.odds, 0) / settledBets.length 
        : 0;
      const avgBetScore = settledBets.length > 0 
        ? settledBets.reduce((sum, b) => sum + (b.bet_score || 0), 0) / settledBets.length 
        : 0;

      const profitLosses = settledBets.map(b => b.profit_loss || 0);
      const bestWin = profitLosses.length > 0 ? Math.max(...profitLosses) : 0;
      const worstLoss = profitLosses.length > 0 ? Math.min(...profitLosses) : 0;

      setStats({
        totalBets: allBets.length,
        settledBets: settledBets.length,
        pendingBets: pending.length,
        wins: wins.length,
        losses: losses.length,
        totalStaked,
        totalProfitLoss: totalPL,
        winRate: settledBets.length > 0 ? (wins.length / settledBets.length) * 100 : 0,
        roi: totalStaked > 0 ? (totalPL / totalStaked) * 100 : 0,
        avgEdge: avgEdge * 100,
        avgOdds,
        avgBetScore,
        bestWin,
        worstLoss,
      });

      // Calculate daily performance
      const dailyMap = new Map<string, { bets: number; wins: number; losses: number; pl: number }>();
      
      settledBets.forEach(bet => {
        const date = bet.settled_at 
          ? new Date(bet.settled_at).toISOString().split('T')[0]
          : new Date(bet.created_at).toISOString().split('T')[0];
        
        const existing = dailyMap.get(date) || { bets: 0, wins: 0, losses: 0, pl: 0 };
        existing.bets += 1;
        if (bet.status === 'won') existing.wins += 1;
        if (bet.status === 'lost') existing.losses += 1;
        existing.pl += bet.profit_loss || 0;
        dailyMap.set(date, existing);
      });

      const sortedDates = Array.from(dailyMap.keys()).sort();
      let cumulative = 0;
      const daily: DailyPerformance[] = sortedDates.map(date => {
        const d = dailyMap.get(date)!;
        cumulative += d.pl;
        return {
          date,
          bets: d.bets,
          wins: d.wins,
          losses: d.losses,
          profitLoss: d.pl,
          cumulativePL: cumulative,
        };
      });
      setDailyPerformance(daily);

      // Calculate league performance
      const leagueMap = new Map<string, { bets: number; wins: number; losses: number; pl: number }>();
      
      settledBets.forEach(bet => {
        const league = bet.league || 'Unknown';
        const existing = leagueMap.get(league) || { bets: 0, wins: 0, losses: 0, pl: 0 };
        existing.bets += 1;
        if (bet.status === 'won') existing.wins += 1;
        if (bet.status === 'lost') existing.losses += 1;
        existing.pl += bet.profit_loss || 0;
        leagueMap.set(league, existing);
      });

      const leagues: LeaguePerformance[] = Array.from(leagueMap.entries())
        .map(([league, data]) => ({
          league,
          bets: data.bets,
          wins: data.wins,
          losses: data.losses,
          profitLoss: data.pl,
          winRate: data.bets > 0 ? (data.wins / data.bets) * 100 : 0,
        }))
        .sort((a, b) => b.bets - a.bets);

      setLeaguePerformance(leagues);

    } catch (err) {
      setError('Failed to load analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    bets,
    stats,
    dailyPerformance,
    leaguePerformance,
    loading,
    error,
    refresh: fetchAnalytics,
  };
}
