import { useState, useEffect, useCallback } from 'react';
import { MyBet, MyBetsState } from '@/types/my-bets';
import { RecommendedBet } from '@/types/model-betting';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useMyBets() {
  const { toast } = useToast();
  const [state, setState] = useState<MyBetsState>({ bets: [], lastUpdated: new Date().toISOString() });
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load bets from database when user changes
  useEffect(() => {
    if (userId) {
      loadBetsFromDatabase();
    } else {
      setState({ bets: [], lastUpdated: new Date().toISOString() });
      setLoading(false);
    }
  }, [userId]);

  const requireSession = async () => {
    // getSession() is fast but may return a cached session; refreshSession() will
    // validate/refresh tokens when the cached JWT is stale/corrupted.
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (sessionData.session?.user) return sessionData.session;

    // Attempt a token refresh (fixes cases where UI thinks you're logged in but
    // the access token is invalid, causing RLS failures).
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.user) {
      // Ensure we don't keep a stale userId around
      setUserId(null);
      return null;
    }

    return refreshed.session;
  };

  const requireUserId = async () => {
    const session = await requireSession();
    return session?.user?.id ?? null;
  };

  const requireLoginToast = () => {
    toast({
      title: "Login Required",
      description: "Your session expired. Please sign in again to save bets.",
      variant: "destructive",
    });
  };

  const isRlsAuthError = (err: unknown) => {
    const anyErr = err as any;
    return anyErr?.code === '42501' || String(anyErr?.message || '').includes('row-level security');
  };

  const loadBetsFromDatabase = async () => {
    const authedUserId = await requireUserId();
    if (!authedUserId) {
      setState({ bets: [], lastUpdated: new Date().toISOString() });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_bets')
        .select('*')
        .eq('user_id', authedUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const bets: MyBet[] = (data || []).map(row => ({
        id: row.id,
        event_id: row.event_name,
        market_id: '',
        event_name: row.event_name,
        league: row.league,
        sport: row.sport,
        selection: row.selection,
        selection_label: row.selection,
        odds_decimal: Number(row.odds),
        bookmaker: row.bookmaker,
        start_time: row.start_time || '',
        model_probability: row.model_probability ? Number(row.model_probability) : 0,
        implied_probability: row.implied_probability ? Number(row.implied_probability) : 0,
        edge: row.edge ? Number(row.edge) : 0,
        bet_score: row.bet_score ?? 0,
        confidence: (row.confidence as 'high' | 'medium' | 'low') || 'medium',
        recommended_stake_units: row.stake_units ? Number(row.stake_units) : 0,
        rationale: row.rationale ?? '',
        addedAt: row.created_at,
        lastCheckedAt: null,
        status: row.status === 'pending' ? 'tracking' : row.status as MyBet['status'],
      }));

      setState({
        bets,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error loading bets:', error);
      if (isRlsAuthError(error)) {
        requireLoginToast();
      } else {
        toast({
          title: "Error",
          description: "Failed to load your bets",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const addBet = useCallback(async (bet: RecommendedBet) => {
    const authedUserId = await requireUserId();
    if (!authedUserId) {
      requireLoginToast();
      return;
    }

    // Check if bet already exists locally
    const exists = state.bets.some(
      b => b.event_name === bet.event_name && b.selection === bet.selection
    );
    if (exists) return;

    try {
      const { data, error } = await supabase
        .from('user_bets')
        .insert({
          user_id: authedUserId,
          event_name: bet.event_name,
          league: bet.league,
          sport: bet.sport || 'soccer',
          selection: bet.selection,
          odds: bet.odds_decimal,
          bookmaker: bet.bookmaker,
          start_time: bet.start_time,
          model_probability: bet.model_probability,
          implied_probability: bet.implied_probability,
          edge: bet.edge,
          bet_score: bet.bet_score,
          confidence: bet.confidence,
          stake_units: bet.recommended_stake_units,
          rationale: bet.rationale,
        })
        .select()
        .single();

      if (error) throw error;

      const myBet: MyBet = {
        id: data.id,
        event_id: data.event_name,
        market_id: '',
        event_name: data.event_name,
        league: data.league,
        sport: data.sport,
        selection: data.selection,
        selection_label: data.selection,
        odds_decimal: Number(data.odds),
        bookmaker: data.bookmaker,
        start_time: data.start_time || '',
        model_probability: data.model_probability ? Number(data.model_probability) : 0,
        implied_probability: data.implied_probability ? Number(data.implied_probability) : 0,
        edge: data.edge ? Number(data.edge) : 0,
        bet_score: data.bet_score ?? 0,
        confidence: (data.confidence as 'high' | 'medium' | 'low') || 'medium',
        recommended_stake_units: data.stake_units ? Number(data.stake_units) : 0,
        rationale: data.rationale ?? '',
        addedAt: data.created_at,
        lastCheckedAt: null,
        status: 'tracking',
      };

      setState(prev => ({
        bets: [myBet, ...prev.bets],
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error adding bet:', error);
      if (isRlsAuthError(error)) {
        requireLoginToast();
      } else {
        toast({
          title: "Error",
          description: "Failed to save bet",
          variant: "destructive",
        });
      }
    }
  }, [state.bets, toast]);

  const addMultipleBets = useCallback(async (bets: RecommendedBet[]) => {
    const authedUserId = await requireUserId();
    if (!authedUserId) {
      requireLoginToast();
      return;
    }

    const newBets = bets.filter(bet => 
      !state.bets.some(b => b.event_name === bet.event_name && b.selection === bet.selection)
    );

    if (newBets.length === 0) return;

    try {
      const inserts = newBets.map(bet => ({
        user_id: authedUserId,
        event_name: bet.event_name,
        league: bet.league,
        sport: bet.sport || 'soccer',
        selection: bet.selection,
        odds: bet.odds_decimal,
        bookmaker: bet.bookmaker,
        start_time: bet.start_time,
        model_probability: bet.model_probability,
        implied_probability: bet.implied_probability,
        edge: bet.edge,
        bet_score: bet.bet_score,
        confidence: bet.confidence,
        stake_units: bet.recommended_stake_units,
        rationale: bet.rationale,
      }));

      const { data, error } = await supabase
        .from('user_bets')
        .insert(inserts)
        .select();

      if (error) throw error;

      const addedBets: MyBet[] = (data || []).map(row => ({
        id: row.id,
        event_id: row.event_name,
        market_id: '',
        event_name: row.event_name,
        league: row.league,
        sport: row.sport,
        selection: row.selection,
        selection_label: row.selection,
        odds_decimal: Number(row.odds),
        bookmaker: row.bookmaker,
        start_time: row.start_time || '',
        model_probability: row.model_probability ? Number(row.model_probability) : 0,
        implied_probability: row.implied_probability ? Number(row.implied_probability) : 0,
        edge: row.edge ? Number(row.edge) : 0,
        bet_score: row.bet_score ?? 0,
        confidence: (row.confidence as 'high' | 'medium' | 'low') || 'medium',
        recommended_stake_units: row.stake_units ? Number(row.stake_units) : 0,
        rationale: row.rationale ?? '',
        addedAt: row.created_at,
        lastCheckedAt: null,
        status: 'tracking' as const,
      }));

      setState(prev => ({
        bets: [...addedBets, ...prev.bets],
        lastUpdated: new Date().toISOString(),
      }));

      toast({
        title: "Bets Saved",
        description: `Added ${addedBets.length} bet(s) to your list`,
      });
    } catch (error) {
      console.error('Error adding bets:', error);
      if (isRlsAuthError(error)) {
        requireLoginToast();
      } else {
        toast({
          title: "Error",
          description: "Failed to save bets",
          variant: "destructive",
        });
      }
    }
  }, [state.bets, toast]);

  const removeBet = useCallback(async (id: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('user_bets')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      setState(prev => ({
        bets: prev.bets.filter(b => b.id !== id),
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error removing bet:', error);
      toast({
        title: "Error",
        description: "Failed to remove bet",
        variant: "destructive",
      });
    }
  }, [userId, toast]);

  const updateBet = useCallback(async (id: string, updates: Partial<MyBet>) => {
    if (!userId) return;

    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.odds_decimal !== undefined) dbUpdates.odds = updates.odds_decimal;
      if (updates.bet_score !== undefined) dbUpdates.bet_score = updates.bet_score;
      if (updates.edge !== undefined) dbUpdates.edge = updates.edge;
      if (updates.model_probability !== undefined) dbUpdates.model_probability = updates.model_probability;
      if (updates.rationale !== undefined) dbUpdates.rationale = updates.rationale;

      if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase
          .from('user_bets')
          .update(dbUpdates)
          .eq('id', id)
          .eq('user_id', userId);

        if (error) throw error;
      }

      setState(prev => ({
        bets: prev.bets.map(b => b.id === id ? { ...b, ...updates } : b),
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error updating bet:', error);
    }
  }, [userId]);

  const updateBetFromRecheck = useCallback(async (id: string, recheckData: RecommendedBet) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('user_bets')
        .update({
          odds: recheckData.odds_decimal,
          model_probability: recheckData.model_probability,
          implied_probability: recheckData.implied_probability,
          edge: recheckData.edge,
          bet_score: recheckData.bet_score,
          rationale: recheckData.rationale,
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      setState(prev => ({
        bets: prev.bets.map(b =>
          b.id === id
            ? { ...b, ...recheckData, lastCheckedAt: new Date().toISOString() }
            : b
        ),
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error updating bet from recheck:', error);
    }
  }, [userId]);

  const setStatus = useCallback(async (id: string, status: MyBet['status']) => {
    if (!userId) return;

    const dbStatus = status === 'tracking' ? 'pending' : status;

    try {
      const updateData: Record<string, any> = { status: dbStatus };
      if (status === 'won' || status === 'lost' || status === 'void') {
        updateData.settled_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('user_bets')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      setState(prev => ({
        bets: prev.bets.map(b => b.id === id ? { ...b, status } : b),
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error setting status:', error);
    }
  }, [userId]);

  const clearAll = useCallback(async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('user_bets')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      setState({ bets: [], lastUpdated: new Date().toISOString() });
    } catch (error) {
      console.error('Error clearing bets:', error);
      toast({
        title: "Error",
        description: "Failed to clear bets",
        variant: "destructive",
      });
    }
  }, [userId, toast]);

  const isBetAdded = useCallback((eventId: string, selection: string) => {
    return state.bets.some(
      b => (b.event_id === eventId || b.event_name === eventId) && b.selection === selection
    );
  }, [state.bets]);

  return {
    bets: state.bets,
    lastUpdated: state.lastUpdated,
    loading,
    isLoggedIn: !!userId,
    addBet,
    addMultipleBets,
    removeBet,
    updateBet,
    updateBetFromRecheck,
    setStatus,
    clearAll,
    isBetAdded,
    refresh: loadBetsFromDatabase,
  };
}
