import { DollarSign, TrendingUp, Target, Percent } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { EVCalculator } from "@/components/dashboard/EVCalculator";
import { KellyCalculator } from "@/components/dashboard/KellyCalculator";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { BestBetsTable } from "@/components/dashboard/BestBetsTable";
import { MatchAnalyzer } from "@/components/dashboard/MatchAnalyzer";
import { BetHistory } from "@/components/dashboard/BetHistory";
import { useBetSlip } from "@/contexts/BetSlipContext";

const Index = () => {
  const { slipBets, draftBets, settledBets, totalProfit, winCount, totalStake } = useBetSlip();
  
  // Calculate stats from settled bets
  const winRate = settledBets.length > 0 ? (winCount / settledBets.length * 100) : 0;
  const totalStaked = settledBets.reduce((sum, b) => sum + b.stake, 0);
  const roi = totalStaked > 0 ? (totalProfit / totalStaked * 100) : 0;
  const avgEdge = slipBets.length > 0 
    ? (slipBets.reduce((sum, b) => sum + ((b.odds - 1) / b.odds * 100), 0) / slipBets.length)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 space-y-8">
        {/* Stats Overview */}
        <section>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Profit"
              value={`${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`}
              change={settledBets.length > 0 ? `${settledBets.length} settled bet${settledBets.length !== 1 ? 's' : ''}` : "No settled bets"}
              changeType={totalProfit > 0 ? "profit" : totalProfit < 0 ? "loss" : "neutral"}
              icon={DollarSign}
            />
            <StatCard
              title="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              change={settledBets.length > 0 ? `${winCount}W - ${settledBets.length - winCount}L` : "No settled bets"}
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

        {/* AI Analyzer & Performance */}
        <section id="analyzer" className="grid gap-6 lg:grid-cols-2">
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
