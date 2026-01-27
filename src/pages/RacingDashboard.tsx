import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RacingValueBetsTable } from "@/components/racing/RacingValueBetsTable";
import { RacingFilters } from "@/components/racing/RacingFilters";
import { RacingSummary } from "@/components/racing/RacingSummary";
import { RacingNextToJump } from "@/components/racing/RacingNextToJump";
import { useRacingEngine } from "@/hooks/useRacingEngine";
import { Loader2, RefreshCw, Trophy, Download, AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RacingBestBet } from "@/types/racing";
import type { RacingRecommendation } from "@/types/racing-engine";

// Convert RacingRecommendation to RacingBestBet format for existing components
function convertToLegacyFormat(rec: RacingRecommendation): RacingBestBet {
  return {
    raceId: rec.raceId,
    match: `${rec.track} R${rec.raceNumber} - ${new Date(rec.startTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`,
    runner: rec.runnerName,
    runnerNumber: rec.runnerNumber,
    trapOrBarrier: rec.barrier,
    jockey: undefined,
    trainer: undefined,
    market: 'Win',
    sport: rec.sport,
    track: rec.track,
    raceNumber: rec.raceNumber,
    raceTime: new Date(rec.startTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
    distanceM: rec.distance,
    trackCondition: rec.trackCondition || 'Good',
    weather: 'Fine',
    raceType: rec.sport === 'horse' ? 'Flat' : 'Sprint',
    recentForm: rec.recentForm,
    earlySpeed: undefined,
    runningStyle: rec.runStyle || undefined,
    daysSinceLastRun: undefined,
    surfacePref: undefined,
    classLastRace: undefined,
    ev: rec.ev,
    meetsCriteria: true,
    minOdds: 1.5,
    offeredOdds: rec.bestOdds,
    actualProbability: rec.modelProbability,
    impliedProbability: rec.impliedProbability,
    fairOdds: rec.fairOdds,
    edge: rec.edgePercent,
    confidence: rec.confidence >= 80 ? 'High' : rec.confidence >= 65 ? 'Moderate' : 'Low',
    suggestedBetPercent: `${rec.stakeUnits}u`,
    reasoning: rec.reasoning,
  };
}

export default function RacingDashboard() {
  const {
    recommendations,
    loading,
    fetchRecommendations,
    getSortedRecommendations,
    getSummaryStats,
    isDemo,
    betfairStatus,
    engineVersion,
    response,
  } = useRacingEngine({
    racingTypes: ['horse', 'greyhound'],
    regions: ['aus'],
    hoursAhead: 12,
    includeDemoData: true,
  });

  // Filters
  const [raceTypeFilter, setRaceTypeFilter] = useState<'all' | 'horse' | 'greyhound'>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'Low' | 'Moderate' | 'High'>('all');
  const [sortBy, setSortBy] = useState<'ev' | 'edge' | 'odds' | 'time'>('ev');

  useEffect(() => {
    fetchRecommendations();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchRecommendations, 300000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort recommendations
  const filteredRecs = recommendations
    .filter(rec => raceTypeFilter === 'all' || rec.sport === raceTypeFilter)
    .filter(rec => {
      if (confidenceFilter === 'all') return true;
      if (confidenceFilter === 'High') return rec.confidence >= 80;
      if (confidenceFilter === 'Moderate') return rec.confidence >= 65;
      return true;
    });

  const sortedRecs = getSortedRecommendations(sortBy, filteredRecs);
  
  // Convert to legacy format for existing components
  const legacyBets: RacingBestBet[] = sortedRecs.map(convertToLegacyFormat);
  const allLegacyBets: RacingBestBet[] = recommendations.map(convertToLegacyFormat);

  const stats = getSummaryStats();

  const exportToCSV = () => {
    const headers = ['Match', 'Runner', 'Type', 'Odds', 'EV %', 'Edge %', 'Confidence', 'Stake', 'Time', 'Angles', 'Reasoning'];
    const rows = sortedRecs.map(rec => [
      `${rec.track} R${rec.raceNumber}`,
      `${rec.runnerNumber}. ${rec.runnerName}`,
      rec.sport,
      rec.bestOdds,
      `${rec.evPercent.toFixed(1)}%`,
      `${rec.edgePercent.toFixed(1)}%`,
      rec.confidence,
      `${rec.stakeUnits}u`,
      new Date(rec.startTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
      rec.angles.join(', '),
      `"${rec.reasoning}"`,
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
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">Racing Engine v2</h1>
                {isDemo && (
                  <Badge variant="outline" className="text-warning border-warning">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Demo Data
                  </Badge>
                )}
                {betfairStatus === 'ready_to_integrate' && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Zap className="h-3 w-3 mr-1" />
                    Betfair Ready
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {response 
                  ? `${response.races_analyzed} races analyzed • ${recommendations.length} value bets • ${engineVersion}`
                  : 'Loading racing data...'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={sortedRecs.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRecommendations()}
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

        {/* Demo Data Warning */}
        {isDemo && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-warning">Demo Mode Active</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  No live racing data available. Using simulated data to demonstrate the model. 
                  To get live data, integrate a racing data provider (Racing.com, TAB, or Punting Form API).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <RacingSummary bets={allLegacyBets} />

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
            <RacingNextToJump bets={allLegacyBets} />

            {/* Engine Stats Card */}
            <div className="stat-card">
              <h3 className="font-semibold text-foreground mb-3">Model Performance</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg EV</span>
                  <span className="font-medium text-profit">+{stats.avgEv.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Edge</span>
                  <span className="font-medium">{stats.avgEdge.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Confidence</span>
                  <span className="font-medium">{stats.avgConfidence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Stake</span>
                  <span className="font-medium">{stats.totalStakeUnits.toFixed(2)}u</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>🐎 {stats.byType.horse}</span>
                    <span>🐕 {stats.byType.greyhound}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Table */}
          <div className="stat-card">
            {loading && recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Analyzing racing markets...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Running probability model with {response?.model_version || 'ML'} engine
                </p>
              </div>
            ) : legacyBets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Trophy className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No value bets found matching criteria</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Try adjusting filters or check back later
                </p>
              </div>
            ) : (
              <RacingValueBetsTable bets={legacyBets} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
