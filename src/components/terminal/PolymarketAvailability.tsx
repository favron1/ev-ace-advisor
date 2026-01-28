import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, ExternalLink, TrendingUp, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface PolymarketNbaMarket {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  lastUpdated: string;
}

export function PolymarketAvailability() {
  const [markets, setMarkets] = useState<PolymarketNbaMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchNbaMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Search for NBA markets on Polymarket
      const response = await fetch(
        'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&title_contains=NBA'
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const events = await response.json();
      const nbaMarkets: PolymarketNbaMarket[] = [];
      
      for (const event of events) {
        const eventMarkets = event.markets || [];
        
        for (const market of eventMarkets) {
          if (market.closed || !market.active) continue;
          
          const volume = parseFloat(market.volume) || 0;
          if (volume < 10000) continue; // Only show markets with $10K+ volume
          
          // Parse prices
          let yesPrice = 0.5;
          let noPrice = 0.5;
          
          if (market.outcomePrices) {
            try {
              const prices = typeof market.outcomePrices === 'string' 
                ? JSON.parse(market.outcomePrices) 
                : market.outcomePrices;
              if (Array.isArray(prices) && prices.length >= 2) {
                yesPrice = parseFloat(prices[0]) || 0.5;
                noPrice = parseFloat(prices[1]) || 0.5;
              }
            } catch {
              // Use defaults
            }
          }
          
          // Skip if no real prices
          if (yesPrice === 0.5 && noPrice === 0.5) continue;
          
          // Filter to H2H game markets (contains "vs" or "beat")
          const question = market.question || event.title || '';
          const isH2H = /vs\.?|beat|defeat|win.*against/i.test(question);
          if (!isH2H) continue;
          
          nbaMarkets.push({
            id: market.conditionId || market.id,
            question,
            yesPrice,
            noPrice,
            volume,
            lastUpdated: market.lastUpdateTimestamp || market.updatedAt || new Date().toISOString(),
          });
        }
      }
      
      // Sort by volume descending
      nbaMarkets.sort((a, b) => b.volume - a.volume);
      
      setMarkets(nbaMarkets);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNbaMarkets();
  }, [fetchNbaMarkets]);

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
    return `$${volume.toFixed(0)}`;
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Polymarket NBA H2H Markets
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchNbaMarkets}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-destructive mb-2">{error}</div>
        )}
        
        {loading && markets.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : markets.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No active NBA H2H markets found on Polymarket
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              {markets.length} markets • Last refresh: {lastRefresh ? formatTimeAgo(lastRefresh.toISOString()) : 'never'}
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50%]">Game</TableHead>
                    <TableHead className="text-right">YES</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markets.slice(0, 10).map((market) => (
                    <TableRow key={market.id}>
                      <TableCell className="font-medium text-sm">
                        <div className="max-w-[200px] truncate" title={market.question}>
                          {market.question.replace(/Will|win\?|beat/gi, '').trim()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="font-mono">
                          {(market.yesPrice * 100).toFixed(0)}¢
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        <span className="flex items-center justify-end gap-1">
                          <DollarSign className="h-3 w-3" />
                          {formatVolume(market.volume).replace('$', '')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatTimeAgo(market.lastUpdated)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {markets.length > 10 && (
              <div className="text-xs text-muted-foreground text-center mt-2">
                +{markets.length - 10} more markets
              </div>
            )}
          </>
        )}
        
        <div className="mt-3 pt-3 border-t">
          <a
            href="https://polymarket.com/sports"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            View all on Polymarket
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
