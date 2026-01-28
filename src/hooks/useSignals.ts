import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { arbitrageApi } from '@/lib/api/arbitrage';
import type { SignalOpportunity, SignalDetectionResult } from '@/types/arbitrage';
import { useToast } from '@/hooks/use-toast';

export function useSignals() {
  const [signals, setSignals] = useState<SignalOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
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
      toast({ title: 'Refreshing data sources...' });
      
      await Promise.all([
        supabase.functions.invoke('fetch-polymarket', { body: {} }),
        supabase.functions.invoke('ingest-odds', { body: {} }),
      ]);
      
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
  }) => {
    return signals.filter(s => {
      if (filters.minEdge && s.edge_percent < filters.minEdge) return false;
      if (filters.minConfidence && s.confidence_score < filters.minConfidence) return false;
      if (filters.urgency?.length && !filters.urgency.includes(s.urgency)) return false;
      return true;
    });
  }, [signals]);

  return {
    signals,
    loading,
    detecting,
    error,
    fetchSignals,
    runDetection,
    dismissSignal,
    executeSignal,
    getFilteredSignals,
  };
}
