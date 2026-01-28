import { TrendingUp, Activity, Clock, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { SignalOpportunity, SignalLog } from '@/types/arbitrage';

interface StatsBarProps {
  signals: SignalOpportunity[];
  logs: SignalLog[];
}

export function StatsBar({ signals, logs }: StatsBarProps) {
  const activeSignals = signals.length;
  const avgEdge = signals.length > 0 
    ? signals.reduce((sum, s) => sum + s.edge_percent, 0) / signals.length 
    : 0;
  const criticalCount = signals.filter(s => s.urgency === 'critical' || s.urgency === 'high').length;
  
  // Calculate win rate from logs
  const settledLogs = logs.filter(l => l.outcome && l.outcome !== 'pending');
  const wins = settledLogs.filter(l => l.outcome === 'win').length;
  const winRate = settledLogs.length > 0 ? (wins / settledLogs.length) * 100 : 0;

  const stats = [
    { 
      label: 'Active Signals', 
      value: activeSignals.toString(),
      icon: Activity,
      color: 'text-primary'
    },
    { 
      label: 'Avg Edge', 
      value: `+${avgEdge.toFixed(1)}%`,
      icon: TrendingUp,
      color: avgEdge >= 5 ? 'text-green-500' : 'text-foreground'
    },
    { 
      label: 'Urgent', 
      value: criticalCount.toString(),
      icon: Clock,
      color: criticalCount > 0 ? 'text-orange-500' : 'text-muted-foreground'
    },
    { 
      label: 'Win Rate', 
      value: settledLogs.length > 0 ? `${winRate.toFixed(0)}%` : '--',
      icon: Target,
      color: winRate >= 50 ? 'text-green-500' : 'text-muted-foreground'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(stat => (
        <Card key={stat.label} className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <span className={`text-2xl font-bold font-mono ${stat.color}`}>
              {stat.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
