import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardContent } from '@/components/ui/card';

interface FiltersBarProps {
  minEdge: number;
  minConfidence: number;
  selectedUrgency: string[];
  onMinEdgeChange: (value: number) => void;
  onMinConfidenceChange: (value: number) => void;
  onUrgencyChange: (value: string[]) => void;
}

export function FiltersBar({
  minEdge,
  minConfidence,
  selectedUrgency,
  onMinEdgeChange,
  onMinConfidenceChange,
  onUrgencyChange,
}: FiltersBarProps) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
