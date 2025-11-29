import { createContext, useContext, useState, ReactNode } from "react";

export interface SlipBet {
  id: string;
  match: string;
  selection: string;
  odds: number;
  stake: number;
  league: string;
  commenceTime: string;
  bookmaker: string;
}

interface BetSlipContextType {
  slipBets: SlipBet[];
  addToSlip: (bet: Omit<SlipBet, "stake">) => void;
  removeFromSlip: (id: string) => void;
  updateStake: (id: string, stake: number) => void;
  updateOdds: (id: string, odds: number) => void;
  clearSlip: () => void;
  isInSlip: (id: string) => boolean;
  totalStake: number;
  potentialReturn: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [slipBets, setSlipBets] = useState<SlipBet[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addToSlip = (bet: Omit<SlipBet, "stake">) => {
    if (!slipBets.find(b => b.id === bet.id)) {
      setSlipBets(prev => [...prev, { ...bet, stake: 10 }]);
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

  const clearSlip = () => {
    setSlipBets([]);
  };

  const isInSlip = (id: string) => slipBets.some(b => b.id === id);

  const totalStake = slipBets.reduce((sum, b) => sum + b.stake, 0);
  const potentialReturn = slipBets.reduce((sum, b) => sum + (b.stake * b.odds), 0);

  return (
    <BetSlipContext.Provider value={{
      slipBets,
      addToSlip,
      removeFromSlip,
      updateStake,
      updateOdds,
      clearSlip,
      isInSlip,
      totalStake,
      potentialReturn,
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
