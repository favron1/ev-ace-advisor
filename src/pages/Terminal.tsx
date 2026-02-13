// ============================================================================
// LAYER 2: PRESENTATION - SAFE TO MODIFY
// ============================================================================
// Professional Sports Betting Terminal UI
// Designed for professional bettors and whales
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Scan, 
  TrendingUp, 
  Target, 
  BarChart3, 
  Zap, 
  RefreshCw, 
  AlertTriangle,
  DollarSign,
  Activity,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Eye,
  Wallet,
  Settings,
  ArrowLeft
} from 'lucide-react';
import { useSignals } from '@/hooks/useSignals';
import { useScanConfig } from '@/hooks/useScanConfig';
import { useWatchState } from '@/hooks/useWatchState';
import { useAutoPolling } from '@/hooks/useAutoPolling';
import { useNotifications } from '@/hooks/useNotifications';
import { useOvernightStats } from '@/hooks/useOvernightStats';
import { arbitrageApi } from '@/lib/api/arbitrage';
import { toast } from '@/hooks/use-toast';
import type { SignalLog } from '@/types/arbitrage';
import type { EventWatchState } from '@/types/scan-config';
import { cn } from '@/lib/utils';

// Types for real data
interface WhalePositionWithWallet {
  id: string;
  event_name: string;
  side: string;
  size: number;
  avg_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  status: string | null;
  wallet_id: string;
  display_name: string | null;
  wallet_address: string;
  confidence_tier: string | null;
}

interface LineShoppingOpp {
  id: string | null;
  event_name: string | null;
  side: string | null;
  polymarket_price: number | null;
  sharp_consensus_prob: number | null;
  sharp_line_edge: number | null;
  edge_percent: number | null;
  confidence_score: number | null;
  line_shopping_tier: string | null;
  contributing_books: string[] | null;
  kelly_fraction: number | null;
  suggested_stake_cents: number | null;
  status: string | null;
}

interface MultiLegOpp {
  id: string;
  event_name: string;
  legs: any;
  combined_edge: number | null;
  correlation_score: number | null;
  combined_probability: number | null;
  sport: string | null;
  status: string | null;
  expires_at: string | null;
}

export default function Terminal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<SignalLog[]>([]);
  const [activeTab, setActiveTab] = useState('whale-activity');

  // Real data states
  const [whalePositions, setWhalePositions] = useState<WhalePositionWithWallet[]>([]);
  const [whaleLoading, setWhaleLoading] = useState(true);
  const [lineShoppingData, setLineShoppingData] = useState<LineShoppingOpp[]>([]);
  const [lineShoppingLoading, setLineShoppingLoading] = useState(true);
  const [multiLegOpps, setMultiLegOpps] = useState<MultiLegOpp[]>([]);
  const [multiLegLoading, setMultiLegLoading] = useState(true);

  // Core hooks
  const { 
    signals, 
    loading: signalsLoading, 
    detecting,
    refreshing,
    dismissSignal, 
    executeSignal,
    getFilteredSignals,
    fetchSignals,
    refreshSignals,
  } = useSignals();

  const {
    config: scanConfig,
    status: scanStatus,
    scanning,
    runManualScan,
    togglePause,
    toggleFastMode,
  } = useScanConfig();

  const {
    watchingEvents,
    activeEvents,
    polling: watchPolling,
    runWatchModePoll,
    runActiveModePoll,
    totalWatching,
    totalActive,
  } = useWatchState({});

  const { stats: overnightStats } = useOvernightStats();

  // Notifications hook
  const {
    enabled: notificationsEnabled,
    permission: notificationPermission,
    hasUnviewedConfirmed,
    unviewedCount,
    toggle: toggleNotifications,
    notify,
    markViewed,
  } = useNotifications();

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch logs for stats
  useEffect(() => {
    arbitrageApi.getSignalLogs(100).then(setLogs).catch(console.error);
  }, []);

  // Fetch whale positions with wallet info
  useEffect(() => {
    const fetchWhaleData = async () => {
      setWhaleLoading(true);
      try {
        const { data: positions } = await supabase
          .from('whale_positions')
          .select('*')
          .eq('status', 'open')
          .order('size', { ascending: false })
          .limit(20);
        
        if (positions && positions.length > 0) {
          const walletIds = [...new Set(positions.map(p => p.wallet_id))];
          const { data: wallets } = await supabase
            .from('whale_wallets')
            .select('id, display_name, wallet_address, confidence_tier')
            .in('id', walletIds);
          
          const walletMap = new Map(wallets?.map(w => [w.id, w]) || []);
          
          const enriched: WhalePositionWithWallet[] = positions.map(p => {
            const wallet = walletMap.get(p.wallet_id);
            return {
              ...p,
              display_name: wallet?.display_name || null,
              wallet_address: wallet?.wallet_address || p.wallet_id,
              confidence_tier: wallet?.confidence_tier || null,
            };
          });
          setWhalePositions(enriched);
        } else {
          setWhalePositions([]);
        }
      } catch (err) {
        console.error('Failed to fetch whale data:', err);
        setWhalePositions([]);
      } finally {
        setWhaleLoading(false);
      }
    };
    fetchWhaleData();
  }, []);

  // Fetch line shopping data from view
  useEffect(() => {
    const fetchLineShopping = async () => {
      setLineShoppingLoading(true);
      try {
        const { data } = await supabase
          .from('line_shopping_opportunities')
          .select('*')
          .eq('status', 'active')
          .order('sharp_line_edge', { ascending: false, nullsFirst: false })
          .limit(20);
        setLineShoppingData((data as LineShoppingOpp[]) || []);
      } catch (err) {
        console.error('Failed to fetch line shopping:', err);
        setLineShoppingData([]);
      } finally {
        setLineShoppingLoading(false);
      }
    };
    fetchLineShopping();
  }, []);

  // Fetch multi-leg opportunities
  useEffect(() => {
    const fetchMultiLeg = async () => {
      setMultiLegLoading(true);
      try {
        const { data } = await supabase
          .from('multi_leg_opportunities')
          .select('*')
          .eq('status', 'active')
          .order('combined_edge', { ascending: false })
          .limit(20);
        setMultiLegOpps((data as MultiLegOpp[]) || []);
      } catch (err) {
        console.error('Failed to fetch multi-leg:', err);
        setMultiLegOpps([]);
      } finally {
        setMultiLegLoading(false);
      }
    };
    fetchMultiLeg();
  }, []);

  // One-click scan that triggers full pipeline
  const handleFullScan = async () => {
    try {
      toast({ title: 'Scanning Markets', description: 'Running discovery + matching + signal detection...' });
      
      await runManualScan();
      await fetchSignals();
      
      toast({ 
        title: 'Scan Complete', 
        description: `Found ${signals.length} opportunities`,
        duration: 3000 
      });
    } catch (error) {
      toast({ 
        title: 'Scan Failed', 
        description: 'Could not complete market scan',
        variant: 'destructive' 
      });
    }
  };

  // Compute portfolio stats from real signal_logs
  const portfolioStats = (() => {
    const now = new Date();
    const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const day30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const settled = logs.filter(l => l.outcome && l.outcome !== 'pending');
    const last24h = settled.filter(l => new Date(l.created_at) >= day24h);
    const last30d = settled.filter(l => new Date(l.created_at) >= day30d);

    const pnl24h = last24h.reduce((sum, l) => sum + (l.profit_loss || 0), 0);
    const pnl30d = last30d.reduce((sum, l) => sum + (l.profit_loss || 0), 0);
    const activeBets = logs.filter(l => l.outcome === 'pending').length;
    const wins = settled.filter(l => l.outcome === 'win').length;
    const winRate = settled.length > 0 ? (wins / settled.length) * 100 : 0;

    return { pnl24h, pnl30d, activeBets, winRate };
  })();

  if (!user) {
    return null;
  }

  // Get high-value signals for quick display
  const highValueSignals = signals
    .filter(s => s.edge_percent && s.edge_percent >= 3)
    .sort((a, b) => (b.edge_percent || 0) - (a.edge_percent || 0))
    .slice(0, 8);

  const tierLabel = (tier: string | null) => {
    if (tier === 'high') return 'Tier 1';
    if (tier === 'medium') return 'Tier 2';
    return 'Tier 3';
  };

  const tierColor = (tier: string | null) => {
    if (tier === 'high') return 'bg-green-500/20 text-green-400 border-green-500/50';
    if (tier === 'medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="container mx-auto px-3 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 lg:gap-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">EV Ace Terminal</h1>
                <p className="text-xs sm:text-sm text-slate-400">Professional Sports Betting Platform</p>
              </div>
              
              <Button 
                size="default"
                onClick={handleFullScan}
                disabled={scanning || detecting}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-lg"
              >
                <Scan className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                {scanning || detecting ? 'Scanning...' : 'Scan Markets'}
              </Button>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div className="text-right hidden sm:block">
                <div className="text-xs sm:text-sm text-slate-400">24h P&L</div>
                <div className={cn("text-sm sm:text-lg font-bold", portfolioStats.pnl24h >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {portfolioStats.pnl24h >= 0 ? '+' : ''}${portfolioStats.pnl24h.toFixed(2)}
                </div>
              </div>
              
              <Button 
                variant="ghost" 
                size="sm"
                className={cn(
                  "relative",
                  hasUnviewedConfirmed && "bg-red-500/20 border-red-500/50"
                )}
                onClick={markViewed}
              >
                <Activity className="h-4 w-4" />
                {unviewedCount > 0 && (
                  <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
                    {unviewedCount}
                  </Badge>
                )}
              </Button>

              <Button variant="ghost" size="sm" onClick={() => navigate('/pipeline/discover')} className="hidden lg:flex">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Pipeline View
              </Button>

              <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
                <Settings className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard */}
      <div className="container mx-auto px-3 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          
          {/* Left Column - Live Signal Feed */}
          <div className="lg:col-span-5 order-1">
            <Card className="bg-slate-900/50 border-slate-700 h-[400px] lg:h-[calc(100vh-200px)]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                    Live Signal Feed
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
                      {highValueSignals.length} Active
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={refreshSignals} disabled={refreshing}>
                      <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[320px] lg:h-[calc(100vh-280px)]">
                  {signalsLoading ? (
                    <div className="p-6 text-center text-slate-400">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                      Loading signals...
                    </div>
                  ) : highValueSignals.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-2">No Active Signals</p>
                      <p className="text-sm">Run a market scan to discover +EV opportunities</p>
                    </div>
                  ) : (
                    <div className="space-y-2 p-4">
                      {highValueSignals.map((signal) => (
                        <div 
                          key={signal.id}
                          className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800/70 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-white text-sm mb-1">
                                {signal.event_name}
                              </h3>
                              <div className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                                  {signal.urgency || 'Unknown'}
                                </Badge>
                                <span className="text-slate-400">
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {signal.expires_at ? new Date(signal.expires_at).toLocaleTimeString() : 'Live'}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-green-400">
                                +{signal.edge_percent?.toFixed(1)}%
                              </div>
                              <div className="text-xs text-slate-400">edge</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <div className="text-slate-400">Confidence</div>
                              <div className="font-semibold text-white">
                                {((signal.confidence_score || 0)).toFixed(0)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400">Polymarket</div>
                              <div className="font-semibold text-white">
                                {((signal.polymarket_price || 0) * 100).toFixed(0)}¢
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400">Book Fair</div>
                              <div className="font-semibold text-white">
                                {((signal.bookmaker_probability || 0) * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-3">
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => executeSignal(signal.id, signal.polymarket_price || 0)}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Execute
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-slate-600 text-slate-300 hover:bg-slate-700"
                              onClick={() => dismissSignal(signal.id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Analyze
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Panels */}
          <div className="lg:col-span-7 order-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-[500px] lg:h-[calc(100vh-200px)]">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-slate-800 border-slate-700 h-auto">
                <TabsTrigger value="whale-activity" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm py-2">
                  <span className="hidden sm:inline">Whale Activity</span>
                  <span className="sm:hidden">Whales</span>
                </TabsTrigger>
                <TabsTrigger value="line-shopping" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm py-2">
                  <span className="hidden sm:inline">Line Shopping</span>
                  <span className="sm:hidden">Lines</span>
                </TabsTrigger>
                <TabsTrigger value="multi-leg" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm py-2">
                  <span className="hidden sm:inline">Multi-Leg</span>
                  <span className="sm:hidden">Multi</span>
                </TabsTrigger>
                <TabsTrigger value="portfolio" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm py-2">
                  <span className="hidden sm:inline">Portfolio</span>
                  <span className="sm:hidden">P&L</span>
                </TabsTrigger>
              </TabsList>

              {/* Whale Activity Panel */}
              <TabsContent value="whale-activity" className="mt-4 h-[calc(100%-60px)]">
                <Card className="bg-slate-900/50 border-slate-700 h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-purple-400" />
                      Whale Activity Monitor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px] lg:h-[calc(100vh-350px)]">
                      {whaleLoading ? (
                        <div className="p-6 text-center text-slate-400">
                          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                          Loading whale activity...
                        </div>
                      ) : whalePositions.length === 0 ? (
                        <div className="p-6 text-center text-slate-400">
                          <Wallet className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="text-lg font-medium mb-2">No Whale Positions</p>
                          <p className="text-sm">No open whale positions detected yet. The whale tracker will populate this when positions are found.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {whalePositions.map((pos) => (
                            <div key={pos.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                                      {pos.display_name || pos.wallet_address.slice(0, 8)}
                                    </Badge>
                                    <Badge variant="outline" className={tierColor(pos.confidence_tier)}>
                                      {tierLabel(pos.confidence_tier)}
                                    </Badge>
                                  </div>
                                  <h3 className="font-semibold text-white text-sm">{pos.event_name}</h3>
                                  <p className="text-xs text-slate-400">{pos.side}</p>
                                </div>
                                <div className="text-right">
                                  <div className={cn(
                                    "text-lg font-bold",
                                    (pos.unrealized_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                                  )}>
                                    {(pos.unrealized_pnl || 0) >= 0 ? '+' : ''}${(pos.unrealized_pnl || 0).toFixed(0)}
                                  </div>
                                  <div className="text-xs text-slate-400">P&L</div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                  <div className="text-slate-400">Size</div>
                                  <div className="font-semibold text-white">${pos.size.toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-slate-400">Avg Price</div>
                                  <div className="font-semibold text-white">{(pos.avg_price * 100).toFixed(0)}¢</div>
                                </div>
                                <div>
                                  <div className="text-slate-400">Current</div>
                                  <div className="font-semibold text-white">
                                    {pos.current_price ? `${(pos.current_price * 100).toFixed(0)}¢` : 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Line Shopping Dashboard */}
              <TabsContent value="line-shopping" className="mt-4 h-[calc(100%-60px)]">
                <Card className="bg-slate-900/50 border-slate-700 h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <LineChart className="h-5 w-5 text-blue-400" />
                      Line Shopping vs Sharp Books
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px] lg:h-[calc(100vh-350px)]">
                      {lineShoppingLoading ? (
                        <div className="p-6 text-center text-slate-400">
                          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                          Loading line shopping data...
                        </div>
                      ) : lineShoppingData.length === 0 ? (
                        <div className="p-6 text-center text-slate-400">
                          <LineChart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="text-lg font-medium mb-2">No Line Shopping Data</p>
                          <p className="text-sm">Sharp consensus data will appear here once the sharp line fetcher runs and finds discrepancies.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {lineShoppingData.map((line) => (
                            <div key={line.id || Math.random()} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h3 className="font-semibold text-white text-sm mb-1">{line.event_name}</h3>
                                  <div className="flex items-center gap-2 text-xs">
                                    {line.line_shopping_tier && (
                                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                                        {line.line_shopping_tier}
                                      </Badge>
                                    )}
                                    {line.contributing_books && (
                                      <span className="text-slate-400">
                                        {line.contributing_books.length} book{line.contributing_books.length !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={cn(
                                    "text-lg font-bold",
                                    (line.sharp_line_edge || 0) > 0 ? 'text-green-400' : 'text-red-400'
                                  )}>
                                    {(line.sharp_line_edge || 0) > 0 ? '+' : ''}{(line.sharp_line_edge || 0).toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-slate-400">vs Sharp</div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                  <div className="text-slate-400">Polymarket</div>
                                  <div className="font-semibold text-white">
                                    {line.polymarket_price ? `${(line.polymarket_price * 100).toFixed(0)}¢` : 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400">Sharp Consensus</div>
                                  <div className="font-semibold text-white">
                                    {line.sharp_consensus_prob ? `${(line.sharp_consensus_prob * 100).toFixed(1)}%` : 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <Button 
                                    size="sm" 
                                    variant={(line.sharp_line_edge || 0) > 0 ? 'default' : 'outline'}
                                    className={cn(
                                      "w-full text-xs",
                                      (line.sharp_line_edge || 0) > 0 ? 'bg-green-600 hover:bg-green-700' : ''
                                    )}
                                    disabled={(line.sharp_line_edge || 0) <= 0}
                                  >
                                    {(line.sharp_line_edge || 0) > 0 ? 'Bet' : 'Skip'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Multi-Leg Opportunities */}
              <TabsContent value="multi-leg" className="mt-4 h-[calc(100%-60px)]">
                <Card className="bg-slate-900/50 border-slate-700 h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-orange-400" />
                      Correlated Multi-Leg Opportunities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px] lg:h-[calc(100vh-350px)]">
                      {multiLegLoading ? (
                        <div className="p-6 text-center text-slate-400">
                          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                          Loading multi-leg data...
                        </div>
                      ) : multiLegOpps.length === 0 ? (
                        <div className="p-6 text-center text-slate-400">
                          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="text-lg font-medium mb-2">No Multi-Leg Opportunities</p>
                          <p className="text-sm">Correlated multi-leg opportunities will appear here when the detector finds them.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {multiLegOpps.map((opp) => {
                            const legs = Array.isArray(opp.legs) ? opp.legs : [];
                            return (
                              <div key={opp.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <h3 className="font-semibold text-white text-sm mb-2">{opp.event_name}</h3>
                                    <div className="space-y-1">
                                      {legs.map((leg: any, legIdx: number) => (
                                        <div key={legIdx} className="flex items-center gap-2">
                                          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50 text-xs">
                                            {typeof leg === 'string' ? leg : leg?.name || leg?.outcome || `Leg ${legIdx + 1}`}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-green-400">
                                      +{(opp.combined_edge || 0).toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-slate-400">combined edge</div>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                                  <div>
                                    <div className="text-slate-400">Correlation</div>
                                    <div className="font-semibold text-white">
                                      {(opp.correlation_score || 0) > 0.7 ? 'High' : (opp.correlation_score || 0) > 0.4 ? 'Medium' : 'Low'}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-slate-400">Sport</div>
                                    <div className="font-semibold text-white">{opp.sport || 'N/A'}</div>
                                  </div>
                                  <div>
                                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white w-full text-xs">
                                      Execute All
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Portfolio/P&L Tracker */}
              <TabsContent value="portfolio" className="mt-4 h-[calc(100%-60px)]">
                <Card className="bg-slate-900/50 border-slate-700 h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-400" />
                      Portfolio & P&L Tracker
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className={cn("text-2xl font-bold", portfolioStats.pnl24h >= 0 ? 'text-green-400' : 'text-red-400')}>
                            {portfolioStats.pnl24h >= 0 ? '+' : ''}${portfolioStats.pnl24h.toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-400">24h P&L</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className={cn("text-2xl font-bold", portfolioStats.pnl30d >= 0 ? 'text-blue-400' : 'text-red-400')}>
                            {portfolioStats.pnl30d >= 0 ? '+' : ''}${portfolioStats.pnl30d.toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-400">30d P&L</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-white">{portfolioStats.activeBets}</div>
                          <div className="text-xs text-slate-400">Active Bets</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-yellow-400">{portfolioStats.winRate.toFixed(1)}%</div>
                          <div className="text-xs text-slate-400">Win Rate</div>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <ScrollArea className="h-[200px] lg:h-[calc(100vh-500px)]">
                      {logs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="text-lg font-medium mb-2">No Bet History</p>
                          <p className="text-sm">Execute signals to start tracking your P&L</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {logs.slice(0, 10).map(log => (
                            <div key={log.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-white">{log.event_name}</div>
                                <div className="text-xs text-slate-400">
                                  {log.side} @ {(log.entry_price * 100).toFixed(0)}¢ · {new Date(log.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className={cn(
                                  log.outcome === 'win' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                                  log.outcome === 'loss' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                  'bg-slate-500/20 text-slate-400 border-slate-500/50'
                                )}>
                                  {log.outcome || 'pending'}
                                </Badge>
                                {log.profit_loss != null && (
                                  <div className={cn("text-sm font-bold mt-1", log.profit_loss >= 0 ? 'text-green-400' : 'text-red-400')}>
                                    {log.profit_loss >= 0 ? '+' : ''}${log.profit_loss.toFixed(2)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
