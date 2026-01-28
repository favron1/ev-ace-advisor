import { SignalCard } from './SignalCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { EnrichedSignal } from '@/types/arbitrage';
import { Activity, RefreshCw } from 'lucide-react';

interface SignalFeedProps {
  signals: EnrichedSignal[];
  loading: boolean;
  refreshing?: boolean;
  onDismiss: (id: string) => void;
  onExecute: (id: string, price: number) => void;
  onRefresh?: () => void;
}

export function SignalFeed({ signals, loading, refreshing, onDismiss, onExecute, onRefresh }: SignalFeedProps) {
  // Sort by urgency then confidence
  const sortedSignals = [...signals].sort((a, b) => {
    const urgencyOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    const urgencyDiff = (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.confidence_score - a.confidence_score;
  });

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      );
    }

    if (signals.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-lg mb-2">No Active Signals</h3>
          <p className="text-muted-foreground text-sm max-w-md">
            Run signal detection to scan bookmaker odds movements and identify mispricings on Polymarket.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {sortedSignals.map(signal => (
          <div
            key={signal.id}
            className={signal.isNew ? 'animate-pulse ring-2 ring-green-500 rounded-lg' : ''}
          >
            <SignalCard
              signal={signal}
              onDismiss={onDismiss}
              onExecute={onExecute}
              onRefresh={onRefresh}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Signal Feed</h2>
        <div className="flex items-center gap-3">
          {onRefresh && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRefresh}
                    disabled={refreshing || loading}
                    className="h-8 px-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Re-check signals without using API quota</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-sm text-muted-foreground">
            {signals.length} signal{signals.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
