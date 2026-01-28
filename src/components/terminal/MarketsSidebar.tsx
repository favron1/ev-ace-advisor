import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { PolymarketMarket } from '@/types/arbitrage';
import { ExternalLink } from 'lucide-react';

interface MarketsSidebarProps {
  markets: PolymarketMarket[];
  loading: boolean;
}

export function MarketsSidebar({ markets, loading }: MarketsSidebarProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No markets loaded
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="space-y-2 pr-4">
        {markets.slice(0, 20).map(market => (
          <div 
            key={market.id}
            className="p-3 rounded-lg border border-border bg-card/50 hover:border-primary/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs font-medium line-clamp-2">{market.question}</p>
              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-500/10 text-green-500 text-[10px]">
                  YES {(market.yes_price * 100).toFixed(0)}¢
                </Badge>
                <Badge variant="outline" className="bg-red-500/10 text-red-500 text-[10px]">
                  NO {(market.no_price * 100).toFixed(0)}¢
                </Badge>
              </div>
              <span className="text-muted-foreground font-mono">
                ${(market.volume / 1000).toFixed(0)}k
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
