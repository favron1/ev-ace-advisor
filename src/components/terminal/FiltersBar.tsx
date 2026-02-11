import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardContent } from '@/components/ui/card';

interface FiltersBarProps {
  minEdge: number;
  minConfidence: number;
  selectedUrgency: string[];
  showTrueEdgesOnly: boolean;
  showBettableOnly: boolean;
  showMovementConfirmedOnly: boolean;
  onMinEdgeChange: (value: number) => void;
  onMinConfidenceChange: (value: number) => void;
  onUrgencyChange: (value: string[]) => void;
  onShowTrueEdgesOnlyChange: (value: boolean) => void;
  onShowBettableOnlyChange: (value: boolean) => void;
  onShowMovementConfirmedOnlyChange: (value: boolean) => void;
}

export function FiltersBar({
  minEdge,
  minConfidence,
  selectedUrgency,
  showTrueEdgesOnly,
  showBettableOnly,
  showMovementConfirmedOnly,
  onMinEdgeChange,
  onMinConfidenceChange,
  onUrgencyChange,
  onShowTrueEdgesOnlyChange,
  onShowBettableOnlyChange,
  onShowMovementConfirmedOnlyChange,
}: FiltersBarProps) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Signal Type Toggles */}
          <div className="space-y-3">
            <Label className="text-xs">Signal Quality</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="movement-confirmed-only"
                  checked={showMovementConfirmedOnly}
                  onCheckedChange={onShowMovementConfirmedOnlyChange}
                />
                <Label htmlFor="movement-confirmed-only" className="text-xs cursor-pointer font-medium text-primary">
                  Movement-Confirmed Only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="true-edges-only"
                  checked={showTrueEdgesOnly}
                  onCheckedChange={onShowTrueEdgesOnlyChange}
                />
                <Label htmlFor="true-edges-only" className="text-xs cursor-pointer">
                  True Edges Only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="bettable-only"
                  checked={showBettableOnly}
                  onCheckedChange={onShowBettableOnlyChange}
                />
                <Label htmlFor="bettable-only" className="text-xs cursor-pointer">
                  Bettable Only
                </Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                showMovementConfirmedOnly && 'Movement-confirmed',
                showTrueEdgesOnly && 'True edges',
                showBettableOnly && 'Bettable',
              ].filter(Boolean).join(' + ') || 'Showing all signals'}
            </p>
          </div>

          {/* Min Edge */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Min Edge %</Label>
              <span className="text-xs font-mono text-muted-foreground">{minEdge}%</span>
            </div>
            <Slider
              value={[minEdge]}
              onValueChange={([v]) => onMinEdgeChange(v)}
              min={0}
              max={20}
              step={1}
              className="w-full"
            />
          </div>

          {/* Min Confidence */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Min Confidence</Label>
              <span className="text-xs font-mono text-muted-foreground">{minConfidence}</span>
            </div>
            <Slider
              value={[minConfidence]}
              onValueChange={([v]) => onMinConfidenceChange(v)}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Urgency Filter */}
          <div className="space-y-2">
            <Label className="text-xs">Urgency</Label>
            <ToggleGroup
              type="multiple"
              value={selectedUrgency}
              onValueChange={onUrgencyChange}
              className="justify-start flex-wrap"
            >
              <ToggleGroupItem value="critical" size="sm" className="text-xs">
                Critical
              </ToggleGroupItem>
              <ToggleGroupItem value="high" size="sm" className="text-xs">
                High
              </ToggleGroupItem>
              <ToggleGroupItem value="normal" size="sm" className="text-xs">
                Normal
              </ToggleGroupItem>
              <ToggleGroupItem value="low" size="sm" className="text-xs">
                Low
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
