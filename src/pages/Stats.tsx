import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Target, Percent, BarChart3, Calendar, RefreshCw, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSignalStats, SignalLogEntry } from '@/hooks/useSignalStats';
import { StatsCharts } from '@/components/stats/StatsCharts';
import { EditBetDialog } from '@/components/stats/EditBetDialog';
import { format } from 'date-fns';

export default function Stats() {
  const { 
    logs, 
    loading, 
    overallStats, 
    dailyStats, 
    exposureByMarket, 
    todayStaked,
    updateBet,
    deleteBet,
    checkPendingBets,
    checkingPending,
  } = useSignalStats();

  const [selectedBet, setSelectedBet] = useState<SignalLogEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const formatCurrency = (value: number) => {
    const formatted = Math.abs(value).toFixed(2);
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  // Calculate unrealized P/L for in-play bets based on current price
  const formatUnrealizedPL = (entryPrice: number, currentPrice: number, stake: number, side: string) => {
    if (!stake) return '--';
    // For YES bets: if current price > entry, we're in profit
    // For NO bets: if current price < entry (meaning NO price went up), we're in profit
    let unrealizedPL: number;
    if (side === 'YES') {
      // Current value of shares = stake / entryPrice * currentPrice
      // P/L = current value - stake
      unrealizedPL = (stake / entryPrice) * currentPrice - stake;
    } else {
      // NO bet: current NO price = 1 - currentPrice
      const entryNoPrice = 1 - entryPrice;
      const currentNoPrice = 1 - currentPrice;
      unrealizedPL = (stake / entryNoPrice) * currentNoPrice - stake;
    }
    return formatCurrency(unrealizedPL);
  };

  const handleRowClick = (log: SignalLogEntry) => {
    setSelectedBet(log);
    setEditDialogOpen(true);
  };

  const pendingCount = logs.filter(l => !l.outcome || l.outcome === 'pending').length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Stats & Analytics</h1>
              <p className="text-muted-foreground text-sm">Track your betting performance</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Today's Deployed</p>
            <p className="text-lg font-mono font-bold text-primary">{formatCurrency(todayStaked)}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Bets</span>
              </div>
              <span className="text-2xl font-bold font-mono">{overallStats.total_bets}</span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Win Rate</span>
              </div>
              <span className={`text-2xl font-bold font-mono ${overallStats.win_rate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(overallStats.win_rate)}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Total Staked</span>
              </div>
              <span className="text-2xl font-bold font-mono">{formatCurrency(overallStats.total_staked)}</span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {overallStats.total_profit_loss >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">Total P/L</span>
              </div>
              <span className={`text-2xl font-bold font-mono ${overallStats.total_profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(overallStats.total_profit_loss)}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">ROI</span>
              </div>
              <span className={`text-2xl font-bold font-mono ${overallStats.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(overallStats.roi)}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Record</span>
              </div>
              <span className="text-2xl font-bold font-mono">
                <span className="text-green-500">{overallStats.wins}</span>
                <span className="text-muted-foreground">-</span>
                <span className="text-red-500">{overallStats.losses}</span>
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="logs">Bet Log</TabsTrigger>
            <TabsTrigger value="daily">Daily Breakdown</TabsTrigger>
            <TabsTrigger value="exposure">24h Exposure</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>

          {/* Bet Log Table */}
          <TabsContent value="logs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Bet History</CardTitle>
                {pendingCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkPendingBets}
                    disabled={checkingPending}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${checkingPending ? 'animate-spin' : ''}`} />
                    {checkingPending ? 'Checking...' : `Check ${pendingCount} Pending`}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">Click any row to edit</p>
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading...</p>
                ) : logs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No bets recorded yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Bet</TableHead>
                          <TableHead className="text-right">Entry</TableHead>
                          <TableHead className="text-right">Stake</TableHead>
                          <TableHead className="text-right">Edge</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">P/L</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.slice(0, 100).map((log) => (
                          <TableRow 
                            key={log.id} 
                            className="cursor-pointer hover:bg-muted/70"
                            onClick={() => handleRowClick(log)}
                          >
                            <TableCell>
                              <Edit2 className="h-3 w-3 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {format(new Date(log.created_at), 'MMM d, HH:mm')}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={log.event_name}>
                              {log.event_name}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  log.side === 'YES' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                                }`}>
                                  {log.side}
                                </span>
                                {log.recommended_outcome && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={log.recommended_outcome}>
                                    {log.recommended_outcome}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(log.entry_price * 100).toFixed(0)}¢
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {log.stake_amount ? formatCurrency(log.stake_amount) : '--'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-green-500">
                              +{log.edge_at_signal.toFixed(1)}%
                            </TableCell>
                            <TableCell>
                              {log.outcome === 'in_play' ? (
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-500 animate-pulse">
                                    LIVE
                                  </span>
                                  {log.live_price != null && (
                                    <span className="text-xs font-mono text-muted-foreground">
                                      {(log.live_price * 100).toFixed(0)}¢
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  log.outcome === 'win' ? 'bg-green-500/20 text-green-500' :
                                  log.outcome === 'loss' ? 'bg-red-500/20 text-red-500' :
                                  log.outcome === 'void' ? 'bg-gray-500/20 text-gray-500' :
                                  'bg-yellow-500/20 text-yellow-500'
                                }`}>
                                  {log.outcome || 'pending'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-mono font-medium ${
                              log.outcome === 'in_play' 
                                ? 'text-blue-500' 
                                : (log.profit_loss || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {log.outcome === 'in_play' && log.live_price != null
                                ? formatUnrealizedPL(log.entry_price, log.live_price, log.stake_amount || 0, log.side)
                                : log.profit_loss != null ? formatCurrency(log.profit_loss) : '--'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Daily Breakdown */}
          <TabsContent value="daily">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Daily Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyStats.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No daily data yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Bets</TableHead>
                        <TableHead className="text-right">Staked</TableHead>
                        <TableHead className="text-right">W-L</TableHead>
                        <TableHead className="text-right">Avg Edge</TableHead>
                        <TableHead className="text-right">P/L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyStats.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell className="font-mono">{day.date}</TableCell>
                          <TableCell className="text-right font-mono">{day.bets_placed}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(day.total_staked)}</TableCell>
                          <TableCell className="text-right font-mono">
                            <span className="text-green-500">{day.wins}</span>
                            <span className="text-muted-foreground">-</span>
                            <span className="text-red-500">{day.losses}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-500">
                            +{day.avg_edge.toFixed(1)}%
                          </TableCell>
                          <TableCell className={`text-right font-mono font-medium ${
                            day.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {formatCurrency(day.profit_loss)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 24h Exposure */}
          <TabsContent value="exposure">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">24h Market Exposure</CardTitle>
              </CardHeader>
              <CardContent>
                {exposureByMarket.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No exposure in last 24h</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Bets</TableHead>
                        <TableHead className="text-right">Total Staked</TableHead>
                        <TableHead>Last Bet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exposureByMarket.map((market) => (
                        <TableRow key={market.condition_id}>
                          <TableCell className="max-w-[250px] truncate" title={market.event_name}>
                            {market.event_name}
                          </TableCell>
                          <TableCell className="text-right font-mono">{market.bet_count}</TableCell>
                          <TableCell className="text-right font-mono font-medium text-primary">
                            {formatCurrency(market.total_staked)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {format(new Date(market.last_bet_at), 'HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charts */}
          <TabsContent value="charts">
            <StatsCharts />
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <EditBetDialog
          bet={selectedBet}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSave={updateBet}
          onDelete={deleteBet}
        />
      </div>
    </div>
  );
}
