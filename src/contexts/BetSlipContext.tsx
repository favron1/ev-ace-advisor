import { createContext, useContext, useState, ReactNode } from "react";

export type BetResult = 'pending' | 'won' | 'lost';

export interface SlipBet {
  id: string;
  match: string;
  selection: string;
  odds: number;
  stake: number;
  league: string;
  commenceTime: string;
  bookmaker: string;
  result: BetResult;
  profitLoss?: number;
}

interface BetSlipContextType {
  slipBets: SlipBet[];
  addToSlip: (bet: Omit<SlipBet, "stake" | "result" | "profitLoss">) => void;
  removeFromSlip: (id: string) => void;
  updateStake: (id: string, stake: number) => void;
  updateOdds: (id: string, odds: number) => void;
  updateResult: (id: string, result: BetResult) => void;
  clearSlip: () => void;
  isInSlip: (id: string) => boolean;
  totalStake: number;
  potentialReturn: number;
  totalProfit: number;
  winCount: number;
  lossCount: number;
  settledBets: SlipBet[];
  pendingBets: SlipBet[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [slipBets, setSlipBets] = useState<SlipBet[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addToSlip = (bet: Omit<SlipBet, "stake" | "result" | "profitLoss">) => {
    if (!slipBets.find(b => b.id === bet.id)) {
      setSlipBets(prev => [...prev, { ...bet, stake: 10, result: 'pending' }]);
      setIsOpen(true);
    }
  };

  const removeFromSlip = (id: string) => {
    setSlipBets(prev => prev.filter(b => b.id !== id));
  };

  const updateStake = (id: string, stake: number) => {
    setSlipBets(prev => prev.map(b => b.id === id ? { ...b, stake } : b));
  };

  const updateOdds = (id: string, odds: number) => {
    setSlipBets(prev => prev.map(b => b.id === id ? { ...b, odds } : b));
  };

  const updateResult = (id: string, result: BetResult) => {
    setSlipBets(prev => prev.map(b => {
      if (b.id === id) {
        const profitLoss = result === 'won' 
          ? (b.stake * b.odds) - b.stake 
          : result === 'lost' 
            ? -b.stake 
            : undefined;
        return { ...b, result, profitLoss };
      }
      return b;
    }));
  };

  const clearSlip = () => {
    setSlipBets([]);
  };

  const isInSlip = (id: string) => slipBets.some(b => b.id === id);

  const pendingBets = slipBets.filter(b => b.result === 'pending');
  const settledBets = slipBets.filter(b => b.result !== 'pending');
  
  const totalStake = pendingBets.reduce((sum, b) => sum + b.stake, 0);
  const potentialReturn = pendingBets.reduce((sum, b) => sum + (b.stake * b.odds), 0);
  const totalProfit = settledBets.reduce((sum, b) => sum + (b.profitLoss || 0), 0);
  const winCount = settledBets.filter(b => b.result === 'won').length;
  const lossCount = settledBets.filter(b => b.result === 'lost').length;

  return (
    <BetSlipContext.Provider value={{
      slipBets,
      addToSlip,
      removeFromSlip,
      updateStake,
      updateOdds,
      updateResult,
      clearSlip,
      isInSlip,
      totalStake,
      potentialReturn,
      totalProfit,
      winCount,
      lossCount,
      settledBets,
      pendingBets,
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
