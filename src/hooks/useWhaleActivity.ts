import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhalePosition {
  id: string;
  wallet_id: string;
  event_name: string;
  side: string;
  size: number;
  avg_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  status: string | null;
  opened_at: string | null;
  condition_id: string | null;
  // Joined from whale_wallets
  wallet_display_name: string | null;
  wallet_confidence_tier: string | null;
  wallet_win_rate: number | null;
  wallet_total_profit: number | null;
}

export function useWhaleActivity() {
  const [positions, setPositions] = useState<WhalePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWhaleActivity = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch active whale positions with wallet details
      const { data, error } = await supabase
        .from('whale_positions')
        .select(`
          id,
          wallet_id,
          event_name,
          side,
          size,
          avg_price,
          current_price,
          unrealized_pnl,
          status,
          opened_at,
          condition_id,
          whale_wallets!inner (
            display_name,
            confidence_tier,
            win_rate,
            total_profit
          )
        `)
        .eq('status', 'active')
        .order('size', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Transform the data to flatten the nested structure
      const transformedPositions: WhalePosition[] = (data || []).map(pos => ({
        id: pos.id,
        wallet_id: pos.wallet_id,
        event_name: pos.event_name,
        side: pos.side,
        size: pos.size,
        avg_price: pos.avg_price,
        current_price: pos.current_price,
        unrealized_pnl: pos.unrealized_pnl,
        status: pos.status,
        opened_at: pos.opened_at,
        condition_id: pos.condition_id,
        wallet_display_name: (pos.whale_wallets as any)?.display_name,
        wallet_confidence_tier: (pos.whale_wallets as any)?.confidence_tier,
        wallet_win_rate: (pos.whale_wallets as any)?.win_rate,
        wallet_total_profit: (pos.whale_wallets as any)?.total_profit,
      }));

      setPositions(transformedPositions);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch whale activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch whale activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWhaleActivity();
  }, [fetchWhaleActivity]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('whale_activity_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whale_positions' },
        () => fetchWhaleActivity()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWhaleActivity]);

  return {
    positions,
    loading,
    error,
    refresh: fetchWhaleActivity,
  };
}