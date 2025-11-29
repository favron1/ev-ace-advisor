import { Clock, Trophy, Dog } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RacingValueBet } from "@/types/racing";

interface RacingNextToJumpProps {
  bets: RacingValueBet[];
}

export function RacingNextToJump({ bets }: RacingNextToJumpProps) {
  const now = new Date();
  
  // Get upcoming races sorted by time
  const upcomingBets = bets
    .filter(b => new Date(b.startTime) > now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  const formatTimeUntil = (startTime: string) => {
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    const mins = Math.floor(diff / 60000);
    
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
            key={bet.id}
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg border transition-all",
              index === 0 
                ? "border-primary/50 bg-primary/5" 
                : "border-border bg-muted/30"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              bet.raceType === 'horse' ? "bg-warning/10" : "bg-blue-400/10"
            )}>
              {bet.raceType === 'horse' ? (
                <Trophy className="h-4 w-4 text-warning" />
              ) : (
                <Dog className="h-4 w-4 text-blue-400" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {bet.trackName} R{bet.raceNumber}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {bet.runnerNumber}. {bet.runnerName}
              </p>
            </div>
            
            <div className="text-right">
              <p className={cn(
                "text-sm font-mono font-bold",
                index === 0 ? "text-primary" : "text-foreground"
              )}>
                {formatTimeUntil(bet.startTime)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(bet.startTime)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
