import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Bet {
  id: string;
  event: string;
  selection: string;
  odds: number;
  stake: number;
  status: "won" | "lost" | "pending";
  profit?: number;
  date: string;
}

const mockHistory: Bet[] = [
  { id: "1", event: "Lakers vs Celtics", selection: "Lakers ML", odds: 2.10, stake: 150, status: "won", profit: 165, date: "2024-01-15" },
  { id: "2", event: "Arsenal vs Chelsea", selection: "Over 2.5", odds: 1.85, stake: 200, status: "lost", profit: -200, date: "2024-01-14" },
  { id: "3", event: "Nadal vs Federer", selection: "Nadal -2.5", odds: 1.95, stake: 180, status: "won", profit: 171, date: "2024-01-13" },
  { id: "4", event: "Chiefs vs Bills", selection: "Under 48.5", odds: 1.90, stake: 220, status: "pending", date: "2024-01-16" },
  { id: "5", event: "Barcelona vs Real Madrid", selection: "BTTS", odds: 1.75, stake: 175, status: "won", profit: 131.25, date: "2024-01-12" },
];

export function BetHistory() {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "won": return <CheckCircle2 className="h-4 w-4 text-profit" />;
      case "lost": return <XCircle className="h-4 w-4 text-loss" />;
      case "pending": return <Clock className="h-4 w-4 text-warning animate-pulse" />;
      default: return null;
    }
  };

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Recent Bets</h3>
        <span className="text-sm text-muted-foreground">Last 5 bets</span>
      </div>

      <div className="space-y-2">
        {mockHistory.map((bet) => (
          <div
            key={bet.id}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(bet.status)}
              <div>
                <p className="text-sm font-medium text-foreground">{bet.selection}</p>
                <p className="text-xs text-muted-foreground">{bet.event}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-foreground">@{bet.odds.toFixed(2)}</p>
              {bet.status !== "pending" ? (
                <p className={cn(
                  "font-mono text-sm font-medium",
                  bet.status === "won" ? "text-profit" : "text-loss"
                )}>
                  {bet.profit && bet.profit > 0 ? "+" : ""}${bet.profit?.toFixed(2)}
                </p>
              ) : (
                <p className="text-xs text-warning">Pending</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
