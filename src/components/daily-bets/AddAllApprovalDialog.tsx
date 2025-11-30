import { useState, useEffect } from "react";
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
import { AlertTriangle, Check, Plus, X, Star, TrendingUp, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyzedBet } from "@/pages/DailyBets";

interface ConflictGroup {
  matchKey: string;
  event: string;
  bets: AnalyzedBet[];
  recommendedBetId: string | null;
  recommendationReason: string;
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

// Score a bet based on AI analysis and metrics
const scoreBet = (bet: AnalyzedBet): number => {
  let score = 0;
  
  // AI recommendation weight (highest priority)
  if (bet.aiAnalysis) {
    switch (bet.aiAnalysis.recommendation) {
      case 'STRONG_BET': score += 100; break;
      case 'GOOD_BET': score += 70; break;
      case 'CAUTION': score += 30; break;
      case 'AVOID': score += 0; break;
    }
    
    // AI confidence boost
    switch (bet.aiAnalysis.confidence) {
      case 'high': score += 20; break;
      case 'moderate': score += 10; break;
      case 'low': score += 0; break;
    }
  }
  
  // Expected value weight
  score += bet.expectedValue * 100;
  
  // Edge percentage
  score += bet.edge * 2;
  
  // Original confidence
  switch (bet.confidence) {
    case 'high': score += 15; break;
    case 'moderate': score += 8; break;
    case 'low': score += 0; break;
  }
  
  // Stake recommendation (higher = more confident)
  score += bet.suggestedStakePercent * 5;
  
  return score;
};

// Generate recommendation reason
const getRecommendationReason = (best: AnalyzedBet, other: AnalyzedBet): string => {
  const reasons: string[] = [];
  
  if (best.aiAnalysis && other.aiAnalysis) {
    const aiOrder = { 'STRONG_BET': 0, 'GOOD_BET': 1, 'CAUTION': 2, 'AVOID': 3 };
    if (aiOrder[best.aiAnalysis.recommendation] < aiOrder[other.aiAnalysis.recommendation]) {
      reasons.push(`AI rates "${best.selection}" as ${best.aiAnalysis.recommendation.replace('_', ' ')}`);
    }
  }
  
  if (best.expectedValue > other.expectedValue) {
    reasons.push(`Higher EV (+${((best.expectedValue - other.expectedValue) * 100).toFixed(1)}%)`);
  }
  
  if (best.edge > other.edge) {
    reasons.push(`Better edge (+${(best.edge - other.edge).toFixed(1)}%)`);
  }
  
  if (best.aiAnalysis?.confidence === 'high' && other.aiAnalysis?.confidence !== 'high') {
    reasons.push('Higher AI confidence');
  }
  
  if (best.aiAnalysis) {
    if (best.aiAnalysis.marketSentiment?.toLowerCase().includes('favorable') ||
        best.aiAnalysis.marketSentiment?.toLowerCase().includes('positive')) {
      reasons.push('Favorable market sentiment');
    }
    if (best.aiAnalysis.proTipsterView?.toLowerCase().includes('agree') ||
        best.aiAnalysis.proTipsterView?.toLowerCase().includes('backing')) {
      reasons.push('Pro tipsters agree');
    }
  }
  
  return reasons.length > 0 ? reasons.slice(0, 2).join(' • ') : 'Better overall metrics';
};

// Find all conflict groups with recommendations
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
        // Find the best bet based on scoring
        const scoredBets = groupBets.map(bet => ({ bet, score: scoreBet(bet) }));
        scoredBets.sort((a, b) => b.score - a.score);
        
        const bestBet = scoredBets[0].bet;
        const secondBest = scoredBets[1]?.bet;
        
        conflicts.push({
          matchKey,
          event: groupBets[0].event,
          bets: groupBets,
          recommendedBetId: bestBet.id,
          recommendationReason: secondBest ? getRecommendationReason(bestBet, secondBest) : 'Best overall metrics',
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
  
  // Initialize with non-recommended bets excluded
  const getInitialExcluded = () => {
    const excluded = new Set<string>();
    conflicts.forEach(conflict => {
      conflict.bets.forEach(bet => {
        if (bet.id !== conflict.recommendedBetId) {
          excluded.add(bet.id);
        }
      });
    });
    return excluded;
  };
  
  const [excludedBetIds, setExcludedBetIds] = useState<Set<string>>(getInitialExcluded);
  
  // Reset excluded when dialog opens
  useEffect(() => {
    if (open) {
      setExcludedBetIds(getInitialExcluded());
    }
  }, [open, bets]);
  
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
  };
  
  const handleCancel = () => {
    onOpenChange(false);
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
            These bets are on the same match with conflicting selections. 
            We've pre-selected the recommended bet based on AI analysis, market sentiment, and pro tipster views.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {conflicts.map((conflict) => (
            <div 
              key={conflict.matchKey} 
              className="border border-warning/30 bg-warning/5 rounded-lg p-4"
            >
              <p className="font-medium text-foreground mb-2">
                {conflict.event}
              </p>
              
              {/* Recommendation banner */}
              <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-profit/10 border border-profit/20">
                <Star className="h-4 w-4 text-profit fill-profit" />
                <span className="text-sm text-profit font-medium">
                  Recommended: {conflict.bets.find(b => b.id === conflict.recommendedBetId)?.selection}
                </span>
                <span className="text-xs text-muted-foreground">
                  — {conflict.recommendationReason}
                </span>
              </div>
              
              <div className="space-y-2">
                {conflict.bets.map((bet) => {
                  const isExcluded = excludedBetIds.has(bet.id);
                  const isRecommended = bet.id === conflict.recommendedBetId;
                  const ai = bet.aiAnalysis;
                  
                  return (
                    <div
                      key={bet.id}
                      className={cn(
                        "flex items-start justify-between p-3 rounded-md border transition-all cursor-pointer",
                        isExcluded 
                          ? "border-border bg-muted/50 opacity-50" 
                          : isRecommended
                            ? "border-profit/50 bg-profit/10"
                            : "border-primary/30 bg-primary/5"
                      )}
                      onClick={() => toggleBet(bet.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox 
                          checked={!isExcluded}
                          onCheckedChange={() => toggleBet(bet.id)}
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">
                              {bet.selection}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {bet.market}
                            </Badge>
                            {isRecommended && (
                              <Badge className="bg-profit/20 text-profit border-profit/30 text-xs gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                Recommended
                              </Badge>
                            )}
                            {ai && (
                              <Badge 
                                className={cn(
                                  "text-xs",
                                  ai.recommendation === 'STRONG_BET' && "bg-profit/20 text-profit border-profit/30",
                                  ai.recommendation === 'GOOD_BET' && "bg-primary/20 text-primary border-primary/30",
                                  ai.recommendation === 'CAUTION' && "bg-warning/20 text-warning border-warning/30",
                                  ai.recommendation === 'AVOID' && "bg-loss/20 text-loss border-loss/30"
                                )}
                              >
                                {ai.recommendation.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="text-xs text-muted-foreground">
                            EV: +{(bet.expectedValue * 100).toFixed(1)}% • 
                            Edge: {bet.edge.toFixed(1)}% • 
                            Odds: {bet.offeredOdds.toFixed(2)}
                          </div>
                          
                          {ai && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2 pt-2 border-t border-border/50">
                              <div className="flex items-center gap-1">
                                <BarChart3 className="h-3 w-3 text-primary" />
                                <span className="text-muted-foreground truncate" title={ai.historicalTrend}>
                                  {ai.historicalTrend?.slice(0, 30)}...
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-primary" />
                                <span className="text-muted-foreground truncate" title={ai.marketSentiment}>
                                  {ai.marketSentiment?.slice(0, 30)}...
                                </span>
                              </div>
                              <div className="flex items-center gap-1 col-span-2">
                                <Users className="h-3 w-3 text-primary" />
                                <span className="text-muted-foreground truncate" title={ai.proTipsterView}>
                                  Pro: {ai.proTipsterView?.slice(0, 50)}...
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="font-mono text-profit font-bold">
                          {bet.offeredOdds.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          
          {nonConflictingBets.length > 0 && (
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
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
