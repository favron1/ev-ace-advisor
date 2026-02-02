import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/terminal/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Eye, Zap, CheckCircle, AlertTriangle, Clock, TrendingUp, Activity, ArrowUp, ArrowDown, ArrowLeft, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type SortField = 'edge' | 'movement' | 'volume' | 'updated' | 'samples' | 'confidence' | 'probability' | 'time';
type SortDirection = 'asc' | 'desc';

interface WatchEvent {
  id: string;
  event_key: string;
  event_name: string;
  watch_state: string;
  escalated_at: string | null;
  hold_start_at: string | null;
  samples_since_hold: number;
  active_until: string | null;
  commence_time: string | null;
  movement_pct: number;
  current_probability: number | null;
  initial_probability: number | null;
  polymarket_yes_price: number | null;
  polymarket_volume: number | null;
  polymarket_condition_id: string | null;
  bookmaker_source: string | null;
  bookmaker_market_key: string | null;
  last_poly_refresh: string | null;
  updated_at: string;
  created_at: string;
}

interface Signal {
  id: string;
  event_name: string;
  status: string;
  side: string;
  edge_percent: number;
  confidence_score: number;
  movement_confirmed: boolean;
  polymarket_yes_price: number | null;
  bookmaker_probability: number;
  created_at: string;
  expires_at: string | null;
  polymarket_condition_id: string | null;
  signal_tier: string | null;
}

interface Snapshot {
  id: string;
  event_key: string;
  event_name: string;
  fair_probability: number;
  captured_at: string;
  source: string;
}

const getStateColor = (state: string) => {
  switch (state) {
    case 'watching': return 'bg-muted text-muted-foreground';
    case 'monitored': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'active': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'confirmed': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'signal': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'dropped': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'expired': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getStateIcon = (state: string) => {
  switch (state) {
    case 'watching': return <Eye className="h-3 w-3" />;
    case 'monitored': return <Activity className="h-3 w-3" />;
    case 'active': return <Zap className="h-3 w-3" />;
    case 'confirmed': return <CheckCircle className="h-3 w-3" />;
    case 'signal': return <TrendingUp className="h-3 w-3" />;
    case 'dropped': return <AlertTriangle className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
};

const isPastOrStale = (event: WatchEvent) => {
  // Prefer commence_time; fallback to updated_at when commence_time is missing (some markets don't populate it reliably)
  const now = Date.now();
  const graceMs = 30 * 60 * 1000; // 30m grace

  if (event.commence_time) {
    const t = new Date(event.commence_time).getTime();
    if (!Number.isNaN(t)) {
      return t < now - graceMs;
    }
  }

  // Fallback: if we haven't seen an update in 36h, treat as stale/past
  const updated = new Date(event.updated_at).getTime();
  if (!Number.isNaN(updated)) {
    return updated < now - 36 * 60 * 60 * 1000;
  }

  return false;
};

// Detect futures markets that shouldn't be in the pipeline (only H2H games belong here)
const isFuturesMarket = (event: WatchEvent) => {
  const name = event.event_name.toLowerCase();
  const futuresPatterns = [
    'traded', 'trade', 'win totals', 'over or under',
    'trophy', 'championship', 'mvp', 'winner', 'playoffs',
    'division', 'conference', 'which', 'where will', 'will be'
  ];
  return futuresPatterns.some(p => name.includes(p));
};

// Detect non-H2H markets (spreads, totals) that can't match to H2H bookmaker data
const isNonH2HMarket = (event: WatchEvent) => {
  const name = event.event_name.toLowerCase();
  const nonH2HPatterns = [
    'spread:', 'spread ', 'o/u ', 'over/under',
    '(-1.5)', '(+1.5)', '(-2.5)', '(+2.5)', '(-3.5)', '(+3.5)',
    '(-0.5)', '(+0.5)', '(-4.5)', '(+4.5)', '(-5.5)', '(+5.5)',
    ': o/u', 'total '
  ];
  return nonH2HPatterns.some(p => name.includes(p));
};

export default function Pipeline() {
  const [watchEvents, setWatchEvents] = useState<WatchEvent[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [recentSnapshots, setRecentSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('edge');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAddToSignalFeed = async (event: WatchEvent) => {
    if (!event.current_probability || !event.polymarket_yes_price) {
      toast({
        title: 'Cannot create signal',
        description: 'This event is missing book or Polymarket price data',
        variant: 'destructive',
      });
      return;
    }

    const edge = (event.current_probability - event.polymarket_yes_price) * 100;
    
    const { error } = await supabase.from('signal_opportunities').insert({
      event_name: event.event_name,
      side: 'YES',
      polymarket_price: event.polymarket_yes_price,
      polymarket_yes_price: event.polymarket_yes_price,
      polymarket_volume: event.polymarket_volume,
      polymarket_condition_id: event.polymarket_condition_id,
      polymarket_match_confidence: 1.0,
      bookmaker_probability: event.current_probability,
      bookmaker_prob_fair: event.current_probability,
      edge_percent: edge,
      is_true_arbitrage: true,
      movement_confirmed: (event.movement_pct || 0) > 0,
      confidence_score: Math.min(90, 60 + Math.round(edge * 3)),
      urgency: edge > 8 ? 'high' : 'normal',
      status: 'active',
      signal_tier: 'MANUAL',
      core_logic_version: 'v1.3',
      signal_factors: {
        edge_type: 'manual_pipeline_promotion',
        movement_pct: event.movement_pct,
      },
    });

    if (error) {
      toast({
        title: 'Failed to create signal',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Signal created', description: event.event_name });
      await fetchData();
    }
  };

  // Sort button component
  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <Button
      variant={sortField === field ? "default" : "outline"}
      size="sm"
      className="h-7 text-xs"
      onClick={() => {
        if (sortField === field) {
          setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
          setSortField(field);
          setSortDirection('desc');
        }
      }}
    >
      {label}
      {sortField === field && (
        sortDirection === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />
      )}
    </Button>
  );

  // Sort functions
  const sortEvents = (events: WatchEvent[]) => {
    return [...events].sort((a, b) => {
      let aVal = 0, bVal = 0;
      switch (sortField) {
        case 'edge':
          aVal = (a.current_probability || 0) - (a.polymarket_yes_price || 0);
          bVal = (b.current_probability || 0) - (b.polymarket_yes_price || 0);
          break;
        case 'movement':
          aVal = a.movement_pct || 0;
          bVal = b.movement_pct || 0;
          break;
        case 'volume':
          aVal = a.polymarket_volume || 0;
          bVal = b.polymarket_volume || 0;
          break;
        case 'updated':
          aVal = new Date(a.updated_at).getTime();
          bVal = new Date(b.updated_at).getTime();
          break;
        case 'samples':
          aVal = a.samples_since_hold || 0;
          bVal = b.samples_since_hold || 0;
          break;
        default:
          aVal = (a.current_probability || 0) - (a.polymarket_yes_price || 0);
          bVal = (b.current_probability || 0) - (b.polymarket_yes_price || 0);
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const sortSignals = (sigs: Signal[]) => {
    return [...sigs].sort((a, b) => {
      let aVal = 0, bVal = 0;
      switch (sortField) {
        case 'edge':
          aVal = a.edge_percent || 0;
          bVal = b.edge_percent || 0;
          break;
        case 'confidence':
          aVal = a.confidence_score || 0;
          bVal = b.confidence_score || 0;
          break;
        case 'updated':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        default:
          aVal = a.edge_percent || 0;
          bVal = b.edge_percent || 0;
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const sortSnapshots = (snaps: Snapshot[]) => {
    return [...snaps].sort((a, b) => {
      let aVal = 0, bVal = 0;
      switch (sortField) {
        case 'probability':
          aVal = a.fair_probability || 0;
          bVal = b.fair_probability || 0;
          break;
        case 'time':
          aVal = new Date(a.captured_at).getTime();
          bVal = new Date(b.captured_at).getTime();
          break;
        default:
          aVal = new Date(a.captured_at).getTime();
          bVal = new Date(b.captured_at).getTime();
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const fetchData = async () => {
    try {
      const [watchRes, signalsRes, snapshotsRes] = await Promise.all([
        supabase
          .from('event_watch_state')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('signal_opportunities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('probability_snapshots')
          .select('*')
          .order('captured_at', { ascending: false })
          .limit(100),
      ]);

      if (watchRes.data) setWatchEvents(watchRes.data as unknown as WatchEvent[]);
      if (signalsRes.data) setSignals(signalsRes.data as unknown as Signal[]);
      if (snapshotsRes.data) setRecentSnapshots(snapshotsRes.data as unknown as Snapshot[]);
    } catch (err) {
      console.error('Failed to fetch pipeline data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast({ title: 'Pipeline data refreshed' });
    setRefreshing(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Filter out futures and past/stale events, then group by state
  const filteredEvents = watchEvents.filter(e => !isPastOrStale(e) && !isFuturesMarket(e));
  
  const eventsByState = filteredEvents.reduce((acc, event) => {
    const state = event.watch_state || 'unknown';
    if (!acc[state]) acc[state] = [];
    acc[state].push(event);
    return acc;
  }, {} as Record<string, WatchEvent[]>);

  // Only show active pipeline states (no expired/dropped)
  const stateOrder = ['signal', 'confirmed', 'active', 'monitored', 'watching'];
  const stateCounts = stateOrder.map(state => ({
    state,
    count: eventsByState[state]?.length || 0
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/')}
              title="Back to Terminal"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Pipeline Monitor</h1>
              <p className="text-muted-foreground text-sm">Full visibility into event detection → signal creation</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* State Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {stateCounts.map(({ state, count }) => (
            <Card key={state} className={`border ${count > 0 ? getStateColor(state) : ''}`}>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  {getStateIcon(state)}
                  <span className="text-xs font-medium capitalize">{state}</span>
                </div>
                <div className="text-2xl font-bold">{count}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All Events ({filteredEvents.filter(e => e.watch_state !== 'expired' && e.watch_state !== 'dropped').length})</TabsTrigger>
            <TabsTrigger value="active">Active Pipeline ({(eventsByState['active']?.length || 0) + (eventsByState['monitored']?.length || 0)})</TabsTrigger>
            <TabsTrigger value="signals">Signals ({signals.length})</TabsTrigger>
            <TabsTrigger value="snapshots">Recent Snapshots</TabsTrigger>
          </TabsList>

          {/* All Events Tab */}
          <TabsContent value="all">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">All Watched Events</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sort:</span>
                    <SortButton field="edge" label="Edge" />
                    <SortButton field="movement" label="Movement" />
                    <SortButton field="volume" label="Volume" />
                    <SortButton field="updated" label="Updated" />
                    <SortButton field="samples" label="Samples" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {loading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : filteredEvents.filter(e => e.watch_state !== 'expired' && e.watch_state !== 'dropped').length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No events in pipeline</div>
                    ) : (
                      sortEvents(filteredEvents.filter(e => e.watch_state !== 'expired' && e.watch_state !== 'dropped')).map((event) => (
                        <div
                          key={event.id}
                          className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className={getStateColor(event.watch_state)}>
                                  {getStateIcon(event.watch_state)}
                                  <span className="ml-1">{event.watch_state}</span>
                                </Badge>
                                <span className="font-medium truncate">{event.event_name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  <span>Movement: <span className="font-mono text-foreground">{event.movement_pct?.toFixed(2) || 0}%</span></span>
                                  <span>Poly: <span className="font-mono text-foreground">{event.polymarket_yes_price ? `${Math.round(event.polymarket_yes_price * 100)}¢` : '-'}</span></span>
                                  <span>Book: <span className="font-mono text-foreground">{event.current_probability ? `${(event.current_probability * 100).toFixed(1)}%` : '-'}</span></span>
                                  <span>Samples: <span className="font-mono text-foreground">{event.samples_since_hold}</span></span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  <span>Volume: <span className="font-mono text-foreground">${event.polymarket_volume?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}</span></span>
                                  <span>Source: <span className="text-foreground">{event.bookmaker_source || '-'}</span></span>
                                  <span>Updated: <span className="text-foreground">{formatTime(event.updated_at)}</span></span>
                                </div>
                              </div>
                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => handleAddToSignalFeed(event)}
                                                disabled={!event.current_probability || !event.polymarket_yes_price}
                                              >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Add to Signals
                                              </Button>
                                              <div className="text-xs text-muted-foreground text-right">
                                                {event.escalated_at && (
                                                  <div>Escalated: {formatTime(event.escalated_at)}</div>
                                                )}
                                                {event.hold_start_at && (
                                                  <div>Hold: {formatTime(event.hold_start_at)}</div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Active Pipeline Tab */}
          <TabsContent value="active">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Active Pipeline (Monitored + Active)</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sort:</span>
                    <SortButton field="edge" label="Edge" />
                    <SortButton field="movement" label="Movement" />
                    <SortButton field="volume" label="Volume" />
                    <SortButton field="samples" label="Samples" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {[...(eventsByState['active'] || []), ...(eventsByState['monitored'] || [])].length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No events currently in active monitoring</div>
                    ) : (
                      sortEvents([...(eventsByState['active'] || []), ...(eventsByState['monitored'] || [])]).map((event) => (
                        <div
                          key={event.id}
                          className="p-4 rounded-lg border bg-card"
                        >
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <Badge variant="outline" className={getStateColor(event.watch_state)}>
                                {getStateIcon(event.watch_state)}
                                <span className="ml-1">{event.watch_state}</span>
                              </Badge>
                              <h3 className="font-semibold mt-1">{event.event_name}</h3>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-primary">
                                {event.movement_pct?.toFixed(1) || 0}%
                              </div>
                              <div className="text-xs text-muted-foreground">movement</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div className="p-2 rounded bg-muted/50">
                              <div className="text-xs text-muted-foreground">Polymarket</div>
                              <div className="font-mono font-semibold">
                                {event.polymarket_yes_price ? `${Math.round(event.polymarket_yes_price * 100)}¢` : '-'}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <div className="text-xs text-muted-foreground">Bookmaker</div>
                              <div className="font-mono font-semibold">
                                {event.current_probability ? `${(event.current_probability * 100).toFixed(1)}%` : '-'}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <div className="text-xs text-muted-foreground">Edge (Book - Poly)</div>
                              <div className="font-mono font-semibold">
                                {event.current_probability && event.polymarket_yes_price 
                                  ? `${((event.current_probability - event.polymarket_yes_price) * 100).toFixed(1)}%`
                                  : '-'}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <div className="text-xs text-muted-foreground">Samples</div>
                              <div className="font-mono font-semibold">{event.samples_since_hold}</div>
                            </div>
                          </div>
                          
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>Volume: ${event.polymarket_volume?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}</span>
                              <span>•</span>
                              <span>Source: {event.bookmaker_source || '-'}</span>
                              <span>•</span>
                              <span>Last refresh: {formatTime(event.last_poly_refresh)}</span>
                              {event.escalated_at && (
                                <>
                                  <span>•</span>
                                  <span>Escalated: {formatTime(event.escalated_at)}</span>
                                </>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleAddToSignalFeed(event)}
                              disabled={!event.current_probability || !event.polymarket_yes_price}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add to Signals
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Signal Opportunities</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sort:</span>
                    <SortButton field="edge" label="Edge" />
                    <SortButton field="confidence" label="Confidence" />
                    <SortButton field="updated" label="Updated" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {signals.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No signals created yet</div>
                    ) : (
                      sortSignals(signals).map((signal) => (
                        <div
                          key={signal.id}
                          className="p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={signal.status === 'active' ? 'default' : 'secondary'}>
                                  {signal.status}
                                </Badge>
                                <Badge variant="outline">{signal.side}</Badge>
                                {signal.signal_tier && (
                                  <Badge variant="outline" className="text-xs">{signal.signal_tier}</Badge>
                                )}
                                <span className="font-medium">{signal.event_name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                                <span>Edge: <span className="font-mono text-foreground">{signal.edge_percent?.toFixed(1)}%</span></span>
                                <span>Confidence: <span className="font-mono text-foreground">{signal.confidence_score}</span></span>
                                <span>Poly: <span className="font-mono text-foreground">{signal.polymarket_yes_price ? `${Math.round(signal.polymarket_yes_price * 100)}¢` : '-'}</span></span>
                                <span>Book: <span className="font-mono text-foreground">{(signal.bookmaker_probability * 100).toFixed(1)}%</span></span>
                                <span>Movement: <span className="font-mono text-foreground">{signal.movement_confirmed ? '✓' : '✗'}</span></span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <div>{formatTime(signal.created_at)}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Snapshots Tab */}
          <TabsContent value="snapshots">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Recent Probability Snapshots</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sort:</span>
                    <SortButton field="probability" label="Probability" />
                    <SortButton field="time" label="Time" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-1">
                    {recentSnapshots.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No snapshots recorded</div>
                    ) : (
                      sortSnapshots(recentSnapshots).map((snap) => (
                        <div
                          key={snap.id}
                          className="p-2 rounded border bg-card text-sm flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs">{snap.source || 'sharp'}</Badge>
                            <span className="truncate max-w-[300px]">{snap.event_name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-muted-foreground">
                            <span className="font-mono">{(snap.fair_probability * 100).toFixed(1)}%</span>
                            <span className="text-xs">{formatTime(snap.captured_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
