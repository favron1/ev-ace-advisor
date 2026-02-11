import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/terminal/Header';
import { PipelineStepper } from '@/components/pipeline/PipelineStepper';
import { StaleIndicator } from '@/components/pipeline/StaleIndicator';
import { ManualPriceOverride } from '@/components/pipeline/ManualPriceOverride';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePipelineData, type PipelineEvent } from '@/hooks/usePipelineData';

export default function Watch() {
  const { loading, counts, fetchEvents, getEventsByStage, promoteEvents } = usePipelineData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const watchingEvents = getEventsByStage('watching');

  const getEdge = (e: PipelineEvent) => ((e.current_probability || 0) - (e.polymarket_yes_price || 0)) * 100;

  const sorted = useMemo(() => {
    return [...watchingEvents].sort((a, b) => getEdge(b) - getEdge(a));
  }, [watchingEvents]);

  const handlePollNow = async () => {
    setPolling(true);
    try {
      const { error } = await supabase.functions.invoke('watch-mode-poll', { body: {} });
      if (error) throw error;
      toast({ title: 'Poll complete' });
      await fetchEvents();
    } catch (err) {
      toast({ title: 'Poll failed', description: String(err), variant: 'destructive' });
    } finally {
      setPolling(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePromote = async () => {
    if (selected.size === 0) return;
    await promoteEvents(Array.from(selected), 'executing');
    setSelected(new Set());
  };

  const MovementIcon = ({ velocity }: { velocity: number | null }) => {
    if (!velocity || velocity === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (velocity > 0) return <TrendingUp className="h-3 w-3 text-green-400" />;
    return <TrendingDown className="h-3 w-3 text-red-400" />;
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
            <p className="text-xs text-muted-foreground">Stage 3: Watching — Monitor Edges</p>
          </div>
        </div>

        <PipelineStepper counts={counts} />

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={handlePollNow} disabled={polling} variant="outline" className="gap-2">
              <RefreshCw className={cn("h-4 w-4", polling && "animate-spin")} />
              Poll Now
            </Button>
            <Badge variant="outline" className="text-xs">
              Auto-poll every 5 min
            </Badge>
          </div>
          {selected.size > 0 && (
            <Button variant="glow" onClick={handlePromote} className="gap-2">
              <Zap className="h-4 w-4" />
              Send {selected.size} → Execute
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Watching ({watchingEvents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : watchingEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No events being watched. Promote from Analysis.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selected.size === sorted.length && sorted.length > 0}
                          onCheckedChange={() => {
                            if (selected.size === sorted.length) setSelected(new Set());
                            else setSelected(new Set(sorted.map(e => e.id)));
                          }}
                        />
                      </TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Poly</TableHead>
                      <TableHead className="text-right">Book</TableHead>
                      <TableHead className="text-right">Edge</TableHead>
                      <TableHead className="text-center">Trend</TableHead>
                      <TableHead className="text-center">Freshness</TableHead>
                      <TableHead className="text-right">Samples</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map(event => {
                      const edge = getEdge(event);
                      return (
                        <TableRow key={event.id} className={cn(selected.has(event.id) && 'bg-primary/5')}>
                          <TableCell>
                            <Checkbox checked={selected.has(event.id)} onCheckedChange={() => toggleSelect(event.id)} />
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">{event.event_name}</TableCell>
                          <TableCell className="text-right">
                            <ManualPriceOverride
                              eventId={event.id}
                              field="polymarket_yes_price"
                              currentValue={event.polymarket_yes_price}
                              onSaved={fetchEvents}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <ManualPriceOverride
                              eventId={event.id}
                              field="current_probability"
                              currentValue={event.current_probability}
                              onSaved={fetchEvents}
                            />
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-mono text-sm font-bold",
                            edge >= 3 ? 'text-green-400' : edge >= 1 ? 'text-yellow-400' : 'text-muted-foreground'
                          )}>
                            {edge >= 0 ? '+' : ''}{edge.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-center">
                            <MovementIcon velocity={event.movement_velocity} />
                          </TableCell>
                          <TableCell className="text-center">
                            <StaleIndicator lastUpdated={event.last_poly_refresh || event.updated_at} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {event.samples_since_hold || 0}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
