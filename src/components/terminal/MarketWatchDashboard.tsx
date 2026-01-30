import { useState } from 'react';
import { 
  Eye, 
  AlertTriangle, 
  TrendingUp, 
  Database, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useMarketWatch, type SportBreakdown, type WatchedMarket } from '@/hooks/useMarketWatch';
import { cn } from '@/lib/utils';

// Format volume
const formatVolume = (vol: number) => {
  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
};

// Format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Sport colors
const SPORT_COLORS: Record<string, string> = {
  NHL: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  NBA: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  NCAA: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  NFL: 'bg-green-500/20 text-green-400 border-green-500/30',
  Other: 'bg-muted text-muted-foreground border-border',
};

interface StatBoxProps {
  value: number | string;
  label: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

function StatBox({ value, label, icon, highlight }: StatBoxProps) {
  return (
    <div className={cn(
      "text-center p-3 rounded-lg border",
      highlight ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border"
    )}>
      <div className="flex items-center justify-center gap-1 mb-1">
        {icon}
        <span className={cn(
          "text-lg font-bold",
          highlight ? "text-primary" : "text-foreground"
        )}>
          {value}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

interface SportRowProps {
  sport: SportBreakdown;
  maxWatching: number;
}

function SportRow({ sport, maxWatching }: SportRowProps) {
  const progressPercent = maxWatching > 0 ? (sport.watching / maxWatching) * 100 : 0;
  const colorClass = SPORT_COLORS[sport.displayName] || SPORT_COLORS.Other;
  
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={cn("text-xs", colorClass)}>
          {sport.displayName}
        </Badge>
        <span className="text-sm font-medium text-foreground">
          {sport.watching} watching
        </span>
      </div>
      <Progress value={progressPercent} className="h-2" />
      <div className="flex gap-2 text-xs text-muted-foreground">
        {sport.apiCount > 0 && <span>API: {sport.apiCount}</span>}
        {sport.firecrawlCount > 0 && <span>Firecrawl: {sport.firecrawlCount}</span>}
        {sport.triggered > 0 && (
          <span className="text-yellow-400">Triggered: {sport.triggered}</span>
        )}
      </div>
    </div>
  );
}

interface MarketRowProps {
  market: WatchedMarket;
}

function MarketRow({ market }: MarketRowProps) {
  const colorClass = SPORT_COLORS[market.sport] || SPORT_COLORS.Other;
  
  return (
    <div className="flex items-center justify-between py-2 px-2 hover:bg-muted/30 rounded-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[10px] px-1", colorClass)}>
            {market.sport}
          </Badge>
          <span className="text-sm truncate text-foreground">{market.eventName}</span>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{formatVolume(market.volume)}</span>
          <span>{(market.yesPrice * 100).toFixed(0)}/{(market.noPrice * 100).toFixed(0)}</span>
        </div>
      </div>
      {market.hasEdge && market.edgePercent && (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
          +{market.edgePercent.toFixed(1)}%
        </Badge>
      )}
      {market.status === 'triggered' && (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs animate-pulse">
          TRIGGERED
        </Badge>
      )}
    </div>
  );
}

export function MarketWatchDashboard() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMarkets, setShowMarkets] = useState(false);
  
  const {
    totalWatching,
    totalTriggered,
    totalEdgesFound,
    totalInCache,
    bySport,
    watchedMarkets,
    recentScans,
    loading,
    refresh,
  } = useMarketWatch();

  const maxWatching = Math.max(...bySport.map(s => s.watching), 1);
  const marketsWithEdges = watchedMarkets.filter(m => m.hasEdge);

  return (
    <Card className="border-border">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Market Watch
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => refresh()}
                disabled={loading}
              >
                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-2">
              <StatBox
                value={totalWatching}
                label="Watching"
                icon={<Eye className="h-3 w-3 text-primary" />}
                highlight
              />
              <StatBox
                value={totalTriggered}
                label="Triggered"
                icon={<AlertTriangle className="h-3 w-3 text-yellow-400" />}
              />
              <StatBox
                value={totalEdgesFound}
                label="Edges"
                icon={<TrendingUp className="h-3 w-3 text-green-400" />}
              />
              <StatBox
                value={totalInCache}
                label="Total"
                icon={<Database className="h-3 w-3 text-muted-foreground" />}
              />
            </div>

            {/* By Sport Breakdown */}
            {bySport.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  By Sport
                </div>
                <div className="space-y-3">
                  {bySport.map(sport => (
                    <SportRow key={sport.sport} sport={sport} maxWatching={maxWatching} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Scans */}
            {recentScans.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recent Scans
                </div>
                <div className="space-y-1">
                  {recentScans.slice(0, 3).map((scan, i) => (
                    <div 
                      key={i} 
                      className="flex items-center gap-2 text-xs text-muted-foreground p-1.5 bg-muted/20 rounded"
                    >
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(scan.timestamp)}</span>
                      <span className="text-foreground">{scan.marketsChecked} markets</span>
                      <span>|</span>
                      <span className={scan.edgesFound > 0 ? "text-green-400" : ""}>
                        {scan.edgesFound} edges
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Markets (Collapsible) */}
            <Collapsible open={showMarkets} onOpenChange={setShowMarkets}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between text-xs h-8"
                >
                  <span>
                    Active Markets ({watchedMarkets.length})
                    {marketsWithEdges.length > 0 && (
                      <Badge className="ml-2 bg-green-500/20 text-green-400 text-[10px]">
                        {marketsWithEdges.length} with edges
                      </Badge>
                    )}
                  </span>
                  {showMarkets ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="h-[200px] mt-2">
                  <div className="space-y-0.5">
                    {watchedMarkets.slice(0, 50).map(market => (
                      <MarketRow key={market.id} market={market} />
                    ))}
                    {watchedMarkets.length > 50 && (
                      <div className="text-xs text-center text-muted-foreground py-2">
                        +{watchedMarkets.length - 50} more
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>

            {/* Empty State */}
            {!loading && totalWatching === 0 && (
              <div className="text-xs text-center text-muted-foreground p-4 bg-muted/20 rounded">
                No markets currently being watched. Run a sync to populate the cache.
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
