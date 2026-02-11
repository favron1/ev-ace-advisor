import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/terminal/Header';
import { PipelineStepper } from '@/components/pipeline/PipelineStepper';
import { MatchStatusBadge } from '@/components/pipeline/MatchStatusBadge';
import { UnmatchedTeamsPanel } from '@/components/terminal/UnmatchedTeamsPanel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Upload, Eye, Loader2, ArrowLeft, Search, Zap, X, ArrowDown, ArrowUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePipelineData, type PipelineEvent } from '@/hooks/usePipelineData';
import { parseBatchImport, type ParseResult } from '@/lib/batch-parser';
import { cn } from '@/lib/utils';

type MatchFilter = 'all' | 'matched' | 'unmatched' | 'has_price' | 'no_price';
type EdgeFilter = 'all' | 'positive' | 'above3' | 'above5';
type SortField = 'updated' | 'poly_price' | 'book_price' | 'volume' | 'name' | 'edge';

export default function Discover() {
  const { events, loading, counts, fetchEvents, getDiscoveryEvents, promoteEvents, dismissEvents } = usePipelineData();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [edgeFilter, setEdgeFilter] = useState<EdgeFilter>('all');
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { toast } = useToast();
  const navigate = useNavigate();

  const discoveryEvents = getDiscoveryEvents();

  const matched = discoveryEvents.filter(e => e.polymarket_matched && e.polymarket_price != null);
  const unmatched = discoveryEvents.filter(e => !e.polymarket_matched || e.polymarket_price == null);

  const getEdge = (e: PipelineEvent) => {
    if (e.current_probability == null || e.polymarket_price == null) return null;
    return (e.current_probability - e.polymarket_price) * 100;
  };

  const filteredEvents = useMemo(() => {
    let filtered = discoveryEvents;
    switch (matchFilter) {
      case 'matched': filtered = filtered.filter(e => e.polymarket_matched); break;
      case 'unmatched': filtered = filtered.filter(e => !e.polymarket_matched); break;
      case 'has_price': filtered = filtered.filter(e => e.polymarket_price != null); break;
      case 'no_price': filtered = filtered.filter(e => e.polymarket_price == null); break;
    }
    switch (edgeFilter) {
      case 'positive': filtered = filtered.filter(e => { const edge = getEdge(e); return edge != null && edge > 0; }); break;
      case 'above3': filtered = filtered.filter(e => { const edge = getEdge(e); return edge != null && edge >= 3; }); break;
      case 'above5': filtered = filtered.filter(e => { const edge = getEdge(e); return edge != null && edge >= 5; }); break;
    }
    return [...filtered].sort((a, b) => {
      let aVal: number | string = 0, bVal: number | string = 0;
      switch (sortField) {
        case 'updated': aVal = new Date(a.updated_at).getTime(); bVal = new Date(b.updated_at).getTime(); break;
        case 'poly_price': aVal = a.polymarket_price ?? -1; bVal = b.polymarket_price ?? -1; break;
        case 'book_price': aVal = a.current_probability ?? -1; bVal = b.current_probability ?? -1; break;
        case 'volume': aVal = a.polymarket_volume ?? -1; bVal = b.polymarket_volume ?? -1; break;
        case 'name': aVal = a.event_name.toLowerCase(); bVal = b.event_name.toLowerCase(); break;
        case 'edge': aVal = getEdge(a) ?? -999; bVal = getEdge(b) ?? -999; break;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [discoveryEvents, matchFilter, edgeFilter, sortField, sortDir]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('polymarket-sync-24h', { body: {} });
      if (error) throw error;
      toast({ title: 'Sync complete', description: `${data?.synced || 0} markets synced` });
      await fetchEvents();
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleParse = () => {
    if (!rawText.trim()) return;
    const result = parseBatchImport(rawText);
    setParseResult(result);
    toast({ title: 'Parsed', description: `${result.summary.parsed} markets found` });
  };

  const handleImport = async () => {
    if (!parseResult?.markets.length) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-market-import', {
        body: { markets: parseResult.markets },
      });
      if (error) throw error;
      toast({ title: 'Import complete', description: `Created: ${data.created}, Updated: ${data.updated}` });
      setRawText('');
      setParseResult(null);
      await fetchEvents();
    } catch (err) {
      toast({ title: 'Import failed', description: String(err), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleRetryMatching = async () => {
    try {
      const { error } = await supabase.functions.invoke('watch-mode-poll', { body: {} });
      if (error) throw error;
      toast({ title: 'Matching re-run complete' });
      await fetchEvents();
    } catch (err) {
      toast({ title: 'Retry failed', description: String(err), variant: 'destructive' });
    }
  };

  const handleDismiss = async (id: string) => {
    await dismissEvents([id]);
  };

  const formatPrice = (v: number | null) => v != null ? `${(v * 100).toFixed(0)}¢` : '—';

  /** Derive bet side from book fair vs poly price.
   *  Polymarket price = YES side (first team). Book fair prob = fair value for YES side.
   *  If Book > Poly → edge on YES (first team). If Book < Poly → edge on NO (second team). */
  const getBetSide = (event: PipelineEvent): { team: string; side: 'YES' | 'NO' } | null => {
    if (event.current_probability == null || event.polymarket_price == null) return null;
    const edge = event.current_probability - event.polymarket_price;
    if (Math.abs(edge) < 0.005) return null; // no meaningful edge
    const teams = event.event_name.split(/\s+vs\.?\s+/i);
    if (teams.length < 2) return null;
    if (edge > 0) return { team: teams[0].trim(), side: 'YES' };
    return { team: teams[1].trim(), side: 'NO' };
  };

  const formatLeague = (source: string | null) => {
    if (!source) return '';
    const map: Record<string, string> = {
      'basketball_nba': 'NBA',
      'icehockey_nhl': 'NHL',
      'americanfootball_nfl': 'NFL',
      'baseball_mlb': 'MLB',
      'soccer_epl': 'EPL',
      'soccer_spain_la_liga': 'La Liga',
      'soccer_germany_bundesliga': 'Bundesliga',
      'soccer_italy_serie_a': 'Serie A',
      'soccer_uefa_champs_league': 'UCL',
      'basketball_ncaab': 'NCAAB',
    };
    return map[source] || source.replace(/_/g, ' ').toUpperCase();
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'desc' ? <ArrowDown className="h-3 w-3 inline ml-0.5" /> : <ArrowUp className="h-3 w-3 inline ml-0.5" />;
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
            <p className="text-xs text-muted-foreground">Stage 1: Discovery — Source & Match</p>
          </div>
        </div>

        <PipelineStepper counts={counts} />

        {/* Summary Bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold font-mono">{discoveryEvents.length}</div>
              <div className="text-xs text-muted-foreground">Discovered</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-green-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold font-mono text-green-400">{matched.length}</div>
              <div className="text-xs text-muted-foreground">Matched</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-amber-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold font-mono text-amber-400">{unmatched.length}</div>
              <div className="text-xs text-muted-foreground">Unmatched</div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSync} disabled={syncing} className="gap-2">
            <Search className="h-4 w-4" />
            {syncing ? 'Syncing...' : 'Sync Polymarket'}
          </Button>
          <Button variant="outline" onClick={handleRetryMatching} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry Matching
          </Button>
          {matched.length > 0 && (
            <Button
              variant="glow"
              onClick={() => promoteEvents(matched.map(e => e.id), 'analyzing')}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Send {matched.length} Matched → Analysis
            </Button>
          )}
        </div>

        {/* Batch Import */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Batch Import
            </CardTitle>
            <CardDescription className="text-xs">Paste market data from Polymarket</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="Paste market data here..."
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              className="min-h-[100px] font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleParse} disabled={!rawText.trim()}>
                <Eye className="h-3 w-3 mr-1" />
                Parse
              </Button>
              {parseResult && parseResult.markets.length > 0 && (
                <Button size="sm" variant="profit" onClick={handleImport} disabled={importing}>
                  {importing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                  Import {parseResult.markets.length}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Unmatched Teams */}
        <UnmatchedTeamsPanel />

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <Select value={matchFilter} onValueChange={(v) => setMatchFilter(v as MatchFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="has_price">Has Poly Price</SelectItem>
              <SelectItem value="no_price">No Poly Price</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Edge:</span>
          <Select value={edgeFilter} onValueChange={(v) => setEdgeFilter(v as EdgeFilter)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="positive">Edge &gt; 0%</SelectItem>
              <SelectItem value="above3">Edge ≥ 3%</SelectItem>
              <SelectItem value="above5">Edge ≥ 5%</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Sort:</span>
          {(['updated', 'poly_price', 'book_price', 'volume', 'edge', 'name'] as SortField[]).map(field => (
            <Button
              key={field}
              variant={sortField === field ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => toggleSort(field)}
            >
              {field === 'updated' ? 'Recent' : field === 'poly_price' ? 'Poly' : field === 'book_price' ? 'Book' : field === 'volume' ? 'Volume' : field === 'edge' ? 'Edge' : 'Name'}
              <SortIcon field={field} />
            </Button>
          ))}
        </div>

        {/* Markets Table */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Discovered Markets ({filteredEvents.length})</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={async () => {
              setRefreshing(true);
              await fetchEvents();
              setRefreshing(false);
              toast({ title: 'Refreshed', description: 'Market data updated' });
            }} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No markets match your filter. Try adjusting above.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Bet Side</TableHead>
                      <TableHead className="text-right">Poly YES</TableHead>
                      <TableHead className="text-right">Book Fair %</TableHead>
                      <TableHead className="text-right">Edge %</TableHead>
                      <TableHead className="text-right">EV/$100</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map(event => (
                      <TableRow key={event.id} className={cn(!event.polymarket_matched || !event.polymarket_price ? 'bg-amber-500/5' : '')}>
                        <TableCell>
                          <MatchStatusBadge
                            hasPolyPrice={event.polymarket_price != null}
                            hasBookProb={event.current_probability != null}
                            polyMatched={event.polymarket_matched}
                          />
                        </TableCell>
                        <TableCell className="max-w-[400px] text-sm" title={event.event_name}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {event.source === 'batch_import' && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-warning/10 text-warning border-warning/30">BATCH</Badge>
                            )}
                            {event.bookmaker_source && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-muted text-muted-foreground border-border">
                                {formatLeague(event.bookmaker_source)}
                              </Badge>
                            )}
                            <span className="truncate">{event.event_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const bet = getBetSide(event);
                            if (!bet) return <span className="text-muted-foreground">—</span>;
                            return (
                              <Badge variant="outline" className={cn(
                                "text-[10px] px-1.5 py-0.5 font-mono",
                                bet.side === 'YES' 
                                  ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                                  : 'bg-red-500/10 text-red-400 border-red-500/30'
                              )}>
                                {bet.side} {bet.team}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatPrice(event.polymarket_price)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{event.current_probability != null ? `${(event.current_probability * 100).toFixed(1)}%` : '—'}</TableCell>
                        <TableCell className={cn("text-right font-mono text-sm font-bold", (() => {
                          const edge = getEdge(event);
                          if (edge == null) return 'text-muted-foreground';
                          if (edge >= 3) return 'text-green-400';
                          if (edge >= 1) return 'text-yellow-400';
                          return 'text-muted-foreground';
                        })())}>
                          {(() => {
                            const edge = getEdge(event);
                            if (edge == null) return '—';
                            return `${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%`;
                          })()}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", (() => {
                          const edge = getEdge(event);
                          if (edge == null) return 'text-muted-foreground';
                          const stake = 100;
                          const polyPrice = event.polymarket_price || 0;
                          const fairProb = event.current_probability || 0;
                          const odds = polyPrice > 0 ? 1 / polyPrice : 0;
                          const ev = fairProb > 0 && odds > 0 ? (fairProb * (odds - 1) - (1 - fairProb)) * stake : 0;
                          if (ev > 0) return 'text-green-400';
                          if (ev < 0) return 'text-red-400';
                          return 'text-muted-foreground';
                        })())}>
                          {(() => {
                            if (event.current_probability == null || event.polymarket_price == null) return '—';
                            const stake = 100;
                            const polyPrice = event.polymarket_price;
                            const fairProb = event.current_probability;
                            const odds = polyPrice > 0 ? 1 / polyPrice : 0;
                            const ev = fairProb > 0 && odds > 0 ? (fairProb * (odds - 1) - (1 - fairProb)) * stake : 0;
                            return `${ev >= 0 ? '+' : ''}$${ev.toFixed(2)}`;
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {event.polymarket_volume ? `$${(event.polymarket_volume / 1000).toFixed(0)}K` : '—'}
                        </TableCell>
                        <TableCell className="p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDismiss(event.id)}
                            title="Remove from pipeline"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}