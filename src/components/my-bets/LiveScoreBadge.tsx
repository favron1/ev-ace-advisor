import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LiveMatch } from '@/hooks/useLiveScores';

interface LiveScoreBadgeProps {
  match: LiveMatch;
  className?: string;
}

export function LiveScoreBadge({ match, className }: LiveScoreBadgeProps) {
  if (match.status !== 'live' && match.status !== 'completed') {
    return null;
  }

  const getScoreDisplay = () => {
    if (match.sport === 'tennis' && match.sets && match.sets.length > 0) {
      // Tennis: show sets
      return match.sets.map((set, i) => `${set.home}-${set.away}`).join(' ');
    }
    
    // Soccer/Basketball: show score
    const home = match.homeScore ?? 0;
    const away = match.awayScore ?? 0;
    return `${home} - ${away}`;
  };

  const getMatchDuration = () => {
    const start = new Date(match.commenceTime).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);

    if (match.sport === 'tennis') {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }
    
    if (match.sport === 'basketball') {
      const quarter = Math.min(4, Math.ceil(diffMins / 12));
      return `Q${quarter}`;
    }
    
    // Soccer
    if (diffMins <= 45) return `${diffMins}'`;
    if (diffMins <= 60) return `45+'`;
    if (diffMins <= 105) return `${diffMins - 15}'`;
    return `90+'`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {match.status === 'live' && (
        <Badge variant="destructive" className="animate-pulse gap-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
          LIVE
        </Badge>
      )}
      {match.status === 'completed' && (
        <Badge variant="secondary" className="text-xs">
          FT
        </Badge>
      )}
      <span className={cn(
        "font-mono font-bold text-sm",
        match.status === 'live' ? "text-profit" : "text-foreground"
      )}>
        {getScoreDisplay()}
      </span>
      {match.status === 'live' && (
        <span className="text-xs text-muted-foreground font-mono">
          {getMatchDuration()}
        </span>
      )}
    </div>
  );
}
