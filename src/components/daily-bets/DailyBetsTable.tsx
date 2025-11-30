import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Info, Plus, Check, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBetSlip } from "@/contexts/BetSlipContext";
import type { AnalyzedBet } from "@/pages/DailyBets";

interface DailyBetsTableProps {
  bets: AnalyzedBet[];
}

const getConfidenceBadge = (confidence: string) => {
  switch (confidence) {
    case "high":
      return <Badge className="bg-profit/20 text-profit border-profit/30">High</Badge>;
    case "moderate":
      return <Badge className="bg-warning/20 text-warning border-warning/30">Moderate</Badge>;
    case "low":
      return <Badge className="bg-muted text-muted-foreground border-border">Low</Badge>;
    default:
      return null;
  }
};

const formatTimeUntil = (isoString: string) => {
  const now = new Date();
  const eventTime = new Date(isoString);
  const diffMs = eventTime.getTime() - now.getTime();
  
  if (diffMs <= 0) return { text: "Started", isLive: true, isSoon: false };
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    const hours = diffHours % 24;
    return { text: `${days}d ${hours}h`, isLive: false, isSoon: false };
  }
  
  if (diffHours > 0) {
    return { text: `${diffHours}h ${diffMins}m`, isLive: false, isSoon: false };
  }
  
  return { text: `${diffMins}m`, isLive: false, isSoon: diffMins <= 30 };
};

export function DailyBetsTable({ bets }: DailyBetsTableProps) {
  const { addToSlip, isInSlip } = useBetSlip();

  const handleAddToSlip = (bet: AnalyzedBet) => {
    addToSlip({
      id: bet.id,
      match: bet.event,
      selection: bet.selection,
      odds: bet.offeredOdds,
      league: bet.sport,
      commenceTime: bet.commenceTime,
      bookmaker: bet.bookmaker,
    });
  };

  if (bets.length === 0) {
    return (
      <div className="stat-card text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium text-foreground">No value bets found</p>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting filters or refresh to scan for new opportunities</p>
      </div>
    );
  }

  return (
    <div className="stat-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground w-[100px]">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Starts In
                </div>
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[200px]">Match</TableHead>
              <TableHead className="text-muted-foreground">Market</TableHead>
              <TableHead className="text-muted-foreground">Selection</TableHead>
              <TableHead className="text-muted-foreground text-center">
                <div className="flex items-center justify-center gap-1">
                  EV
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Expected Value: (Prob × Odds) - 1</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
              <TableHead className="text-muted-foreground text-center">
                <div className="flex items-center justify-center gap-1">
                  Criteria
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>EV &gt; 5%, Odds &gt; 1.50, Actual Prob &gt; Implied Prob</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
              <TableHead className="text-muted-foreground text-center">Min Odds</TableHead>
              <TableHead className="text-muted-foreground text-center">Offered</TableHead>
              <TableHead className="text-muted-foreground text-center">Confidence</TableHead>
              <TableHead className="text-muted-foreground text-center">
                <div className="flex items-center justify-center gap-1">
                  Stake %
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>High: Kelly (max 5%)<br/>Moderate: Flat 2-3%<br/>Low: 1-2%</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[250px]">Reasoning</TableHead>
              <TableHead className="text-muted-foreground text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bets.map((bet) => {
              const timeUntil = formatTimeUntil(bet.commenceTime);
              const inSlip = isInSlip(bet.id);

              return (
                <TableRow key={bet.id} className="border-border hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                      timeUntil.isLive 
                        ? "bg-loss/20 text-loss" 
                        : timeUntil.isSoon 
                          ? "bg-warning/20 text-warning" 
                          : "bg-primary/10 text-primary"
                    )}>
                      <Clock className="h-3 w-3" />
                      {timeUntil.text}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{bet.event}</p>
                      <p className="text-xs text-muted-foreground">{bet.sport}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{bet.market}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-primary">{bet.selection}</p>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "font-mono font-bold",
                        bet.expectedValue >= 0.15 ? "text-profit" : bet.expectedValue >= 0.08 ? "text-warning" : "text-foreground"
                      )}>
                        +{(bet.expectedValue * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Edge: +{bet.edge.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <CheckCircle2 className="h-5 w-5 text-profit mx-auto" />
                  </TableCell>
                  <TableCell className="text-center font-mono text-muted-foreground">
                    {bet.minOdds.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-mono font-bold text-profit">{bet.offeredOdds.toFixed(2)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Fair: {bet.fairOdds.toFixed(2)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{getConfidenceBadge(bet.confidence)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "font-mono font-medium",
                        bet.suggestedStakePercent >= 3 ? "text-profit" : "text-foreground"
                      )}>
                        {bet.suggestedStakePercent.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Kelly: {bet.kellyStake.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground line-clamp-2 cursor-help max-w-[250px]">
                          {bet.reasoning}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-1">
                          <p className="font-medium">{bet.event}</p>
                          <p>{bet.reasoning}</p>
                          <div className="text-xs text-muted-foreground pt-1 border-t border-border mt-1">
                            <p>Implied: {(bet.impliedProbability * 100).toFixed(1)}% → Actual: {(bet.actualProbability * 100).toFixed(1)}%</p>
                            <p>Best price at {bet.bookmaker}</p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant={inSlip ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleAddToSlip(bet)}
                      disabled={inSlip || timeUntil.isLive}
                      className={cn(
                        "gap-1",
                        inSlip && "bg-profit/20 text-profit border-profit/30"
                      )}
                    >
                      {inSlip ? (
                        <>
                          <Check className="h-3 w-3" />
                          Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          Add
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
