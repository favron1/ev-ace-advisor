import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LineComparison {
  event_name: string;
  polymarket_price: number | null;
  pinnacle_price: number | null;
  edge_percent: number | null;
  polymarket_volume: number | null;
  time_until_start: string | null;
  event_start_time: string | null;
  sport: string;
  market_type: string;
  outcome: string;
}

export function useLineShoppingData() {
  const [comparisons, setComparisons] = useState<LineComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLineComparisons = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch recent sharp book lines, focusing on Pinnacle as the sharp book
      const { data: sharpLines, error: sharpError } = await supabase
        .from('sharp_book_lines')
        .select('*')
        .eq('bookmaker', 'pinnacle')
        .eq('is_sharp', true)
        .order('captured_at', { ascending: false })
        .limit(100);

      if (sharpError) throw sharpError;

      // Fetch corresponding Polymarket data
      const { data: polyData, error: polyError } = await supabase
        .from('polymarket_h2h_cache')
        .select('event_title, yes_price, volume, event_start_time')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (polyError) throw polyError;

      // Match Polymarket markets with Pinnacle lines and calculate edges
      const matchedComparisons: LineComparison[] = [];
      
      if (sharpLines && polyData) {
        sharpLines.forEach(sharpLine => {
          // Try to find matching Polymarket market
          const matchingPoly = polyData.find(poly => 
            poly.event_title.toLowerCase().includes(sharpLine.event_name.toLowerCase()) ||
            sharpLine.event_name.toLowerCase().includes(poly.event_title.toLowerCase())
          );

          if (matchingPoly) {
            const polyPrice = matchingPoly.yes_price;
            const pinnaclePrice = 1 - sharpLine.implied_probability; // Convert to complementary probability
            const edgePercent = polyPrice && pinnaclePrice ? 
              ((polyPrice - pinnaclePrice) / pinnaclePrice) * 100 : null;

            // Calculate time until start
            const timeUntilStart = sharpLine.event_start_time ? 
              formatTimeUntilStart(sharpLine.event_start_time) : null;

            matchedComparisons.push({
              event_name: sharpLine.event_name,
              polymarket_price: polyPrice,
              pinnacle_price: pinnaclePrice,
              edge_percent: edgePercent,
              polymarket_volume: matchingPoly.volume,
              time_until_start: timeUntilStart,
              event_start_time: sharpLine.event_start_time,
              sport: sharpLine.sport,
              market_type: sharpLine.market_type,
              outcome: sharpLine.outcome,
            });
          }
        });
      }

      // Sort by absolute edge percent (highest first)
      matchedComparisons.sort((a, b) => {
        const aEdge = Math.abs(a.edge_percent || 0);
        const bEdge = Math.abs(b.edge_percent || 0);
        return bEdge - aEdge;
      });

      setComparisons(matchedComparisons.slice(0, 10)); // Top 10 comparisons
      setError(null);
    } catch (err) {
      console.error('Failed to fetch line shopping data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch line shopping data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLineComparisons();
  }, [fetchLineComparisons]);

  return {
    comparisons,
    loading,
    error,
    refresh: fetchLineComparisons,
  };
}

function formatTimeUntilStart(eventStartTime: string): string {
  const now = new Date();
  const start = new Date(eventStartTime);
  const diffMs = start.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Started';
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}