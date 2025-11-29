import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { DailyBetsTable } from "@/components/daily-bets/DailyBetsTable";
import { DailyBetsSummary } from "@/components/daily-bets/DailyBetsSummary";
import { DailyBetsFilters } from "@/components/daily-bets/DailyBetsFilters";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AnalyzedBet {
  id: string;
  event: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  market: string;
  offeredOdds: number;
  fairOdds: number;
  impliedProbability: number;
  actualProbability: number;
  expectedValue: number;
  edge: number;
  confidence: "high" | "moderate" | "low";
  suggestedStakePercent: number;
  kellyStake: number;
  reasoning: string;
  meetsCriteria: boolean;
  minOdds: number;
  sport: string;
  commenceTime: string;
  bookmaker: string;
}

export interface BetsSummary {
  totalBets: number;
  highConfidence: number;
  moderateConfidence: number;
  lowConfidence: number;
  avgEdge: number;
  avgEV: number;
  totalSuggestedStake: number;
  timestamp: string;
}

const DailyBets = () => {
  const [bets, setBets] = useState<AnalyzedBet[]>([]);
  const [summary, setSummary] = useState<BetsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("ev");
  const [timeFrame, setTimeFrame] = useState<string>("24");
  const { toast } = useToast();

  const fetchAnalyzedBets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-value-bets');

      if (error) {
        console.error('Error fetching analyzed bets:', error);
        toast({
          title: "Error fetching bets",
          description: error.message || "Failed to analyze value bets",
          variant: "destructive",
        });
        return;
      }

      if (data?.bets) {
        setBets(data.bets);
        setSummary(data.summary);
        setLastUpdated(new Date());
        toast({
          title: "Analysis Complete",
          description: `Found ${data.bets.length} value betting opportunities`,
        });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Error",
        description: "Failed to connect to analysis service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyzedBets();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchAnalyzedBets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort bets
  const filteredBets = bets
    .filter(bet => {
      // Time frame filter
      const now = new Date();
      const betTime = new Date(bet.commenceTime);
      const hoursUntilMatch = (betTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const maxHours = parseInt(timeFrame);
      if (hoursUntilMatch < 0 || hoursUntilMatch > maxHours) return false;
      
      if (confidenceFilter !== "all" && bet.confidence !== confidenceFilter) return false;
      if (marketFilter !== "all" && bet.market !== marketFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "ev":
          return b.expectedValue - a.expectedValue;
        case "edge":
          return b.edge - a.edge;
        case "odds":
          return b.offeredOdds - a.offeredOdds;
        case "stake":
          return b.suggestedStakePercent - a.suggestedStakePercent;
        case "time":
          return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
        default:
          return 0;
      }
    });

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      "Match",
      "Market",
      "Selection",
      "Expected Value",
      "Edge %",
      "Offered Odds",
      "Fair Odds",
      "Implied Prob %",
      "Actual Prob %",
      "Confidence",
      "Suggested Stake %",
      "Kelly Stake %",
      "Bookmaker",
      "Kick-off",
      "Reasoning"
    ];

    const rows = filteredBets.map(bet => [
      bet.event,
      bet.market,
      bet.selection,
      (bet.expectedValue * 100).toFixed(2),
      bet.edge.toFixed(2),
      bet.offeredOdds.toFixed(2),
      bet.fairOdds.toFixed(2),
      (bet.impliedProbability * 100).toFixed(1),
      (bet.actualProbability * 100).toFixed(1),
      bet.confidence,
      bet.suggestedStakePercent.toFixed(1),
      bet.kellyStake.toFixed(2),
      bet.bookmaker,
      new Date(bet.commenceTime).toLocaleString(),
      `"${bet.reasoning}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `best-bets-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Complete",
      description: `Exported ${filteredBets.length} bets to CSV`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Daily Best Bets</h1>
                <p className="text-sm text-muted-foreground">
                  {lastUpdated 
                    ? `Auto-analyzed • Last updated ${lastUpdated.toLocaleTimeString()}`
                    : 'AI-powered value bet analysis with expert strategies'
                  }
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={loading || filteredBets.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={fetchAnalyzedBets}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {loading ? 'Analyzing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && <DailyBetsSummary summary={summary} />}

        {/* Filters */}
        <DailyBetsFilters
          confidenceFilter={confidenceFilter}
          setConfidenceFilter={setConfidenceFilter}
          marketFilter={marketFilter}
          setMarketFilter={setMarketFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          timeFrame={timeFrame}
          setTimeFrame={setTimeFrame}
        />

        {/* Main Table */}
        {loading && bets.length === 0 ? (
          <div className="stat-card flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary" />
            <p className="font-medium text-lg">Analyzing Markets...</p>
            <p className="text-sm">Scanning odds from multiple bookmakers and calculating value</p>
          </div>
        ) : (
          <DailyBetsTable bets={filteredBets} />
        )}
      </main>
    </div>
  );
};

export default DailyBets;
