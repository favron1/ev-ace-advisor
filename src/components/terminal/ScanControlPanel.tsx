import { useState } from 'react';
import { 
  Zap, 
  Pause, 
  Play, 
  Settings2, 
  AlertTriangle,
  Clock,
  Activity,
  Gauge,
  Eye,
  RefreshCw,
  Flame
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ScanConfig, ScanStatus } from '@/types/scan-config';
import { formatDistanceToNow } from 'date-fns';

interface ScanControlPanelProps {
  config: ScanConfig | null;
  status: ScanStatus;
  scanning: boolean;
  onManualScan: () => void;
  onTogglePause: () => void;
  onToggleFastMode: () => void;
  onOpenSettings: () => void;
  // Two-tier polling props
  onWatchModePoll?: () => void;
  onActiveModePoll?: () => void;
  watchPolling?: boolean;
  watchingCount?: number;
  activeCount?: number;
  // News Spike Mode props
  onTriggerNewsSpike?: () => void;
  newsSpikeActive?: boolean;
  spikeCountdown?: string;
  cooldownActive?: boolean;
  cooldownCountdown?: string;
}

export function ScanControlPanel({
  config,
  status,
  scanning,
  onManualScan,
  onTogglePause,
  onToggleFastMode,
  onOpenSettings,
  onWatchModePoll,
  onActiveModePoll,
  watchPolling,
  watchingCount = 0,
  activeCount = 0,
  // News Spike Mode
  onTriggerNewsSpike,
  newsSpikeActive = false,
  spikeCountdown = '--:--',
  cooldownActive = false,
  cooldownCountdown = '--:--',
}: ScanControlPanelProps) {
  const dailyUsagePercent = (status.dailyRequestsUsed / status.dailyRequestsLimit) * 100;
  const monthlyUsagePercent = (status.monthlyRequestsUsed / status.monthlyRequestsLimit) * 100;
  
  const isNearDailyLimit = dailyUsagePercent > 80;
  const isNearMonthlyLimit = monthlyUsagePercent > 80;

  // News Spike button state
  const spikeDisabled = newsSpikeActive || cooldownActive || scanning || watchPolling || dailyUsagePercent > 90;
  const spikeButtonLabel = newsSpikeActive 
    ? `Spike: ${spikeCountdown}` 
    : cooldownActive 
      ? `Cooldown: ${cooldownCountdown}` 
      : '🔥 News Spike';

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Scan Control
          </CardTitle>
          <div className="flex items-center gap-2">
            {newsSpikeActive && (
              <Badge className="text-xs bg-orange-500/20 text-orange-400 animate-pulse">
                <Flame className="h-3 w-3 mr-1" />
                SPIKE
              </Badge>
            )}
            {watchingCount > 0 && (
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                <Eye className="h-3 w-3 mr-1" />
                {watchingCount}
              </Badge>
            )}
            {activeCount > 0 && (
              <Badge className="text-xs bg-blue-500/20 text-blue-400">
                <Zap className="h-3 w-3 mr-1" />
                {activeCount}
              </Badge>
            )}
            {status.isPaused ? (
              <Badge variant="secondary" className="text-xs">Paused</Badge>
            ) : config?.watch_poll_interval_minutes === 2 ? (
              <Badge className="bg-orange-500/20 text-orange-400 text-xs">Fast</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Active</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* News Spike Mode Button - TOP PRIORITY */}
        {onTriggerNewsSpike && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onTriggerNewsSpike}
                  disabled={spikeDisabled}
                  variant={newsSpikeActive ? 'default' : cooldownActive ? 'secondary' : 'outline'}
                  className={`w-full gap-2 ${
                    !spikeDisabled && !newsSpikeActive && !cooldownActive
                      ? 'bg-orange-500/10 border-orange-500/50 text-orange-500 hover:bg-orange-500/20 hover:border-orange-500'
                      : newsSpikeActive
                        ? 'bg-orange-500 text-white animate-pulse'
                        : ''
                  }`}
                  size="sm"
                >
                  <Flame className={`h-4 w-4 ${newsSpikeActive ? 'animate-bounce' : ''}`} />
                  {spikeButtonLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">
                  {cooldownActive 
                    ? 'Cooldown active. Wait before triggering another spike.'
                    : newsSpikeActive
                      ? 'High-frequency polling active (60s). Watching for rapid movements!'
                      : 'Trigger 5-min high-frequency polling after news breaks (injuries, lineups, etc.)'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Two-tier polling buttons */}
        {(onWatchModePoll || onActiveModePoll) && (
          <div className="flex gap-2">
            {onWatchModePoll && (
              <Button 
                onClick={onWatchModePoll}
                disabled={watchPolling || scanning}
                variant="outline"
                className="flex-1 gap-2"
                size="sm"
              >
                <Eye className={`h-4 w-4 ${watchPolling ? 'animate-pulse' : ''}`} />
                Watch Poll
              </Button>
            )}
            
            {onActiveModePoll && (
              <Button 
                onClick={onActiveModePoll}
                disabled={watchPolling || scanning || activeCount === 0}
                variant={activeCount > 0 ? 'default' : 'outline'}
                className="flex-1 gap-2"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 ${watchPolling ? 'animate-spin' : ''}`} />
                Active Poll
              </Button>
            )}
          </div>
        )}

        {/* Main scan button (legacy) */}
        <div className="flex gap-2">
          <Button 
            onClick={onManualScan}
            disabled={scanning || (status.dailyRequestsUsed >= status.dailyRequestsLimit)}
            className="flex-1 gap-2"
            size="sm"
          >
            <Zap className={`h-4 w-4 ${scanning ? 'animate-pulse' : ''}`} />
            {scanning ? 'Scanning...' : 'Full Scan'}
          </Button>
          
          <Button
            variant={status.isPaused ? 'default' : 'secondary'}
            size="sm"
            onClick={onTogglePause}
            className="gap-1"
          >
            {status.isPaused ? (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            )}
          </Button>
        </div>

        {/* Quick controls */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Switch
              id="fast-mode"
              checked={config?.watch_poll_interval_minutes === 2}
              onCheckedChange={onToggleFastMode}
              disabled={status.isPaused}
            />
            <Label htmlFor="fast-mode" className="text-xs cursor-pointer">
              Fast Mode (2m)
            </Label>
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div className="text-sm font-medium">Quick Settings</div>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Watch Interval</span>
                    <span>{config?.watch_poll_interval_minutes || 5}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Interval</span>
                    <span>{config?.active_poll_interval_seconds || 60}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Movement Threshold</span>
                    <span>{config?.movement_threshold_pct || 6}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Active Events</span>
                    <span>{config?.max_simultaneous_active || 5}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sports</span>
                    <span>{config?.enabled_sports?.length || 1}</span>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={onOpenSettings}
                >
                  Full Settings
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Scan timing */}
        {!status.isPaused && config?.adaptive_scanning_enabled && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {status.lastScanAt ? (
                <>Last scan {formatDistanceToNow(status.lastScanAt, { addSuffix: true })}</>
              ) : (
                'No scans yet'
              )}
            </span>
          </div>
        )}

        {/* API Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Daily API Usage</span>
            <span className={isNearDailyLimit ? 'text-orange-400' : ''}>
              {status.dailyRequestsUsed}/{status.dailyRequestsLimit}
            </span>
          </div>
          <Progress 
            value={dailyUsagePercent} 
            className={`h-1.5 ${isNearDailyLimit ? '[&>div]:bg-orange-400' : ''}`}
          />
          
          {isNearDailyLimit && (
            <div className="flex items-center gap-1 text-xs text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              Approaching daily limit
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Monthly API Usage</span>
            <span className={isNearMonthlyLimit ? 'text-orange-400' : ''}>
              {status.monthlyRequestsUsed}/{status.monthlyRequestsLimit}
            </span>
          </div>
          <Progress 
            value={monthlyUsagePercent} 
            className={`h-1.5 ${isNearMonthlyLimit ? '[&>div]:bg-orange-400' : ''}`}
          />
        </div>

        {/* Estimated cost */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" />
              Est. Monthly Requests
            </span>
            <span>{Math.round(status.estimatedMonthlyCost)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
