import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyzedBet } from "@/pages/DailyBets";

interface ConflictGroup {
  matchKey: string;
  event: string;
  bets: AnalyzedBet[];
}

interface AddAllApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bets: AnalyzedBet[];
  onConfirm: (selectedBets: AnalyzedBet[]) => void;
}

// Extract match key for grouping (normalize event name)
const getMatchKey = (bet: AnalyzedBet): string => {
  return bet.event.toLowerCase().trim();
};

// Check if two bets on the same match are conflicting (mutually exclusive)
const areConflicting = (bet1: AnalyzedBet, bet2: AnalyzedBet): boolean => {
  // Same match, different selections that can't both win
  if (bet1.market === bet2.market) {
    // Same market type - different selections are conflicting
    if (bet1.selection !== bet2.selection) {
      return true;
    }
  }
  
  // Check for obvious conflicts
  const sel1 = bet1.selection.toLowerCase();
  const sel2 = bet2.selection.toLowerCase();
  
  // Over/Under conflicts
  if ((sel1.includes('over') && sel2.includes('under')) ||
      (sel1.includes('under') && sel2.includes('over'))) {
    return true;
  }
  
  // Yes/No conflicts (BTTS)
  if ((sel1 === 'yes' && sel2 === 'no') ||
      (sel1 === 'no' && sel2 === 'yes')) {
    return true;
  }
  
  // Home/Away/Draw conflicts in 1x2
  const homeAway1 = sel1.includes('home') || sel1.includes('away') || sel1.includes('draw');
  const homeAway2 = sel2.includes('home') || sel2.includes('away') || sel2.includes('draw');
  if (homeAway1 && homeAway2 && sel1 !== sel2) {
    return true;
  }
  
  return false;
};

// Find all conflict groups
const findConflicts = (bets: AnalyzedBet[]): ConflictGroup[] => {
  const matchGroups = new Map<string, AnalyzedBet[]>();
  
  // Group by match
  bets.forEach(bet => {
    const key = getMatchKey(bet);
    if (!matchGroups.has(key)) {
      matchGroups.set(key, []);
    }
    matchGroups.get(key)!.push(bet);
  });
  
  // Find groups with conflicts
  const conflicts: ConflictGroup[] = [];
  
  matchGroups.forEach((groupBets, matchKey) => {
    if (groupBets.length > 1) {
      // Check if any bets in this group are conflicting
      let hasConflict = false;
      for (let i = 0; i < groupBets.length; i++) {
        for (let j = i + 1; j < groupBets.length; j++) {
          if (areConflicting(groupBets[i], groupBets[j])) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) break;
      }
      
      if (hasConflict) {
        conflicts.push({
          matchKey,
          event: groupBets[0].event,
          bets: groupBets,
        });
      }
    }
  });
  
  return conflicts;
};

export function AddAllApprovalDialog({
  open,
  onOpenChange,
  bets,
  onConfirm,
}: AddAllApprovalDialogProps) {
  const conflicts = findConflicts(bets);
  const [excludedBetIds, setExcludedBetIds] = useState<Set<string>>(new Set());
  
  // Get non-conflicting bets
  const conflictingBetIds = new Set(conflicts.flatMap(c => c.bets.map(b => b.id)));
  const nonConflictingBets = bets.filter(b => !conflictingBetIds.has(b.id));
  
  const toggleBet = (betId: string) => {
    setExcludedBetIds(prev => {
      const next = new Set(prev);
      if (next.has(betId)) {
        next.delete(betId);
      } else {
        next.add(betId);
      }
      return next;
    });
  };
  
  const handleConfirm = () => {
    const selectedBets = bets.filter(b => !excludedBetIds.has(b.id));
    onConfirm(selectedBets);
    onOpenChange(false);
    setExcludedBetIds(new Set());
  };
  
  const handleCancel = () => {
    onOpenChange(false);
    setExcludedBetIds(new Set());
  };
  
  const totalSelected = bets.length - excludedBetIds.size;
  
  // If no conflicts, confirm immediately
  if (conflicts.length === 0 && open) {
    onConfirm(bets);
    onOpenChange(false);
    return null;
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Conflicting Bets Detected
          </DialogTitle>
          <DialogDescription>
            The following bets are on the same match with conflicting selections. 
            Both cannot win. Please choose which bet(s) to keep.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {conflicts.map((conflict) => (
            <div 
              key={conflict.matchKey} 
              className="border border-warning/30 bg-warning/5 rounded-lg p-4"
            >
              <p className="font-medium text-foreground mb-3">
                {conflict.event}
              </p>
              <div className="space-y-2">
                {conflict.bets.map((bet) => {
                  const isExcluded = excludedBetIds.has(bet.id);
                  return (
                    <div
                      key={bet.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-md border transition-all cursor-pointer",
                        isExcluded 
                          ? "border-border bg-muted/50 opacity-50" 
                          : "border-primary/30 bg-primary/5"
                      )}
                      onClick={() => toggleBet(bet.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={!isExcluded}
                          onCheckedChange={() => toggleBet(bet.id)}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {bet.selection}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {bet.market}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            EV: +{(bet.expectedValue * 100).toFixed(1)}% • 
                            Odds: {bet.offeredOdds.toFixed(2)} • 
                            Confidence: {bet.confidence}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-profit font-bold">
                          {bet.offeredOdds.toFixed(2)}
                        </span>
                        {bet.aiAnalysis && (
                          <div className="text-xs text-muted-foreground">
                            AI: {bet.aiAnalysis.recommendation.replace('_', ' ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          
          {nonConflictingBets.length > 0 && (
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-2">
                <Check className="h-4 w-4 inline mr-1 text-profit" />
                {nonConflictingBets.length} other bet(s) with no conflicts will be added
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={totalSelected === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Add {totalSelected} Bet{totalSelected !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
