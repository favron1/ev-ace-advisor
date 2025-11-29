import { Trophy, Dog, Filter, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface RacingFiltersProps {
  raceTypeFilter: 'all' | 'horse' | 'greyhound';
  setRaceTypeFilter: (value: 'all' | 'horse' | 'greyhound') => void;
  confidenceFilter: 'all' | 'Low' | 'Moderate' | 'High';
  setConfidenceFilter: (value: 'all' | 'Low' | 'Moderate' | 'High') => void;
  sortBy: 'ev' | 'edge' | 'odds' | 'time';
  setSortBy: (value: 'ev' | 'edge' | 'odds' | 'time') => void;
}

export function RacingFilters({
  raceTypeFilter,
  setRaceTypeFilter,
  confidenceFilter,
  setConfidenceFilter,
  sortBy,
  setSortBy,
}: RacingFiltersProps) {
  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Filters</h3>
      </div>

      {/* Race Type Toggle */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Race Type</Label>
        <div className="grid grid-cols-3 gap-1 p-1 bg-muted/50 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRaceTypeFilter('all')}
            className={cn(
              "h-8 text-xs",
              raceTypeFilter === 'all' && "bg-background shadow-sm"
            )}
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRaceTypeFilter('horse')}
            className={cn(
              "h-8 text-xs gap-1",
              raceTypeFilter === 'horse' && "bg-background shadow-sm"
            )}
          >
            <Trophy className="h-3 w-3" />
            Horse
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRaceTypeFilter('greyhound')}
            className={cn(
              "h-8 text-xs gap-1",
              raceTypeFilter === 'greyhound' && "bg-background shadow-sm"
            )}
          >
            <Dog className="h-3 w-3" />
            Dogs
          </Button>
        </div>
      </div>

      {/* Confidence Filter */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Confidence Level</Label>
        <Select value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as 'all' | 'Low' | 'Moderate' | 'High')}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="High">High Only</SelectItem>
            <SelectItem value="Moderate">Moderate & Above</SelectItem>
            <SelectItem value="Low">Including Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort By */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground flex items-center gap-1">
          <ArrowUpDown className="h-3 w-3" />
          Sort By
        </Label>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'ev' | 'edge' | 'odds' | 'time')}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ev">Expected Value</SelectItem>
            <SelectItem value="edge">Edge %</SelectItem>
            <SelectItem value="odds">Odds (Low to High)</SelectItem>
            <SelectItem value="time">Race Time</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
