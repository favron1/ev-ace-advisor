import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';

interface StaleIndicatorProps {
  lastUpdated: string | null;
}

export function StaleIndicator({ lastUpdated }: StaleIndicatorProps) {
  if (!lastUpdated) {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
        <XCircle className="h-2.5 w-2.5 mr-0.5" />
        DEAD
      </Badge>
    );
  }

  const diffMs = Date.now() - new Date(lastUpdated).getTime();
  const diffMins = diffMs / 60000;

  if (diffMins < 10) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
        <Clock className="h-2.5 w-2.5 mr-0.5" />
        FRESH
      </Badge>
    );
  }

  if (diffMins < 30) {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
        STALE
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
      <XCircle className="h-2.5 w-2.5 mr-0.5" />
      DEAD
    </Badge>
  );
}
