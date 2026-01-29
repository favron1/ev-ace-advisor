import { Clock, X, Check, Target, TrendingUp, Activity, AlertCircle, Eye, Zap, DollarSign, Timer, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EnrichedSignal } from '@/types/arbitrage';
import type { SignalState } from '@/types/scan-config';
import { ExecutionDecision } from './ExecutionDecision';
import { ManualPriceInput } from './ManualPriceInput';

interface SignalCardProps {
  signal: EnrichedSignal;
  onDismiss: (id: string) => void;
  onExecute: (id: string, price: number) => void;
  onRefresh?: () => void;
  watchState?: SignalState;
  movementPct?: number;
  samplesCount?: number;
  samplesRequired?: number;
}

// Format volume for display
function formatVolume(volume: number | null | undefined): string {
  if (!volume) return 'N/A';
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
}

// Convert probability to decimal odds (dollar payout per $1)
function toDecimalOdds(probability: number | null | undefined): string {
  if (!probability || probability <= 0) return 'N/A';
  return `$${(1 / probability).toFixed(2)}`;
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

// Check if Polymarket data is stale (>2h)
function isStalePolymarket(dateStr: string | null | undefined): boolean {
  if (!dateStr) return true;
  const hours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  return hours > 2;
}

// Check if volume meets professional threshold
function isLowVolume(volume: number | null | undefined): boolean {
  return !volume || volume < 10000;
}

// State badge configuration
const stateBadges: Record<SignalState, { color: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  watching: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30', text: 'WATCHING', icon: Eye },
  active: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/30', text: 'TRACKING', icon: Zap },
  confirmed: { color: 'bg-green-500/10 text-green-500 border-green-500/30', text: 'CONFIRMED', icon: TrendingUp },
  signal: { color: 'bg-muted text-muted-foreground', text: 'SIGNAL ONLY', icon: Activity },
  dropped: { color: 'bg-red-500/10 text-red-500 border-red-500/30', text: 'DROPPED', icon: X },
};

export function SignalCard({ 
  signal, 
  onDismiss, 
  onExecute,
  onRefresh,
  watchState,
  movementPct,
  samplesCount,
  samplesRequired = 2,
}: SignalCardProps) {
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
  
  // Get extended fields
  const bookmakerProbFair = (signal as any).bookmaker_prob_fair || signal.bookmaker_probability;
  const signalStrength = (signal as any).signal_strength;
  const polyVolume = (signal as any).polymarket_volume;
  const polyUpdatedAt = (signal as any).polymarket_updated_at;
  const polyYesPrice = (signal as any).polymarket_yes_price || signal.polymarket_price;
  
  // Quality checks
  const isStale = isStalePolymarket(polyUpdatedAt);
  const hasLowVolume = isLowVolume(polyVolume);
  
  // Determine display state
  const displayState = watchState || (isTrueArbitrage ? 'confirmed' : 'signal');
  const stateConfig = stateBadges[displayState];
  const StateIcon = stateConfig.icon;

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
              
              {/* State badge */}
              <Badge 
                variant="outline" 
                className={cn("flex items-center gap-1", stateConfig.color)}
              >
                <StateIcon className="h-3 w-3" />
                {stateConfig.text}
              </Badge>
              
              {/* Edge/Signal indicator */}
              {isTrueArbitrage ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  EDGE: +{signal.edge_percent.toFixed(1)}%
                </Badge>
              ) : signalStrength ? (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <Activity className="h-3 w-3 mr-1" />
                  SIGNAL: +{signalStrength.toFixed(1)}%
                </Badge>
              ) : null}
              
              {/* Movement indicator for tracking states */}
              {(displayState === 'watching' || displayState === 'active') && movementPct !== undefined && (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {movementPct > 0 ? '+' : ''}{movementPct.toFixed(1)}%
                </Badge>
              )}
              
              {/* Sample count for active tracking */}
              {displayState === 'active' && samplesCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {samplesCount}/{samplesRequired} samples
                </span>
              )}
              
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
            
            {/* True arbitrage - show execution decision with cost breakdown */}
            {isTrueArbitrage && signal.execution && (
              <div className="mt-3">
                {/* Odds comparison row - decimal odds format */}
                <div className="grid grid-cols-3 gap-2 mb-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {toDecimalOdds(polyYesPrice)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ({(polyYesPrice * 100).toFixed(0)}¢ share)
                    </div>
                    <div className="text-xs font-medium text-muted-foreground mt-1">POLYMARKET</div>
                  </div>
                  <div className="text-center flex flex-col justify-center">
                    <div className="text-lg text-muted-foreground font-medium">vs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">
                      {toDecimalOdds(bookmakerProbFair)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ({(bookmakerProbFair * 100).toFixed(0)}% fair)
                    </div>
                    <div className="text-xs font-medium text-muted-foreground mt-1">SHARP BOOKS</div>
                  </div>
                </div>
                
                {/* Edge callout */}
                <div className="text-center mb-3 p-2 bg-green-500/10 rounded border border-green-500/30">
                  <span className="text-sm text-muted-foreground">Edge per $1 bet: </span>
                  <span className="text-lg font-bold text-green-500">
                    +${polyYesPrice && bookmakerProbFair ? ((1/polyYesPrice) - (1/bookmakerProbFair)).toFixed(2) : 'N/A'}
                  </span>
                </div>
                
                {/* Quality indicators row */}
                <div className="flex justify-between text-xs mb-3 px-1">
                  <span className={cn(
                    "flex items-center gap-1",
                    hasLowVolume ? 'text-orange-400' : 'text-green-400'
                  )}>
                    <DollarSign className="h-3 w-3" />
                    {formatVolume(polyVolume)}
                    {hasLowVolume && ' ⚠️'}
                  </span>
                  <span className="text-muted-foreground">
                    Match: {matchConfidence ? `${(matchConfidence * 100).toFixed(0)}%` : 'N/A'}
                  </span>
                  <span className={cn(
                    "flex items-center gap-1",
                    isStale ? 'text-red-400' : 'text-green-400'
                  )}>
                    <Timer className="h-3 w-3" />
                    {formatTimeAgo(polyUpdatedAt)}
                    {isStale && ' ⚠️'}
                  </span>
                </div>
                
                {/* Execution Decision with cost breakdown */}
                <ExecutionDecision analysis={signal.execution} />
                
                {/* Warnings */}
                {(isStale || hasLowVolume) && (
                  <div className="mt-2 text-xs text-orange-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {isStale && 'Stale price data. '}
                    {hasLowVolume && 'Low liquidity.'}
                  </div>
                )}
              </div>
            )}
            
            {/* Signal-only notice (no Polymarket match) */}
            {!isTrueArbitrage && (
              <div className="text-xs mt-2 p-2 bg-muted/50 rounded border border-border flex items-start gap-2">
                <AlertCircle className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-muted-foreground">
                    No Polymarket match
                  </span>
                  <ManualPriceInput 
                    signalId={signal.id}
                    eventName={signal.event_name}
                    currentPolyPrice={polyYesPrice}
                    onUpdate={onRefresh || (() => {})}
                  />
                </div>
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
          {isTrueArbitrage && signal.execution ? (
            <>
              <Button 
                size="sm" 
                variant="outline"
                className="gap-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                asChild
              >
                <a 
                  href={`https://polymarket.com/search?query=${encodeURIComponent(betTarget || signal.event_name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3" />
                  Trade on Poly
                </a>
              </Button>
              <Button 
                size="sm" 
                className={cn(
                  "flex-1 gap-1",
                  signal.execution.execution_decision === 'STRONG_BET' && "bg-green-600 hover:bg-green-700",
                  signal.execution.execution_decision === 'BET' && "bg-green-600 hover:bg-green-700",
                  signal.execution.execution_decision === 'MARGINAL' && "bg-yellow-600 hover:bg-yellow-700",
                  signal.execution.execution_decision === 'NO_BET' && "bg-muted text-muted-foreground hover:bg-muted"
                )}
                onClick={() => onExecute(signal.id, signal.polymarket_price)}
                disabled={signal.execution.execution_decision === 'NO_BET'}
              >
                <Check className="h-3 w-3" />
                {signal.execution.execution_decision === 'STRONG_BET' && 'Execute (Strong)'}
                {signal.execution.execution_decision === 'BET' && 'Execute Bet'}
                {signal.execution.execution_decision === 'MARGINAL' && 'Execute (Caution)'}
                {signal.execution.execution_decision === 'NO_BET' && 'No Bet'}
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onDismiss(signal.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button 
                size="sm" 
                variant="outline"
                className="gap-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                asChild
              >
                <a 
                  href={`https://polymarket.com/search?query=${encodeURIComponent(betTarget || signal.event_name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3" />
                  Search Poly
                </a>
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => onExecute(signal.id, signal.polymarket_price)}
              >
                <Check className="h-3 w-3" />
                Log Signal
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onDismiss(signal.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
