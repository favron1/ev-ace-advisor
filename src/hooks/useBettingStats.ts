import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BettingStats {
  totalBets: number;
  wins: number;
  losses: number;
  pending: number;
  totalStaked: number;
  totalProfit: number;
  winRate: number;
  roi: number;
  isLoading: boolean;
}

export function useBettingStats() {
  const [stats, setStats] = useState<BettingStats>({
    totalBets: 0,
    wins: 0,
    losses: 0,
    pending: 0,
    totalStaked: 0,
    totalProfit: 0,
    winRate: 0,
    roi: 0,
    isLoading: true,
  });
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

  const fetchStats = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setStats(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const { data: bets, error } = await supabase
      .from('bet_history')
      .select('status, stake, profit_loss')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching betting stats:', error);
      setStats(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const wins = bets?.filter(b => b.status === 'won').length || 0;
    const losses = bets?.filter(b => b.status === 'lost').length || 0;
    const pending = bets?.filter(b => b.status === 'pending').length || 0;
    const settled = wins + losses;
    
    const totalStaked = bets?.reduce((sum, b) => sum + Number(b.stake), 0) || 0;
    const settledStaked = bets
      ?.filter(b => b.status === 'won' || b.status === 'lost')
      .reduce((sum, b) => sum + Number(b.stake), 0) || 0;
    
    const totalProfit = bets
      ?.filter(b => b.profit_loss !== null)
      .reduce((sum, b) => sum + Number(b.profit_loss || 0), 0) || 0;
    
    const winRate = settled > 0 ? (wins / settled) * 100 : 0;
    const roi = settledStaked > 0 ? (totalProfit / settledStaked) * 100 : 0;

    setStats({
      totalBets: bets?.length || 0,
      wins,
      losses,
      pending,
      totalStaked,
      totalProfit,
      winRate,
      roi,
      isLoading: false,
    });
  }, []);

  const resetStats = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to reset stats",
        variant: "destructive"
      });
      return false;
    }

    setIsResetting(true);

    try {
      // Delete all bet history for this user
      const { error } = await supabase
        .from('bet_history')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error resetting stats:', error);
        toast({
          title: "Error",
          description: "Failed to reset stats. Please try again.",
          variant: "destructive"
        });
        return false;
      }

      // Reset local stats
      setStats({
        totalBets: 0,
        wins: 0,
        losses: 0,
        pending: 0,
        totalStaked: 0,
        totalProfit: 0,
        winRate: 0,
        roi: 0,
        isLoading: false,
      });

      toast({
        title: "Stats Reset",
        description: "All betting history and stats have been reset to 0"
      });

      return true;
    } finally {
      setIsResetting(false);
    }
  }, [toast]);

  // Fetch stats on mount and when auth changes
  useEffect(() => {
    fetchStats();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setTimeout(() => fetchStats(), 0);
      } else {
        setStats({
          totalBets: 0,
          wins: 0,
          losses: 0,
          pending: 0,
          totalStaked: 0,
          totalProfit: 0,
          winRate: 0,
          roi: 0,
          isLoading: false,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchStats]);

  return { stats, fetchStats, resetStats, isResetting };
}
