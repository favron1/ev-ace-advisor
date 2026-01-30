import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AdvisorRecommendation {
  id: string;
  analysis_type: string;
  insight_category: string | null;
  recommendation: string;
  supporting_data: {
    reasoning?: string;
    expected_impact?: string;
    stats_snapshot?: {
      total_bets: number;
      win_rate: number;
      roi: number;
      by_market_type?: Record<string, { count: number; winRate: number }>;
      by_liquidity?: Record<string, { count: number; winRate: number }>;
    };
  } | null;
  priority: string;
  status: string;
  applied_at: string | null;
  created_at: string;
}

export function useAdvisor() {
  const [recommendations, setRecommendations] = useState<AdvisorRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  const fetchRecommendations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ai_advisor_logs')
        .select('*')
        .eq('status', 'active')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Sort by priority (critical > high > medium > low)
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sorted = (data || []).sort((a, b) => {
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
        return aPriority - bPriority;
      });

      setRecommendations(sorted as AdvisorRecommendation[]);
    } catch (error) {
      console.error('Error fetching advisor recommendations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    try {
      const response = await supabase.functions.invoke('analyze-betting-patterns');

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;

      if (!data.success) {
        toast({
          title: 'Analysis incomplete',
          description: data.message || 'Could not complete analysis',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Analysis complete',
        description: `Generated ${data.recommendations_count} recommendations`,
      });

      // Refresh recommendations
      await fetchRecommendations();
    } catch (error) {
      console.error('Error running analysis:', error);
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  }, [toast, fetchRecommendations]);

  const applyRecommendation = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_advisor_logs')
        .update({ 
          status: 'applied', 
          applied_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;

      setRecommendations(prev => prev.filter(r => r.id !== id));
      
      toast({
        title: 'Recommendation applied',
        description: 'Marked as applied and removed from active list',
      });
    } catch (error) {
      console.error('Error applying recommendation:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark recommendation as applied',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const dismissRecommendation = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_advisor_logs')
        .update({ status: 'dismissed' })
        .eq('id', id);

      if (error) throw error;

      setRecommendations(prev => prev.filter(r => r.id !== id));
      
      toast({
        title: 'Recommendation dismissed',
        description: 'Removed from active recommendations',
      });
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
      toast({
        title: 'Error',
        description: 'Failed to dismiss recommendation',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const activeCount = recommendations.length;
  const criticalCount = recommendations.filter(r => r.priority === 'critical').length;
  const highCount = recommendations.filter(r => r.priority === 'high').length;

  return {
    recommendations,
    loading,
    analyzing,
    activeCount,
    criticalCount,
    highCount,
    runAnalysis,
    applyRecommendation,
    dismissRecommendation,
    refresh: fetchRecommendations,
  };
}
