import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { arbitrageApi } from '@/lib/api/arbitrage';
import type { SignalOpportunity, SignalDetectionResult } from '@/types/arbitrage';
import { useToast } from '@/hooks/use-toast';

export function useSignals() {
  const [signals, setSignals] = useState<SignalOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await arbitrageApi.getActiveSignals();
      setSignals(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch signals');
    } finally {
      setLoading(false);
    }
  }, []);

  const runDetection = useCallback(async (): Promise<SignalDetectionResult | null> => {
    try {
      setDetecting(true);
      
      // First, refresh data sources
      toast({ title: 'Refreshing bookmaker data...' });
      
      // Only fetch bookmaker odds - Polymarket is fetched per-event in active-mode-poll
      await supabase.functions.invoke('ingest-odds', { body: {} });
      
      // Then run detection
      const result = await arbitrageApi.runSignalDetection();
      await fetchSignals();
      
      toast({
        title: 'Signal Detection Complete',
        description: `Found ${result.signals_surfaced} opportunities from ${result.outright_signals || result.movements_detected} bookmaker signals.`,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      toast({
        title: 'Detection Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setDetecting(false);
    }
  }, [fetchSignals, toast]);

  const refreshSignals = useCallback(async () => {
    try {
      setRefreshing(true);
      const result = await arbitrageApi.refreshSignals();
      await fetchSignals();
      
      toast({
        title: 'Signals Refreshed',
        description: `${result.expired} expired, ${result.updated} updated, ${result.unchanged} unchanged`,
      });
      return result;
    } catch (err) {
      toast({
        title: 'Refresh Error',
        description: err instanceof Error ? err.message : 'Failed to refresh signals',
        variant: 'destructive',
      });
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [fetchSignals, toast]);

  const dismissSignal = useCallback(async (signalId: string) => {
    try {
      await arbitrageApi.dismissSignal(signalId);
      setSignals(prev => prev.filter(s => s.id !== signalId));
      toast({ title: 'Signal dismissed' });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to dismiss signal',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const executeSignal = useCallback(async (signalId: string, entryPrice: number) => {
    try {
      await arbitrageApi.executeSignal(signalId, entryPrice);
      setSignals(prev => prev.filter(s => s.id !== signalId));
      toast({ title: 'Signal marked as executed' });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to execute signal',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // Filter and sort helpers
  const getFilteredSignals = useCallback((filters: {
    minEdge?: number;
    minConfidence?: number;
    urgency?: string[];
    trueEdgesOnly?: boolean;
  }) => {
    return signals.filter(s => {
      // Filter by true edges only (matched to Polymarket)
      if (filters.trueEdgesOnly && s.is_true_arbitrage !== true) return false;
      
      // For true arbitrage, filter by edge; for signals, use signal_strength from factors
      if (filters.minEdge) {
        if (s.is_true_arbitrage) {
          if (s.edge_percent < filters.minEdge) return false;
        } else {
          const signalStrength = (s as any).signal_strength || 0;
          if (signalStrength < filters.minEdge) return false;
        }
      }
      
      if (filters.minConfidence && s.confidence_score < filters.minConfidence) return false;
      if (filters.urgency?.length && !filters.urgency.includes(s.urgency)) return false;
      return true;
    });
  }, [signals]);

  return {
    signals,
    loading,
    detecting,
    refreshing,
    error,
    fetchSignals,
    runDetection,
    refreshSignals,
    dismissSignal,
    executeSignal,
    getFilteredSignals,
  };
}
