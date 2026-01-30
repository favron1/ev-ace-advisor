import { RefreshCw, Database, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePolymarketCache } from '@/hooks/usePolymarketCache';
import { cn } from '@/lib/utils';

interface PolymarketCacheStatsProps {
  onScanTrigger?: () => void;
  isScanning?: boolean;
}

export function PolymarketCacheStats({ onScanTrigger, isScanning }: PolymarketCacheStatsProps) {
  const { loading, syncing, triggerSync, getCacheStats } = usePolymarketCache();
  
  const stats = getCacheStats();
  
  // Format volume
  const formatVolume = (vol: number) => {
    if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(1)}B`;
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(0)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };
  
  // Format time ago
  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  
  // Check staleness
  const isStale = stats.lastSync 
    ? (Date.now() - new Date(stats.lastSync).getTime()) > 6 * 60 * 60 * 1000 
    : true;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Polymarket Cache
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs",
              isStale ? "text-orange-400 border-orange-400/30" : "text-green-400 border-green-400/30"
            )}
          >
            {isStale ? 'Stale' : 'Fresh'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="text-lg font-bold text-foreground">
              {stats.totalMarkets}
            </div>
            <div className="text-xs text-muted-foreground">Markets</div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="text-lg font-bold text-foreground">
              {formatVolume(stats.totalVolume)}
            </div>
            <div className="text-xs text-muted-foreground">Volume</div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(stats.lastSync)}
            </div>
            <div className="text-xs text-muted-foreground">Last Sync</div>
          </div>
        </div>

        {/* By Sport Breakdown */}
        {Object.keys(stats.bySport).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">By Sport</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats.bySport)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([sport, count]) => (
                  <Badge 
                    key={sport} 
                    variant="outline" 
                    className="text-xs bg-muted/50"
                  >
                    {sport.replace('_', ' ').replace('basketball ', '').replace('americanfootball ', '')}: {count}
                  </Badge>
                ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1"
            onClick={triggerSync}
            disabled={syncing || loading}
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            {syncing ? 'Syncing...' : 'Sync Cache'}
          </Button>
        </div>
        
        {onScanTrigger && (
          <Button
            size="sm"
            className="w-full gap-1"
            onClick={onScanTrigger}
            disabled={isScanning || stats.totalMarkets === 0}
          >
            <TrendingUp className={cn("h-3 w-3", isScanning && "animate-pulse")} />
            {isScanning ? 'Scanning...' : 'Find Edges'}
          </Button>
        )}
        
        {stats.totalMarkets === 0 && !loading && (
          <div className="text-xs text-center text-muted-foreground p-2 bg-muted/20 rounded">
            No markets in cache. Click "Sync Polymarket" to populate.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
