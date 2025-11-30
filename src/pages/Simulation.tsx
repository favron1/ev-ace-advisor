import { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { Header } from "@/components/layout/Header";
import { SimulationControls } from "@/components/simulation/SimulationControls";
import { SimulationResults } from "@/components/simulation/SimulationResults";
import { SimulatedBetsTable } from "@/components/simulation/SimulatedBetsTable";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SimulationConfig {
  numberOfBets: number;
  minEdge: number;
  maxEdge: number;
  minOdds: number;
  maxOdds: number;
  confidenceLevel: 'all' | 'low' | 'moderate' | 'high';
  stakingStrategy: 'fixed' | 'kelly' | 'percentage';
  fixedStake: number;
  bankrollPercentage: number;
  initialBankroll: number;
}

export interface SimulatedBet {
  id: string;
  selection: string;
  match: string;
  odds: number;
  edge: number;
  confidence: string;
  stake: number;
  result: 'won' | 'lost';
  profitLoss: number;
  runningBankroll: number;
  actualProbability: number;
}

export interface SimulationStats {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalStaked: number;
  totalProfit: number;
  roi: number;
  maxDrawdown: number;
  finalBankroll: number;
  avgOdds: number;
  avgEdge: number;
}

const defaultConfig: SimulationConfig = {
  numberOfBets: 100,
  minEdge: 5,
  maxEdge: 50,
  minOdds: 1.5,
  maxOdds: 10,
  confidenceLevel: 'all',
  stakingStrategy: 'fixed',
  fixedStake: 10,
  bankrollPercentage: 2,
  initialBankroll: 1000,
};

export default function Simulation() {
  const [config, setConfig] = useState<SimulationConfig>(defaultConfig);
  const [isRunning, setIsRunning] = useState(false);
  const [isCheckingResults, setIsCheckingResults] = useState(false);
  const [isFetchingHistorical, setIsFetchingHistorical] = useState(false);
  const [simulatedBets, setSimulatedBets] = useState<SimulatedBet[]>([]);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [valueBets, setValueBets] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  // Count settled bets (with real results)
  const settledBets = valueBets.filter(bet => bet.result === 'won' || bet.result === 'lost').length;

  // Fetch historical value bets - ONLY bets with real match results for simulation
  const fetchValueBets = async () => {
    const { data, error } = await supabase
      .from('value_bets')
      .select(`
        *,
        matches (
          home_team,
          away_team,
          league,
          match_date
        )
      `)
      .in('result', ['won', 'lost']) // Only fetch settled bets with real results
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching value bets:', error);
      return;
    }

    setValueBets(data || []);
  };

  useEffect(() => {
    fetchValueBets();
  }, []);

  // Fetch historical odds data with real results
  const fetchHistorical = async () => {
    setIsFetchingHistorical(true);
    try {
      // Fetch historical data from last 90 days to get more settled bets
      const response = await supabase.functions.invoke('fetch-historical-odds', {
        body: { daysBack: 90 }
      });
      
      if (response.error) {
        throw response.error;
      }

      const data = response.data;
      toast({
        title: "Historical data loaded",
        description: `${data.settledBets} settled bets from last ${data.daysBack} days (${data.winRate} win rate)`,
      });

      // Refresh value bets
      await fetchValueBets();
    } catch (error) {
      console.error('Error fetching historical:', error);
      toast({
        title: "Error fetching historical data",
        description: error instanceof Error ? error.message : "Failed to fetch historical odds",
        variant: "destructive",
      });
    } finally {
      setIsFetchingHistorical(false);
    }
  };

  // Check results from real matches
  const checkResults = async () => {
    setIsCheckingResults(true);
    try {
      const response = await supabase.functions.invoke('check-results');
      
      if (response.error) {
        throw response.error;
      }

      const data = response.data;
      toast({
        title: "Results checked",
        description: `Updated ${data.valueBetsUpdated || 0} value bets with real match outcomes.`,
      });

      // Refresh value bets to get updated results
      await fetchValueBets();
    } catch (error) {
      console.error('Error checking results:', error);
      toast({
        title: "Error checking results",
        description: error instanceof Error ? error.message : "Failed to check match results",
        variant: "destructive",
      });
    } finally {
      setIsCheckingResults(false);
    }
  };

  const calculateKellyStake = (edge: number, odds: number, bankroll: number): number => {
    // Kelly Criterion: f* = (bp - q) / b
    // where b = odds - 1, p = probability of winning, q = 1 - p
    const probability = 1 / odds + (edge / 100);
    const b = odds - 1;
    const kellyFraction = (b * probability - (1 - probability)) / b;
    // Use quarter Kelly for more conservative sizing
    const quarterKelly = kellyFraction * 0.25;
    return Math.max(0, Math.min(quarterKelly * bankroll, bankroll * 0.1)); // Max 10% of bankroll
  };

  const runSimulation = async () => {
    if (valueBets.length === 0) {
      toast({
        title: "No data available",
        description: "No historical value bets found to simulate",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setSimulatedBets([]);

    // Filter value bets based on config - prioritize bets with real results
    let filteredBets = valueBets.filter(bet => {
      const edgeMatch = bet.edge >= config.minEdge && bet.edge <= config.maxEdge;
      const oddsMatch = bet.offered_odds >= config.minOdds && bet.offered_odds <= config.maxOdds;
      const confidenceMatch = config.confidenceLevel === 'all' || bet.confidence === config.confidenceLevel;
      return edgeMatch && oddsMatch && confidenceMatch;
    });

    // Separate bets with real results from pending ones
    const settledBets = filteredBets.filter(bet => bet.result === 'won' || bet.result === 'lost');
    const pendingBets = filteredBets.filter(bet => bet.result === 'pending' || !bet.result);

    if (filteredBets.length === 0) {
      toast({
        title: "No matching bets",
        description: "No value bets match your filter criteria. Try adjusting the filters.",
        variant: "destructive",
      });
      setIsRunning(false);
      return;
    }

    // Show info about data source
    if (settledBets.length === 0 && pendingBets.length > 0) {
      toast({
        title: "No settled bets yet",
        description: `All ${pendingBets.length} bets are still pending. Run 'Check Results' first to get real outcomes.`,
        variant: "default",
      });
    } else if (settledBets.length > 0) {
      toast({
        title: "Using real results",
        description: `${settledBets.length} bets with real outcomes, ${pendingBets.length} still pending.`,
        variant: "default",
      });
    }

    // Build simulation pool - prioritize settled bets, fill with pending if needed
    const betsNeeded = config.numberOfBets;
    let simulationPool: any[] = [];
    
    // First add all settled bets (real results)
    simulationPool = [...settledBets];
    
    // If we need more and have pending bets, we can't use them without results
    // Only use settled bets for accurate backtesting
    if (simulationPool.length === 0) {
      toast({
        title: "No settled bets",
        description: "Check results first to get actual match outcomes for backtesting.",
        variant: "destructive",
      });
      setIsRunning(false);
      return;
    }

    // Limit to requested number
    simulationPool = simulationPool.slice(0, betsNeeded);

    // Run simulation with REAL results (no randomness!)
    let bankroll = config.initialBankroll;
    let maxBankroll = bankroll;
    let maxDrawdown = 0;
    const results: SimulatedBet[] = [];
    let wins = 0;
    let totalStaked = 0;

    for (let i = 0; i < simulationPool.length; i++) {
      const bet = simulationPool[i];
      
      // Calculate stake based on strategy
      let stake: number;
      switch (config.stakingStrategy) {
        case 'kelly':
          stake = calculateKellyStake(bet.edge, bet.offered_odds, bankroll);
          break;
        case 'percentage':
          stake = bankroll * (config.bankrollPercentage / 100);
          break;
        case 'fixed':
        default:
          stake = config.fixedStake;
      }

      // Ensure we don't bet more than we have
      stake = Math.min(stake, bankroll);
      if (stake <= 0) break;

      // Use ACTUAL RESULT from database - no random!
      const isWin = bet.result === 'won';

      const profitLoss = isWin 
        ? stake * (bet.offered_odds - 1) 
        : -stake;

      bankroll += profitLoss;
      totalStaked += stake;

      if (isWin) wins++;

      // Track max drawdown
      if (bankroll > maxBankroll) {
        maxBankroll = bankroll;
      }
      const currentDrawdown = ((maxBankroll - bankroll) / maxBankroll) * 100;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }

      const match = bet.matches 
        ? `${bet.matches.home_team} vs ${bet.matches.away_team}`
        : `Match ${i + 1}`;

      results.push({
        id: `sim-${i}`,
        selection: bet.selection,
        match,
        odds: bet.offered_odds,
        edge: bet.edge,
        confidence: bet.confidence,
        stake,
        result: isWin ? 'won' : 'lost',
        profitLoss,
        runningBankroll: bankroll,
        actualProbability: bet.actual_probability,
      });

      // Update progress
      setProgress(Math.round(((i + 1) / simulationPool.length) * 100));

      // Small delay for visual effect
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    const totalProfit = bankroll - config.initialBankroll;
    const avgOdds = results.reduce((sum, b) => sum + b.odds, 0) / results.length;
    const avgEdge = results.reduce((sum, b) => sum + b.edge, 0) / results.length;

    setSimulatedBets(results);
    setStats({
      totalBets: results.length,
      wins,
      losses: results.length - wins,
      winRate: (wins / results.length) * 100,
      totalStaked,
      totalProfit,
      roi: (totalProfit / totalStaked) * 100,
      maxDrawdown,
      finalBankroll: bankroll,
      avgOdds,
      avgEdge,
    });

    setIsRunning(false);
    setProgress(100);

    toast({
      title: "Simulation complete",
      description: `Ran ${results.length} bets with REAL results. ${totalProfit >= 0 ? 'Profit' : 'Loss'}: $${Math.abs(totalProfit).toFixed(2)}`,
    });
  };

  const resetSimulation = () => {
    setSimulatedBets([]);
    setStats(null);
    setProgress(0);
  };

  return (
    <>
      <Helmet>
        <title>Betting Simulation | FAVYBET PRO</title>
        <meta name="description" content="Backtest your betting strategies with historical data. Run hundreds of simulated bets to validate profitability." />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Betting Simulation</h1>
              <p className="text-muted-foreground">
                Backtest strategies using {valueBets.length} historical value bets
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Controls Panel */}
            <div className="lg:col-span-1">
              <SimulationControls
                config={config}
                setConfig={setConfig}
                onRun={runSimulation}
                onReset={resetSimulation}
                onCheckResults={checkResults}
                onFetchHistorical={fetchHistorical}
                isRunning={isRunning}
                isCheckingResults={isCheckingResults}
                isFetchingHistorical={isFetchingHistorical}
                progress={progress}
                availableBets={valueBets.length}
                settledBets={settledBets}
              />
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-2 space-y-6">
              <SimulationResults
                stats={stats}
                simulatedBets={simulatedBets}
                initialBankroll={config.initialBankroll}
              />
            </div>
          </div>

          {/* Bets Table */}
          {simulatedBets.length > 0 && (
            <SimulatedBetsTable bets={simulatedBets} />
          )}
        </main>
      </div>
    </>
  );
}
