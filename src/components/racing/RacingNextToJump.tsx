import { Clock, Trophy, Dog } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RacingBestBet } from "@/types/racing";

interface RacingNextToJumpProps {
  bets: RacingBestBet[];
}

export function RacingNextToJump({ bets }: RacingNextToJumpProps) {
  // Sort by race time
  const upcomingBets = [...bets]
    .sort((a, b) => a.raceTime.localeCompare(b.raceTime))
    .slice(0, 5);

  if (upcomingBets.length === 0) {
    return (
      <div className="stat-card">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Next to Jump</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No upcoming races with value bets
        </p>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Next to Jump</h3>
      </div>

      <div className="space-y-3">
        {upcomingBets.map((bet, index) => (
          <div
            key={bet.raceId + bet.runner}
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg border transition-all",
              index === 0 
                ? "border-primary/50 bg-primary/5" 
                : "border-border bg-muted/30"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              bet.sport === 'horse' ? "bg-warning/10" : "bg-blue-400/10"
            )}>
              {bet.sport === 'horse' ? (
                <Trophy className="h-4 w-4 text-warning" />
              ) : (
                <Dog className="h-4 w-4 text-blue-400" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {bet.track} R{bet.raceNumber}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {bet.runnerNumber}. {bet.runner}
              </p>
            </div>
            
            <div className="text-right">
              <p className={cn(
                "text-sm font-mono font-bold",
                index === 0 ? "text-primary" : "text-foreground"
              )}>
                {bet.raceTime}
              </p>
              <p className="text-xs text-profit">
                +{(bet.ev * 100).toFixed(0)}% EV
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
