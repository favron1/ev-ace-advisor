import { Clock, X, Check, Target, TrendingUp, Activity, AlertCircle } from 'lucide-react';
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

// Format volume for display
function formatVolume(volume: number | null | undefined): string {
  if (!volume) return 'N/A';
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
}

// Format time ago
function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
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
  
  // Extract enhanced data from signal_factors
  const signalFactors = signal.signal_factors as { 
    matched_polymarket?: boolean; 
    match_confidence?: number;
    edge_type?: string;
    time_label?: string;
    confirming_books?: number;
    is_sharp_book?: boolean;
  } | null;
  
  const isTrueArbitrage = signal.is_true_arbitrage === true;
  const matchConfidence = signal.polymarket_match_confidence;
  
  // Get extended fields (may be on signal or signal_factors)
  const bookmakerProbFair = (signal as any).bookmaker_prob_fair || signal.bookmaker_probability;
  const signalStrength = (signal as any).signal_strength;
  const polyVolume = (signal as any).polymarket_volume;
  const polyUpdatedAt = (signal as any).polymarket_updated_at;
  const polyYesPrice = (signal as any).polymarket_yes_price || signal.polymarket_price;

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
                          EDGE: +{signal.edge_percent.toFixed(1)}%
                        </>
                      ) : (
                        <>
                          <Activity className="h-3 w-3 mr-1" />
                          SIGNAL: {signalStrength ? `+${signalStrength.toFixed(1)}%` : 'N/A'}
                        </>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {isTrueArbitrage ? (
                      <div className="space-y-1">
                        <div className="font-semibold">True Arbitrage Opportunity</div>
                        <div>Bookmaker Fair: {(bookmakerProbFair * 100).toFixed(1)}%</div>
                        <div>Polymarket: {(polyYesPrice * 100).toFixed(0)}¢</div>
                        <div>Match Confidence: {matchConfidence ? `${(matchConfidence * 100).toFixed(0)}%` : 'N/A'}</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-semibold">Signal Strength Only</div>
                        <div>No Polymarket match found</div>
                        <div>Shows distance from 50% baseline</div>
                        <div className="text-yellow-500 flex items-center gap-1 mt-1">
                          <AlertCircle className="h-3 w-3" />
                          Not a tradeable edge
                        </div>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {timeUntilExpiry !== null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {signalFactors?.time_label || `${timeUntilExpiry}m`}
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
              <span className="ml-1">• {(bookmakerProbFair * 100).toFixed(1)}% fair prob</span>
              {signalFactors?.confirming_books && (
                <span className="ml-1">• {signalFactors.confirming_books} books</span>
              )}
            </p>
            
            {/* True arbitrage detailed breakdown */}
            {isTrueArbitrage && (
              <div className="text-xs space-y-1 mt-2 p-2 bg-green-500/10 rounded border border-green-500/20">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bookmaker Fair:</span>
                  <span className="font-mono">{(bookmakerProbFair * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Polymarket:</span>
                  <span className="font-mono">{(polyYesPrice * 100).toFixed(0)}¢</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Match Conf:</span>
                  <span className="font-mono">{matchConfidence ? `${(matchConfidence * 100).toFixed(0)}%` : 'N/A'}</span>
                </div>
                {polyVolume && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Volume:</span>
                    <span className="font-mono">{formatVolume(polyVolume)}</span>
                  </div>
                )}
                {polyUpdatedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Updated:</span>
                    <span className="font-mono">{formatTimeAgo(polyUpdatedAt)}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Signal-only notice */}
            {!isTrueArbitrage && (
              <div className="text-xs mt-2 p-2 bg-muted/50 rounded border border-border flex items-start gap-2">
                <AlertCircle className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">
                  No Polymarket match — informational signal only
                </span>
              </div>
            )}
          </div>

          {/* Right: Metrics */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={cn('font-mono font-semibold', confidenceColor)}>
                {signal.confidence_score}
              </span>
            </div>
            {signalFactors?.is_sharp_book && (
              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                SHARP
              </Badge>
            )}
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
