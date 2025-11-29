import { useState, useEffect } from "react";
import { Activity, RefreshCw, Loader2, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  league: string;
  commenceTime: string;
  status: 'live' | 'upcoming' | 'completed';
  lastUpdate: string | null;
}

export function LiveScores() {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<LiveMatch[]>([]);
  const [completedMatches, setCompletedMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  const fetchLiveScores = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-live-scores');

      if (error) {
        console.error('Error fetching live scores:', error);
        toast({
          title: "Error fetching scores",
          description: error.message || "Failed to fetch live scores",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setLiveMatches(data.live || []);
        setUpcomingMatches(data.upcoming || []);
        setCompletedMatches(data.completed || []);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Error",
        description: "Failed to connect to scores service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveScores();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchLiveScores, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMatchMinute = (commenceTime: string) => {
    const start = new Date(commenceTime).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    
    // Cap at 90+ for regular time, show actual for extra time
    if (diffMins <= 45) return `${diffMins}'`;
    if (diffMins <= 60) return `45+${diffMins - 45}'`; // First half stoppage/halftime
    if (diffMins <= 105) return `${diffMins - 15}'`; // Second half (15 min break)
    return `90+${diffMins - 105}'`; // Extra time
  };

  const getLeagueColor = (league: string) => {
    if (league.includes('EPL') || league.includes('Premier')) return 'text-purple-400';
    if (league.includes('La Liga')) return 'text-orange-400';
    if (league.includes('Bundesliga')) return 'text-red-400';
    return 'text-primary';
  };

  const MatchCard = ({ match, showScore = true }: { match: LiveMatch; showScore?: boolean }) => (
    <div className={cn(
      "rounded-lg border p-3 transition-all duration-200",
      match.status === 'live' 
        ? "border-profit/50 bg-profit/5" 
        : "border-border bg-muted/30"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn("text-xs font-medium", getLeagueColor(match.league))}>
          {match.league}
        </span>
        {match.status === 'live' && (
          <span className="flex items-center gap-2 text-xs font-bold text-profit">
            <span className="flex items-center gap-1 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-profit"></span>
              LIVE
            </span>
            <span className="font-mono bg-profit/20 px-1.5 py-0.5 rounded">
              {getMatchMinute(match.commenceTime)}
            </span>
          </span>
        )}
        {match.status === 'upcoming' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTime(match.commenceTime)}
          </span>
        )}
        {match.status === 'completed' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle className="h-3 w-3" />
            FT
          </span>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={cn(
            "text-sm font-medium truncate",
            match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore
              ? "text-profit"
              : "text-foreground"
          )}>
            {match.homeTeam}
          </p>
          <p className={cn(
            "text-sm font-medium truncate",
            match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore
              ? "text-profit"
              : "text-foreground"
          )}>
            {match.awayTeam}
          </p>
        </div>
        
        {showScore && (match.homeScore !== null || match.status === 'live') && (
          <div className="text-right ml-4">
            <p className={cn(
              "text-lg font-bold font-mono",
              match.status === 'live' ? "text-profit" : "text-foreground"
            )}>
              {match.homeScore ?? 0}
            </p>
            <p className={cn(
              "text-lg font-bold font-mono",
              match.status === 'live' ? "text-profit" : "text-foreground"
            )}>
              {match.awayScore ?? 0}
            </p>
          </div>
        )}
        
        {match.status === 'upcoming' && match.homeScore === null && (
          <div className="text-right ml-4">
            <p className="text-lg font-bold font-mono text-muted-foreground">-</p>
            <p className="text-lg font-bold font-mono text-muted-foreground">-</p>
          </div>
        )}
      </div>
    </div>
  );

  const totalMatches = liveMatches.length + upcomingMatches.length + completedMatches.length;

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-profit/10 p-2">
            <Activity className="h-5 w-5 text-profit" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Live Scores</h3>
            <p className="text-sm text-muted-foreground">
              {lastUpdated 
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Loading scores...'
              }
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={fetchLiveScores}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {loading && totalMatches === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p>Loading live scores...</p>
        </div>
      ) : totalMatches === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Activity className="h-8 w-8 mb-4 opacity-50" />
          <p>No matches available</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Live Matches */}
          {liveMatches.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-profit flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-profit animate-pulse"></span>
                Live Now ({liveMatches.length})
              </h4>
              <div className="grid gap-2">
                {liveMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Matches */}
          {upcomingMatches.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Upcoming ({upcomingMatches.length})
              </h4>
              <div className="grid gap-2">
                {upcomingMatches.slice(0, 5).map((match) => (
                  <MatchCard key={match.id} match={match} showScore={false} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Matches */}
          {completedMatches.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Recently Completed ({completedMatches.length})
              </h4>
              <div className="grid gap-2">
                {completedMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
