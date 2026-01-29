import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSignalStats } from '@/hooks/useSignalStats';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';

const COLORS = ['#22c55e', '#ef4444', '#eab308', '#6b7280'];

export function StatsCharts() {
  const { cumulativePL, dailyStats, overallStats, logs } = useSignalStats();

  // Prepare pie chart data for win/loss distribution
  const outcomeData = [
    { name: 'Wins', value: overallStats.wins, color: '#22c55e' },
    { name: 'Losses', value: overallStats.losses, color: '#ef4444' },
    { name: 'Pending', value: logs.filter(l => !l.outcome || l.outcome === 'pending').length, color: '#eab308' },
    { name: 'Void', value: logs.filter(l => l.outcome === 'void').length, color: '#6b7280' },
  ].filter(d => d.value > 0);

  // Edge distribution histogram
  const edgeBuckets = [
    { range: '2-5%', count: 0 },
    { range: '5-10%', count: 0 },
    { range: '10-15%', count: 0 },
    { range: '15-20%', count: 0 },
    { range: '20%+', count: 0 },
  ];

  logs.forEach(log => {
    const edge = log.edge_at_signal;
    if (edge < 5) edgeBuckets[0].count++;
    else if (edge < 10) edgeBuckets[1].count++;
    else if (edge < 15) edgeBuckets[2].count++;
    else if (edge < 20) edgeBuckets[3].count++;
    else edgeBuckets[4].count++;
  });

  const formatAxisDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MM/dd');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Cumulative P/L Chart */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Cumulative P/L</CardTitle>
        </CardHeader>
        <CardContent>
          {cumulativePL.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cumulativePL}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatAxisDate}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'P/L']}
                />
                <Line 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Daily P/L Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily P/L</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyStats.slice(0, 14).reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatAxisDate}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'P/L']}
                />
                <Bar 
                  dataKey="profit_loss" 
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Win/Loss Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Outcome Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {outcomeData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={outcomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {outcomeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Edge Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Edge Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={edgeBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="range"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [value, 'Bets']}
                />
                <Bar 
                  dataKey="count" 
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Stake Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily Stakes</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyStats.slice(0, 14).reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatAxisDate}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Staked']}
                />
                <Bar 
                  dataKey="total_staked" 
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
