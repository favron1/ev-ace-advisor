import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { arbitrageApi } from '@/lib/api/arbitrage';
import type { SignalOpportunity, SignalDetectionResult, EnrichedSignal } from '@/types/arbitrage';
import { useToast } from '@/hooks/use-toast';
import { analyzeExecution } from '@/lib/execution-engine';

export function useSignals() {
  const [signals, setSignals] = useState<SignalOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSignalIds, setNewSignalIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const initialLoadDone = useRef(false);

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
    fetchSignals().then(() => {
      initialLoadDone.current = true;
    });
  }, [fetchSignals]);

  // Real-time subscription for signal_opportunities
  useEffect(() => {
    const channel = supabase
      .channel('signal_opportunities_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signal_opportunities',
        },
        (payload) => {
          const newSignal = payload.new as SignalOpportunity;
          if (newSignal.status === 'active') {
            setSignals(prev => {
              // Avoid duplicates
              if (prev.some(s => s.id === newSignal.id)) return prev;
              return [newSignal, ...prev];
            });
            // Mark as new for animation (only after initial load)
            if (initialLoadDone.current) {
              setNewSignalIds(prev => new Set(prev).add(newSignal.id));
              toast({
                title: '🎯 New Signal Detected!',
                description: newSignal.event_name,
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'signal_opportunities',
        },
        (payload) => {
          const updated = payload.new as SignalOpportunity;
          setSignals(prev => {
            // If status changed to non-active, remove it
            if (updated.status !== 'active') {
              return prev.filter(s => s.id !== updated.id);
            }
            // Otherwise update in place
            return prev.map(s => s.id === updated.id ? updated : s);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'signal_opportunities',
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setSignals(prev => prev.filter(s => s.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  // Clear "new" status after 5 seconds
  useEffect(() => {
    if (newSignalIds.size === 0) return;
    const timer = setTimeout(() => {
      setNewSignalIds(new Set());
    }, 5000);
    return () => clearTimeout(timer);
  }, [newSignalIds]);

  // Enrich signals with execution analysis
  const enrichedSignals: EnrichedSignal[] = useMemo(() => {
    return signals.map(signal => ({
      ...signal,
      execution: analyzeExecution(signal, 100), // Default $100 stake
      isNew: newSignalIds.has(signal.id),
    }));
  }, [signals, newSignalIds]);

  // Filter and sort helpers
  const getFilteredSignals = useCallback((filters: {
    minEdge?: number;
    minConfidence?: number;
    urgency?: string[];
    trueEdgesOnly?: boolean;
    bettableOnly?: boolean; // NEW: Filter by execution decision
  }) => {
    return enrichedSignals.filter(s => {
      // Filter by true edges only (matched to Polymarket)
      if (filters.trueEdgesOnly && s.is_true_arbitrage !== true) return false;
      
      // NEW: Filter by bettable only (BET or STRONG_BET decisions)
      if (filters.bettableOnly && s.execution) {
        const decision = s.execution.execution_decision;
        if (decision !== 'BET' && decision !== 'STRONG_BET') return false;
      }
      
      // For true arbitrage, filter by NET edge (not raw edge)
      if (filters.minEdge) {
        if (s.is_true_arbitrage && s.execution) {
          if (s.execution.net_edge_percent < filters.minEdge) return false;
        } else {
          const signalStrength = (s as any).signal_strength || 0;
          if (signalStrength < filters.minEdge) return false;
        }
      }
      
      if (filters.minConfidence && s.confidence_score < filters.minConfidence) return false;
      if (filters.urgency?.length && !filters.urgency.includes(s.urgency)) return false;
      return true;
    });
  }, [enrichedSignals]);

  return {
    signals: enrichedSignals,
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
