import { useState, useEffect, useCallback } from 'react';
import { MyBet, MyBetsState } from '@/types/my-bets';
import { RecommendedBet } from '@/types/model-betting';

const STORAGE_KEY = 'my-bets-v1';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function loadFromStorage(): MyBetsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading my bets from storage:', error);
  }
  return { bets: [], lastUpdated: new Date().toISOString() };
}

function saveToStorage(state: MyBetsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving my bets to storage:', error);
  }
}

export function useMyBets() {
  const [state, setState] = useState<MyBetsState>(() => loadFromStorage());

  // Persist to localStorage on state change
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const addBet = useCallback((bet: RecommendedBet) => {
    setState(prev => {
      // Check if bet already exists (by event_id + selection)
      const exists = prev.bets.some(
        b => b.event_id === bet.event_id && b.selection === bet.selection
      );
      if (exists) return prev;

      const myBet: MyBet = {
        ...bet,
        id: generateId(),
        addedAt: new Date().toISOString(),
        lastCheckedAt: null,
        status: 'tracking',
      };

      return {
        bets: [...prev.bets, myBet],
        lastUpdated: new Date().toISOString(),
      };
    });
  }, []);

  const addMultipleBets = useCallback((bets: RecommendedBet[]) => {
    setState(prev => {
      const newBets: MyBet[] = [];
      
      for (const bet of bets) {
        const exists = prev.bets.some(
          b => b.event_id === bet.event_id && b.selection === bet.selection
        );
        if (!exists) {
          newBets.push({
            ...bet,
            id: generateId(),
            addedAt: new Date().toISOString(),
            lastCheckedAt: null,
            status: 'tracking',
          });
        }
      }

      if (newBets.length === 0) return prev;

      return {
        bets: [...prev.bets, ...newBets],
        lastUpdated: new Date().toISOString(),
      };
    });
  }, []);

  const removeBet = useCallback((id: string) => {
    setState(prev => ({
      bets: prev.bets.filter(b => b.id !== id),
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  const updateBet = useCallback((id: string, updates: Partial<MyBet>) => {
    setState(prev => ({
      bets: prev.bets.map(b => 
        b.id === id ? { ...b, ...updates } : b
      ),
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  const updateBetFromRecheck = useCallback((id: string, recheckData: RecommendedBet) => {
    setState(prev => ({
      bets: prev.bets.map(b => 
        b.id === id 
          ? { 
              ...b, 
              ...recheckData,
              lastCheckedAt: new Date().toISOString(),
            } 
          : b
      ),
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  const setStatus = useCallback((id: string, status: MyBet['status']) => {
    setState(prev => ({
      bets: prev.bets.map(b => 
        b.id === id ? { ...b, status } : b
      ),
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  const clearAll = useCallback(() => {
    setState({ bets: [], lastUpdated: new Date().toISOString() });
  }, []);

  const isBetAdded = useCallback((eventId: string, selection: string) => {
    return state.bets.some(
      b => b.event_id === eventId && b.selection === selection
    );
  }, [state.bets]);

  return {
    bets: state.bets,
    lastUpdated: state.lastUpdated,
    addBet,
    addMultipleBets,
    removeBet,
    updateBet,
    updateBetFromRecheck,
    setStatus,
    clearAll,
    isBetAdded,
  };
}
