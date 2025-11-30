import { TrendingUp, TrendingDown, Target, Percent, DollarSign, Activity, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { SimulationStats, SimulatedBet } from "@/pages/Simulation";

interface SimulationResultsProps {
  stats: SimulationStats | null;
  simulatedBets: SimulatedBet[];
  initialBankroll: number;
}

export function SimulationResults({ stats, simulatedBets, initialBankroll }: SimulationResultsProps) {
  if (!stats) {
    return (
      <div className="stat-card flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No Simulation Data</h3>
        <p className="text-muted-foreground max-w-md">
          Configure your simulation parameters and click "Run Simulation" to see how your betting strategy would perform.
        </p>
      </div>
    );
  }

  // Prepare chart data
  const chartData = simulatedBets.map((bet, index) => ({
    bet: index + 1,
    bankroll: bet.runningBankroll,
    profit: bet.runningBankroll - initialBankroll,
  }));

  const isProfitable = stats.totalProfit >= 0;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total P/L</span>
            {isProfitable ? (
              <TrendingUp className="h-4 w-4 text-profit" />
            ) : (
              <TrendingDown className="h-4 w-4 text-loss" />
            )}
          </div>
          <p className={cn(
            "text-2xl font-bold font-mono",
            isProfitable ? "text-profit" : "text-loss"
          )}>
            {isProfitable ? '+' : ''}${stats.totalProfit.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">
            Final: ${stats.finalBankroll.toFixed(2)}
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">ROI</span>
            <Percent className="h-4 w-4 text-primary" />
          </div>
          <p className={cn(
            "text-2xl font-bold font-mono",
            stats.roi >= 0 ? "text-profit" : "text-loss"
          )}>
            {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground">
            On ${stats.totalStaked.toFixed(2)} staked
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Win Rate</span>
            <Target className="h-4 w-4 text-primary" />
          </div>
          <p className={cn(
            "text-2xl font-bold font-mono",
            stats.winRate >= 50 ? "text-profit" : "text-foreground"
          )}>
            {stats.winRate.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.wins}W - {stats.losses}L
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Max Drawdown</span>
            <Activity className="h-4 w-4 text-loss" />
          </div>
          <p className={cn(
            "text-2xl font-bold font-mono",
            stats.maxDrawdown > 20 ? "text-loss" : "text-foreground"
          )}>
            -{stats.maxDrawdown.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            Peak to trough
          </p>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card py-3">
          <p className="text-xs text-muted-foreground mb-1">Total Bets</p>
          <p className="text-xl font-bold font-mono text-foreground">{stats.totalBets}</p>
        </div>
        <div className="stat-card py-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Odds</p>
          <p className="text-xl font-bold font-mono text-foreground">{stats.avgOdds.toFixed(2)}</p>
        </div>
        <div className="stat-card py-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Edge</p>
          <p className="text-xl font-bold font-mono text-primary">+{stats.avgEdge.toFixed(1)}%</p>
        </div>
      </div>

      {/* Bankroll Chart */}
      <div className="stat-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Bankroll Progression</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="bet" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Bankroll']}
                labelFormatter={(label) => `Bet #${label}`}
              />
              <ReferenceLine 
                y={initialBankroll} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                label={{ value: 'Start', position: 'right', fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="bankroll"
                stroke={isProfitable ? "hsl(var(--profit))" : "hsl(var(--loss))"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: isProfitable ? "hsl(var(--profit))" : "hsl(var(--loss))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
