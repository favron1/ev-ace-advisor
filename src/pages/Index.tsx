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
  const { slipBets, totalStake, potentialReturn } = useBetSlip();
  
  // Calculate stats from bet slips (currently all pending, so profit-related stats are 0)
  const totalProfit = 0; // No settled bets yet
  const winRate = 0; // No settled bets yet
  const roi = 0; // No settled bets yet
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
              value={`$${totalProfit.toFixed(2)}`}
              change={slipBets.length > 0 ? `${slipBets.length} pending bet${slipBets.length !== 1 ? 's' : ''}` : "No bets placed"}
              changeType="neutral"
              icon={DollarSign}
            />
            <StatCard
              title="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              change="No settled bets yet"
              changeType="neutral"
              icon={Target}
            />
            <StatCard
              title="ROI"
              value={`${roi.toFixed(1)}%`}
              change="No settled bets yet"
              changeType="neutral"
              icon={TrendingUp}
            />
            <StatCard
              title="Avg Edge"
              value={`${avgEdge.toFixed(1)}%`}
              change={slipBets.length > 0 ? `From ${slipBets.length} selection${slipBets.length !== 1 ? 's' : ''}` : "Add bets to calculate"}
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
