import { Card } from "@/components/ui/card";
import { TrendingUp, Target, Percent, DollarSign, Zap, BarChart3 } from "lucide-react";
import type { BetsSummary } from "@/pages/DailyBets";

interface DailyBetsSummaryProps {
  summary: BetsSummary;
}

export function DailyBetsSummary({ summary }: DailyBetsSummaryProps) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Bets</p>
            <p className="text-xl font-bold text-foreground">{summary.totalBets}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-profit/10">
            <Zap className="h-4 w-4 text-profit" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">High Conf.</p>
            <p className="text-xl font-bold text-profit">{summary.highConfidence}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10">
            <BarChart3 className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Moderate</p>
            <p className="text-xl font-bold text-warning">{summary.moderateConfidence}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Edge</p>
            <p className="text-xl font-bold text-foreground">{summary.avgEdge.toFixed(1)}%</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-profit/10">
            <Percent className="h-4 w-4 text-profit" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg EV</p>
            <p className="text-xl font-bold text-profit">+{(summary.avgEV * 100).toFixed(1)}%</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Stake</p>
            <p className="text-xl font-bold text-foreground">{summary.totalSuggestedStake.toFixed(1)}%</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
