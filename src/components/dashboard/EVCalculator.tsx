import { useState } from "react";
import { Calculator, TrendingUp, TrendingDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function EVCalculator() {
  const [odds, setOdds] = useState("");
  const [probability, setProbability] = useState("");
  const [result, setResult] = useState<{ ev: number; edge: number; isPositive: boolean } | null>(null);

  const calculateEV = () => {
    const decimalOdds = parseFloat(odds);
    const winProb = parseFloat(probability) / 100;

    if (isNaN(decimalOdds) || isNaN(winProb) || decimalOdds <= 1 || winProb <= 0 || winProb > 1) return;

    // Implied probability from odds
    const impliedProb = 1 / decimalOdds;
    
    // Edge = Your probability - Implied probability
    const edge = (winProb - impliedProb) * 100;
    
    // EV per $100 stake = (Prob × Profit) - (1-Prob × Stake)
    const ev = (winProb * (decimalOdds - 1) * 100) - ((1 - winProb) * 100);

    setResult({ ev, edge, isPositive: ev > 0 });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') calculateEV();
  };

  // Calculate implied probability for display
  const impliedProb = odds ? (1 / parseFloat(odds)) * 100 : null;

  return (
    <div className="stat-card space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Calculator className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">EV Calculator</h3>
          <p className="text-xs text-muted-foreground">Quick +EV check</p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="odds" className="text-muted-foreground text-sm">Decimal Odds</Label>
          <Input
            id="odds"
            type="number"
            step="0.01"
            placeholder="e.g. 2.10"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-lg bg-muted border-border h-12"
          />
          {impliedProb && impliedProb > 0 && impliedProb < 100 && (
            <p className="text-xs text-muted-foreground">
              Implied: {impliedProb.toFixed(1)}%
            </p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="probability" className="text-muted-foreground text-sm">Your True Probability (%)</Label>
          <Input
            id="probability"
            type="number"
            step="0.1"
            placeholder="e.g. 55"
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-lg bg-muted border-border h-12"
          />
        </div>

        <Button onClick={calculateEV} variant="glow" className="w-full h-11">
          <Zap className="h-4 w-4 mr-2" />
          Check EV
        </Button>
      </div>

      {result && (
        <div className={cn(
          "rounded-xl p-4 space-y-3 animate-slide-up border",
          result.isPositive 
            ? "bg-profit/10 border-profit/30" 
            : "bg-loss/10 border-loss/30"
        )}>
          <div className="flex items-center justify-center gap-2 pb-2 border-b border-border/50">
            {result.isPositive ? (
              <TrendingUp className="h-5 w-5 text-profit" />
            ) : (
              <TrendingDown className="h-5 w-5 text-loss" />
            )}
            <span className={cn(
              "text-lg font-bold",
              result.isPositive ? "text-profit" : "text-loss"
            )}>
              {result.isPositive ? "+EV Bet ✓" : "Negative EV ✗"}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Expected Value</p>
              <p className={cn(
                "font-mono text-xl font-bold",
                result.ev >= 0 ? "text-profit" : "text-loss"
              )}>
                {result.ev >= 0 ? "+" : ""}{result.ev.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">per $100</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Edge</p>
              <p className={cn(
                "font-mono text-xl font-bold",
                result.edge >= 0 ? "text-profit" : "text-loss"
              )}>
                {result.edge >= 0 ? "+" : ""}{result.edge.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">vs implied</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
