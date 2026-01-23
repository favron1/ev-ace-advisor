import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Star, 
  Trash2, 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  Clock,
  TrendingUp,
  Zap
} from 'lucide-react';
import { MyBet } from '@/types/my-bets';
import { RecommendedBet } from '@/types/model-betting';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLiveScores } from '@/hooks/useLiveScores';
import { LiveScoreBadge } from './LiveScoreBadge';

interface MyBetsDrawerProps {
  bets: MyBet[];
  onRemove: (id: string) => void;
  onUpdateFromRecheck: (id: string, data: RecommendedBet) => void;
  onSetStatus: (id: string, status: MyBet['status']) => void;
  onClearAll: () => void;
  onRefresh?: () => void;
}

export function MyBetsDrawer({ 
  bets, 
  onRemove, 
  onUpdateFromRecheck, 
  onSetStatus,
  onClearAll,
  onRefresh
}: MyBetsDrawerProps) {
  const { toast } = useToast();
  const [checkingBetId, setCheckingBetId] = useState<string | null>(null);
  const [checkingAllResults, setCheckingAllResults] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { findMatchForBet, loading: scoresLoading, fetchLiveScores: refreshScores } = useLiveScores(true, 30000);

  const trackingBets = bets.filter(b => b.status === 'tracking');
  const settledBets = bets.filter(b => ['won', 'lost', 'void'].includes(b.status));
  
  // Find bets that are likely finished (started 2+ hours ago)
  const getFinishedBets = () => {
    const now = new Date();
    const twoHoursMs = 2 * 60 * 60 * 1000;
    return trackingBets.filter(bet => {
      if (!bet.start_time) return false;
      const startTime = new Date(bet.start_time);
      return now.getTime() - startTime.getTime() > twoHoursMs;
    });
  };

  const recheckBet = async (bet: MyBet) => {
    setCheckingBetId(bet.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('recheck-bet', {
        body: {
          event_id: bet.event_id,
          selection: bet.selection,
          market_id: bet.market_id,
          event_name: bet.event_name,
          league: bet.league,
          sport: bet.sport,
          start_time: bet.start_time,
          original_model_probability: bet.model_probability,
          original_bet_score: bet.bet_score,
          original_confidence: bet.confidence,
          original_stake_units: bet.recommended_stake_units,
        },
        headers: session ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      });

      if (error) throw error;

      // Check if we got a result (match finished)
      if (data.result) {
        const { status, actual_score } = data.result;
        if (status === 'won' || status === 'lost' || status === 'void') {
          onSetStatus(bet.id, status);
          toast({
            title: status === 'won' ? '✅ Bet Won!' : status === 'lost' ? '❌ Bet Lost' : 'Bet Void',
            description: actual_score ? `Final score: ${actual_score}` : data.message,
            variant: status === 'won' ? 'default' : 'destructive',
          });
          return;
        }
      }

      // Check for full updated bet (same de-vig logic as original model)
      if (data.updated_bet) {
        onUpdateFromRecheck(bet.id, data.updated_bet);
        toast({
          title: 'Bet Rechecked',
          description: `${data.updated_bet.odds_decimal.toFixed(2)} @ ${data.updated_bet.bookmaker}, Edge: ${(data.updated_bet.edge * 100).toFixed(1)}%, Score: ${data.updated_bet.bet_score}`,
        });
      } else {
        toast({
          title: 'No Updates',
          description: data.message || 'Could not fetch updated odds',
        });
      }
    } catch (error) {
      console.error('Error rechecking bet:', error);
      toast({
        title: 'Error',
        description: 'Failed to recheck bet',
        variant: 'destructive',
      });
    } finally {
      setCheckingBetId(null);
    }
  };

  // Use the backend check-results function for bulk settlement
  const checkAllResultsViaBackend = async () => {
    setCheckingAllResults(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-results');
      
      if (error) throw error;
      
      const totalUpdated = (data.updated || 0) + (data.userBetsUpdated || 0) + (data.valueBetsUpdated || 0);
      
      if (totalUpdated > 0) {
        // Calculate wins and losses from results
        const results = data.results || [];
        const wonCount = results.filter((r: { status: string }) => r.status === 'won').length;
        const lostCount = results.filter((r: { status: string }) => r.status === 'lost').length;
        
        toast({
          title: `✅ ${totalUpdated} bets settled!`,
          description: `${wonCount} won, ${lostCount} lost`,
          variant: wonCount >= lostCount ? 'default' : 'destructive',
        });
        
        // Refresh the bets list to show updated status
        if (onRefresh) {
          onRefresh();
        }
      } else {
        toast({
          title: 'No results available',
          description: data.message || 'Matches may still be in progress',
        });
      }
    } catch (error) {
      console.error('Error checking results:', error);
      toast({
        title: 'Error',
        description: 'Failed to check results',
        variant: 'destructive',
      });
    } finally {
      setCheckingAllResults(false);
    }
  };

  const checkAllResults = async () => {
    const finishedBets = getFinishedBets();
    if (finishedBets.length === 0) {
      toast({
        title: 'No finished bets',
        description: 'No bets have started 2+ hours ago yet',
      });
      return;
    }

    setCheckingAllResults(true);
    let wonCount = 0;
    let lostCount = 0;
    let checkedCount = 0;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      for (const bet of finishedBets) {
        try {
          const { data, error } = await supabase.functions.invoke('recheck-bet', {
            body: {
              event_id: bet.event_id,
              selection: bet.selection,
              market_id: bet.market_id,
              event_name: bet.event_name,
              league: bet.league,
              sport: bet.sport,
              start_time: bet.start_time,
            },
            headers: session ? {
              Authorization: `Bearer ${session.access_token}`
            } : undefined
          });

          if (error) continue;

          if (data.result) {
            const { status } = data.result;
            if (status === 'won' || status === 'lost' || status === 'void') {
              onSetStatus(bet.id, status);
              checkedCount++;
              if (status === 'won') wonCount++;
              if (status === 'lost') lostCount++;
            }
          }
        } catch {
          // Skip failed bets
        }
      }

      if (checkedCount > 0) {
        toast({
          title: `Results checked: ${checkedCount} bets`,
          description: `${wonCount} won, ${lostCount} lost`,
          variant: wonCount > lostCount ? 'default' : 'destructive',
        });
      } else {
        toast({
          title: 'No results available',
          description: 'Matches may still be in progress',
        });
      }
    } finally {
      setCheckingAllResults(false);
    }
  };

  const getKickoffDisplay = (startTime: string) => {
    if (!startTime) return { time: 'TBC', countdown: null, urgent: false };
    
    const kickoff = new Date(startTime);
    const now = new Date();
    const diffMs = kickoff.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    const formattedTime = kickoff.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    if (diffHours < 0) {
      return { time: formattedTime, countdown: 'LIVE', urgent: true };
    } else if (diffHours < 2) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return { 
        time: formattedTime, 
        countdown: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
        urgent: true
      };
    }
    
    return { time: formattedTime, countdown: null, urgent: false };
  };

  const getStatusBadge = (status: MyBet['status']) => {
    switch (status) {
      case 'tracking':
        return <Badge variant="outline" className="text-primary"><Clock className="h-3 w-3 mr-1" />Tracking</Badge>;
      case 'placed':
        return <Badge className="bg-primary/20 text-primary">Placed</Badge>;
      case 'won':
        return <Badge className="bg-profit text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Won</Badge>;
      case 'lost':
        return <Badge className="bg-loss text-white"><XCircle className="h-3 w-3 mr-1" />Lost</Badge>;
      case 'void':
        return <Badge variant="secondary">Void</Badge>;
    }
  };

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-profit/20 text-profit border-profit/30">High</Badge>;
      case 'medium':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-muted-foreground">Low</Badge>;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Star className="h-4 w-4" />
          My Bets
          {trackingBets.length > 0 && (
            <Badge className="bg-primary text-primary-foreground ml-1">
              {trackingBets.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            My Bets ({bets.length})
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Check All Results Button - Always visible when there are tracking bets */}
          {trackingBets.length > 0 && (
            <Button
              onClick={checkAllResultsViaBackend}
              disabled={checkingAllResults}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
              size="lg"
            >
              {checkingAllResults ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Zap className="h-5 w-5" />
              )}
              Check All Results
            </Button>
          )}

          {bets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No bets added yet</p>
              <p className="text-sm">Select bets from the results to track them</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-240px)]">
              <div className="space-y-3 pr-4">
                {/* Tracking Bets Section */}
                {trackingBets.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Tracking ({trackingBets.length})
                      </h3>
                      {getFinishedBets().length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={checkAllResults}
                          disabled={checkingAllResults}
                          className="gap-1"
                        >
                          {checkingAllResults ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Check All ({getFinishedBets().length})
                        </Button>
                      )}
                    </div>
                    {trackingBets.map(bet => {
                      const kickoff = getKickoffDisplay(bet.start_time);
                      const liveMatch = findMatchForBet(bet.event_name);
                      const isLive = liveMatch?.status === 'live';
                      
                      return (
                        <Card key={bet.id} className={isLive ? 'border-profit bg-profit/5' : kickoff.urgent ? 'border-warning' : ''}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{bet.event_name}</p>
                                <p className="text-xs text-muted-foreground">{bet.league}</p>
                              </div>
                              {getStatusBadge(bet.status)}
                            </div>
                            
                            {/* Live Score Display */}
                            {liveMatch && (liveMatch.status === 'live' || liveMatch.status === 'completed') && (
                              <div className="bg-muted/50 rounded-lg p-2 border">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 text-center">
                                    <p className="text-xs text-muted-foreground truncate">{liveMatch.homeTeam}</p>
                                  </div>
                                  <LiveScoreBadge match={liveMatch} />
                                  <div className="flex-1 text-center">
                                    <p className="text-xs text-muted-foreground truncate">{liveMatch.awayTeam}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary">{bet.selection_label}</Badge>
                              <span className="font-mono font-bold">{bet.odds_decimal?.toFixed(2)}</span>
                              {bet.bookmaker && (
                                <Badge variant="outline" className="text-xs bg-muted">
                                  @ {bet.bookmaker}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">{kickoff.time}</span>
                              {!liveMatch?.status && kickoff.countdown && (
                                <Badge 
                                  variant={kickoff.countdown === 'LIVE' ? 'destructive' : 'secondary'}
                                  className={kickoff.countdown === 'LIVE' ? 'animate-pulse' : ''}
                                >
                                  {kickoff.countdown === 'LIVE' ? '🔴 LIVE' : `⏱️ ${kickoff.countdown}`}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {getConfidenceBadge(bet.confidence)}
                              <Badge variant="outline">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                {(bet.edge * 100).toFixed(1)}% edge
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Score: {bet.bet_score}
                              </span>
                            </div>

                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {bet.addedAt && (
                                <p>
                                  Updated: {new Date(bet.addedAt).toLocaleString('en-AU', {
                                    timeZone: 'Australia/Sydney',
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              )}
                              {bet.lastCheckedAt && (
                                <p>
                                  Last checked: {new Date(bet.lastCheckedAt).toLocaleString('en-AU', {
                                    timeZone: 'Australia/Sydney',
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => recheckBet(bet)}
                                disabled={checkingBetId === bet.id}
                                className="flex-1"
                              >
                                {checkingBetId === bet.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                )}
                                Re-check
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onSetStatus(bet.id, 'placed')}
                              >
                                Mark Placed
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onRemove(bet.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                )}

                {/* Settled Bets Section */}
                {settledBets.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mt-6">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Settled ({settledBets.length})
                      </h3>
                      {/* P/L Summary */}
                      {(() => {
                        const totalPL = settledBets.reduce((sum, b) => {
                          const stakeUnits = b.recommended_stake_units || 1;
                          if (b.status === 'won') return sum + (stakeUnits * (b.odds_decimal - 1));
                          if (b.status === 'lost') return sum - stakeUnits;
                          return sum;
                        }, 0);
                        const wonCount = settledBets.filter(b => b.status === 'won').length;
                        const lostCount = settledBets.filter(b => b.status === 'lost').length;
                        return (
                          <div className="text-right">
                            <p className={`font-mono font-bold text-sm ${totalPL >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {totalPL >= 0 ? '+' : ''}{totalPL.toFixed(2)}u
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {wonCount}W / {lostCount}L
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    {settledBets.map(bet => {
                      const stakeUnits = bet.recommended_stake_units || 1;
                      const profitLoss = bet.status === 'won' 
                        ? stakeUnits * (bet.odds_decimal - 1) 
                        : bet.status === 'lost' 
                          ? -stakeUnits 
                          : 0;
                      
                      return (
                        <Card 
                          key={bet.id} 
                          className={
                            bet.status === 'won' 
                              ? 'border-profit/50 bg-profit/10' 
                              : bet.status === 'lost' 
                                ? 'border-loss/50 bg-loss/10'
                                : ''
                          }
                        >
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{bet.event_name}</p>
                                <p className="text-xs text-muted-foreground">{bet.league}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {getStatusBadge(bet.status)}
                                <span className={`font-mono font-bold text-sm ${profitLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                                  {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)}u
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary">{bet.selection_label}</Badge>
                              <span className="font-mono text-sm">@{bet.odds_decimal?.toFixed(2)}</span>
                              {bet.bookmaker && (
                                <Badge variant="outline" className="text-xs">
                                  {bet.bookmaker}
                                </Badge>
                              )}
                            </div>
                            
                            {bet.addedAt && (
                              <p className="text-xs text-muted-foreground">
                                Settled: {new Date(bet.addedAt).toLocaleString('en-AU', {
                                  timeZone: 'Australia/Sydney',
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}
                            
                            <div className="flex justify-end pt-2 border-t">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onRemove(bet.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                )}

                {bets.length > 0 && (
                  <div className="pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onClearAll}
                      className="w-full text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All Bets
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
