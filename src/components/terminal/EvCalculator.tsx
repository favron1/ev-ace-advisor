import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface EvCalculatorProps {
  // Pre-fill with signal data if available
  defaultOdds?: number;
  defaultTrueProb?: number;
  stake?: number;
}

export function EvCalculator({ 
  defaultOdds, 
  defaultTrueProb,
  stake = 100 
}: EvCalculatorProps) {
  const [decimalOdds, setDecimalOdds] = useState(defaultOdds?.toFixed(2) || '');
  const [trueProb, setTrueProb] = useState(
    defaultTrueProb ? (defaultTrueProb * 100).toFixed(1) : ''
  );

  // Calculate values
  const odds = parseFloat(decimalOdds);
  const prob = parseFloat(trueProb) / 100;
  
  const impliedProb = odds > 0 ? (1 / odds) * 100 : 0;
  const edge = prob > 0 && odds > 0 ? (prob - (1 / odds)) * 100 : 0;
  const ev = prob > 0 && odds > 0 ? (prob * (odds - 1) - (1 - prob)) * stake : 0;
  
  const isValid = odds > 1 && prob > 0 && prob <= 1;
  const isProfitable = ev > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Just triggers re-render with current values
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <Calculator className="h-3 w-3" />
          EV Calc
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            EV Calculator
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Decimal Odds</Label>
              <Input
                type="number"
                step="0.01"
                min="1.01"
                placeholder="e.g. 2.50"
                value={decimalOdds}
                onChange={(e) => setDecimalOdds(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">True Prob (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 55"
                value={trueProb}
                onChange={(e) => setTrueProb(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {isValid && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Implied Prob:</span>
                <span className="font-mono">{impliedProb.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Edge:</span>
                <span className={cn(
                  "font-mono font-medium",
                  edge > 0 ? "text-green-500" : edge < 0 ? "text-red-500" : ""
                )}>
                  {edge > 0 ? '+' : ''}{edge.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>EV per ${stake}:</span>
                <span className={cn(
                  "font-mono",
                  isProfitable ? "text-green-500" : "text-red-500"
                )}>
                  {isProfitable ? '+' : ''}${ev.toFixed(2)}
                </span>
              </div>
              
              {/* Status indicator */}
              <div className={cn(
                "text-center text-xs py-1.5 rounded font-medium mt-2",
                isProfitable 
                  ? "bg-green-500/10 text-green-500 border border-green-500/30" 
                  : "bg-red-500/10 text-red-500 border border-red-500/30"
              )}>
                {isProfitable ? '✓ +EV BET' : '✗ -EV (No Bet)'}
              </div>
            </div>
          )}
          
          {!isValid && (decimalOdds || trueProb) && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Enter valid odds ({'>'}1.00) and probability (0-100%)
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
