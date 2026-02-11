import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface MatchStatusBadgeProps {
  hasPolyPrice: boolean;
  hasBookProb: boolean;
  polyMatched: boolean | null;
}

export function MatchStatusBadge({ hasPolyPrice, hasBookProb, polyMatched }: MatchStatusBadgeProps) {
  if (hasPolyPrice && hasBookProb && polyMatched) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
        <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
        MATCHED
      </Badge>
    );
  }

  if (hasPolyPrice && !hasBookProb) {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
        PARTIAL
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
      <XCircle className="h-2.5 w-2.5 mr-0.5" />
      UNMATCHED
    </Badge>
  );
}
