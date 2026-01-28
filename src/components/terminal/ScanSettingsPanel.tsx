import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Zap, 
  Target, 
  Shield, 
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import type { ScanConfig } from '@/types/scan-config';
import { SHARP_BOOKMAKERS } from '@/types/scan-config';

interface ScanSettingsPanelProps {
  config: Partial<ScanConfig>;
  onChange: (updates: Partial<ScanConfig>) => void;
}

export function ScanSettingsPanel({ config, onChange }: ScanSettingsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Scan Frequency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scan Frequency
          </CardTitle>
          <CardDescription>
            Configure how often the system scans for opportunities
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Base Frequency</Label>
              <span className="text-sm font-mono">{config.base_frequency_minutes}m</span>
            </div>
            <Slider
              value={[config.base_frequency_minutes || 30]}
              onValueChange={([v]) => onChange({ base_frequency_minutes: v })}
              min={15}
              max={120}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>15m (more requests)</span>
              <span>120m (fewer requests)</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Turbo Frequency</Label>
              <span className="text-sm font-mono">{config.turbo_frequency_minutes}m</span>
            </div>
            <Slider
              value={[config.turbo_frequency_minutes || 5]}
              onValueChange={([v]) => onChange({ turbo_frequency_minutes: v })}
              min={2}
              max={15}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Used when events are within {config.min_event_horizon_hours || 2} hours
            </p>
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
              <p>Each scan uses ~10-12 requests. Adjust limits based on your API plan.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
