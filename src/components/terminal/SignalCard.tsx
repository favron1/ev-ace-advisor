import { Clock, X, Check, Target, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SignalOpportunity } from '@/types/arbitrage';

interface SignalCardProps {
  signal: SignalOpportunity;
  onDismiss: (id: string) => void;
  onExecute: (id: string, price: number) => void;
}

export function SignalCard({ signal, onDismiss, onExecute }: SignalCardProps) {
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
  
  const betTarget = signal.recommended_outcome || signal.event_name;
  
  // Check if this is a true arbitrage (matched to Polymarket) or just signal strength
  const signalFactors = signal.signal_factors as { matched_polymarket?: boolean; match_confidence?: number } | null;
  const isTrueArbitrage = signalFactors?.matched_polymarket === true;
  const matchConfidence = signalFactors?.match_confidence;

  return (
    <Card className={cn(
      "group hover:border-primary/50 transition-all duration-200",
      isTrueArbitrage && "border-green-500/30 bg-green-500/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Event info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className={urgencyColors[signal.urgency]}>
                {signal.urgency.toUpperCase()}
              </Badge>
              
              {/* True Arbitrage vs Signal Strength indicator */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        isTrueArbitrage 
                          ? "bg-green-500/10 text-green-500 border-green-500/30" 
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isTrueArbitrage ? (
                        <>
                          <TrendingUp className="h-3 w-3 mr-1" />
                          ARBITRAGE
                        </>
                      ) : (
                        <>
                          <Activity className="h-3 w-3 mr-1" />
                          SIGNAL
                        </>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isTrueArbitrage 
                      ? `Matched to Polymarket (${matchConfidence ? (matchConfidence * 100).toFixed(0) + '% confidence' : 'verified'})`
                      : "No Polymarket match - shows signal strength vs 50% baseline"
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {timeUntilExpiry !== null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeUntilExpiry}m
                </span>
              )}
            </div>
            <h3 className="font-medium text-sm truncate mb-1">{signal.event_name}</h3>
            
            {/* Clear bet recommendation */}
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                className="bg-primary/20 text-primary hover:bg-primary/30 font-semibold"
              >
                <Target className="h-3 w-3 mr-1" />
                BET: {betTarget}
              </Badge>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Back <span className="font-medium text-foreground">{betTarget}</span> to win
              <span className="ml-1">• {(signal.bookmaker_probability * 100).toFixed(1)}% implied</span>
              {isTrueArbitrage && signal.polymarket_price > 0 && (
                <span className="ml-1">• Poly: {(signal.polymarket_price * 100).toFixed(0)}¢</span>
              )}
            </p>
          </div>

          {/* Right: Metrics */}
          <div className="flex flex-col items-end gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {isTrueArbitrage ? 'Edge' : 'Strength'}
                    </span>
                    <span className={cn(
                      'font-mono font-bold text-lg',
                      isTrueArbitrage 
                        ? (signal.edge_percent >= 5 ? 'text-green-500' : signal.edge_percent >= 2 ? 'text-yellow-500' : 'text-foreground')
                        : (signal.edge_percent >= 20 ? 'text-orange-500' : 'text-muted-foreground')
                    )}>
                      +{signal.edge_percent.toFixed(1)}%
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {isTrueArbitrage 
                    ? `Real edge: Bookmaker ${(signal.bookmaker_probability * 100).toFixed(1)}% vs Polymarket ${(signal.polymarket_price * 100).toFixed(0)}%`
                    : `Signal strength: Distance from 50% baseline (not real arbitrage)`
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={cn('font-mono font-semibold', confidenceColor)}>
                {signal.confidence_score}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          <Button 
            size="sm" 
            className={cn(
              "flex-1 gap-1",
              isTrueArbitrage && "bg-green-600 hover:bg-green-700"
            )}
            onClick={() => onExecute(signal.id, signal.polymarket_price)}
          >
            <Check className="h-3 w-3" />
            {isTrueArbitrage ? 'Execute Arb' : 'Log Signal'}
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
