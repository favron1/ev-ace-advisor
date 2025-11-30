import { useState } from "react";
import { DollarSign, TrendingUp, Target, Percent, RotateCcw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { EVCalculator } from "@/components/dashboard/EVCalculator";
import { KellyCalculator } from "@/components/dashboard/KellyCalculator";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { BestBetsTable } from "@/components/dashboard/BestBetsTable";
import { MatchAnalyzer } from "@/components/dashboard/MatchAnalyzer";
import { BetHistory } from "@/components/dashboard/BetHistory";
import { LiveScores } from "@/components/dashboard/LiveScores";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useBettingStats } from "@/hooks/useBettingStats";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Index = () => {
  const { slipBets, draftBets } = useBetSlip();
  const { stats, resetStats, isResetting, fetchStats } = useBettingStats();
  const [showResetDialog, setShowResetDialog] = useState(false);
  
  // Use database stats for all-time metrics
  const { totalProfit, winRate, roi, wins, losses, totalStaked, totalBets, pending } = stats;
  
  // Calculate avg edge from current slip bets
  const avgEdge = slipBets.length > 0 
    ? (slipBets.reduce((sum, b) => sum + ((b.odds - 1) / b.odds * 100), 0) / slipBets.length)
    : 0;

  const handleReset = async () => {
    const success = await resetStats();
    if (success) {
      setShowResetDialog(false);
      // Refresh the page to clear bet slip context too
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 space-y-8">
        {/* Stats Overview */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Performance Overview</h2>
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset Stats
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset All Stats?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your betting history and reset all metrics to 0. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleReset}
                    disabled={isResetting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isResetting ? "Resetting..." : "Reset Everything"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Profit"
              value={`${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`}
              change={totalBets > 0 ? `${wins + losses} settled • ${pending} pending` : "No bets yet"}
              changeType={totalProfit > 0 ? "profit" : totalProfit < 0 ? "loss" : "neutral"}
              icon={DollarSign}
            />
            <StatCard
              title="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              change={(wins + losses) > 0 ? `${wins}W - ${losses}L` : "No settled bets"}
              changeType={winRate >= 50 ? "profit" : winRate > 0 ? "loss" : "neutral"}
              icon={Target}
            />
            <StatCard
              title="ROI"
              value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`}
              change={totalStaked > 0 ? `On $${totalStaked.toFixed(0)} staked` : "No settled bets"}
              changeType={roi > 0 ? "profit" : roi < 0 ? "loss" : "neutral"}
              icon={TrendingUp}
            />
            <StatCard
              title="Avg Edge"
              value={`${avgEdge.toFixed(1)}%`}
              change={draftBets.length > 0 ? `${draftBets.length} draft bet${draftBets.length !== 1 ? 's' : ''}` : "Add bets to calculate"}
              changeType={avgEdge > 0 ? "profit" : "neutral"}
              icon={Percent}
            />
          </div>
        </section>

        {/* Best Bets Table */}
        <section id="best-bets">
          <BestBetsTable />
        </section>

        {/* Live Scores & AI Analyzer */}
        <section id="analyzer" className="grid gap-6 lg:grid-cols-3">
          <LiveScores />
          <MatchAnalyzer />
          <PerformanceChart />
        </section>

        {/* Calculators & History */}
        <section className="grid gap-6 lg:grid-cols-3">
          <EVCalculator />
          <KellyCalculator />
          <BetHistory />
        </section>
      </main>
    </div>
  );
};

export default Index;
