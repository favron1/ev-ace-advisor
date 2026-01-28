import { 
  Timer, 
  Bell,
  BellOff,
  Play,
  Pause,
  Clock,
  Zap,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface AutomationPanelProps {
  // Auto-polling state
  autoPollingEnabled: boolean;
  onToggleAutoPolling: () => void;
  isPolling: boolean;
  watchCountdown: string;
  activeCountdown: string;
  pollsToday: number;
  activeCount: number;
  
  // Notifications state
  notificationsEnabled: boolean;
  notificationPermission: NotificationPermission;
  onToggleNotifications: () => Promise<boolean>;
  hasUnviewedAlerts: boolean;
  
  // Safeguards
  dailyUsagePercent: number;
  isPaused: boolean;
}

export function AutomationPanel({
  autoPollingEnabled,
  onToggleAutoPolling,
  isPolling,
  watchCountdown,
  activeCountdown,
  pollsToday,
  activeCount,
  notificationsEnabled,
  notificationPermission,
  onToggleNotifications,
  hasUnviewedAlerts,
  dailyUsagePercent,
  isPaused,
}: AutomationPanelProps) {
  const isNearLimit = dailyUsagePercent > 90;
  const automationBlocked = isPaused; // Only paused state blocks, not near-limit

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Automation & Alerts
          </CardTitle>
          {autoPollingEnabled && !automationBlocked && (
            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Running
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Auto-Polling Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {autoPollingEnabled ? (
              <Play className="h-4 w-4 text-green-500" />
            ) : (
              <Pause className="h-4 w-4 text-muted-foreground" />
            )}
            <Label htmlFor="auto-polling" className="text-sm cursor-pointer">
              Auto-Polling
            </Label>
          </div>
          <Switch
            id="auto-polling"
            checked={autoPollingEnabled}
            onCheckedChange={onToggleAutoPolling}
            disabled={automationBlocked}
          />
        </div>

        {/* Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notificationsEnabled ? (
              <Bell className="h-4 w-4 text-primary" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            <Label htmlFor="notifications" className="text-sm cursor-pointer">
              Notifications
            </Label>
            {notificationPermission === 'denied' && (
              <span className="text-xs text-destructive">(blocked)</span>
            )}
          </div>
          <Switch
            id="notifications"
            checked={notificationsEnabled}
            onCheckedChange={onToggleNotifications}
            disabled={notificationPermission === 'denied'}
          />
        </div>

        {/* Countdown Timers */}
        {autoPollingEnabled && !automationBlocked && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                Watch Poll
              </span>
              <span className="font-mono">
                {isPolling ? (
                  <span className="text-primary animate-pulse">polling...</span>
                ) : (
                  `Next in ${watchCountdown}`
                )}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                Active Poll
              </span>
              <span className="font-mono">
                {activeCount > 0 ? (
                  isPolling ? (
                    <span className="text-primary animate-pulse">polling...</span>
                  ) : (
                    `Next in ${activeCountdown}`
                  )
                ) : (
                  <span className="text-muted-foreground">No active events</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Polls Today
          </span>
          <span className="font-mono">{pollsToday}</span>
        </div>

        {/* Warnings */}
        {isNearLimit && (
          <div className="text-xs text-orange-400 bg-orange-500/10 rounded px-2 py-1.5">
            ⚠️ Approaching daily API limit ({dailyUsagePercent.toFixed(0)}% used)
          </div>
        )}
        {automationBlocked && (
          <div className="text-xs text-orange-400 bg-orange-500/10 rounded px-2 py-1.5">
            ⏸️ Auto-polling paused: scanning is paused
          </div>
        )}

        {hasUnviewedAlerts && (
          <div className="text-xs text-primary bg-primary/10 rounded px-2 py-1.5 animate-pulse">
            🎯 New confirmed signals detected!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
