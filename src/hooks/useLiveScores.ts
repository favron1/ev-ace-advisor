import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | string | null;
  awayScore: number | string | null;
  league: string;
  sport: 'soccer' | 'tennis' | 'basketball';
  commenceTime: string;
  status: 'live' | 'upcoming' | 'completed';
  lastUpdate: string | null;
  sets?: { home: number; away: number }[];
}

export interface LiveScoresData {
  live: LiveMatch[];
  upcoming: LiveMatch[];
  completed: LiveMatch[];
}

export function useLiveScores(autoRefresh = true, refreshInterval = 60000) {
  const [data, setData] = useState<LiveScoresData>({ live: [], upcoming: [], completed: [] });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLiveScores = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-live-scores');

      if (error) {
        console.error('Error fetching live scores:', error);
        return;
      }

      if (result) {
        setData({
          live: result.live || [],
          upcoming: result.upcoming || [],
          completed: result.completed || [],
        });
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveScores();
    
    if (autoRefresh) {
      const interval = setInterval(fetchLiveScores, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchLiveScores, autoRefresh, refreshInterval]);

  // Helper to find a matching live score for a bet
  const findMatchForBet = useCallback((eventName: string): LiveMatch | null => {
    const allMatches = [...data.live, ...data.upcoming, ...data.completed];
    
    // Normalize event name for matching
    const normalizeTeam = (name: string) => 
      name.toLowerCase()
        .replace(/fc|afc|sc|cf|bv|sv|fk|nk/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Try exact match first
    for (const match of allMatches) {
      const matchName1 = `${match.homeTeam} vs ${match.awayTeam}`.toLowerCase();
      const matchName2 = `${match.awayTeam} vs ${match.homeTeam}`.toLowerCase();
      const betName = eventName.toLowerCase();
      
      if (betName.includes(matchName1) || betName.includes(matchName2) ||
          matchName1.includes(betName) || matchName2.includes(betName)) {
        return match;
      }
    }
    
    // Try fuzzy match on team names
    for (const match of allMatches) {
      const homeNorm = normalizeTeam(match.homeTeam);
      const awayNorm = normalizeTeam(match.awayTeam);
      const betNorm = normalizeTeam(eventName);
      
      // Check if both teams appear in the bet event name
      if (betNorm.includes(homeNorm) || betNorm.includes(awayNorm)) {
        // Check if other team also appears (for vs matches)
        if ((betNorm.includes(homeNorm) && betNorm.includes(awayNorm)) ||
            homeNorm.length > 3 && betNorm.includes(homeNorm) ||
            awayNorm.length > 3 && betNorm.includes(awayNorm)) {
          return match;
        }
      }
      
      // Tennis: Check player last names
      if (match.sport === 'tennis') {
        const homeLastName = match.homeTeam.split(' ').pop()?.toLowerCase() || '';
        const awayLastName = match.awayTeam.split(' ').pop()?.toLowerCase() || '';
        const betWords = betNorm.split(' ');
        
        if (betWords.some(w => w.length > 3 && homeLastName.includes(w)) &&
            betWords.some(w => w.length > 3 && awayLastName.includes(w))) {
          return match;
        }
        
        // Also try the other way
        if (homeLastName.length > 3 && betNorm.includes(homeLastName) &&
            awayLastName.length > 3 && betNorm.includes(awayLastName)) {
          return match;
        }
      }
    }
    
    return null;
  }, [data]);

  return {
    data,
    loading,
    lastUpdated,
    fetchLiveScores,
    findMatchForBet,
  };
}
