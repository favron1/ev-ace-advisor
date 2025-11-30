import { Clock, Trophy, Dog, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import type { RacingBestBet } from "@/types/racing";

interface RacingNextToJumpProps {
  bets: RacingBestBet[];
}

function CountdownTimer({ raceTime }: { raceTime: string }) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    const calculateTimeLeft = () => {
      // Parse the race time (format: "HH:MM")
      const now = new Date();
      const [hours, minutes] = raceTime.split(':').map(Number);
      
      const raceDate = new Date();
      raceDate.setHours(hours, minutes, 0, 0);
      
      // If race time has passed today, assume it's tomorrow
      if (raceDate < now) {
        raceDate.setDate(raceDate.getDate() + 1);
      }
      
      const diff = raceDate.getTime() - now.getTime();
      
      if (diff <= 0) {
        return "NOW";
      }
      
      const totalMinutes = Math.floor(diff / (1000 * 60));
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
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

  const isUrgent = timeLeft.includes('s') && !timeLeft.includes('m') && !timeLeft.includes('h');
  const isSoon = timeLeft.includes('m') && !timeLeft.includes('h') && parseInt(timeLeft) <= 5;

  return (
    <span className={cn(
      "text-xs font-mono font-bold px-2 py-0.5 rounded",
      timeLeft === "NOW" && "bg-destructive/20 text-destructive animate-pulse",
      isUrgent && "bg-warning/20 text-warning animate-pulse",
      isSoon && "bg-warning/10 text-warning",
      !isUrgent && !isSoon && timeLeft !== "NOW" && "bg-primary/10 text-primary"
    )}>
      {timeLeft === "NOW" ? "JUMPING!" : `Jumps in ${timeLeft}`}
    </span>
  );
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
        <Timer className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Next to Jump</h3>
      </div>

      <div className="space-y-3">
        {upcomingBets.map((bet, index) => (
          <div
            key={bet.raceId + bet.runner}
            className={cn(
              "flex flex-col gap-2 p-3 rounded-lg border transition-all",
              index === 0 
                ? "border-primary/50 bg-primary/5" 
                : "border-border bg-muted/30"
            )}
          >
            {/* Countdown Timer - First */}
            <div className="flex items-center justify-between">
              <CountdownTimer raceTime={bet.raceTime} />
              <span className="text-xs text-muted-foreground">{bet.raceTime}</span>
            </div>
            
            {/* Race Info */}
            <div className="flex items-center gap-3">
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
                <p className="text-xs text-profit font-semibold">
                  +{(bet.ev * 100).toFixed(0)}% EV
                </p>
                <p className="text-xs text-muted-foreground">
                  @{bet.offeredOdds.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
