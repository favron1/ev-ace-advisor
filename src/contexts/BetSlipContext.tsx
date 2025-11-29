import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";

export type BetStatus = 'draft' | 'placed' | 'won' | 'lost';

export interface SlipBet {
  id: string;
  match: string;
  selection: string;
  odds: number;
  stake: number;
  league: string;
  commenceTime: string;
  bookmaker: string;
  status: BetStatus;
  profitLoss?: number;
  placedAt?: string;
  dbId?: string; // Database ID for synced bets
}

interface BetSlipContextType {
  slipBets: SlipBet[];
  addToSlip: (bet: Omit<SlipBet, "stake" | "status" | "profitLoss" | "placedAt">) => void;
  removeFromSlip: (id: string) => void;
  updateStake: (id: string, stake: number) => void;
  updateOdds: (id: string, odds: number) => void;
  placeBets: () => Promise<void>;
  checkResults: () => Promise<void>;
  updateResult: (id: string, result: 'won' | 'lost') => void;
  undoResult: (id: string) => void;
  clearSlip: () => void;
  isInSlip: (id: string) => boolean;
  totalStake: number;
  potentialReturn: number;
  totalProfit: number;
  winCount: number;
  lossCount: number;
  draftBets: SlipBet[];
  placedBets: SlipBet[];
  settledBets: SlipBet[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isChecking: boolean;
  isPlacing: boolean;
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [slipBets, setSlipBets] = useState<SlipBet[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();

  // Load bets from database
  const loadBetsFromDB = useCallback(async (userId: string) => {
    console.log('Loading bets for user:', userId);
    
    const { data: dbBets, error } = await supabase
      .from('bet_history')
      .select('*')
      .eq('user_id', userId)
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('Error loading bets:', error);
      return;
    }

    console.log('Loaded bets from DB:', dbBets);

    if (dbBets && dbBets.length > 0) {
      const loadedBets: SlipBet[] = dbBets.map(bet => ({
        id: bet.id,
        dbId: bet.id,
        match: bet.match_description,
        selection: bet.selection,
        odds: Number(bet.odds),
        stake: Number(bet.stake),
        league: '',
        commenceTime: bet.placed_at || '',
        bookmaker: '',
        status: bet.status === 'pending' ? 'placed' : bet.status as BetStatus,
        profitLoss: bet.profit_loss ? Number(bet.profit_loss) : undefined,
        placedAt: bet.placed_at || undefined
      }));
      setSlipBets(prev => {
        // Keep only draft bets from local state, add DB bets
        const drafts = prev.filter(b => b.status === 'draft');
        return [...drafts, ...loadedBets];
      });
    }
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Defer the DB call to avoid deadlock
        setTimeout(() => {
          loadBetsFromDB(session.user.id);
        }, 0);
      } else {
        // Clear non-draft bets when logged out
        setSlipBets(prev => prev.filter(b => b.status === 'draft'));
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session check:', session?.user?.id);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadBetsFromDB(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadBetsFromDB]);

  const addToSlip = (bet: Omit<SlipBet, "stake" | "status" | "profitLoss" | "placedAt">) => {
    if (!slipBets.find(b => b.id === bet.id)) {
      setSlipBets(prev => [...prev, { ...bet, stake: 10, status: 'draft' }]);
      setIsOpen(true);
    }
  };

  const removeFromSlip = async (id: string) => {
    const bet = slipBets.find(b => b.id === id);
    
    // Delete from database if it has a dbId
    if (bet?.dbId) {
      const { error } = await supabase
        .from('bet_history')
        .delete()
        .eq('id', bet.dbId);
      
      if (error) {
        console.error('Error deleting bet:', error);
        toast({
          title: "Error",
          description: "Failed to delete bet from database",
          variant: "destructive"
        });
        return;
      }
    }
    
    setSlipBets(prev => prev.filter(b => b.id !== id));
    toast({
      title: "Bet Deleted",
      description: "Bet has been removed"
    });
  };

  const updateStake = (id: string, stake: number) => {
    setSlipBets(prev => prev.map(b => b.id === id && b.status === 'draft' ? { ...b, stake } : b));
  };

  const updateOdds = (id: string, odds: number) => {
    setSlipBets(prev => prev.map(b => b.id === id && b.status === 'draft' ? { ...b, odds } : b));
  };

  const placeBets = async () => {
    const drafts = slipBets.filter(b => b.status === 'draft');
    if (drafts.length === 0) return;

    setIsPlacing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Not logged in",
          description: "Please log in to place bets and track results automatically",
          variant: "destructive"
        });
        // Still update local state
        setSlipBets(prev => prev.map(b => 
          b.status === 'draft' 
            ? { ...b, status: 'placed' as BetStatus, placedAt: new Date().toISOString() } 
            : b
        ));
        return;
      }

      // Save to database
      const betsToInsert = drafts.map(bet => ({
        user_id: user.id,
        match_description: bet.match,
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        potential_return: bet.stake * bet.odds,
        status: 'pending' as const,
        placed_at: new Date().toISOString()
      }));

      const { data: insertedBets, error } = await supabase
        .from('bet_history')
        .insert(betsToInsert)
        .select();

      if (error) {
        console.error('Error saving bets:', error);
        toast({
          title: "Error",
          description: "Failed to save bets to database",
          variant: "destructive"
        });
        return;
      }

      // Update local state with database IDs
      setSlipBets(prev => {
        const updatedBets = prev.map(b => {
          if (b.status === 'draft') {
            const dbBet = insertedBets?.find(ib => 
              ib.match_description === b.match && ib.selection === b.selection
            );
            return { 
              ...b, 
              status: 'placed' as BetStatus, 
              placedAt: new Date().toISOString(),
              dbId: dbBet?.id,
              id: dbBet?.id || b.id
            };
          }
          return b;
        });
        return updatedBets;
      });

      toast({
        title: "Bets Placed",
        description: `${drafts.length} bet(s) saved. Results will be checked automatically.`
      });

    } catch (err) {
      console.error('Error placing bets:', err);
      toast({
        title: "Error",
        description: "An error occurred while placing bets",
        variant: "destructive"
      });
    } finally {
      setIsPlacing(false);
    }
  };

  const checkResults = useCallback(async () => {
    setIsChecking(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-results');
      
      if (error) {
        console.error('Error checking results:', error);
        toast({
          title: "Error",
          description: "Failed to check results",
          variant: "destructive"
        });
        return;
      }

      console.log('Check results response:', data);

      if (data.updated > 0) {
        // Reload bets from database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: dbBets } = await supabase
            .from('bet_history')
            .select('*')
            .eq('user_id', user.id)
            .order('placed_at', { ascending: false });

          if (dbBets) {
            const loadedBets: SlipBet[] = dbBets.map(bet => ({
              id: bet.id,
              dbId: bet.id,
              match: bet.match_description,
              selection: bet.selection,
              odds: Number(bet.odds),
              stake: Number(bet.stake),
              league: '',
              commenceTime: bet.placed_at || '',
              bookmaker: '',
              status: bet.status === 'pending' ? 'placed' : bet.status as BetStatus,
              profitLoss: bet.profit_loss ? Number(bet.profit_loss) : undefined,
              placedAt: bet.placed_at || undefined
            }));
            setSlipBets(prev => {
              const drafts = prev.filter(b => b.status === 'draft');
              return [...drafts, ...loadedBets];
            });
          }
        }

        toast({
          title: "Results Updated",
          description: `${data.updated} bet(s) have been settled`
        });
      } else {
        toast({
          title: "No Updates",
          description: "No completed matches found for your pending bets"
        });
      }

    } catch (err) {
      console.error('Error checking results:', err);
      toast({
        title: "Error",
        description: "An error occurred while checking results",
        variant: "destructive"
      });
    } finally {
      setIsChecking(false);
    }
  }, [toast]);

  const updateResult = async (id: string, result: 'won' | 'lost') => {
    const bet = slipBets.find(b => b.id === id);
    if (!bet || bet.status !== 'placed') return;

    const profitLoss = result === 'won' 
      ? (bet.stake * bet.odds) - bet.stake 
      : -bet.stake;

    // Update database if bet has dbId
    if (bet.dbId) {
      const { error } = await supabase
        .from('bet_history')
        .update({
          status: result,
          profit_loss: profitLoss,
          settled_at: new Date().toISOString()
        })
        .eq('id', bet.dbId);

      if (error) {
        console.error('Error updating bet:', error);
        toast({
          title: "Error",
          description: "Failed to update bet in database",
          variant: "destructive"
        });
      }
    }

    setSlipBets(prev => prev.map(b => {
      if (b.id === id && b.status === 'placed') {
        return { ...b, status: result, profitLoss };
      }
      return b;
    }));
  };

  const undoResult = async (id: string) => {
    const bet = slipBets.find(b => b.id === id);
    if (!bet || (bet.status !== 'won' && bet.status !== 'lost')) return;

    // Update database if bet has dbId
    if (bet.dbId) {
      const { error } = await supabase
        .from('bet_history')
        .update({
          status: 'pending',
          profit_loss: null,
          settled_at: null
        })
        .eq('id', bet.dbId);

      if (error) {
        console.error('Error undoing result:', error);
      }
    }

    setSlipBets(prev => prev.map(b => {
      if (b.id === id) {
        return { ...b, status: 'placed' as BetStatus, profitLoss: undefined };
      }
      return b;
    }));
  };

  const clearSlip = () => {
    setSlipBets(prev => prev.filter(b => b.status !== 'draft'));
  };

  const isInSlip = (id: string) => slipBets.some(b => b.id === id);

  const draftBets = slipBets.filter(b => b.status === 'draft');
  const placedBets = slipBets.filter(b => b.status === 'placed');
  const settledBets = slipBets.filter(b => b.status === 'won' || b.status === 'lost');
  
  const totalStake = draftBets.reduce((sum, b) => sum + b.stake, 0);
  const potentialReturn = draftBets.reduce((sum, b) => sum + (b.stake * b.odds), 0);
  const totalProfit = settledBets.reduce((sum, b) => sum + (b.profitLoss || 0), 0);
  const winCount = settledBets.filter(b => b.status === 'won').length;
  const lossCount = settledBets.filter(b => b.status === 'lost').length;

  return (
    <BetSlipContext.Provider value={{
      slipBets,
      addToSlip,
      removeFromSlip,
      updateStake,
      updateOdds,
      placeBets,
      checkResults,
      updateResult,
      undoResult,
      clearSlip,
      isInSlip,
      totalStake,
      potentialReturn,
      totalProfit,
      winCount,
      lossCount,
      draftBets,
      placedBets,
      settledBets,
      isOpen,
      setIsOpen,
      isChecking,
      isPlacing
    }}>
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error("useBetSlip must be used within a BetSlipProvider");
  }
  return context;
}