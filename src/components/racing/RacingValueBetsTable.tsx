import { useState } from "react";
import { ChevronDown, ChevronUp, Info, Trophy, Dog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RacingValueBet } from "@/types/racing";

interface RacingValueBetsTableProps {
  bets: RacingValueBet[];
}

export function RacingValueBetsTable({ bets }: RacingValueBetsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-profit/20 text-profit border-profit/30">High</Badge>;
      case 'moderate':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Moderate</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground">Low</Badge>;
    }
  };

  const getRaceTypeIcon = (type: 'horse' | 'greyhound') => {
    return type === 'horse' ? (
      <Trophy className="h-4 w-4 text-warning" />
    ) : (
      <Dog className="h-4 w-4 text-primary" />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Race</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Runner</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Form</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Odds</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
              <Tooltip>
                <TooltipTrigger className="flex items-center gap-1 ml-auto">
                  Edge %
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Difference between actual and implied probability</p>
                </TooltipContent>
              </Tooltip>
            </th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
              <Tooltip>
                <TooltipTrigger className="flex items-center gap-1 ml-auto">
                  EV %
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Expected Value - positive means profitable long-term</p>
                </TooltipContent>
              </Tooltip>
            </th>
            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Confidence</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Stake %</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Time</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => (
            <>
              <tr
                key={bet.id}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-muted/30 cursor-pointer",
                  expandedRow === bet.id && "bg-muted/30"
                )}
                onClick={() => setExpandedRow(expandedRow === bet.id ? null : bet.id)}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {getRaceTypeIcon(bet.raceType)}
                    <div>
                      <p className="font-medium text-foreground">{bet.trackName}</p>
                      <p className="text-xs text-muted-foreground">R{bet.raceNumber} • {bet.distance}m</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div>
                    <p className="font-medium text-foreground">
                      {bet.runnerNumber}. {bet.runnerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bet.jockey ? `J: ${bet.jockey}` : ''} {bet.trainer ? `T: ${bet.trainer}` : ''}
                    </p>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="font-mono text-sm">{bet.form}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="font-mono font-bold text-foreground">${bet.odds.toFixed(2)}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={cn(
                    "font-mono font-medium",
                    bet.edge > 0 ? "text-profit" : "text-loss"
                  )}>
                    {bet.edge > 0 ? '+' : ''}{bet.edge.toFixed(2)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={cn(
                    "font-mono font-medium",
                    bet.expectedValue > 0 ? "text-profit" : "text-loss"
                  )}>
                    {bet.expectedValue > 0 ? '+' : ''}{bet.expectedValue.toFixed(2)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {getConfidenceBadge(bet.confidence)}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="font-mono text-primary font-medium">
                    {bet.suggestedStakePercent.toFixed(2)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="text-sm text-muted-foreground">{formatTime(bet.startTime)}</span>
                </td>
                <td className="py-3 px-4">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    {expandedRow === bet.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </td>
              </tr>
              
              {/* Expanded Details Row */}
              {expandedRow === bet.id && (
                <tr className="bg-muted/20">
                  <td colSpan={10} className="py-4 px-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Race Details</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Class:</span> {bet.raceClass}</p>
                          <p><span className="text-muted-foreground">Distance:</span> {bet.distance}m</p>
                          <p><span className="text-muted-foreground">Track:</span> {bet.trackCondition}</p>
                          <p><span className="text-muted-foreground">Barrier:</span> {bet.barrier}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Probability Analysis</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Implied Prob:</span> {bet.impliedProbability.toFixed(2)}%</p>
                          <p><span className="text-muted-foreground">Actual Prob:</span> {bet.actualProbability.toFixed(2)}%</p>
                          <p><span className="text-muted-foreground">Fair Odds:</span> ${bet.fairOdds.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Analysis Notes</h4>
                        <p className="text-sm text-muted-foreground">{bet.reasoning}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
