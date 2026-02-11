import { useState } from 'react';
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
import { RefreshCw, Upload, Eye, Loader2, ArrowLeft, Search, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePipelineData, type PipelineEvent } from '@/hooks/usePipelineData';
import { parseBatchImport, type ParseResult } from '@/lib/batch-parser';

export default function Discover() {
  const { events, loading, counts, fetchEvents, getDiscoveryEvents, promoteEvents } = usePipelineData();
  const [syncing, setSyncing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const discoveryEvents = getDiscoveryEvents();

  const matched = discoveryEvents.filter(e => e.polymarket_matched && e.current_probability != null);
  const unmatched = discoveryEvents.filter(e => !e.polymarket_matched || e.current_probability == null);

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

  const formatPrice = (v: number | null) => v != null ? `${(v * 100).toFixed(0)}¢` : '—';

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

        {/* Markets Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Discovered Markets ({discoveryEvents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : discoveryEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No markets discovered yet. Click "Sync Polymarket" to start.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Poly YES</TableHead>
                      <TableHead className="text-right">Book Fair</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discoveryEvents.map(event => (
                      <TableRow key={event.id} className={!event.polymarket_matched || !event.current_probability ? 'bg-amber-500/5' : ''}>
                        <TableCell>
                          <MatchStatusBadge
                            hasPolyPrice={event.polymarket_yes_price != null}
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
                            {event.outcome && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 bg-primary/10 text-primary border-primary/30">
                                BET {event.outcome.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatPrice(event.polymarket_yes_price)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatPrice(event.current_probability)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {event.polymarket_volume ? `$${(event.polymarket_volume / 1000).toFixed(0)}K` : '—'}
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
