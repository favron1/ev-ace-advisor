import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Clock, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Bet {
  id: string;
  match_description: string;
  selection: string;
  odds: number;
  stake: number;
  status: "won" | "lost" | "pending" | "void";
  profit_loss: number | null;
  placed_at: string;
  potential_return: number;
}

export function BetHistory() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingResults, setCheckingResults] = useState(false);
  const { toast } = useToast();

  const fetchBets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('bet_history')
        .select('*')
        .eq('user_id', user.id)
        .order('placed_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setBets(data || []);
    } catch (error) {
      console.error('Error fetching bets:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkResults = async () => {
    setCheckingResults(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-results');
      
      if (error) throw error;
      
      toast({
        title: "Results checked",
        description: data.message || `Updated ${data.updated} bets`,
      });
      
      // Refresh bets after checking
      await fetchBets();
    } catch (error) {
      console.error('Error checking results:', error);
      toast({
        title: "Error",
        description: "Failed to check results",
        variant: "destructive",
      });
    } finally {
      setCheckingResults(false);
    }
  };

  useEffect(() => {
    fetchBets();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "won": return <CheckCircle2 className="h-4 w-4 text-profit" />;
      case "lost": return <XCircle className="h-4 w-4 text-loss" />;
      case "pending": return <Clock className="h-4 w-4 text-warning animate-pulse" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const pendingCount = bets.filter(b => b.status === 'pending').length;

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Bets</h3>
          <p className="text-sm text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} pending` : 'All settled'}
          </p>
        </div>
        {pendingCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={checkResults}
            disabled={checkingResults}
            className="gap-2"
          >
            {checkingResults ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Check Results
          </Button>
        )}
      </div>

      {bets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No bets placed yet</p>
          <p className="text-sm">Add bets from the Value Bet Finder</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bets.map((bet) => (
            <div
              key={bet.id}
              className={cn(
                "flex items-center justify-between rounded-lg border p-3 transition-colors",
                bet.status === 'won' && "border-profit/30 bg-profit/5",
                bet.status === 'lost' && "border-loss/30 bg-loss/5",
                bet.status === 'pending' && "border-border bg-muted/30 hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(bet.status)}
                <div>
                  <p className="text-sm font-medium text-foreground">{bet.selection}</p>
                  <p className="text-xs text-muted-foreground">{bet.match_description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(bet.placed_at)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm text-foreground">@{bet.odds.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">${bet.stake} stake</p>
                {bet.status !== "pending" ? (
                  <p className={cn(
                    "font-mono text-sm font-bold",
                    bet.status === "won" ? "text-profit" : "text-loss"
                  )}>
                    {bet.profit_loss && bet.profit_loss > 0 ? "+" : ""}${bet.profit_loss?.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-xs text-warning font-medium">Pending</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
