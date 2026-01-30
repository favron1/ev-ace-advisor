import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/terminal/Header';
import { SignalFeed } from '@/components/terminal/SignalFeed';
import { StatsBar } from '@/components/terminal/StatsBar';
import { FiltersBar } from '@/components/terminal/FiltersBar';
import { ScanControlPanel } from '@/components/terminal/ScanControlPanel';
import { AutomationPanel } from '@/components/terminal/AutomationPanel';
import { MarketWatchDashboard } from '@/components/terminal/MarketWatchDashboard';
import { useSignals } from '@/hooks/useSignals';
import { useScanConfig } from '@/hooks/useScanConfig';
import { useWatchState } from '@/hooks/useWatchState';
import { useAutoPolling } from '@/hooks/useAutoPolling';
import { useNotifications } from '@/hooks/useNotifications';
import { useOvernightStats } from '@/hooks/useOvernightStats';
import { arbitrageApi } from '@/lib/api/arbitrage';
import type { SignalLog } from '@/types/arbitrage';
import type { EventWatchState } from '@/types/scan-config';

export default function Terminal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<SignalLog[]>([]);
  
  // Filters state
  const [minEdge, setMinEdge] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedUrgency, setSelectedUrgency] = useState<string[]>([]);
  const [showTrueEdgesOnly, setShowTrueEdgesOnly] = useState(false);
  const [showBettableOnly, setShowBettableOnly] = useState(false);
  const [showMovementConfirmedOnly, setShowMovementConfirmedOnly] = useState(true); // Default ON
  const [showBuyYesOnly, setShowBuyYesOnly] = useState(false); // NEW: BUY YES only filter

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

  // Callback for when new confirmed events are detected
  const handleNewConfirmed = useCallback((newEvents: EventWatchState[]) => {
    for (const event of newEvents) {
      const movement = event.movement_pct?.toFixed(1) || '0';
      notify(
        `🎯 EDGE DETECTED`,
        `${event.event_name}\n+${movement}% movement confirmed. Execute now!`
      );
    }
  }, [notify]);

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
  
  
  
  // Overnight stats for server-side poll activity
  const { stats: overnightStats, refresh: refreshOvernightStats } = useOvernightStats();

  const {
    config: scanConfig,
    status: scanStatus,
    scanning,
    runManualScan,
    togglePause,
    toggleFastMode,
  } = useScanConfig();

  // Two-tier polling state with notification callback
  const {
    watchingEvents,
    activeEvents,
    polling: watchPolling,
    runWatchModePoll,
    runActiveModePoll,
    totalWatching,
    totalActive,
  } = useWatchState({ onNewConfirmed: handleNewConfirmed });

  // Calculate daily usage percent for safeguards
  const dailyUsagePercent = scanStatus.dailyRequestsUsed / scanStatus.dailyRequestsLimit * 100;

  // Handle watch mode poll - also refresh signals after
  const handleWatchModePoll = useCallback(async () => {
    await runWatchModePoll();
    await fetchSignals();
  }, [runWatchModePoll, fetchSignals]);

  // Handle active mode poll - also refresh signals after
  const handleActiveModePoll = useCallback(async () => {
    await runActiveModePoll();
    await fetchSignals();
  }, [runActiveModePoll, fetchSignals]);

  // Auto-polling hook with News Spike Mode
  const {
    isEnabled: autoPollingEnabled,
    isRunning: autoPollingRunning,
    watchCountdown,
    activeCountdown,
    pollsToday,
    toggle: toggleAutoPolling,
    triggerNewsSpike,
    newsSpikeActive,
    spikeCountdown,
    cooldownActive,
    cooldownCountdown,
  } = useAutoPolling({
    onWatchPoll: handleWatchModePoll,
    onActivePoll: handleActiveModePoll,
    activeCount: totalActive,
    dailyUsagePercent,
    isPaused: scanStatus.isPaused,
  });

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

  const filteredSignals = getFilteredSignals({
    minEdge: minEdge > 0 ? minEdge : undefined,
    minConfidence: minConfidence > 0 ? minConfidence : undefined,
    urgency: selectedUrgency.length > 0 ? selectedUrgency : undefined,
    trueEdgesOnly: showTrueEdgesOnly,
    bettableOnly: showBettableOnly,
    movementConfirmedOnly: showMovementConfirmedOnly,
    buyYesOnly: showBuyYesOnly, // NEW: Pass buy yes only filter
  });

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        onRunDetection={handleManualScan} 
        detecting={scanning}
        hasUnviewedAlerts={hasUnviewedConfirmed}
        unviewedCount={unviewedCount}
        onAlertClick={markViewed}
      />
      
      <main className="container py-6 space-y-6">
        {/* Stats Overview */}
        <StatsBar signals={signals} logs={logs} overnightStats={overnightStats} />
        
        {/* Filters */}
        <FiltersBar
          minEdge={minEdge}
          minConfidence={minConfidence}
          selectedUrgency={selectedUrgency}
          showTrueEdgesOnly={showTrueEdgesOnly}
          showBettableOnly={showBettableOnly}
          showMovementConfirmedOnly={showMovementConfirmedOnly}
          showBuyYesOnly={showBuyYesOnly}
          onMinEdgeChange={setMinEdge}
          onMinConfidenceChange={setMinConfidence}
          onUrgencyChange={setSelectedUrgency}
          onShowTrueEdgesOnlyChange={setShowTrueEdgesOnly}
          onShowBettableOnlyChange={setShowBettableOnly}
          onShowMovementConfirmedOnlyChange={setShowMovementConfirmedOnly}
          onShowBuyYesOnlyChange={setShowBuyYesOnly}
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
            {/* Automation Panel - NEW */}
            <AutomationPanel
              autoPollingEnabled={autoPollingEnabled}
              onToggleAutoPolling={toggleAutoPolling}
              isPolling={autoPollingRunning || watchPolling}
              watchCountdown={watchCountdown}
              activeCountdown={activeCountdown}
              pollsToday={pollsToday}
              activeCount={totalActive}
              notificationsEnabled={notificationsEnabled}
              notificationPermission={notificationPermission}
              onToggleNotifications={toggleNotifications}
              hasUnviewedAlerts={hasUnviewedConfirmed}
              dailyUsagePercent={dailyUsagePercent}
              isPaused={scanStatus.isPaused}
            />

            {/* Scan Control Panel */}
            <ScanControlPanel
              config={scanConfig}
              status={scanStatus}
              scanning={scanning}
              onManualScan={handleManualScan}
              onTogglePause={togglePause}
              onToggleFastMode={toggleFastMode}
              onOpenSettings={() => navigate('/settings')}
              onWatchModePoll={handleWatchModePoll}
              onActiveModePoll={handleActiveModePoll}
              watchPolling={watchPolling}
              watchingCount={totalWatching}
              activeCount={totalActive}
              // News Spike Mode props
              onTriggerNewsSpike={triggerNewsSpike}
              newsSpikeActive={newsSpikeActive}
              spikeCountdown={spikeCountdown}
              cooldownActive={cooldownActive}
              cooldownCountdown={cooldownCountdown}
            />
            
            {/* Market Watch Dashboard - Full Visibility */}
            <MarketWatchDashboard />
          </div>
        </div>
      </main>
    </div>
  );
}
