import { Trophy, Dog, TrendingUp, Target } from "lucide-react";
import type { RacingValueBet } from "@/types/racing";

interface RacingSummaryProps {
  bets: RacingValueBet[];
}

export function RacingSummary({ bets }: RacingSummaryProps) {
  const horseBets = bets.filter(b => b.raceType === 'horse');
  const greyhoundBets = bets.filter(b => b.raceType === 'greyhound');
  const highConfidence = bets.filter(b => b.confidence === 'high');
  const avgEdge = bets.length > 0 
    ? bets.reduce((sum, b) => sum + b.edge, 0) / bets.length 
    : 0;

  const stats = [
    {
      label: "Total Value Bets",
      value: bets.length,
      icon: Target,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Horse Racing",
      value: horseBets.length,
      icon: Trophy,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Greyhound Racing",
      value: greyhoundBets.length,
      icon: Dog,
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
    },
    {
      label: "High Confidence",
      value: highConfidence.length,
      icon: TrendingUp,
      color: "text-profit",
      bgColor: "bg-profit/10",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="stat-card">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg ${stat.bgColor} p-2.5`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
