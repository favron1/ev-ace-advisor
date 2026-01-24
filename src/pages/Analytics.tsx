import { Header } from "@/components/layout/Header";
import { useAnalytics } from "@/hooks/useAnalytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, TrendingDown, Target, Percent, DollarSign, 
  BarChart3, RefreshCw, Trophy, XCircle, Clock, Activity
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ['hsl(var(--profit))', 'hsl(var(--loss))', 'hsl(var(--primary))', 'hsl(var(--muted))'];

export default function Analytics() {
  const { stats, dailyPerformance, leaguePerformance, loading, error, refresh } = useAnalytics();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-center text-destructive">{error}</p>
              <div className="flex justify-center mt-4">
                <Button variant="outline" onClick={refresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">No betting data available yet.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const pieData = [
    { name: 'Wins', value: stats.wins },
    { name: 'Losses', value: stats.losses },
    { name: 'Pending', value: stats.pendingBets },
  ].filter(d => d.value > 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-primary" />
              Betting Analytics
            </h1>
            <p className="text-muted-foreground mt-1">Track your performance and identify patterns</p>
          </div>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard
            label="Total P/L"
            value={`${stats.totalProfitLoss >= 0 ? '+' : ''}${stats.totalProfitLoss.toFixed(2)}u`}
            icon={stats.totalProfitLoss >= 0 ? TrendingUp : TrendingDown}
            variant={stats.totalProfitLoss >= 0 ? 'profit' : 'loss'}
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            icon={Percent}
            variant={stats.winRate >= 50 ? 'profit' : 'neutral'}
          />
          <StatCard
            label="ROI"
            value={`${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`}
            icon={DollarSign}
            variant={stats.roi >= 0 ? 'profit' : 'loss'}
          />
          <StatCard
            label="Total Bets"
            value={stats.totalBets.toString()}
            icon={Activity}
            variant="neutral"
          />
          <StatCard
            label="Record"
            value={`${stats.wins}W - ${stats.losses}L`}
            icon={Trophy}
            variant="neutral"
          />
          <StatCard
            label="Pending"
            value={stats.pendingBets.toString()}
            icon={Clock}
            variant="neutral"
          />
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Avg Edge"
            value={`${stats.avgEdge.toFixed(2)}%`}
            icon={Target}
            variant="neutral"
            size="sm"
          />
          <StatCard
            label="Avg Odds"
            value={stats.avgOdds.toFixed(2)}
            icon={BarChart3}
            variant="neutral"
            size="sm"
          />
          <StatCard
            label="Best Win"
            value={`+${stats.bestWin.toFixed(2)}u`}
            icon={Trophy}
            variant="profit"
            size="sm"
          />
          <StatCard
            label="Worst Loss"
            value={`${stats.worstLoss.toFixed(2)}u`}
            icon={XCircle}
            variant="loss"
            size="sm"
          />
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cumulative P/L Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Cumulative Profit/Loss</CardTitle>
              <CardDescription>Your bankroll progression over time</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyPerformance}>
                    <defs>
                      <linearGradient id="colorPL" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(value) => `${value}u`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      labelFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      formatter={(value: number) => [`${value.toFixed(2)}u`, 'Cumulative P/L']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cumulativePL" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorPL)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data to display yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Win/Loss Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bet Outcomes</CardTitle>
              <CardDescription>Distribution of results</CardDescription>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data to display yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily P/L Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Profit/Loss</CardTitle>
            <CardDescription>Performance breakdown by day</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(value) => `${value}u`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    labelFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    formatter={(value: number, name: string) => {
                      if (name === 'profitLoss') return [`${value.toFixed(2)}u`, 'P/L'];
                      return [value, name];
                    }}
                  />
                  <Bar 
                    dataKey="profitLoss" 
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data to display yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* League Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance by League</CardTitle>
            <CardDescription>See which leagues are most profitable</CardDescription>
          </CardHeader>
          <CardContent>
            {leaguePerformance.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">League</th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground">Bets</th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground">Record</th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground">Win Rate</th>
                      <th className="text-right py-3 px-2 font-medium text-muted-foreground">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaguePerformance.map((league) => (
                      <tr key={league.league} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-3 px-2 font-medium">{league.league}</td>
                        <td className="py-3 px-2 text-center text-muted-foreground">{league.bets}</td>
                        <td className="py-3 px-2 text-center">
                          <span className="text-profit">{league.wins}W</span>
                          {' - '}
                          <span className="text-loss">{league.losses}L</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={league.winRate >= 50 ? 'text-profit' : 'text-loss'}>
                            {league.winRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`py-3 px-2 text-right font-mono font-medium ${
                          league.profitLoss >= 0 ? 'text-profit' : 'text-loss'
                        }`}>
                          {league.profitLoss >= 0 ? '+' : ''}{league.profitLoss.toFixed(2)}u
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                No league data to display yet
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  variant: 'profit' | 'loss' | 'neutral';
  size?: 'sm' | 'default';
}

function StatCard({ label, value, icon: Icon, variant, size = 'default' }: StatCardProps) {
  const variantStyles = {
    profit: 'text-profit bg-profit/10 border-profit/20',
    loss: 'text-loss bg-loss/10 border-loss/20',
    neutral: 'text-foreground bg-muted/50 border-border',
  };

  const iconStyles = {
    profit: 'text-profit',
    loss: 'text-loss',
    neutral: 'text-primary',
  };

  return (
    <div className={`rounded-xl border p-4 ${variantStyles[variant]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${iconStyles[variant]}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`font-bold font-mono ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </p>
    </div>
  );
}
