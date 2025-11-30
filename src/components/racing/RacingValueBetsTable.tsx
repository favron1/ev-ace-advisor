import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Info, Trophy, Dog, CloudRain, Timer, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RacingBestBet } from "@/types/racing";

interface RacingValueBetsTableProps {
  bets: RacingBestBet[];
}

function JumpCountdown({ raceTime }: { raceTime: string }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [urgency, setUrgency] = useState<'normal' | 'soon' | 'urgent' | 'now'>('normal');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const [hours, minutes] = raceTime.split(':').map(Number);
      
      const raceDate = new Date();
      raceDate.setHours(hours, minutes, 0, 0);
      
      if (raceDate < now) {
        raceDate.setDate(raceDate.getDate() + 1);
      }
      
      const diff = raceDate.getTime() - now.getTime();
      
      if (diff <= 0) {
        setUrgency('now');
        return "NOW";
      }
      
      const totalMinutes = Math.floor(diff / (1000 * 60));
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (totalMinutes <= 2) {
        setUrgency('urgent');
      } else if (totalMinutes <= 10) {
        setUrgency('soon');
      } else {
        setUrgency('normal');
      }
      
      if (h > 0) {
        return `${h}h ${m}m`;
      } else if (m > 0) {
        return `${m}m ${s}s`;
      } else {
        return `${s}s`;
      }
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [raceTime]);

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-xs font-bold whitespace-nowrap",
      urgency === 'now' && "bg-destructive/20 text-destructive animate-pulse",
      urgency === 'urgent' && "bg-warning/20 text-warning animate-pulse",
      urgency === 'soon' && "bg-warning/10 text-warning",
      urgency === 'normal' && "bg-primary/10 text-primary"
    )}>
      <Clock className="h-3 w-3" />
      {timeLeft === "NOW" ? "JUMPING!" : timeLeft}
    </div>
  );
}

// Helper to calculate time until race for sorting
const getTimeUntilRace = (raceTime: string): number => {
  const now = new Date();
  const [hours, minutes] = raceTime.split(':').map(Number);
  
  const raceDate = new Date();
  raceDate.setHours(hours, minutes, 0, 0);
  
  // If race time has passed today, assume it's tomorrow
  if (raceDate < now) {
    raceDate.setDate(raceDate.getDate() + 1);
  }
  
  return raceDate.getTime() - now.getTime();
};

export function RacingValueBetsTable({ bets }: RacingValueBetsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Sort bets by time until race (soonest first)
  const sortedBets = [...bets].sort((a, b) => getTimeUntilRace(a.raceTime) - getTimeUntilRace(b.raceTime));

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'High':
        return <Badge className="bg-profit/20 text-profit border-profit/30">High</Badge>;
      case 'Moderate':
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

  const formatForm = (form: string[]) => {
    return form.map((pos, idx) => {
      const isWin = pos === '1st';
      const isPlace = ['1st', '2nd', '3rd'].includes(pos);
      return (
        <span 
          key={idx} 
          className={cn(
            "inline-block w-6 text-center text-xs font-mono rounded",
            isWin ? "bg-profit/20 text-profit" : isPlace ? "bg-warning/20 text-warning" : "text-muted-foreground"
          )}
        >
          {pos.replace(/[a-z]/g, '')}
        </span>
      );
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Jumps In</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Race</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Runner</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Form</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Odds</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
              <Tooltip>
                <TooltipTrigger className="flex items-center gap-1 ml-auto">
                  EV
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Expected Value - positive means profitable long-term</p>
                </TooltipContent>
              </Tooltip>
            </th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Edge %</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Confidence</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Stake</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {sortedBets.map((bet) => (
            <React.Fragment key={bet.raceId + bet.runner}>
              <tr
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-muted/30 cursor-pointer",
                  expandedRow === bet.raceId + bet.runner && "bg-muted/30"
                )}
                onClick={() => setExpandedRow(expandedRow === bet.raceId + bet.runner ? null : bet.raceId + bet.runner)}
              >
                <td className="py-3 px-4">
                  <JumpCountdown raceTime={bet.raceTime} />
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {getRaceTypeIcon(bet.sport)}
                    <div>
                      <p className="font-medium text-foreground">{bet.track}</p>
                      <p className="text-xs text-muted-foreground">R{bet.raceNumber} • {bet.distanceM}m • {bet.raceType}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div>
                    <p className="font-medium text-foreground">
                      {bet.runnerNumber}. {bet.runner}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bet.jockey ? `J: ${bet.jockey}` : ''} {bet.trainer ? `T: ${bet.trainer}` : ''}
                    </p>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-0.5">
                    {formatForm(bet.recentForm)}
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="font-mono font-bold text-foreground">${bet.offeredOdds.toFixed(2)}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={cn(
                    "font-mono font-medium",
                    bet.ev > 0 ? "text-profit" : "text-loss"
                  )}>
                    {bet.ev > 0 ? '+' : ''}{(bet.ev * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={cn(
                    "font-mono font-medium",
                    bet.edge > 0 ? "text-profit" : "text-loss"
                  )}>
                    {bet.edge > 0 ? '+' : ''}{bet.edge.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {getConfidenceBadge(bet.confidence)}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="font-mono text-primary font-medium">
                    {bet.suggestedBetPercent}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    {expandedRow === bet.raceId + bet.runner ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </td>
              </tr>
              
              {/* Expanded Details Row */}
              {expandedRow === bet.raceId + bet.runner && (
                <tr className="bg-muted/20">
                  <td colSpan={10} className="py-4 px-6">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Race Conditions</h4>
                        <div className="space-y-1 text-sm">
                          <p className="flex items-center gap-2">
                            <CloudRain className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Weather:</span> {bet.weather}
                          </p>
                          <p><span className="text-muted-foreground">Track:</span> {bet.trackCondition}</p>
                          <p><span className="text-muted-foreground">Distance:</span> {bet.distanceM}m</p>
                          <p><span className="text-muted-foreground">Class:</span> {bet.raceType}</p>
                          <p><span className="text-muted-foreground">Jump Time:</span> {bet.raceTime}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Runner Profile</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Barrier/Box:</span> {bet.trapOrBarrier}</p>
                          <p><span className="text-muted-foreground">Style:</span> {bet.runningStyle || 'N/A'}</p>
                          <p><span className="text-muted-foreground">Early Speed:</span> {bet.earlySpeed || 'N/A'}</p>
                          <p className="flex items-center gap-2">
                            <Timer className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Days since run:</span> {bet.daysSinceLastRun || 'N/A'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Value Analysis</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Implied Prob:</span> {(bet.impliedProbability * 100).toFixed(1)}%</p>
                          <p><span className="text-muted-foreground">Actual Prob:</span> {(bet.actualProbability * 100).toFixed(1)}%</p>
                          <p><span className="text-muted-foreground">Fair Odds:</span> ${bet.fairOdds.toFixed(2)}</p>
                          <p><span className="text-muted-foreground">Min Odds:</span> ${bet.minOdds.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Reasoning</h4>
                        <p className="text-sm text-muted-foreground">{bet.reasoning}</p>
                        <div className="pt-2">
                          <p className="text-xs text-muted-foreground">Surface Pref: {bet.surfacePref || 'Any'}</p>
                          <p className="text-xs text-muted-foreground">Last Class: {bet.classLastRace || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
