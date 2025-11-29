import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

const mockData = [
  { date: "Jan", profit: 0, bets: 12 },
  { date: "Feb", profit: 450, bets: 18 },
  { date: "Mar", profit: 280, bets: 15 },
  { date: "Apr", profit: 890, bets: 22 },
  { date: "May", profit: 1250, bets: 28 },
  { date: "Jun", profit: 980, bets: 20 },
  { date: "Jul", profit: 1680, bets: 25 },
  { date: "Aug", profit: 2100, bets: 30 },
  { date: "Sep", profit: 1950, bets: 24 },
  { date: "Oct", profit: 2650, bets: 32 },
  { date: "Nov", profit: 3200, bets: 35 },
  { date: "Dec", profit: 3850, bets: 38 },
];

export function PerformanceChart() {
  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-profit/10 p-2">
            <TrendingUp className="h-5 w-5 text-profit" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Performance</h3>
            <p className="text-sm text-muted-foreground">Cumulative Profit Over Time</p>
          </div>
        </div>
        <div className="text-right">
          <p className="data-display text-profit">+$3,850</p>
          <p className="text-sm text-muted-foreground">YTD Profit</p>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mockData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 17%)" />
            <XAxis 
              dataKey="date" 
              stroke="hsl(215, 20%, 55%)" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="hsl(215, 20%, 55%)" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "hsl(222, 47%, 8%)", 
                border: "1px solid hsl(217, 33%, 17%)",
                borderRadius: "8px",
                color: "hsl(210, 40%, 98%)"
              }}
              formatter={(value: number) => [`$${value}`, "Profit"]}
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth={2}
              fill="url(#profitGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
