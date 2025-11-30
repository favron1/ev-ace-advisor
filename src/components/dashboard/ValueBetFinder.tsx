import { useState, useEffect } from "react";
import { Search, Zap, ArrowRight, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ValueBet {
  id: string;
  event: string;
  selection: string;
  odds: number;
  fairOdds: number;
  edge: number;
  ev: number;
  confidence: "high" | "medium" | "low";
  sport?: string;
  commenceTime?: string;
  bookmaker?: string;
}

export function ValueBetFinder() {
  const [bets, setBets] = useState<ValueBet[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  const fetchOdds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-odds');

      if (error) {
        console.error('Error fetching odds:', error);
        toast({
          title: "Error fetching odds",
          description: error.message || "Failed to fetch live odds",
          variant: "destructive",
        });
        return;
      }

      if (data?.bets) {
        setBets(data.bets);
        setLastUpdated(new Date());
        toast({
          title: "Odds updated",
          description: `Found ${data.bets.length} value betting opportunities`,
        });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Error",
        description: "Failed to connect to odds service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOdds();
  }, []);

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high": return "bg-profit/20 text-profit border-profit/30";
      case "medium": return "bg-warning/20 text-warning border-warning/30";
      case "low": return "bg-muted text-muted-foreground border-border";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Sort bets by commence time (soonest first)
  const sortedBets = [...bets].sort((a, b) => {
    if (!a.commenceTime && !b.commenceTime) return 0;
    if (!a.commenceTime) return 1;
    if (!b.commenceTime) return -1;
    return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
  });
  
  console.log('Sorted bets by time:', sortedBets.map(b => ({ event: b.event, time: b.commenceTime })));

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Value Bet Finder</h3>
            <p className="text-sm text-muted-foreground">
              {lastUpdated 
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Live odds from The Odds API'
              }
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={fetchOdds}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {loading && bets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p>Scanning markets for value bets...</p>
        </div>
      ) : bets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mb-4 opacity-50" />
          <p>No value bets found at the moment</p>
          <p className="text-sm">Try refreshing or check back later</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBets.map((bet) => (
            <div
              key={bet.id}
              className="group rounded-lg border border-border bg-muted/30 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {bet.sport && (
                      <span className="text-xs text-primary font-medium">{bet.sport}</span>
                    )}
                    <span className="text-sm text-muted-foreground">{bet.event}</span>
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      getConfidenceColor(bet.confidence)
                    )}>
                      {bet.confidence}
                    </span>
                  </div>
                  <p className="font-medium text-foreground">{bet.selection}</p>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-muted-foreground">
                      Odds: <span className="font-mono text-foreground">{bet.odds.toFixed(2)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Fair: <span className="font-mono text-foreground">{bet.fairOdds.toFixed(2)}</span>
                    </span>
                    {bet.bookmaker && (
                      <span className="text-xs text-muted-foreground">
                        @ {bet.bookmaker}
                      </span>
                    )}
                  </div>
                  {bet.commenceTime && (
                    <p className="text-xs text-muted-foreground">{formatTime(bet.commenceTime)}</p>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">Edge</span>
                    <span className="font-mono font-bold text-profit">+{bet.edge.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">EV</span>
                    <span className="font-mono font-bold text-profit">+{bet.ev.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <Button variant="ghost" size="sm" className="w-full justify-between text-primary hover:text-primary">
                  Analyze this bet
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
