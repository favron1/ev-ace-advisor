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

export default function Terminal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<SignalLog[]>([]);
  const [activeTab, setActiveTab] = useState('whale-activity');

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

  // One-click scan that triggers full pipeline
  const handleFullScan = async () => {
    try {
      toast({ title: 'Scanning Markets', description: 'Running discovery + matching + signal detection...' });
      
      // Run full pipeline: discover → match → detect signals
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

  // Mock data for demonstration - in real app this would come from backend
  const mockWhaleActivity = [
    { wallet: 'kch123', event: 'Lakers vs Warriors', side: 'YES Lakers', stake: '$150k', odds: '1.85', edge: '+4.2%', tier: 'Tier 1' },
    { wallet: 'SeriouslySirius', event: 'Cowboys -3.5', side: 'YES', stake: '$89k', odds: '1.91', edge: '+2.1%', tier: 'Tier 2' },
    { wallet: 'DrPufferfish', event: 'Over 225.5', side: 'YES', stake: '$45k', odds: '1.88', edge: '+1.8%', tier: 'Tier 3' }
  ];

  const mockLineComparisons = [
    { event: 'Hawks vs Celtics', polymarket: '0.65', pinnacle: '0.62', edge: '+4.8%', volume: '$125k', time: '2h 15m' },
    { event: 'Rangers -1.5', polymarket: '0.45', pinnacle: '0.42', edge: '+7.1%', volume: '$89k', time: '45m' },
    { event: 'Over 6.5 Goals', polymarket: '0.38', pinnacle: '0.41', edge: '-7.9%', volume: '$67k', time: '1h 30m' }
  ];

  const mockMultiLegOps = [
    { 
      event: 'Lakers vs Warriors', 
      legs: ['Lakers ML', 'Lakers -3.5', 'Over 225'], 
      combinedEdge: '+8.9%', 
      correlationStrength: 'High',
      totalStake: '$200k'
    },
    { 
      event: 'Cowboys vs Giants', 
      legs: ['Cowboys -7', 'Under 45.5'], 
      combinedEdge: '+5.3%', 
      correlationStrength: 'Medium',
      totalStake: '$150k'
    }
  ];

  if (!user) {
    return null;
  }

  // Get high-value signals for quick display
  const highValueSignals = signals
    .filter(s => s.edge_percentage && s.edge_percentage >= 3)
    .sort((a, b) => (b.edge_percentage || 0) - (a.edge_percentage || 0))
    .slice(0, 8);

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
              
              {/* One-Click Scan Button */}
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
              {/* Portfolio Summary - Hidden on very small screens */}
              <div className="text-right hidden sm:block">
                <div className="text-xs sm:text-sm text-slate-400">24h P&L</div>
                <div className="text-sm sm:text-lg font-bold text-green-400">+$12,450</div>
              </div>
              
              {/* Notifications */}
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

              {/* Legacy Terminal Link - Hidden on mobile */}
              <Button variant="ghost" size="sm" onClick={() => navigate('/pipeline/discover')} className="hidden lg:flex">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Pipeline View
              </Button>

              {/* Settings */}
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
          
          {/* Mobile: Stack vertically, Desktop: Left Column - Live Signal Feed */}
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
                      {highValueSignals.map((signal, idx) => (
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
                                  {signal.league || 'Unknown League'}
                                </Badge>
                                <span className="text-slate-400">
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {signal.expires_at ? new Date(signal.expires_at).toLocaleTimeString() : 'Live'}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-green-400">
                                +{signal.edge_percentage?.toFixed(1)}%
                              </div>
                              <div className="text-xs text-slate-400">edge</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <div className="text-slate-400">Kelly Stake</div>
                              <div className="font-semibold text-white">
                                ${signal.kelly_stake?.toFixed(0) || '0'}
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
                                {((signal.book_probability || 0) * 100).toFixed(1)}%
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
                          
                          {/* Whale Activity Indicator */}
                          {idx < 3 && (
                            <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-xs">
                              <div className="flex items-center gap-1">
                                <Wallet className="h-3 w-3 text-purple-400" />
                                <span className="text-purple-400 font-medium">kch123 active</span>
                                <span className="text-slate-400">- Similar position detected</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Mobile: Stack below signals, Desktop: Right Column - Panels */}
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
                      <div className="space-y-3">
                        {mockWhaleActivity.map((whale, idx) => (
                          <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                                    {whale.wallet}
                                  </Badge>
                                  <Badge variant="outline" className={cn(
                                    whale.tier === 'Tier 1' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                                    whale.tier === 'Tier 2' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                                    'bg-orange-500/20 text-orange-400 border-orange-500/50'
                                  )}>
                                    {whale.tier}
                                  </Badge>
                                </div>
                                <h3 className="font-semibold text-white text-sm">{whale.event}</h3>
                                <p className="text-xs text-slate-400">{whale.side}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-green-400">{whale.edge}</div>
                                <div className="text-xs text-slate-400">edge</div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <div className="text-slate-400">Stake</div>
                                <div className="font-semibold text-white">{whale.stake}</div>
                              </div>
                              <div>
                                <div className="text-slate-400">Odds</div>
                                <div className="font-semibold text-white">{whale.odds}</div>
                              </div>
                              <div>
                                <Button size="sm" variant="outline" className="w-full text-xs">
                                  Copy Trade
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                      <div className="space-y-3">
                        {mockLineComparisons.map((line, idx) => (
                          <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="font-semibold text-white text-sm mb-1">{line.event}</h3>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-400">Vol: {line.volume}</span>
                                  <span className="text-slate-400">
                                    <Clock className="h-3 w-3 inline mr-1" />
                                    {line.time} left
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={cn(
                                  "text-lg font-bold",
                                  line.edge.startsWith('+') ? 'text-green-400' : 'text-red-400'
                                )}>
                                  {line.edge}
                                </div>
                                <div className="text-xs text-slate-400">vs Pinnacle</div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <div className="text-slate-400">Polymarket</div>
                                <div className="font-semibold text-white">{line.polymarket}</div>
                              </div>
                              <div>
                                <div className="text-slate-400">Pinnacle</div>
                                <div className="font-semibold text-white">{line.pinnacle}</div>
                              </div>
                              <div>
                                <Button 
                                  size="sm" 
                                  variant={line.edge.startsWith('+') ? 'default' : 'outline'}
                                  className={cn(
                                    "w-full text-xs",
                                    line.edge.startsWith('+') ? 'bg-green-600 hover:bg-green-700' : ''
                                  )}
                                  disabled={line.edge.startsWith('-')}
                                >
                                  {line.edge.startsWith('+') ? 'Bet' : 'Skip'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                      <div className="space-y-4">
                        {mockMultiLegOps.map((opp, idx) => (
                          <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="font-semibold text-white text-sm mb-2">{opp.event}</h3>
                                <div className="space-y-1">
                                  {opp.legs.map((leg, legIdx) => (
                                    <div key={legIdx} className="flex items-center gap-2">
                                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50 text-xs">
                                        {leg}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-green-400">{opp.combinedEdge}</div>
                                <div className="text-xs text-slate-400">combined edge</div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                              <div>
                                <div className="text-slate-400">Correlation</div>
                                <div className="font-semibold text-white">{opp.correlationStrength}</div>
                              </div>
                              <div>
                                <div className="text-slate-400">Total Stake</div>
                                <div className="font-semibold text-white">{opp.totalStake}</div>
                              </div>
                              <div>
                                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white w-full text-xs">
                                  Execute All
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                          <div className="text-2xl font-bold text-green-400">$12,450</div>
                          <div className="text-xs text-slate-400">24h P&L</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-blue-400">$89,320</div>
                          <div className="text-xs text-slate-400">30d P&L</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-white">23</div>
                          <div className="text-xs text-slate-400">Active Bets</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-yellow-400">67.8%</div>
                          <div className="text-xs text-slate-400">Win Rate</div>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <ScrollArea className="h-[200px] lg:h-[calc(100vh-500px)]">
                      <div className="text-center py-8 text-slate-400">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium mb-2">Portfolio Analytics</p>
                        <p className="text-sm">Detailed P&L tracking coming soon</p>
                      </div>
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
