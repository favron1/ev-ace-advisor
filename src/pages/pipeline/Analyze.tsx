import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/terminal/Header';
import { PipelineStepper } from '@/components/pipeline/PipelineStepper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Eye, ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineData, type PipelineEvent } from '@/hooks/usePipelineData';

type SortField = 'edge' | 'volume' | 'confidence';

export default function Analyze() {
  const { loading, counts, promoteEvents, getEventsByStage } = usePipelineData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('edge');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  const analysisEvents = getEventsByStage('analyzing');

  // Only show events with both prices
  const eligibleEvents = useMemo(() => {
    return analysisEvents.filter(e => e.current_probability != null && e.polymarket_price != null);
  }, [analysisEvents]);

  const getEdge = (e: PipelineEvent) => ((e.current_probability || 0) - (e.polymarket_price || 0)) * 100;

  const sortedEvents = useMemo(() => {
    return [...eligibleEvents].sort((a, b) => {
      let aVal = 0, bVal = 0;
      switch (sortField) {
        case 'edge': aVal = getEdge(a); bVal = getEdge(b); break;
        case 'volume': aVal = a.polymarket_volume || 0; bVal = b.polymarket_volume || 0; break;
        case 'confidence': aVal = a.samples_since_hold || 0; bVal = b.samples_since_hold || 0; break;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [eligibleEvents, sortField, sortDir]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sortedEvents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedEvents.map(e => e.id)));
    }
  };

  const handlePromote = async () => {
    if (selected.size === 0) return;
    await promoteEvents(Array.from(selected), 'watching');
    setSelected(new Set());
  };

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <Button
      variant={sortField === field ? 'default' : 'outline'}
      size="sm"
      className="h-7 text-xs"
      onClick={() => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
      }}
    >
      {label}
      {sortField === field && (sortDir === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />)}
    </Button>
  );

  const edgeColor = (edge: number) => edge >= 3 ? 'text-green-400' : edge >= 1 ? 'text-yellow-400' : 'text-muted-foreground';
  const formatPrice = (v: number | null) => v != null ? `${(v * 100).toFixed(0)}¢` : '—';

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
            <p className="text-xs text-muted-foreground">Stage 2: Analysis — Find Edges</p>
          </div>
        </div>

        <PipelineStepper counts={counts} />

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <SortBtn field="edge" label="Edge" />
            <SortBtn field="volume" label="Volume" />
            <SortBtn field="confidence" label="Samples" />
          </div>
          {selected.size > 0 && (
            <Button variant="glow" onClick={handlePromote} className="gap-2">
              <Eye className="h-4 w-4" />
              Send {selected.size} → Watching
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Analyzable Markets ({eligibleEvents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : eligibleEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No markets ready for analysis. Promote matched markets from Discovery.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={selected.size === sortedEvents.length && sortedEvents.length > 0} onCheckedChange={toggleAll} />
                      </TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Poly</TableHead>
                      <TableHead className="text-right">Book</TableHead>
                      <TableHead className="text-right">Edge %</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEvents.map(event => {
                      const edge = getEdge(event);
                      return (
                        <TableRow
                          key={event.id}
                          className={cn(
                            selected.has(event.id) && 'bg-primary/5',
                            edge >= 3 && 'bg-green-500/5'
                          )}
                        >
                          <TableCell>
                            <Checkbox checked={selected.has(event.id)} onCheckedChange={() => toggleSelect(event.id)} />
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate text-sm">{event.event_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatPrice(event.polymarket_price)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatPrice(event.current_probability)}</TableCell>
                          <TableCell className={cn("text-right font-mono text-sm font-bold", edgeColor(edge))}>
                            {edge >= 0 ? '+' : ''}{edge.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {event.polymarket_volume ? `$${(event.polymarket_volume / 1000).toFixed(0)}K` : '—'}
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
