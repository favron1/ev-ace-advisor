import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Clock, 
  Zap, 
  Target, 
  Shield, 
  TrendingUp,
  AlertCircle,
  Activity
} from 'lucide-react';
import type { ScanConfig } from '@/types/scan-config';
import { SHARP_BOOKMAKERS, AVAILABLE_SPORTS } from '@/types/scan-config';

interface ScanSettingsPanelProps {
  config: Partial<ScanConfig>;
  onChange: (updates: Partial<ScanConfig>) => void;
}

export function ScanSettingsPanel({ config, onChange }: ScanSettingsPanelProps) {
  const enabledSports = config.enabled_sports || ['basketball_nba'];
  
  const handleSportToggle = (sportKey: string, checked: boolean) => {
    let updated: string[];
    if (checked) {
      // Max 4 sports for cost control
      if (enabledSports.length >= 4) {
        updated = [...enabledSports.slice(1), sportKey];
      } else {
        updated = [...enabledSports, sportKey];
      }
    } else {
      updated = enabledSports.filter(s => s !== sportKey);
    }
    onChange({ enabled_sports: updated });
  };

  return (
    <div className="space-y-6">
      {/* Sport Scope (NEW) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sport Scope
          </CardTitle>
          <CardDescription>
            Select which sports to monitor (max 4 for cost control)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {AVAILABLE_SPORTS.map((sport) => (
              <div key={sport.key} className="flex items-center space-x-3">
                <Checkbox
                  id={sport.key}
                  checked={enabledSports.includes(sport.key)}
                  onCheckedChange={(checked) => handleSportToggle(sport.key, !!checked)}
                />
                <label 
                  htmlFor={sport.key} 
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <span>{sport.icon}</span>
                  <span>{sport.label}</span>
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Currently monitoring: {enabledSports.length}/4 sports
          </p>
        </CardContent>
      </Card>

      {/* Two-Tier Polling (NEW) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Two-Tier Polling
          </CardTitle>
          <CardDescription>
            Watch Mode polls all events, Active Mode tracks candidates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Watch Poll Interval</Label>
              <span className="text-sm font-mono">{config.watch_poll_interval_minutes || 5}m</span>
            </div>
            <Slider
              value={[config.watch_poll_interval_minutes || 5]}
              onValueChange={([v]) => onChange({ watch_poll_interval_minutes: v })}
              min={2}
              max={15}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Baseline polling for all events (Tier 1)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Active Poll Interval</Label>
              <span className="text-sm font-mono">{config.active_poll_interval_seconds || 60}s</span>
            </div>
            <Slider
              value={[config.active_poll_interval_seconds || 60]}
              onValueChange={([v]) => onChange({ active_poll_interval_seconds: v })}
              min={30}
              max={120}
              step={10}
            />
            <p className="text-xs text-muted-foreground">
              High-frequency polling for escalated events (Tier 2)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Active Window Duration</Label>
              <span className="text-sm font-mono">{config.active_window_minutes || 20}m</span>
            </div>
            <Slider
              value={[config.active_window_minutes || 20]}
              onValueChange={([v]) => onChange({ active_window_minutes: v })}
              min={10}
              max={30}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Max time in Active Mode before dropping
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max Simultaneous Active</Label>
              <span className="text-sm font-mono">{config.max_simultaneous_active || 5}</span>
            </div>
            <Slider
              value={[config.max_simultaneous_active || 5]}
              onValueChange={([v]) => onChange({ max_simultaneous_active: v })}
              min={1}
              max={10}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Limits concurrent high-frequency polling
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Movement Detection (NEW) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Movement Detection
          </CardTitle>
          <CardDescription>
            Configure when to escalate events to Active Mode
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Movement Threshold</Label>
              <span className="text-sm font-mono">{config.movement_threshold_pct || 6}%</span>
            </div>
            <Slider
              value={[config.movement_threshold_pct || 6]}
              onValueChange={([v]) => onChange({ movement_threshold_pct: v })}
              min={3}
              max={12}
              step={0.5}
            />
            <p className="text-xs text-muted-foreground">
              Minimum probability movement to trigger escalation
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Hold Window</Label>
              <span className="text-sm font-mono">{config.hold_window_minutes || 3}m</span>
            </div>
            <Slider
              value={[config.hold_window_minutes || 3]}
              onValueChange={([v]) => onChange({ hold_window_minutes: v })}
              min={1}
              max={10}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Movement must persist for this duration
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Samples Required</Label>
              <span className="text-sm font-mono">{config.samples_required || 2}</span>
            </div>
            <Slider
              value={[config.samples_required || 2]}
              onValueChange={([v]) => onChange({ samples_required: v })}
              min={1}
              max={5}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Consecutive samples confirming movement
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Adaptive Scanning Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Background Scanning
          </CardTitle>
          <CardDescription>
            Configure background scan behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Adaptive Scanning</Label>
              <p className="text-xs text-muted-foreground">
                Automatically increase frequency as events approach
              </p>
            </div>
            <Switch
              checked={config.adaptive_scanning_enabled}
              onCheckedChange={(v) => onChange({ adaptive_scanning_enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Event Horizon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Event Horizon
          </CardTitle>
          <CardDescription>
            Focus on events starting within this time window
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Maximum Horizon</Label>
              <span className="text-sm font-mono">{config.event_horizon_hours}h</span>
            </div>
            <Slider
              value={[config.event_horizon_hours || 24]}
              onValueChange={([v]) => onChange({ event_horizon_hours: v })}
              min={6}
              max={72}
              step={6}
            />
            <p className="text-xs text-muted-foreground">
              Only scan events starting within this window
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Turbo Threshold</Label>
              <span className="text-sm font-mono">{config.min_event_horizon_hours}h</span>
            </div>
            <Slider
              value={[config.min_event_horizon_hours || 2]}
              onValueChange={([v]) => onChange({ min_event_horizon_hours: v })}
              min={1}
              max={12}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Switch to turbo frequency when events are this close
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sharp Book Weighting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Sharp Book Weighting
          </CardTitle>
          <CardDescription>
            Prioritize signals from professional bookmakers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Sharp Weighting</Label>
              <p className="text-xs text-muted-foreground">
                Weight Pinnacle/Betfair odds higher
              </p>
            </div>
            <Switch
              checked={config.sharp_book_weighting_enabled}
              onCheckedChange={(v) => onChange({ sharp_book_weighting_enabled: v })}
            />
          </div>

          {config.sharp_book_weighting_enabled && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Weight Multiplier</Label>
                  <span className="text-sm font-mono">{config.sharp_book_weight}x</span>
                </div>
                <Slider
                  value={[config.sharp_book_weight || 1.5]}
                  onValueChange={([v]) => onChange({ sharp_book_weight: v })}
                  min={1}
                  max={3}
                  step={0.1}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Sharp Bookmakers</Label>
                <div className="flex flex-wrap gap-1">
                  {SHARP_BOOKMAKERS.map((book) => (
                    <Badge key={book} variant="secondary" className="text-xs">
                      {book}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* API Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            API Safety Limits
          </CardTitle>
          <CardDescription>
            Prevent runaway API usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Daily Max Requests</Label>
              <Input
                type="number"
                value={config.max_daily_requests}
                onChange={(e) => onChange({ max_daily_requests: parseInt(e.target.value) || 100 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly Max Requests</Label>
              <Input
                type="number"
                value={config.max_monthly_requests}
                onChange={(e) => onChange({ max_monthly_requests: parseInt(e.target.value) || 1500 })}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Odds API Free Tier: 500 requests/month</p>
              <p>Watch Mode uses ~2-4 requests per poll. Active Mode uses ~1 request per event per minute.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
