import { useState } from "react";
import { Calculator, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function EVCalculator() {
  const [odds, setOdds] = useState("");
  const [probability, setProbability] = useState("");
  const [stake, setStake] = useState("100");
  const [result, setResult] = useState<{ ev: number; roi: number; recommendation: string } | null>(null);

  const calculateEV = () => {
    const decimalOdds = parseFloat(odds);
    const winProb = parseFloat(probability) / 100;
    const stakeAmount = parseFloat(stake);

    if (isNaN(decimalOdds) || isNaN(winProb) || isNaN(stakeAmount)) return;

    // EV = (Probability of Win × Potential Profit) - (Probability of Loss × Stake)
    const potentialProfit = (decimalOdds - 1) * stakeAmount;
    const ev = (winProb * potentialProfit) - ((1 - winProb) * stakeAmount);
    const roi = (ev / stakeAmount) * 100;

    let recommendation = "";
    if (roi > 5) recommendation = "Strong Value Bet ✓";
    else if (roi > 0) recommendation = "Slight Edge - Consider";
    else if (roi > -5) recommendation = "Marginal - Avoid";
    else recommendation = "Negative EV - Do Not Bet";

    setResult({ ev, roi, recommendation });
  };

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Calculator className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">EV Calculator</h3>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="odds" className="text-muted-foreground">Decimal Odds</Label>
            <Input
              id="odds"
              type="number"
              step="0.01"
              placeholder="2.50"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className="font-mono bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="probability" className="text-muted-foreground">True Probability (%)</Label>
            <Input
              id="probability"
              type="number"
              step="0.1"
              placeholder="45"
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
              className="font-mono bg-muted border-border"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stake" className="text-muted-foreground">Stake Amount</Label>
          <Input
            id="stake"
            type="number"
            placeholder="100"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="font-mono bg-muted border-border"
          />
        </div>
        <Button onClick={calculateEV} variant="glow" className="w-full">
          Calculate Expected Value
        </Button>
      </div>

      {result && (
        <div className={cn(
          "rounded-lg p-4 space-y-3 animate-slide-up",
          result.roi > 0 ? "bg-profit/10 border border-profit/20" : "bg-loss/10 border border-loss/20"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Expected Value</span>
            <span className={cn("font-mono font-bold", result.ev >= 0 ? "text-profit" : "text-loss")}>
              {result.ev >= 0 ? "+" : ""}{result.ev.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">ROI</span>
            <div className="flex items-center gap-1">
              {result.roi >= 0 ? (
                <TrendingUp className="h-4 w-4 text-profit" />
              ) : (
                <TrendingDown className="h-4 w-4 text-loss" />
              )}
              <span className={cn("font-mono font-bold", result.roi >= 0 ? "text-profit" : "text-loss")}>
                {result.roi >= 0 ? "+" : ""}{result.roi.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <p className={cn(
              "text-sm font-medium",
              result.roi > 0 ? "text-profit" : "text-loss"
            )}>
              {result.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
