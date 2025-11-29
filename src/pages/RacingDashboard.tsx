import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RacingValueBetsTable } from "@/components/racing/RacingValueBetsTable";
import { RacingFilters } from "@/components/racing/RacingFilters";
import { RacingSummary } from "@/components/racing/RacingSummary";
import { RacingNextToJump } from "@/components/racing/RacingNextToJump";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Trophy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RacingBestBet } from "@/types/racing";

export default function RacingDashboard() {
  const [bestBets, setBestBets] = useState<RacingBestBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  // Filters
  const [raceTypeFilter, setRaceTypeFilter] = useState<'all' | 'horse' | 'greyhound'>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'Low' | 'Moderate' | 'High'>('all');
  const [sortBy, setSortBy] = useState<'ev' | 'edge' | 'odds' | 'time'>('ev');

  const fetchRacingBets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-racing-bets');
      
      if (error) {
        console.error('Error fetching racing bets:', error);
        toast({
          title: "Error",
          description: "Failed to fetch racing analysis",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setBestBets(data.bestBets || []);
        setLastUpdated(new Date());
        toast({
          title: "Updated",
          description: `Found ${data.bestBets?.length || 0} value bets across ${data.totalRacesAnalyzed || 0} races`,
        });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Error",
        description: "Failed to connect to racing service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRacingBets();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchRacingBets, 300000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort bets
  const filteredBets = bestBets
    .filter(bet => raceTypeFilter === 'all' || bet.sport === raceTypeFilter)
    .filter(bet => {
      if (confidenceFilter === 'all') return true;
      if (confidenceFilter === 'High') return bet.confidence === 'High';
      if (confidenceFilter === 'Moderate') return bet.confidence === 'High' || bet.confidence === 'Moderate';
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'ev': return b.ev - a.ev;
        case 'edge': return b.edge - a.edge;
        case 'odds': return a.offeredOdds - b.offeredOdds;
        case 'time': return a.raceTime.localeCompare(b.raceTime);
        default: return 0;
      }
    });

  const exportToCSV = () => {
    const headers = ['Match', 'Runner', 'Type', 'Odds', 'EV', 'Edge %', 'Confidence', 'Stake', 'Time', 'Reasoning'];
    const rows = filteredBets.map(bet => [
      bet.match,
      `${bet.runnerNumber}. ${bet.runner}`,
      bet.sport,
      bet.offeredOdds,
      (bet.ev * 100).toFixed(0) + '%',
      bet.edge.toFixed(1) + '%',
      bet.confidence,
      bet.suggestedBetPercent,
      bet.raceTime,
      `"${bet.reasoning}"`,
    ]);
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `racing-best-bets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-3">
              <Trophy className="h-6 w-6 text-warning" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Racing Best Bets</h1>
              <p className="text-sm text-muted-foreground">
                {lastUpdated 
                  ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
                  : 'Loading racing data...'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={filteredBets.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRacingBets}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <RacingSummary bets={bestBets} />

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Sidebar */}
          <div className="space-y-6">
            {/* Filters */}
            <RacingFilters
              raceTypeFilter={raceTypeFilter}
              setRaceTypeFilter={setRaceTypeFilter}
              confidenceFilter={confidenceFilter}
              setConfidenceFilter={setConfidenceFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />
            
            {/* Next to Jump */}
            <RacingNextToJump bets={bestBets} />
          </div>

          {/* Main Table */}
          <div className="stat-card">
            {loading && bestBets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Analyzing racing markets...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Calculating probabilities, form analysis, and value metrics
                </p>
              </div>
            ) : filteredBets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Trophy className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No value bets found matching criteria</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Try adjusting filters or check back later
                </p>
              </div>
            ) : (
              <RacingValueBetsTable bets={filteredBets} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
