import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, ArrowUpDown, Layers } from "lucide-react";

interface DailyBetsFiltersProps {
  confidenceFilter: string;
  setConfidenceFilter: (value: string) => void;
  marketFilter: string;
  setMarketFilter: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
}

export function DailyBetsFilters({
  confidenceFilter,
  setConfidenceFilter,
  marketFilter,
  setMarketFilter,
  sortBy,
  setSortBy,
}: DailyBetsFiltersProps) {
  return (
    <div className="stat-card">
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
