import { useState } from "react";
import { Search, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ValueBet {
  id: string;
  event: string;
  selection: string;
  odds: number;
  fairOdds: number;
  edge: number;
  ev: number;
  confidence: "high" | "medium" | "low";
}

const mockBets: ValueBet[] = [
  {
    id: "1",
    event: "Lakers vs Celtics",
    selection: "Lakers +5.5",
    odds: 2.10,
    fairOdds: 1.85,
    edge: 13.5,
    ev: 8.2,
    confidence: "high"
  },
  {
    id: "2",
    event: "Man City vs Arsenal",
    selection: "Over 2.5 Goals",
    odds: 1.95,
    fairOdds: 1.80,
    edge: 8.3,
    ev: 5.1,
    confidence: "medium"
  },
  {
    id: "3",
    event: "Djokovic vs Alcaraz",
    selection: "Alcaraz ML",
    odds: 2.40,
    fairOdds: 2.15,
    edge: 11.6,
    ev: 7.4,
    confidence: "high"
  },
  {
    id: "4",
    event: "Chiefs vs Ravens",
    selection: "Ravens +3",
    odds: 1.90,
    fairOdds: 1.82,
    edge: 4.4,
    ev: 2.8,
    confidence: "low"
  },
];

export function ValueBetFinder() {
  const [bets] = useState<ValueBet[]>(mockBets);

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high": return "bg-profit/20 text-profit border-profit/30";
      case "medium": return "bg-warning/20 text-warning border-warning/30";
      case "low": return "bg-muted text-muted-foreground border-border";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Value Bet Finder</h3>
            <p className="text-sm text-muted-foreground">Positive EV opportunities detected</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Zap className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {bets.map((bet) => (
          <div
            key={bet.id}
            className="group rounded-lg border border-border bg-muted/30 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{bet.event}</span>
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    getConfidenceColor(bet.confidence)
                  )}>
                    {bet.confidence}
                  </span>
                </div>
                <p className="font-medium text-foreground">{bet.selection}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Odds: <span className="font-mono text-foreground">{bet.odds.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Fair: <span className="font-mono text-foreground">{bet.fairOdds.toFixed(2)}</span>
                  </span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Edge</span>
                  <span className="font-mono font-bold text-profit">+{bet.edge.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">EV</span>
                  <span className="font-mono font-bold text-profit">+{bet.ev.toFixed(1)}%</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full justify-between text-primary hover:text-primary">
                Analyze this bet
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
