import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/terminal/Header';
import { PipelineStepper } from '@/components/pipeline/PipelineStepper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, DollarSign, Target, BarChart3, Percent, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineData } from '@/hooks/usePipelineData';
import { useSignalStats, type SignalLogEntry } from '@/hooks/useSignalStats';
import { EditBetDialog } from '@/components/stats/EditBetDialog';
import { PredictiveReportDownload } from '@/components/stats/PredictiveReportDownload';
import { format } from 'date-fns';

export default function History() {
  const { counts } = usePipelineData();
  const {
    logs, loading, overallStats, updateBet, deleteBet, checkPendingBets, checkingPending,
  } = useSignalStats();
  const [selectedBet, setSelectedBet] = useState<SignalLogEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();

  const fmt = (v: number) => {
    const f = Math.abs(v).toFixed(2);
    return v < 0 ? `-$${f}` : `$${f}`;
  };

  const pendingCount = logs.filter(l => !l.outcome || l.outcome === 'pending' || l.outcome === 'in_play').length;

  const getPickedTeam = (name: string, side: string) => {
    const m = name.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    if (!m) return side;
    return side === 'YES' ? m[1].trim() : m[2].trim();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Pipeline</h1>
            <p className="text-xs text-muted-foreground">Stage 5: History — Track Performance</p>
          </div>
        </div>

        <PipelineStepper counts={counts} />

        {/* Summary Cards */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <Card className="bg-card/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center gap-1 justify-center mb-0.5">
                <BarChart3 className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground">Bets</span>
              </div>
              <span className="text-lg font-bold font-mono">{overallStats.total_bets}</span>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center gap-1 justify-center mb-0.5">
                <Target className="h-3 w-3 text-green-500" />
                <span className="text-[10px] text-muted-foreground">Win%</span>
              </div>
              <span className={cn("text-lg font-bold font-mono", overallStats.win_rate >= 50 ? 'text-green-500' : 'text-red-500')}>
                {overallStats.win_rate.toFixed(1)}%
              </span>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center gap-1 justify-center mb-0.5">
                <DollarSign className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] text-muted-foreground">Staked</span>
              </div>
              <span className="text-lg font-bold font-mono">{fmt(overallStats.total_staked)}</span>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center gap-1 justify-center mb-0.5">
                {overallStats.total_profit_loss >= 0 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                <span className="text-[10px] text-muted-foreground">P/L</span>
              </div>
              <span className={cn("text-lg font-bold font-mono", overallStats.total_profit_loss >= 0 ? 'text-green-500' : 'text-red-500')}>
                {fmt(overallStats.total_profit_loss)}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center gap-1 justify-center mb-0.5">
                <Percent className="h-3 w-3 text-orange-500" />
                <span className="text-[10px] text-muted-foreground">ROI</span>
              </div>
              <span className={cn("text-lg font-bold font-mono", overallStats.roi >= 0 ? 'text-green-500' : 'text-red-500')}>
                {overallStats.roi.toFixed(1)}%
              </span>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center gap-1 justify-center mb-0.5">
                <span className="text-[10px] text-muted-foreground">W-L</span>
              </div>
              <span className="text-lg font-bold font-mono">
                <span className="text-green-500">{overallStats.wins}</span>-<span className="text-red-500">{overallStats.losses}</span>
              </span>
            </CardContent>
          </Card>
        </div>

        <PredictiveReportDownload overallStats={overallStats} />

        {/* Controls */}
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={checkPendingBets} disabled={checkingPending} className="gap-1">
            <RefreshCw className={cn("h-3 w-3", checkingPending && "animate-spin")} />
            {checkingPending ? 'Checking...' : pendingCount > 0 ? `Settle ${pendingCount}` : 'Refresh'}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bet History ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No bets placed yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Pick</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Stake</TableHead>
                      <TableHead className="text-right">Edge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.slice(0, 200).map(log => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/70"
                        onClick={() => { setSelectedBet(log); setEditOpen(true); }}
                      >
                        <TableCell><Edit2 className="h-3 w-3 text-muted-foreground" /></TableCell>
                        <TableCell className="font-mono text-xs">{format(new Date(log.created_at), 'MMM d, HH:mm')}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm">{log.event_name}</TableCell>
                        <TableCell>
                          <span className="px-1.5 py-0.5 rounded text-xs bg-primary/20 text-primary">
                            {getPickedTeam(log.event_name, log.side)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{(log.entry_price * 100).toFixed(0)}¢</TableCell>
                        <TableCell className="text-right font-mono text-sm">{log.stake_amount ? fmt(log.stake_amount) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-500">+{log.edge_at_signal.toFixed(1)}%</TableCell>
                        <TableCell>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            log.outcome === 'win' && 'bg-green-500/20 text-green-500',
                            log.outcome === 'loss' && 'bg-red-500/20 text-red-500',
                            log.outcome === 'void' && 'bg-gray-500/20 text-gray-400',
                            log.outcome === 'in_play' && 'bg-blue-500/20 text-blue-500 animate-pulse',
                            (!log.outcome || log.outcome === 'pending') && 'bg-yellow-500/20 text-yellow-500',
                          )}>
                            {log.outcome === 'in_play' ? 'LIVE' : (log.outcome || 'pending').toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-mono text-sm font-bold",
                          (log.profit_loss || 0) >= 0 ? 'text-green-500' : 'text-red-500',
                        )}>
                          {log.profit_loss != null ? fmt(log.profit_loss) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {selectedBet && (
          <EditBetDialog
            bet={selectedBet}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSave={updateBet}
            onDelete={deleteBet}
          />
        )}
      </main>
    </div>
  );
}
