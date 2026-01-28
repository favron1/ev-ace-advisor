import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/terminal/Header';
import { SignalFeed } from '@/components/terminal/SignalFeed';
import { StatsBar } from '@/components/terminal/StatsBar';
import { FiltersBar } from '@/components/terminal/FiltersBar';
import { MarketsSidebar } from '@/components/terminal/MarketsSidebar';
import { ScanControlPanel } from '@/components/terminal/ScanControlPanel';
import { useSignals } from '@/hooks/useSignals';
import { usePolymarket } from '@/hooks/usePolymarket';
import { useScanConfig } from '@/hooks/useScanConfig';
import { useWatchState } from '@/hooks/useWatchState';
import { arbitrageApi } from '@/lib/api/arbitrage';
import type { SignalLog } from '@/types/arbitrage';

export default function Terminal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<SignalLog[]>([]);
  
  // Filters state
  const [minEdge, setMinEdge] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedUrgency, setSelectedUrgency] = useState<string[]>([]);
  const [showTrueEdgesOnly, setShowTrueEdgesOnly] = useState(false);

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
  
  const { markets, loading: marketsLoading } = usePolymarket();
  
  const {
    config: scanConfig,
    status: scanStatus,
    scanning,
    runManualScan,
    togglePause,
    toggleTurboMode,
  } = useScanConfig();

  // Two-tier polling state
  const {
    watchingEvents,
    activeEvents,
    polling: watchPolling,
    runWatchModePoll,
    runActiveModePoll,
    totalWatching,
    totalActive,
  } = useWatchState();

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

  // Handle scan completion - refresh signals
  const handleManualScan = async () => {
    await runManualScan();
    await fetchSignals();
  };

  // Handle watch mode poll - also refresh signals after
  const handleWatchModePoll = async () => {
    await runWatchModePoll();
    await fetchSignals();
  };

  // Handle active mode poll - also refresh signals after
  const handleActiveModePoll = async () => {
    await runActiveModePoll();
    await fetchSignals();
  };

  const filteredSignals = getFilteredSignals({
    minEdge: minEdge > 0 ? minEdge : undefined,
    minConfidence: minConfidence > 0 ? minConfidence : undefined,
    urgency: selectedUrgency.length > 0 ? selectedUrgency : undefined,
    trueEdgesOnly: showTrueEdgesOnly,
  });

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header onRunDetection={handleManualScan} detecting={scanning} />
      
      <main className="container py-6 space-y-6">
        {/* Stats Overview */}
        <StatsBar signals={signals} logs={logs} />
        
        {/* Filters */}
        <FiltersBar
          minEdge={minEdge}
          minConfidence={minConfidence}
          selectedUrgency={selectedUrgency}
          showTrueEdgesOnly={showTrueEdgesOnly}
          onMinEdgeChange={setMinEdge}
          onMinConfidenceChange={setMinConfidence}
          onUrgencyChange={setSelectedUrgency}
          onShowTrueEdgesOnlyChange={setShowTrueEdgesOnly}
        />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Signal Feed */}
          <div className="lg:col-span-2">
            <SignalFeed
              signals={filteredSignals}
              loading={signalsLoading}
              refreshing={refreshing}
              onDismiss={dismissSignal}
              onExecute={executeSignal}
              onRefresh={refreshSignals}
            />
          </div>

          {/* Right sidebar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Scan Control Panel */}
            <ScanControlPanel
              config={scanConfig}
              status={scanStatus}
              scanning={scanning}
              onManualScan={handleManualScan}
              onTogglePause={togglePause}
              onToggleTurbo={toggleTurboMode}
              onOpenSettings={() => navigate('/settings')}
              onWatchModePoll={handleWatchModePoll}
              onActiveModePoll={handleActiveModePoll}
              watchPolling={watchPolling}
              watchingCount={totalWatching}
              activeCount={totalActive}
            />
            
            {/* Polymarket Sidebar */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Polymarket</h2>
              <MarketsSidebar markets={markets} loading={marketsLoading} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
