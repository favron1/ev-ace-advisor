import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { RacingEngineResponse, RacingRecommendation, RacingEngineConfig } from '@/types/racing-engine';

interface UseRacingEngineOptions {
  racingTypes?: ('horse' | 'greyhound')[];
  regions?: string[];
  hoursAhead?: number;
  config?: Partial<RacingEngineConfig>;
  includeDemoData?: boolean;
}

const DEFAULT_OPTIONS: UseRacingEngineOptions = {
  racingTypes: ['horse', 'greyhound'],
  regions: ['aus'],
  hoursAhead: 12,
  includeDemoData: true,
};

export function useRacingEngine(options: UseRacingEngineOptions = {}) {
  const [recommendations, setRecommendations] = useState<RacingRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<RacingEngineResponse | null>(null);
  const { toast } = useToast();

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('racing-engine', {
        body: {
          racing_types: mergedOptions.racingTypes,
          regions: mergedOptions.regions,
          hours_ahead: mergedOptions.hoursAhead,
          config: mergedOptions.config,
          include_demo_data: mergedOptions.includeDemoData,
        }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      const engineResponse = data as RacingEngineResponse;
      
      if (!engineResponse.success) {
        throw new Error(engineResponse.error || 'Engine returned unsuccessful response');
      }

      setResponse(engineResponse);
      setRecommendations(engineResponse.recommendations);

      // Show appropriate toast
      if (engineResponse.data_source === 'demo') {
        toast({
          title: "Demo Data Active",
          description: `Found ${engineResponse.recommendations.length} value bets (demo mode - no live racing data available)`,
          duration: 5000,
        });
      } else {
        toast({
          title: "Racing Analysis Complete",
          description: `Found ${engineResponse.recommendations.length} value bets from ${engineResponse.races_analyzed} races`,
        });
      }

      return engineResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch racing recommendations';
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [mergedOptions, toast]);

  // Filter recommendations
  const getFilteredRecommendations = useCallback((
    filters: {
      sport?: 'all' | 'horse' | 'greyhound';
      minConfidence?: number;
      minEv?: number;
      timing?: 'all' | 'optimal' | 'acceptable';
    }
  ) => {
    return recommendations.filter(rec => {
      if (filters.sport && filters.sport !== 'all' && rec.sport !== filters.sport) {
        return false;
      }
      if (filters.minConfidence && rec.confidence < filters.minConfidence) {
        return false;
      }
      if (filters.minEv && rec.ev < filters.minEv) {
        return false;
      }
      if (filters.timing && filters.timing !== 'all' && rec.timing !== filters.timing) {
        return false;
      }
      return true;
    });
  }, [recommendations]);

  // Sort recommendations
  const getSortedRecommendations = useCallback((
    sortBy: 'ev' | 'edge' | 'confidence' | 'odds' | 'time',
    recs: RacingRecommendation[] = recommendations
  ) => {
    return [...recs].sort((a, b) => {
      switch (sortBy) {
        case 'ev': return b.ev - a.ev;
        case 'edge': return b.edge - a.edge;
        case 'confidence': return b.confidence - a.confidence;
        case 'odds': return a.bestOdds - b.bestOdds;
        case 'time': return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        default: return 0;
      }
    });
  }, [recommendations]);

  // Get summary stats
  const getSummaryStats = useCallback(() => {
    if (recommendations.length === 0) {
      return {
        totalBets: 0,
        avgEv: 0,
        avgEdge: 0,
        avgConfidence: 0,
        totalStakeUnits: 0,
        byType: { horse: 0, greyhound: 0 },
        byConfidence: { high: 0, moderate: 0, low: 0 },
      };
    }

    const totalBets = recommendations.length;
    const avgEv = recommendations.reduce((sum, r) => sum + r.ev, 0) / totalBets;
    const avgEdge = recommendations.reduce((sum, r) => sum + r.edge, 0) / totalBets;
    const avgConfidence = recommendations.reduce((sum, r) => sum + r.confidence, 0) / totalBets;
    const totalStakeUnits = recommendations.reduce((sum, r) => sum + r.stakeUnits, 0);

    const byType = {
      horse: recommendations.filter(r => r.sport === 'horse').length,
      greyhound: recommendations.filter(r => r.sport === 'greyhound').length,
    };

    const byConfidence = {
      high: recommendations.filter(r => r.confidence >= 80).length,
      moderate: recommendations.filter(r => r.confidence >= 65 && r.confidence < 80).length,
      low: recommendations.filter(r => r.confidence < 65).length,
    };

    return {
      totalBets,
      avgEv: Math.round(avgEv * 1000) / 10, // as percentage
      avgEdge: Math.round(avgEdge * 1000) / 10,
      avgConfidence: Math.round(avgConfidence),
      totalStakeUnits: Math.round(totalStakeUnits * 100) / 100,
      byType,
      byConfidence,
    };
  }, [recommendations]);

  return {
    recommendations,
    loading,
    error,
    response,
    fetchRecommendations,
    getFilteredRecommendations,
    getSortedRecommendations,
    getSummaryStats,
    isDemo: response?.data_source === 'demo',
    betfairStatus: response?.betfair_status,
    engineVersion: response?.engine_version,
    modelVersion: response?.model_version,
  };
}
