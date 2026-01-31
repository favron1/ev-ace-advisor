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
import { AdvisorPanel } from '@/components/advisor/AdvisorPanel';
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

  // Extract the picked team from event name based on side
  // Event format: "Team A vs Team B" - YES = Team A (home), NO = Team B (away)
  const getPickedTeam = (eventName: string, side: string): string => {
    const vsMatch = eventName.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    if (!vsMatch) return side; // Fallback to YES/NO if can't parse
    
    const [, teamA, teamB] = vsMatch;
    // YES = home team (Team A), NO = away team (Team B)
    if (side === 'YES') {
      return teamA.trim();
    } else {
      return teamB.trim();
    }
  };

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
  const inPlayCount = logs.filter(l => l.outcome === 'in_play').length;
  const actionableBetsCount = pendingCount + inPlayCount;

  // Mobile bet card component
  const MobileBetCard = ({ log }: { log: SignalLogEntry }) => (
    <div 
      className="p-3 border border-border rounded-lg bg-card/50 space-y-2 cursor-pointer active:bg-muted/50"
      onClick={() => handleRowClick(log)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">
          {format(new Date(log.created_at), 'MMM d, HH:mm')}
        </span>
        <div className="flex items-center gap-2">
          {log.outcome === 'in_play' ? (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-500 animate-pulse">LIVE</span>
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
          <span className={`font-mono font-bold text-sm ${
            log.outcome === 'in_play' ? 'text-blue-500' :
            (log.profit_loss || 0) >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {log.outcome === 'in_play' && log.live_price != null
              ? formatUnrealizedPL(log.entry_price, log.live_price, log.stake_amount || 0, log.side)
              : log.profit_loss != null ? formatCurrency(log.profit_loss) : '--'}
          </span>
        </div>
      </div>
      
      <div className="text-sm font-medium truncate">{log.event_name}</div>
      
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded font-medium bg-primary/20 text-primary truncate max-w-[120px]" title={getPickedTeam(log.event_name, log.side)}>
            {getPickedTeam(log.event_name, log.side)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground font-mono">
          <span>{(log.entry_price * 100).toFixed(0)}¢</span>
          <span>{log.stake_amount ? formatCurrency(log.stake_amount) : '--'}</span>
          <span className="text-green-500">+{log.edge_at_signal.toFixed(1)}%</span>
        </div>
      </div>

      {log.outcome === 'in_play' && (log.home_team || log.live_score || log.game_status) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/50">
          {log.home_team && log.away_team && log.home_score && log.away_score ? (
            <span className="font-mono font-medium text-foreground">
              {log.home_team.substring(0, 3).toUpperCase()} {log.home_score}-{log.away_score} {log.away_team.substring(0, 3).toUpperCase()}
            </span>
          ) : log.live_score ? (
            <span className="font-mono">{log.live_score}</span>
          ) : null}
          {log.game_status && <span>({log.game_status})</span>}
          {log.live_price != null && <span className="font-mono">{(log.live_price * 100).toFixed(0)}¢ now</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-2 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10">
                <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg md:text-2xl font-bold">Stats</h1>
              <p className="text-muted-foreground text-xs md:text-sm hidden md:block">Track your betting performance</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-sm md:text-lg font-mono font-bold text-primary">{formatCurrency(todayStaked)}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-2 md:p-4">
              <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                <BarChart3 className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                <span className="text-[10px] md:text-xs text-muted-foreground">Bets</span>
              </div>
              <span className="text-lg md:text-2xl font-bold font-mono">{overallStats.total_bets}</span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-2 md:p-4">
              <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                <Target className="h-3 w-3 md:h-4 md:w-4 text-green-500" />
                <span className="text-[10px] md:text-xs text-muted-foreground">Win%</span>
              </div>
              <span className={`text-lg md:text-2xl font-bold font-mono ${overallStats.win_rate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(overallStats.win_rate)}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/50 hidden md:block">
            <CardContent className="p-2 md:p-4">
              <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                <DollarSign className="h-3 w-3 md:h-4 md:w-4 text-blue-500" />
                <span className="text-[10px] md:text-xs text-muted-foreground">Staked</span>
              </div>
              <span className="text-lg md:text-2xl font-bold font-mono">{formatCurrency(overallStats.total_staked)}</span>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-2 md:p-4">
              <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                {overallStats.total_profit_loss >= 0 ? (
                  <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 md:h-4 md:w-4 text-red-500" />
                )}
                <span className="text-[10px] md:text-xs text-muted-foreground">P/L</span>
              </div>
              <span className={`text-lg md:text-2xl font-bold font-mono ${overallStats.total_profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(overallStats.total_profit_loss)}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/50 hidden md:block">
            <CardContent className="p-2 md:p-4">
              <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                <Percent className="h-3 w-3 md:h-4 md:w-4 text-orange-500" />
                <span className="text-[10px] md:text-xs text-muted-foreground">ROI</span>
              </div>
              <span className={`text-lg md:text-2xl font-bold font-mono ${overallStats.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(overallStats.roi)}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/50 hidden md:block">
            <CardContent className="p-2 md:p-4">
              <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                <Calendar className="h-3 w-3 md:h-4 md:w-4 text-purple-500" />
                <span className="text-[10px] md:text-xs text-muted-foreground">Record</span>
              </div>
              <span className="text-lg md:text-2xl font-bold font-mono">
                <span className="text-green-500">{overallStats.wins}</span>
                <span className="text-muted-foreground">-</span>
                <span className="text-red-500">{overallStats.losses}</span>
              </span>
            </CardContent>
          </Card>
        </div>

        {/* AI Advisor Panel */}
        <AdvisorPanel />

        {/* Tabs */}
        <Tabs defaultValue="logs" className="space-y-3 md:space-y-4">
          <TabsList className="w-full md:w-auto overflow-x-auto">
            <TabsTrigger value="logs" className="text-xs md:text-sm">Bets</TabsTrigger>
            <TabsTrigger value="daily" className="text-xs md:text-sm">Daily</TabsTrigger>
            <TabsTrigger value="exposure" className="text-xs md:text-sm">Exposure</TabsTrigger>
            <TabsTrigger value="charts" className="text-xs md:text-sm">Charts</TabsTrigger>
          </TabsList>

          {/* Bet Log Table */}
          <TabsContent value="logs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6">
                <CardTitle className="text-base md:text-lg">Bet History</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkPendingBets}
                  disabled={checkingPending}
                  className="gap-1 md:gap-2 text-xs md:text-sm h-8"
                >
                  <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${checkingPending ? 'animate-spin' : ''}`} />
                  {checkingPending ? 'Checking...' : actionableBetsCount > 0 ? `Check ${actionableBetsCount}` : 'Refresh'}
                </Button>
              </CardHeader>
              <CardContent className="p-2 md:p-6 pt-0 md:pt-0">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading...</p>
                ) : logs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No bets recorded yet</p>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-2">
                      {logs.slice(0, 100).map((log) => (
                        <MobileBetCard key={log.id} log={log} />
                      ))}
                    </div>
                    
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <p className="text-xs text-muted-foreground mb-4">Click any row to edit</p>
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
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary truncate max-w-[150px] inline-block" title={getPickedTeam(log.event_name, log.side)}>
                                  {getPickedTeam(log.event_name, log.side)}
                                </span>
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
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-500 animate-pulse">
                                      LIVE
                                    </span>
                                    {log.home_team && log.away_team && log.home_score && log.away_score ? (
                                      <span className="text-xs font-mono font-medium text-foreground">
                                        {log.home_team.substring(0, 3).toUpperCase()} {log.home_score}-{log.away_score} {log.away_team.substring(0, 3).toUpperCase()}
                                      </span>
                                    ) : log.live_score ? (
                                      <span className="text-xs font-mono font-medium text-foreground">
                                        {log.live_score}
                                      </span>
                                    ) : null}
                                    {log.game_status && (
                                      <span className="text-xs text-muted-foreground">
                                        ({log.game_status})
                                      </span>
                                    )}
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
                  </>
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
