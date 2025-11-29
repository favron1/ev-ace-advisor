import { DollarSign, TrendingUp, Target, Percent } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { EVCalculator } from "@/components/dashboard/EVCalculator";
import { KellyCalculator } from "@/components/dashboard/KellyCalculator";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { BestBetsTable } from "@/components/dashboard/BestBetsTable";
import { MatchAnalyzer } from "@/components/dashboard/MatchAnalyzer";
import { BetHistory } from "@/components/dashboard/BetHistory";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 space-y-8">
        {/* Stats Overview */}
        <section>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Profit"
              value="$3,850"
              change="+12.5% from last month"
              changeType="profit"
              icon={DollarSign}
            />
            <StatCard
              title="Win Rate"
              value="58.3%"
              change="+2.1% improvement"
              changeType="profit"
              icon={Target}
            />
            <StatCard
              title="ROI"
              value="8.7%"
              change="Above target of 5%"
              changeType="profit"
              icon={TrendingUp}
            />
            <StatCard
              title="Avg Edge"
              value="6.2%"
              change="Consistent edge maintained"
              changeType="neutral"
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
