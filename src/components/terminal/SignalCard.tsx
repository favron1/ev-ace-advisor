import { Clock, X, Check, Target, TrendingUp, Activity, AlertCircle, Eye, Zap, DollarSign, Timer, ExternalLink, Copy, ChevronDown, Search, Link } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EnrichedSignal } from '@/types/arbitrage';
import type { SignalState } from '@/types/scan-config';
import { ExecutionDecision } from './ExecutionDecision';
import { ManualPriceInput } from './ManualPriceInput';
import { EvCalculator } from './EvCalculator';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

// No longer needed - using slug-based URLs from backend

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

// Format countdown to kickoff
function formatCountdown(hoursUntil: number | null | undefined): { text: string; urgent: boolean } {
  if (!hoursUntil || hoursUntil <= 0) return { text: 'Started', urgent: true };
  
  if (hoursUntil < 1) {
    const mins = Math.round(hoursUntil * 60);
    return { text: `${mins}m`, urgent: true };
  }
  
  if (hoursUntil < 24) {
    const hours = Math.floor(hoursUntil);
    const mins = Math.round((hoursUntil - hours) * 60);
    if (mins > 0) {
      return { text: `${hours}h ${mins}m`, urgent: hoursUntil < 2 };
    }
    return { text: `${hours}h`, urgent: hoursUntil < 2 };
  }
  
  const days = Math.floor(hoursUntil / 24);
  const hours = Math.round(hoursUntil % 24);
  return { text: `${days}d ${hours}h`, urgent: false };
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
  
  // Only use recommended_outcome for bet display - never fall back to event_name
  const betTarget = signal.recommended_outcome;
  const isMissingBetSide = !betTarget && signal.is_true_arbitrage;
  
  // Extract enhanced data from signal_factors
  const signalFactors = signal.signal_factors as { 
    matched_polymarket?: boolean; 
    match_confidence?: number;
    edge_type?: string;
    time_label?: string;
    confirming_books?: number;
    is_sharp_book?: boolean;
    hours_until_event?: number;
    sport?: string;
  } | null;
  
  const isTrueArbitrage = signal.is_true_arbitrage === true;
  const matchConfidence = signal.polymarket_match_confidence;
  
  // Get extended fields
  const bookmakerProbFair = (signal as any).bookmaker_prob_fair || signal.bookmaker_probability;
  const signalStrength = (signal as any).signal_strength;
  const polyVolume = (signal as any).polymarket_volume;
  const polyUpdatedAt = (signal as any).polymarket_updated_at;
  const polyYesPrice = (signal as any).polymarket_yes_price || signal.polymarket_price;
  const polyConditionId = (signal as any).polymarket_condition_id;
  
  // Generate Polymarket direct URL using slug from backend (FIXED)
  const getPolymarketDirectUrl = (): string | null => {
    // Priority 1: Use slug from backend (most reliable)
    const slug = (signal as any).polymarket_slug;
    if (slug) {
      return `https://polymarket.com/event/${slug}`;
    }
    
    // Priority 2: Use condition_id for direct market access (if it's a hex hash)
    const conditionId = (signal as any).polymarket_condition_id;
    if (conditionId && conditionId.startsWith('0x')) {
      return `https://polymarket.com/markets?conditionId=${conditionId}`;
    }
    
    return null; // Fall through to search
  };
  
  // Fallback search URL
  const getPolymarketSearchUrl = () => {
    const searchTerm = signal.recommended_outcome || signal.event_name;
    return `https://polymarket.com/search?query=${encodeURIComponent(searchTerm)}`;
  };
  
  // Get best available URL
  const getPolymarketUrl = () => getPolymarketDirectUrl() || getPolymarketSearchUrl();
  
  const copyLinkToClipboard = () => {
    const url = getPolymarketUrl();
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link copied!",
        description: getPolymarketDirectUrl() ? "Direct link copied" : "Search link copied",
      });
    });
  };
  
  // Quality checks
  const isStale = isStalePolymarket(polyUpdatedAt);
  const hasLowVolume = isLowVolume(polyVolume);
  
  // Countdown timer - calculate from expires_at (event start time) or use signal_factors
  const hoursUntilEvent = signal.expires_at 
    ? (new Date(signal.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)
    : signalFactors?.hours_until_event as number | undefined;
  const countdown = formatCountdown(hoursUntilEvent);
  
  // Determine display state
  const displayState = watchState || (isTrueArbitrage ? 'confirmed' : 'signal');
  const stateConfig = stateBadges[displayState];
  const StateIcon = stateConfig.icon;

  // HARD EXECUTION GATES - Enforced safety controls
  const canExecuteSignal = (): { allowed: boolean; reason: string } => {
    // Gate 1: Must have team name present in event name
    if (betTarget) {
      const teamLastWord = betTarget.split(' ').pop()?.toLowerCase() || '';
      const eventNorm = signal.event_name.toLowerCase();
      if (teamLastWord && !eventNorm.includes(teamLastWord)) {
        return { allowed: false, reason: 'Team mismatch' };
      }
    }
    
    // Gate 2: Must have fresh price data (≤5 minutes)
    const stalenessMinutes = polyUpdatedAt 
      ? (Date.now() - new Date(polyUpdatedAt).getTime()) / 60000 
      : Infinity;
    if (stalenessMinutes > 5) {
      return { allowed: false, reason: 'Stale price data' };
    }
    
    // Gate 3: Must have minimum liquidity ($5K)
    if (!polyVolume || polyVolume < 5000) {
      return { allowed: false, reason: 'Insufficient liquidity' };
    }
    
    // Gate 4: High-prob artifact check (85%+ fair prob needs very fresh data)
    if (bookmakerProbFair >= 0.85 && signal.edge_percent > 40) {
      return { allowed: false, reason: 'Artifact edge detected' };
    }
    
    // Gate 5: Must have positive execution decision
    if (!signal.execution || signal.execution.execution_decision === 'NO_BET') {
      return { allowed: false, reason: 'No bet recommended' };
    }
    
    return { allowed: true, reason: 'Ready to execute' };
  };

  const executionStatus = canExecuteSignal();

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
              
              {/* NEW: Signal Tier badge for movement-confirmed signals */}
              {signal.signal_tier && signal.signal_tier !== 'static' && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "flex items-center gap-1 animate-pulse",
                    signal.signal_tier === 'elite' 
                      ? "bg-red-500/20 text-red-400 border-red-500/50" 
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                  )}
                >
                  <Zap className="h-3 w-3" />
                  {signal.signal_tier.toUpperCase()}
                  {signal.movement_velocity && ` +${(signal.movement_velocity * 100).toFixed(1)}%`}
                </Badge>
              )}
              
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
              
              
              {/* Countdown timer to kickoff */}
              {hoursUntilEvent !== undefined && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "flex items-center gap-1",
                    countdown.urgent 
                      ? "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse" 
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {countdown.text} to kickoff
                </Badge>
              )}
            </div>
            
            <h3 className="font-medium text-sm truncate mb-1">{signal.event_name}</h3>
            
            {/* Clear bet recommendation - SIMPLIFIED: Use recommended_outcome directly */}
            {(() => {
              // Use recommended_outcome from backend as the single source of truth
              const teamToBetOn = signal.recommended_outcome;
              const displayFairProb = bookmakerProbFair * 100;
              
              return (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    {isMissingBetSide ? (
                      <Badge 
                        className="bg-orange-500/20 text-orange-500 hover:bg-orange-500/30 font-semibold"
                      >
                        <AlertCircle className="h-3 w-3 mr-1" />
                        BET SIDE UNKNOWN
                      </Badge>
                    ) : teamToBetOn ? (
                      <Badge 
                        className="bg-green-500/20 text-green-400 hover:bg-green-500/30 font-semibold"
                      >
                        <Target className="h-3 w-3 mr-1" />
                        BET ON {teamToBetOn} TO WIN
                      </Badge>
                    ) : (
                      <Badge 
                        className="bg-muted text-muted-foreground font-semibold"
                      >
                        <Activity className="h-3 w-3 mr-1" />
                        Signal Only
                      </Badge>
                    )}
                  </div>
                  
                  {isMissingBetSide ? (
                    <p className="text-xs text-orange-400">
                      ⚠️ Could not determine bet side. Check Polymarket question directly.
                    </p>
                  ) : teamToBetOn ? (
                    <p className="text-xs text-muted-foreground">
                      Sharp books value <span className="font-medium text-foreground">{teamToBetOn}</span> at {displayFairProb.toFixed(1)}% to win
                      {signalFactors?.confirming_books && (
                        <span className="ml-1">• {signalFactors.confirming_books} books</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sharp movement detected • {(bookmakerProbFair * 100).toFixed(1)}% fair prob
                    </p>
                  )}
                </>
              );
            })()}
            
            {/* True arbitrage - show execution decision with cost breakdown */}
            {isTrueArbitrage && signal.execution && (() => {
              // For NO-side bets, show the NO price (1 - YES price)
              // bookmakerProbFair is already for the MATCHED TEAM, no flip needed
              const isNoBet = signal.side === 'NO';
              const displayPolyPrice = isNoBet ? (1 - polyYesPrice) : polyYesPrice;
              const displayFairProb = bookmakerProbFair; // Already for the bet side
              
              // Parse teams for clearer labels
              const vsMatch = signal.event_name.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
              const teamName = isNoBet ? vsMatch?.[2]?.trim() : vsMatch?.[1]?.trim();
              
              // Calculate edge correctly for the bet side
              const edgePerDollar = displayPolyPrice && displayFairProb 
                ? ((1/displayPolyPrice) - (1/displayFairProb)).toFixed(2)
                : 'N/A';
              
              return (
                <div className="mt-3">
                  {/* Odds comparison row - decimal odds format */}
                  <div className="grid grid-cols-3 gap-2 mb-3 p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {toDecimalOdds(displayPolyPrice)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ({(displayPolyPrice * 100).toFixed(0)}¢ share)
                      </div>
                      <div className="text-xs font-medium text-muted-foreground mt-1">POLYMARKET</div>
                    </div>
                    <div className="text-center flex flex-col justify-center">
                      <div className="text-lg text-muted-foreground font-medium">vs</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {toDecimalOdds(displayFairProb)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ({(displayFairProb * 100).toFixed(0)}% fair)
                      </div>
                      <div className="text-xs font-medium text-muted-foreground mt-1">SHARP BOOKS</div>
                    </div>
                  </div>
                  
                  {/* Edge callout - now shows positive edge for the bet */}
                  <div className="text-center mb-3 p-2 bg-green-500/10 rounded border border-green-500/30">
                    <span className="text-sm text-muted-foreground">Edge per $1 bet: </span>
                    <span className="text-lg font-bold text-green-500">
                      +${edgePerDollar}
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
                
                {/* NOT EXECUTABLE warning banner */}
                {!executionStatus.allowed && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">NOT EXECUTABLE: {executionStatus.reason}</span>
                  </div>
                )}
                {/* High-prob artifact edge warning */}
                {bookmakerProbFair >= 0.85 && signal.edge_percent > 40 && (
                  <div className="mt-2 text-xs text-yellow-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    ⚠️ High-prob edge ({(bookmakerProbFair * 100).toFixed(0)}% fair) - verify manually before trading
                  </div>
                )}
              </div>
              );
            })()}
            
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

          {/* Right: Metrics + EV Calculator */}
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
            {/* EV Calculator - pre-filled with signal data */}
            <EvCalculator 
              defaultOdds={polyYesPrice ? 1 / polyYesPrice : undefined}
              defaultTrueProb={bookmakerProbFair}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          {isTrueArbitrage && signal.execution ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="gap-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                  >
                    <Link className="h-3 w-3" />
                    Trade on Poly
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover border border-border z-50">
                  {getPolymarketDirectUrl() && (
                    <>
                      <DropdownMenuItem asChild>
                        <a 
                          href={getPolymarketDirectUrl()!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cursor-pointer flex items-center gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Market Directly
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <a 
                      href={getPolymarketSearchUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Search className="h-4 w-4" />
                      Search on Polymarket
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={copyLinkToClipboard} className="cursor-pointer flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    Copy link to clipboard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                size="sm" 
                className={cn(
                  "flex-1 gap-1",
                  executionStatus.allowed && signal.execution.execution_decision === 'STRONG_BET' && "bg-green-600 hover:bg-green-700",
                  executionStatus.allowed && signal.execution.execution_decision === 'BET' && "bg-green-600 hover:bg-green-700",
                  executionStatus.allowed && signal.execution.execution_decision === 'MARGINAL' && "bg-yellow-600 hover:bg-yellow-700",
                  !executionStatus.allowed && "bg-muted text-muted-foreground hover:bg-muted"
                )}
                onClick={() => onExecute(signal.id, signal.polymarket_price)}
                disabled={!executionStatus.allowed}
                title={!executionStatus.allowed ? executionStatus.reason : undefined}
              >
                <Check className="h-3 w-3" />
                {executionStatus.allowed ? (
                  <>
                    {signal.execution.execution_decision === 'STRONG_BET' && 'Execute (Strong)'}
                    {signal.execution.execution_decision === 'BET' && 'Execute Bet'}
                    {signal.execution.execution_decision === 'MARGINAL' && 'Execute (Caution)'}
                  </>
                ) : (
                  `Watch Only (${executionStatus.reason})`
                )}
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
              {/* For unmatched signals, show disabled Poly button with explanation */}
              {!signalFactors?.matched_polymarket ? (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="gap-1 text-muted-foreground border-muted cursor-not-allowed"
                  disabled
                  title="This event isn't available on Polymarket"
                >
                  <AlertCircle className="h-3 w-3" />
                  No Poly Market
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="gap-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                    >
                      <Link className="h-3 w-3" />
                      {getPolymarketDirectUrl() ? 'Open Poly' : 'Search Poly'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-popover border border-border z-50">
                    {getPolymarketDirectUrl() && (
                      <>
                        <DropdownMenuItem asChild>
                          <a 
                            href={getPolymarketDirectUrl()!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer flex items-center gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open Market Directly
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <a 
                        href={getPolymarketSearchUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer flex items-center gap-2"
                      >
                        <Search className="h-4 w-4" />
                        Search on Polymarket
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={copyLinkToClipboard} className="cursor-pointer flex items-center gap-2">
                      <Copy className="h-4 w-4" />
                      Copy link to clipboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
