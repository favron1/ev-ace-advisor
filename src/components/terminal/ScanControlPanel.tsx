import { useState } from 'react';
import { 
  Zap, 
  Pause, 
  Play, 
  Settings2, 
  AlertTriangle,
  Clock,
  Activity,
  Gauge
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
import type { ScanConfig, ScanStatus } from '@/types/scan-config';
import { formatDistanceToNow } from 'date-fns';

interface ScanControlPanelProps {
  config: ScanConfig | null;
  status: ScanStatus;
  scanning: boolean;
  onManualScan: () => void;
  onTogglePause: () => void;
  onToggleTurbo: () => void;
  onOpenSettings: () => void;
}

export function ScanControlPanel({
  config,
  status,
  scanning,
  onManualScan,
  onTogglePause,
  onToggleTurbo,
  onOpenSettings,
}: ScanControlPanelProps) {
  const dailyUsagePercent = (status.dailyRequestsUsed / status.dailyRequestsLimit) * 100;
  const monthlyUsagePercent = (status.monthlyRequestsUsed / status.monthlyRequestsLimit) * 100;
  
  const isNearDailyLimit = dailyUsagePercent > 80;
  const isNearMonthlyLimit = monthlyUsagePercent > 80;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Scan Control
          </CardTitle>
          <div className="flex items-center gap-2">
            {status.isPaused ? (
              <Badge variant="secondary" className="text-xs">Paused</Badge>
            ) : status.currentMode === 'turbo' ? (
              <Badge className="bg-orange-500/20 text-orange-400 text-xs">Turbo</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Active</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main scan button */}
        <div className="flex gap-2">
          <Button 
            onClick={onManualScan}
            disabled={scanning || (status.dailyRequestsUsed >= status.dailyRequestsLimit)}
            className="flex-1 gap-2"
            size="sm"
          >
            <Zap className={`h-4 w-4 ${scanning ? 'animate-pulse' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan Now'}
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
              id="turbo-mode"
              checked={config?.turbo_mode_enabled || false}
              onCheckedChange={onToggleTurbo}
              disabled={status.isPaused}
            />
            <Label htmlFor="turbo-mode" className="text-xs cursor-pointer">
              Turbo Mode
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
                    <span className="text-muted-foreground">Base Frequency</span>
                    <span>{config?.base_frequency_minutes || 30}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Turbo Frequency</span>
                    <span>{config?.turbo_frequency_minutes || 5}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Event Horizon</span>
                    <span>{config?.event_horizon_hours || 24}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sharp Weighting</span>
                    <span>{config?.sharp_book_weighting_enabled ? 'On' : 'Off'}</span>
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
