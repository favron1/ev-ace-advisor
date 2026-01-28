import { TrendingUp, Activity, Clock, Target, Database, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { SignalOpportunity, SignalLog } from '@/types/arbitrage';
import type { OvernightStats } from '@/hooks/useOvernightStats';

interface StatsBarProps {
  signals: SignalOpportunity[];
  logs: SignalLog[];
  overnightStats?: OvernightStats;
}

export function StatsBar({ signals, logs, overnightStats }: StatsBarProps) {
  const activeSignals = signals.length;
  const avgEdge = signals.length > 0 
    ? signals.reduce((sum, s) => sum + s.edge_percent, 0) / signals.length 
    : 0;
  const criticalCount = signals.filter(s => s.urgency === 'critical' || s.urgency === 'high').length;
  
  // Calculate win rate from logs
  const settledLogs = logs.filter(l => l.outcome && l.outcome !== 'pending');
  const wins = settledLogs.filter(l => l.outcome === 'win').length;
  const winRate = settledLogs.length > 0 ? (wins / settledLogs.length) * 100 : 0;

  // Format last snapshot time
  const formatLastSnapshot = () => {
    if (!overnightStats?.lastSnapshotAt) return '--';
    const diff = Date.now() - overnightStats.lastSnapshotAt.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  const stats = [
    { 
      label: 'Active Signals', 
      value: activeSignals.toString(),
      icon: Activity,
      color: 'text-primary'
    },
    { 
      label: '24h Snapshots', 
      value: overnightStats?.totalSnapshots24h.toLocaleString() || '--',
      subtext: `${overnightStats?.eventsMonitored || 0} events`,
      icon: Database,
      color: 'text-blue-500'
    },
    { 
      label: 'Max Movement', 
      value: overnightStats ? `${overnightStats.maxMovementPct.toFixed(1)}%` : '--',
      subtext: formatLastSnapshot(),
      icon: Zap,
      color: (overnightStats?.maxMovementPct || 0) >= 4 ? 'text-green-500' : 'text-muted-foreground'
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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            {'subtext' in stat && stat.subtext && (
              <p className="text-xs text-muted-foreground mt-0.5">{stat.subtext}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
