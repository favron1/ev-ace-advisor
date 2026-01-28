import { ArrowUp, ArrowDown, Clock, TrendingUp, X, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SignalOpportunity } from '@/types/arbitrage';

interface SignalCardProps {
  signal: SignalOpportunity;
  onDismiss: (id: string) => void;
  onExecute: (id: string, price: number) => void;
}

export function SignalCard({ signal, onDismiss, onExecute }: SignalCardProps) {
  const isYes = signal.side === 'YES';
  const urgencyColors = {
    low: 'bg-muted text-muted-foreground',
    normal: 'bg-blue-500/10 text-blue-500',
    high: 'bg-orange-500/10 text-orange-500',
    critical: 'bg-red-500/10 text-red-500 animate-pulse',
  };

  const confidenceColor = signal.confidence_score >= 80 
    ? 'text-green-500' 
    : signal.confidence_score >= 60 
      ? 'text-yellow-500' 
      : 'text-muted-foreground';

  const timeUntilExpiry = signal.expires_at 
    ? Math.max(0, Math.floor((new Date(signal.expires_at).getTime() - Date.now()) / 1000 / 60))
    : null;

  return (
    <Card className="group hover:border-primary/50 transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Event info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={urgencyColors[signal.urgency]}>
                {signal.urgency.toUpperCase()}
              </Badge>
              {timeUntilExpiry !== null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeUntilExpiry}m
                </span>
              )}
            </div>
            <h3 className="font-medium text-sm truncate mb-1">{signal.event_name}</h3>
            <div className="flex items-center gap-2">
              <Badge 
                variant={isYes ? 'default' : 'secondary'}
                className={cn(
                  'font-mono',
                  isYes ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                )}
              >
                {isYes ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                {signal.side}
              </Badge>
              <span className="text-xs text-muted-foreground">
                @ {(signal.polymarket_price * 100).toFixed(1)}¢
              </span>
            </div>
          </div>

          {/* Right: Metrics */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Edge</span>
              <span className={cn(
                'font-mono font-bold text-lg',
                signal.edge_percent >= 10 ? 'text-green-500' : signal.edge_percent >= 5 ? 'text-yellow-500' : 'text-foreground'
              )}>
                +{signal.edge_percent.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={cn('font-mono font-semibold', confidenceColor)}>
                {signal.confidence_score}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Books: {(signal.bookmaker_probability * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          <Button 
            size="sm" 
            className="flex-1 gap-1"
            onClick={() => onExecute(signal.id, signal.polymarket_price)}
          >
            <Check className="h-3 w-3" />
            Execute
          </Button>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={() => onDismiss(signal.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
