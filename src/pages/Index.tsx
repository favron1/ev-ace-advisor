import { DollarSign, TrendingUp, Target, Percent } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { EVCalculator } from "@/components/dashboard/EVCalculator";
import { KellyCalculator } from "@/components/dashboard/KellyCalculator";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { ValueBetFinder } from "@/components/dashboard/ValueBetFinder";
import { BetHistory } from "@/components/dashboard/BetHistory";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
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

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Calculators */}
          <div className="space-y-6">
            <EVCalculator />
            <KellyCalculator />
          </div>

          {/* Middle Column - Chart & History */}
          <div className="lg:col-span-2 space-y-6">
            <PerformanceChart />
            <div className="grid gap-6 md:grid-cols-2">
              <BetHistory />
              <ValueBetFinder />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
