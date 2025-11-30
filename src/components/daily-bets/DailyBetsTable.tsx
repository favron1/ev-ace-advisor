import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Info, Plus, Check, Clock, AlertCircle, Brain, AlertTriangle, XCircle, TrendingUp, Users, BarChart3, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { AddAllApprovalDialog } from "./AddAllApprovalDialog";
import type { AnalyzedBet } from "@/pages/DailyBets";

interface DailyBetsTableProps {
  bets: AnalyzedBet[];
  showAiAnalysis?: boolean;
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

const getRecommendationBadge = (recommendation: string) => {
  switch (recommendation) {
    case "STRONG_BET":
      return (
        <Badge className="bg-profit/20 text-profit border-profit/30 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Strong
        </Badge>
      );
    case "GOOD_BET":
      return (
        <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
          <Check className="h-3 w-3" />
          Good
        </Badge>
      );
    case "CAUTION":
      return (
        <Badge className="bg-warning/20 text-warning border-warning/30 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Caution
        </Badge>
      );
    case "AVOID":
      return (
        <Badge className="bg-loss/20 text-loss border-loss/30 gap-1">
          <XCircle className="h-3 w-3" />
          Avoid
        </Badge>
      );
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

export function DailyBetsTable({ bets, showAiAnalysis = false }: DailyBetsTableProps) {
  const { addToSlip, isInSlip } = useBetSlip();
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);

  const handleAddToSlip = (bet: AnalyzedBet) => {
    addToSlip({
      id: bet.id,
      match: bet.event,
      selection: bet.selection,
      odds: bet.offeredOdds,
      league: bet.sport,
      commenceTime: bet.commenceTime,
      bookmaker: bet.bookmaker,
      suggestedStakePercent: bet.suggestedStakePercent,
    });
  };

  // Get bets that can be added (not started and not already in slip)
  const addableBets = bets.filter(bet => {
    const timeUntil = formatTimeUntil(bet.commenceTime);
    // If AI analyzed, only add strong/good bets
    if (showAiAnalysis && bet.aiAnalysis) {
      if (bet.aiAnalysis.recommendation === 'AVOID' || bet.aiAnalysis.recommendation === 'CAUTION') {
        return false;
      }
    }
    return !timeUntil.isLive && !isInSlip(bet.id);
  });

  const handleAddAllClick = () => {
    setShowApprovalDialog(true);
  };

  const handleApprovalConfirm = (selectedBets: AnalyzedBet[]) => {
    selectedBets.forEach(bet => handleAddToSlip(bet));
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
      <AddAllApprovalDialog
        open={showApprovalDialog}
        onOpenChange={setShowApprovalDialog}
        bets={addableBets}
        onConfirm={handleApprovalConfirm}
      />
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-sm text-muted-foreground">
          {bets.length} bet{bets.length !== 1 ? 's' : ''} found
          {showAiAnalysis && ` • AI verified`}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddAllClick}
          disabled={addableBets.length === 0}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add All {showAiAnalysis ? 'Good+' : ''} ({addableBets.length})
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {showAiAnalysis && (
                <TableHead className="text-muted-foreground w-[100px]">
                  <div className="flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    AI Rating
                  </div>
                </TableHead>
              )}
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
                      <p>AI-adjusted stake recommendation</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[300px]">
                {showAiAnalysis ? 'AI Analysis' : 'Reasoning'}
              </TableHead>
              <TableHead className="text-muted-foreground text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bets.map((bet) => {
              const timeUntil = formatTimeUntil(bet.commenceTime);
              const inSlip = isInSlip(bet.id);
              const ai = bet.aiAnalysis;

              return (
                <TableRow 
                  key={bet.id} 
                  className={cn(
                    "border-border hover:bg-muted/30 transition-colors",
                    ai?.recommendation === 'STRONG_BET' && "bg-profit/5",
                    ai?.recommendation === 'AVOID' && "bg-loss/5 opacity-60"
                  )}
                >
                  {showAiAnalysis && (
                    <TableCell>
                      {ai ? getRecommendationBadge(ai.recommendation) : (
                        <Badge variant="outline" className="text-muted-foreground">N/A</Badge>
                      )}
                    </TableCell>
                  )}
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
                        bet.suggestedStakePercent >= 1.5 ? "text-profit" : "text-foreground"
                      )}>
                        {bet.suggestedStakePercent.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ${(bet.suggestedStakePercent * 10).toFixed(0)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {showAiAnalysis && ai ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-xs space-y-1 cursor-help max-w-[300px]">
                            <p className="text-foreground line-clamp-2">{ai.enhancedReasoning}</p>
                            {ai.riskFactors.length > 0 && (
                              <p className="text-loss text-[10px]">
                                ⚠️ {ai.riskFactors[0]}
                              </p>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md p-4">
                          <div className="space-y-3">
                            <p className="font-bold text-foreground">{bet.event}</p>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex items-start gap-1.5">
                                <BarChart3 className="h-3 w-3 text-primary mt-0.5" />
                                <div>
                                  <p className="font-medium text-foreground">Historical</p>
                                  <p className="text-muted-foreground">{ai.historicalTrend}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <TrendingUp className="h-3 w-3 text-primary mt-0.5" />
                                <div>
                                  <p className="font-medium text-foreground">Market Sentiment</p>
                                  <p className="text-muted-foreground">{ai.marketSentiment}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <ShieldCheck className="h-3 w-3 text-primary mt-0.5" />
                                <div>
                                  <p className="font-medium text-foreground">Team Form</p>
                                  <p className="text-muted-foreground">{ai.teamFormAnalysis}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <Users className="h-3 w-3 text-primary mt-0.5" />
                                <div>
                                  <p className="font-medium text-foreground">Pro Tipster View</p>
                                  <p className="text-muted-foreground">{ai.proTipsterView}</p>
                                </div>
                              </div>
                            </div>
                            
                            {ai.riskFactors.length > 0 && (
                              <div className="pt-2 border-t border-border">
                                <p className="font-medium text-loss text-xs mb-1">Risk Factors:</p>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                  {ai.riskFactors.map((risk, i) => (
                                    <li key={i}>• {risk}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
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
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant={inSlip ? "secondary" : ai?.recommendation === 'STRONG_BET' ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleAddToSlip(bet)}
                      disabled={inSlip || timeUntil.isLive || ai?.recommendation === 'AVOID'}
                      className={cn(
                        "gap-1",
                        inSlip && "bg-profit/20 text-profit border-profit/30",
                        ai?.recommendation === 'STRONG_BET' && !inSlip && "bg-profit hover:bg-profit/90 text-background"
                      )}
                    >
                      {inSlip ? (
                        <>
                          <Check className="h-3 w-3" />
                          Added
                        </>
                      ) : ai?.recommendation === 'AVOID' ? (
                        <>
                          <XCircle className="h-3 w-3" />
                          Skip
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
