import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, ArrowUpDown, Layers, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DailyBetsFiltersProps {
  confidenceFilter: string;
  setConfidenceFilter: (value: string) => void;
  marketFilter: string;
  setMarketFilter: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  timeFrame: string;
  setTimeFrame: (value: string) => void;
}

export function DailyBetsFilters({
  confidenceFilter,
  setConfidenceFilter,
  marketFilter,
  setMarketFilter,
  sortBy,
  setSortBy,
  timeFrame,
  setTimeFrame,
}: DailyBetsFiltersProps) {
  return (
    <div className="stat-card space-y-4">
      {/* Time Frame Toggle */}
      <div className="flex items-center gap-3">
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Time Frame:</span>
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          {[
            { value: '12', label: '12 Hours' },
            { value: '24', label: '24 Hours' },
            { value: '48', label: '48 Hours' },
          ].map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              onClick={() => setTimeFrame(option.value)}
              className={cn(
                "h-8 px-4 text-sm font-medium transition-all",
                timeFrame === option.value 
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Other Filters Row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filters:</span>
        </div>

        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-[150px] bg-muted border-border">
            <SelectValue placeholder="Confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Confidence</SelectItem>
            <SelectItem value="high">High Only</SelectItem>
            <SelectItem value="moderate">Moderate Only</SelectItem>
            <SelectItem value="low">Low Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger className="w-[150px] bg-muted border-border">
            <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Market" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            <SelectItem value="1X2">1X2 (Win/Draw)</SelectItem>
            <SelectItem value="Over/Under">Over/Under</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Sort:</span>
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px] bg-muted border-border">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ev">Expected Value</SelectItem>
            <SelectItem value="edge">Edge %</SelectItem>
            <SelectItem value="odds">Offered Odds</SelectItem>
            <SelectItem value="stake">Suggested Stake</SelectItem>
            <SelectItem value="time">Kick-off Time</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
