import { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SimulatedBet } from "@/pages/Simulation";

interface SimulatedBetsTableProps {
  bets: SimulatedBet[];
}

export function SimulatedBetsTable({ bets }: SimulatedBetsTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  const displayBets = showAll ? bets : bets.slice(0, 20);

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="default" className="bg-profit/20 text-profit border-profit/30">High</Badge>;
      case 'moderate':
        return <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">Moderate</Badge>;
      case 'low':
        return <Badge variant="default" className="bg-warning/20 text-warning border-warning/30">Low</Badge>;
      default:
        return <Badge variant="outline">{confidence}</Badge>;
    }
  };

  return (
    <div className="stat-card">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">Simulated Bets</h3>
          <p className="text-sm text-muted-foreground">
            {bets.length} bets • {bets.filter(b => b.result === 'won').length} wins
          </p>
        </div>
        <Button variant="ghost" size="icon">
          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground py-3 px-2">#</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-3 px-2">Match</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-3 px-2">Selection</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-3 px-2">Odds</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-3 px-2">Edge</th>
                  <th className="text-center text-xs font-medium text-muted-foreground py-3 px-2">Conf.</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-3 px-2">Stake</th>
                  <th className="text-center text-xs font-medium text-muted-foreground py-3 px-2">Result</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-3 px-2">P/L</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-3 px-2">Bankroll</th>
                </tr>
              </thead>
              <tbody>
                {displayBets.map((bet, index) => (
                  <tr 
                    key={bet.id} 
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      bet.result === 'won' && "bg-profit/5",
                      bet.result === 'lost' && "bg-loss/5"
                    )}
                  >
                    <td className="py-2 px-2 text-sm text-muted-foreground">{index + 1}</td>
                    <td className="py-2 px-2">
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                        {bet.match}
                      </p>
                    </td>
                    <td className="py-2 px-2">
                      <p className="text-sm text-primary">{bet.selection}</p>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className="font-mono text-sm text-foreground">{bet.odds.toFixed(2)}</span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className="font-mono text-sm text-profit">+{bet.edge.toFixed(1)}%</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {getConfidenceBadge(bet.confidence)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className="font-mono text-sm text-foreground">${bet.stake.toFixed(2)}</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {bet.result === 'won' ? (
                        <CheckCircle2 className="h-4 w-4 text-profit mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-loss mx-auto" />
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={cn(
                        "font-mono text-sm font-medium",
                        bet.profitLoss >= 0 ? "text-profit" : "text-loss"
                      )}>
                        {bet.profitLoss >= 0 ? '+' : ''}{bet.profitLoss.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className="font-mono text-sm text-foreground">
                        ${bet.runningBankroll.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bets.length > 20 && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? `Show Less` : `Show All ${bets.length} Bets`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
