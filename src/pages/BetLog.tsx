import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Target, DollarSign, Percent, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ModelBet, BetStats } from "@/types/model-betting";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function BetLog() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bets, setBets] = useState<ModelBet[]>([]);
  const [stats, setStats] = useState<BetStats | null>(null);
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const fetchBets = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('model_bets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (sportFilter !== 'all') {
        query = query.eq('sport', sportFilter);
      }

      if (resultFilter !== 'all') {
        query = query.eq('result', resultFilter as 'pending' | 'win' | 'loss' | 'void');
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59');
      }

      const { data, error } = await query;

      if (error) throw error;

      const typedBets = (data || []).map(bet => ({
        ...bet,
        odds_taken: Number(bet.odds_taken),
        model_probability: Number(bet.model_probability),
        implied_probability: Number(bet.implied_probability),
        edge: Number(bet.edge),
        recommended_stake_units: Number(bet.recommended_stake_units),
        closing_odds: bet.closing_odds ? Number(bet.closing_odds) : null,
        clv: bet.clv ? Number(bet.clv) : null,
        profit_loss_units: bet.profit_loss_units ? Number(bet.profit_loss_units) : null,
      })) as ModelBet[];

      setBets(typedBets);
      calculateStats(typedBets);
    } catch (error) {
      console.error('Error fetching bets:', error);
      toast({
        title: "Error",
        description: "Failed to fetch bet history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (bets: ModelBet[]) => {
    const wins = bets.filter(b => b.result === 'win').length;
    const losses = bets.filter(b => b.result === 'loss').length;
    const pending = bets.filter(b => b.result === 'pending').length;
    const settled = bets.filter(b => b.result !== 'pending' && b.result !== 'void');
    
    const totalStaked = bets.reduce((sum, b) => sum + b.recommended_stake_units, 0);
    const totalProfit = bets.reduce((sum, b) => sum + (b.profit_loss_units || 0), 0);
    const avgEdge = bets.length > 0 
      ? bets.reduce((sum, b) => sum + b.edge, 0) / bets.length 
      : 0;
    const avgBetScore = bets.length > 0
      ? bets.reduce((sum, b) => sum + b.bet_score, 0) / bets.length
      : 0;
    const betsWithCLV = bets.filter(b => b.clv !== null);
    const avgCLV = betsWithCLV.length > 0
      ? betsWithCLV.reduce((sum, b) => sum + (b.clv || 0), 0) / betsWithCLV.length
      : 0;

    setStats({
      totalBets: bets.length,
      wins,
      losses,
      pending,
      totalStaked,
      totalProfit,
      winRate: settled.length > 0 ? (wins / settled.length) * 100 : 0,
      roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0,
      avgEdge: avgEdge * 100,
      avgBetScore,
      avgCLV: avgCLV * 100
    });
  };

  const updateBetResult = async (betId: string, result: 'win' | 'loss' | 'void') => {
    try {
      const bet = bets.find(b => b.id === betId);
      if (!bet) return;

      let profitLoss = 0;
      if (result === 'win') {
        profitLoss = bet.recommended_stake_units * (bet.odds_taken - 1);
      } else if (result === 'loss') {
        profitLoss = -bet.recommended_stake_units;
      }

      const { error } = await supabase
        .from('model_bets')
        .update({
          result,
          profit_loss_units: profitLoss,
          settled_at: new Date().toISOString()
        })
        .eq('id', betId);

      if (error) throw error;

      toast({
        title: "Bet Updated",
        description: `Marked as ${result}`,
      });

      fetchBets();
    } catch (error) {
      console.error('Error updating bet:', error);
      toast({
        title: "Error",
        description: "Failed to update bet",
        variant: "destructive",
      });
    }
  };

  const resetAllBets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('model_bets')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Stats Reset",
        description: "All bet history has been cleared",
      });

      setBets([]);
      setStats(null);
    } catch (error) {
      console.error('Error resetting bets:', error);
      toast({
        title: "Error",
        description: "Failed to reset stats",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchBets();
  }, [sportFilter, resultFilter, dateFrom, dateTo]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'win':
        return <Badge className="bg-profit text-white gap-1"><CheckCircle2 className="h-3 w-3" />Win</Badge>;
      case 'loss':
        return <Badge className="bg-loss text-white gap-1"><XCircle className="h-3 w-3" />Loss</Badge>;
      case 'void':
        return <Badge variant="secondary">Void</Badge>;
      default:
        return <Badge className="bg-warning text-black gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Bet Log</h1>
            <p className="text-muted-foreground">Track your betting performance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchBets} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Reset Stats
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset All Stats?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your bet history and reset all statistics to zero. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={resetAllBets}>Reset Everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Bets</p>
                    <p className="text-xl font-bold">{stats.totalBets}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-profit/10">
                    <Percent className="h-5 w-5 text-profit" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-bold">{stats.winRate.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stats.totalProfit >= 0 ? 'bg-profit/10' : 'bg-loss/10'}`}>
                    {stats.totalProfit >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-profit" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-loss" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Profit/Loss</p>
                    <p className={`text-xl font-bold ${stats.totalProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {stats.totalProfit >= 0 ? '+' : ''}{stats.totalProfit.toFixed(2)}u
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stats.roi >= 0 ? 'bg-profit/10' : 'bg-loss/10'}`}>
                    <DollarSign className={`h-5 w-5 ${stats.roi >= 0 ? 'text-profit' : 'text-loss'}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ROI</p>
                    <p className={`text-xl font-bold ${stats.roi >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Edge</p>
                  <p className="text-xl font-bold">{stats.avgEdge.toFixed(2)}%</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Bet Score</p>
                  <p className="text-xl font-bold">{stats.avgBetScore.toFixed(0)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Sport</Label>
                <Select value={sportFilter} onValueChange={setSportFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sports</SelectItem>
                    <SelectItem value="soccer">Soccer</SelectItem>
                    <SelectItem value="basketball">Basketball</SelectItem>
                    <SelectItem value="afl">AFL</SelectItem>
                    <SelectItem value="nrl">NRL</SelectItem>
                    <SelectItem value="tennis">Tennis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Result</Label>
                <Select value={resultFilter} onValueChange={setResultFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Results" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Results</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="win">Won</SelectItem>
                    <SelectItem value="loss">Lost</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bets Table */}
        <Card>
          <CardHeader>
            <CardTitle>Bet History</CardTitle>
            <CardDescription>{bets.length} bets found</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : bets.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Selection</TableHead>
                      <TableHead className="text-center">Odds</TableHead>
                      <TableHead className="text-center">Close</TableHead>
                      <TableHead className="text-center">CLV</TableHead>
                      <TableHead className="text-center">Stake</TableHead>
                      <TableHead className="text-center">Result</TableHead>
                      <TableHead className="text-center">P/L</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bets.map((bet) => (
                      <TableRow key={bet.id}>
                        <TableCell className="text-sm">{formatDate(bet.created_at)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{bet.event_name}</p>
                            <p className="text-xs text-muted-foreground">{bet.league}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{bet.selection_label}</p>
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {bet.odds_taken.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">
                          {bet.closing_odds ? bet.closing_odds.toFixed(2) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {bet.clv !== null ? (
                            <span className={bet.clv > 0 ? 'text-profit' : 'text-loss'}>
                              {bet.clv > 0 ? '+' : ''}{(bet.clv * 100).toFixed(1)}%
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {bet.recommended_stake_units.toFixed(1)}u
                        </TableCell>
                        <TableCell className="text-center">
                          {getResultBadge(bet.result)}
                        </TableCell>
                        <TableCell className="text-center">
                          {bet.profit_loss_units !== null ? (
                            <span className={`font-mono font-bold ${bet.profit_loss_units >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {bet.profit_loss_units >= 0 ? '+' : ''}{bet.profit_loss_units.toFixed(2)}u
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {bet.result === 'pending' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-profit hover:bg-profit hover:text-white"
                                onClick={() => updateBetResult(bet.id, 'win')}
                              >
                                Win
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-loss hover:bg-loss hover:text-white"
                                onClick={() => updateBetResult(bet.id, 'loss')}
                              >
                                Loss
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No bets found</p>
                <p className="text-sm">Start by finding bets on the Find Bets page</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
