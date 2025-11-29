import { createContext, useContext, useState, ReactNode } from "react";

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
}

interface BetSlipContextType {
  slipBets: SlipBet[];
  addToSlip: (bet: Omit<SlipBet, "stake" | "status" | "profitLoss" | "placedAt">) => void;
  removeFromSlip: (id: string) => void;
  updateStake: (id: string, stake: number) => void;
  updateOdds: (id: string, odds: number) => void;
  placeBets: () => void;
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
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [slipBets, setSlipBets] = useState<SlipBet[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addToSlip = (bet: Omit<SlipBet, "stake" | "status" | "profitLoss" | "placedAt">) => {
    if (!slipBets.find(b => b.id === bet.id)) {
      setSlipBets(prev => [...prev, { ...bet, stake: 10, status: 'draft' }]);
      setIsOpen(true);
    }
  };

  const removeFromSlip = (id: string) => {
    setSlipBets(prev => prev.filter(b => b.id !== id));
  };

  const updateStake = (id: string, stake: number) => {
    setSlipBets(prev => prev.map(b => b.id === id && b.status === 'draft' ? { ...b, stake } : b));
  };

  const updateOdds = (id: string, odds: number) => {
    setSlipBets(prev => prev.map(b => b.id === id && b.status === 'draft' ? { ...b, odds } : b));
  };

  const placeBets = () => {
    setSlipBets(prev => prev.map(b => 
      b.status === 'draft' 
        ? { ...b, status: 'placed' as BetStatus, placedAt: new Date().toISOString() } 
        : b
    ));
  };

  const updateResult = (id: string, result: 'won' | 'lost') => {
    setSlipBets(prev => prev.map(b => {
      if (b.id === id && b.status === 'placed') {
        const profitLoss = result === 'won' 
          ? (b.stake * b.odds) - b.stake 
          : -b.stake;
        return { ...b, status: result, profitLoss };
      }
      return b;
    }));
  };

  const undoResult = (id: string) => {
    setSlipBets(prev => prev.map(b => {
      if (b.id === id && (b.status === 'won' || b.status === 'lost')) {
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
      setIsOpen
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
