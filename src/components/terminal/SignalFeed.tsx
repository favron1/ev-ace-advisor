import { SignalCard } from './SignalCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { SignalOpportunity } from '@/types/arbitrage';
import { Activity } from 'lucide-react';

interface SignalFeedProps {
  signals: SignalOpportunity[];
  loading: boolean;
  onDismiss: (id: string) => void;
  onExecute: (id: string, price: number) => void;
}

export function SignalFeed({ signals, loading, onDismiss, onExecute }: SignalFeedProps) {
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

  // Sort by urgency then confidence
  const sortedSignals = [...signals].sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.confidence_score - a.confidence_score;
  });

  return (
    <div className="space-y-4">
      {sortedSignals.map(signal => (
        <SignalCard
          key={signal.id}
          signal={signal}
          onDismiss={onDismiss}
          onExecute={onExecute}
        />
      ))}
    </div>
  );
}
