import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MultiLegOpportunity {
  id: string;
  event_name: string;
  legs: any; // JSON array of leg details
  combined_edge: number | null;
  combined_probability: number | null;
  correlation_score: number | null;
  sport: string | null;
  status: string | null;
  detected_at: string | null;
  expires_at: string | null;
}

export function useMultiLegOpportunities() {
  const [opportunities, setOpportunities] = useState<MultiLegOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMultiLegOpportunities = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('multi_leg_opportunities')
        .select('*')
        .eq('status', 'active')
        .order('combined_edge', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      setOpportunities(data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch multi-leg opportunities:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch multi-leg opportunities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMultiLegOpportunities();
  }, [fetchMultiLegOpportunities]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('multi_leg_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'multi_leg_opportunities' },
        () => fetchMultiLegOpportunities()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMultiLegOpportunities]);

  return {
    opportunities,
    loading,
    error,
    refresh: fetchMultiLegOpportunities,
  };
}