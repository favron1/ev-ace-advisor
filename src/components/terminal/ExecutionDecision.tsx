import { CheckCircle, XCircle, AlertTriangle, TrendingUp, DollarSign, Percent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExecutionAnalysis } from '@/types/arbitrage';
import { getDecisionBgColor, getDecisionColor } from '@/lib/execution-engine';

interface ExecutionDecisionProps {
  analysis: ExecutionAnalysis;
  showBreakdown?: boolean;
}

const decisionIcons = {
  STRONG_BET: CheckCircle,
  BET: CheckCircle,
  MARGINAL: AlertTriangle,
  NO_BET: XCircle,
};

const decisionLabels = {
  STRONG_BET: 'STRONG BET',
  BET: 'BET',
  MARGINAL: 'MARGINAL',
  NO_BET: 'NO BET',
};

export function ExecutionDecision({ analysis, showBreakdown = true }: ExecutionDecisionProps) {
  const Icon = decisionIcons[analysis.execution_decision];
  const isBettable = analysis.execution_decision === 'STRONG_BET' || analysis.execution_decision === 'BET';
  const isMarginal = analysis.execution_decision === 'MARGINAL';

  return (
    <div className="space-y-3">
      {/* Cost Breakdown */}
      {showBreakdown && analysis.raw_edge_percent > 0 && (
        <div className="p-3 bg-muted/30 rounded-lg border border-border text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <Percent className="h-3 w-3" />
            <span className="font-medium">Cost Breakdown</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">Raw edge</span>
            <span className="text-foreground font-mono">+{analysis.raw_edge_percent.toFixed(1)}%</span>
          </div>
          
          <div className="flex justify-between text-red-400">
            <span>Platform fee (1%)</span>
            <span className="font-mono">-{analysis.platform_fee_percent.toFixed(2)}%</span>
          </div>
          
          <div className="flex justify-between text-red-400">
            <span>Est. spread</span>
            <span className="font-mono">-{analysis.estimated_spread_percent.toFixed(1)}%</span>
          </div>
          
          <div className="flex justify-between text-red-400">
            <span>Est. slippage</span>
            <span className="font-mono">-{analysis.estimated_slippage_percent.toFixed(1)}%</span>
          </div>
          
          <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between font-semibold">
            <span className="text-foreground">Net edge</span>
            <span className={cn(
              "font-mono",
              analysis.net_edge_percent >= 2 ? 'text-green-400' :
              analysis.net_edge_percent >= 1 ? 'text-yellow-400' :
              'text-red-400'
            )}>
              {analysis.net_edge_percent >= 0 ? '+' : ''}{analysis.net_edge_percent.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Main Decision Banner */}
      <div className={cn(
        "p-3 rounded-lg border flex items-center justify-between",
        getDecisionBgColor(analysis.execution_decision)
      )}>
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", getDecisionColor(analysis.execution_decision))} />
          <div>
            <span className={cn("font-bold", getDecisionColor(analysis.execution_decision))}>
              {decisionLabels[analysis.execution_decision]}
            </span>
            <p className="text-xs text-muted-foreground">
              {analysis.decision_reason}
            </p>
          </div>
        </div>
        
        {isBettable && (
          <Badge className="bg-green-600 hover:bg-green-700 text-white">
            <TrendingUp className="h-3 w-3 mr-1" />
            +{analysis.net_edge_percent.toFixed(1)}% NET
          </Badge>
        )}
        
        {isMarginal && (
          <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">
            <AlertTriangle className="h-3 w-3 mr-1" />
            CAUTION
          </Badge>
        )}
      </div>

      {/* Liquidity Info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          Max stake: ${analysis.max_stake_without_impact.toLocaleString()}
        </span>
        <Badge 
          variant="outline" 
          className={cn(
            "text-xs",
            analysis.liquidity_tier === 'high' && 'border-green-500/50 text-green-500',
            analysis.liquidity_tier === 'medium' && 'border-yellow-500/50 text-yellow-500',
            analysis.liquidity_tier === 'low' && 'border-orange-500/50 text-orange-500',
            analysis.liquidity_tier === 'insufficient' && 'border-red-500/50 text-red-500'
          )}
        >
          {analysis.liquidity_tier.toUpperCase()} LIQUIDITY
        </Badge>
      </div>
    </div>
  );
}
