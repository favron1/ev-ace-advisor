// ============================================================================
// LAYER 2: PRESENTATION - SAFE TO MODIFY
// ============================================================================
// Quick Execution Panel for professional betting analysis
// Shows full Kelly sizing, costs, net edge, and BET/NO BET recommendation
// ============================================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Calculator, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Check, 
  X,
  Zap,
  Eye,
  Clock,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EnrichedSignal } from '@/types/arbitrage';

interface QuickExecutionPanelProps {
  signal: EnrichedSignal;
  onExecute: (id: string, price: number) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
  bankroll?: number;
}

export function QuickExecutionPanel({ 
  signal, 
  onExecute, 
  onDismiss, 
  onClose,
  bankroll = 100000 // Default $100k bankroll
}: QuickExecutionPanelProps) {
  const [customStake, setCustomStake] = useState<number | null>(null);

  // Calculate Kelly percentage and sizing
  const polymarketPrice = signal.polymarket_price || 0;
  const bookFairProb = signal.book_probability || 0;
  const edge = signal.edge_percentage || 0;
  
  // Kelly formula: (bp - q) / b where b = odds-1, p = true prob, q = 1-p
  const odds = polymarketPrice > 0 ? 1 / polymarketPrice : 0;
  const kellyFraction = bookFairProb > 0 && odds > 1 ? 
    (bookFairProb * odds - 1) / (odds - 1) : 0;
  
  const kellyPercent = Math.max(0, Math.min(25, kellyFraction * 100)); // Cap at 25%
  const kellyStake = bankroll * (kellyPercent / 100);
  const customStakeToUse = customStake || kellyStake;
  
  // Calculate expected value
  const expectedValue = bookFairProb > 0 && odds > 0 ? 
    (bookFairProb * (odds * customStakeToUse - customStakeToUse) - (1 - bookFairProb) * customStakeToUse) : 0;
  
  // Calculate costs (assume 2% Polymarket fee)
  const polymarketFee = customStakeToUse * 0.02;
  const netExpectedValue = expectedValue - polymarketFee;
  
  // Risk assessment
  const riskLevel = kellyPercent > 15 ? 'high' : kellyPercent > 8 ? 'medium' : 'low';
  const confidence = signal.confidence_score || 0;
  
  // BET/NO BET recommendation
  const shouldBet = netExpectedValue > 0 && kellyPercent > 2 && confidence > 0.7;
  
  // Time to event
  const timeToEvent = signal.expires_at ? 
    new Date(signal.expires_at).getTime() - new Date().getTime() : null;
  const hoursToEvent = timeToEvent ? Math.max(0, timeToEvent / (1000 * 60 * 60)) : null;

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-400" />
            Quick Execution Analysis
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Event Summary */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="font-semibold text-white text-sm mb-2">{signal.event_name}</h3>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
              {signal.league || 'Unknown League'}
            </Badge>
            {hoursToEvent !== null && (
              <span className="text-slate-400">
                <Clock className="h-3 w-3 inline mr-1" />
                {hoursToEvent < 1 ? `${Math.round(hoursToEvent * 60)}m` : `${hoursToEvent.toFixed(1)}h`} left
              </span>
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">+{edge.toFixed(1)}%</div>
            <div className="text-xs text-slate-400">Edge</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{(kellyPercent).toFixed(1)}%</div>
            <div className="text-xs text-slate-400">Kelly</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{(confidence * 100).toFixed(0)}%</div>
            <div className="text-xs text-slate-400">Confidence</div>
          </div>
        </div>

        <Separator className="bg-slate-700" />

        {/* Pricing Analysis */}
        <div className="space-y-3">
          <h4 className="font-medium text-white text-sm">Pricing Analysis</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Polymarket Price</div>
              <div className="font-semibold text-white">{(polymarketPrice * 100).toFixed(0)}¢</div>
            </div>
            <div>
              <div className="text-slate-400">Fair Value</div>
              <div className="font-semibold text-white">{(bookFairProb * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-slate-400">Implied Odds</div>
              <div className="font-semibold text-white">{odds.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-slate-400">Volume</div>
              <div className="font-semibold text-white">
                {signal.polymarket_volume ? 
                  `$${(signal.polymarket_volume / 1000).toFixed(0)}K` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-slate-700" />

        {/* Position Sizing */}
        <div className="space-y-3">
          <h4 className="font-medium text-white text-sm">Position Sizing</h4>
          <div className="bg-slate-800/30 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-400">Kelly Stake</div>
                <div className="font-semibold text-white">${kellyStake.toFixed(0)}</div>
              </div>
              <div>
                <div className="text-slate-400">Kelly %</div>
                <div className="font-semibold text-white">{kellyPercent.toFixed(1)}%</div>
              </div>
            </div>
            
            {/* Risk Level */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-400">Risk Level:</span>
              <Badge variant="outline" className={cn(
                riskLevel === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                'bg-green-500/20 text-green-400 border-green-500/50'
              )}>
                {riskLevel.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Expected Value Calculation */}
        <div className="space-y-3">
          <h4 className="font-medium text-white text-sm">Expected Value</h4>
          <div className="bg-slate-800/30 rounded-lg p-3 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Gross EV</span>
                <span className="font-semibold text-white">${expectedValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Polymarket Fee (2%)</span>
                <span className="font-semibold text-red-400">-${polymarketFee.toFixed(2)}</span>
              </div>
              <Separator className="bg-slate-600" />
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Net EV</span>
                <span className={cn(
                  "font-bold",
                  netExpectedValue > 0 ? 'text-green-400' : 'text-red-400'
                )}>
                  {netExpectedValue > 0 ? '+' : ''}${netExpectedValue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center justify-center mb-3">
            {shouldBet ? (
              <div className="flex items-center gap-2">
                <Check className="h-6 w-6 text-green-400" />
                <span className="text-xl font-bold text-green-400">BET</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <X className="h-6 w-6 text-red-400" />
                <span className="text-xl font-bold text-red-400">NO BET</span>
              </div>
            )}
          </div>
          
          <div className="text-xs text-center text-slate-400 mb-4">
            {shouldBet ? 
              'Positive expected value with acceptable risk level. Recommended position size based on Kelly criterion.' :
              'Insufficient edge, high risk, or low confidence. Consider waiting for better opportunities.'
            }
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              className={cn(
                "flex-1",
                shouldBet ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-600 hover:bg-slate-700'
              )}
              onClick={() => onExecute(signal.id, polymarketPrice)}
              disabled={!shouldBet}
            >
              <Zap className="h-4 w-4 mr-2" />
              Execute Bet
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={() => onDismiss(signal.id)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Watch
            </Button>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
            Close Analysis
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}