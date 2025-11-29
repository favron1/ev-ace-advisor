import { useState } from "react";
import { Target, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function KellyCalculator() {
  const [bankroll, setBankroll] = useState("");
  const [odds, setOdds] = useState("");
  const [probability, setProbability] = useState("");
  const [kellyFraction, setKellyFraction] = useState("0.25"); // Quarter Kelly default
  const [result, setResult] = useState<{ 
    fullKelly: number; 
    fractionalKelly: number; 
    optimalStake: number;
    edge: number;
  } | null>(null);

  const calculateKelly = () => {
    const bank = parseFloat(bankroll);
    const decimalOdds = parseFloat(odds);
    const winProb = parseFloat(probability) / 100;
    const fraction = parseFloat(kellyFraction);

    if (isNaN(bank) || isNaN(decimalOdds) || isNaN(winProb) || isNaN(fraction)) return;

    // Kelly Criterion: f* = (bp - q) / b
    // where b = decimal odds - 1, p = probability of winning, q = probability of losing
    const b = decimalOdds - 1;
    const q = 1 - winProb;
    const fullKelly = ((b * winProb) - q) / b;
    const edge = (winProb * decimalOdds) - 1;

    // Apply fractional Kelly
    const fractionalKelly = Math.max(0, fullKelly * fraction);
    const optimalStake = bank * fractionalKelly;

    setResult({ fullKelly: fullKelly * 100, fractionalKelly: fractionalKelly * 100, optimalStake, edge: edge * 100 });
  };

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-warning/10 p-2">
            <Target className="h-5 w-5 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Kelly Criterion</h3>
        </div>
        <Tooltip>
          <TooltipTrigger>
            <Info className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>The Kelly Criterion calculates the optimal bet size to maximize long-term growth while managing risk. We recommend using fractional Kelly (25-50%) for added safety.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="bankroll" className="text-muted-foreground">Bankroll</Label>
          <Input
            id="bankroll"
            type="number"
            placeholder="10000"
            value={bankroll}
            onChange={(e) => setBankroll(e.target.value)}
            className="font-mono bg-muted border-border"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="kelly-odds" className="text-muted-foreground">Decimal Odds</Label>
            <Input
              id="kelly-odds"
              type="number"
              step="0.01"
              placeholder="2.50"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className="font-mono bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kelly-probability" className="text-muted-foreground">Win Probability (%)</Label>
            <Input
              id="kelly-probability"
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
          <Label htmlFor="kelly-fraction" className="text-muted-foreground">Kelly Fraction (0.25 = Quarter Kelly)</Label>
          <Input
            id="kelly-fraction"
            type="number"
            step="0.05"
            placeholder="0.25"
            value={kellyFraction}
            onChange={(e) => setKellyFraction(e.target.value)}
            className="font-mono bg-muted border-border"
          />
        </div>
        <Button onClick={calculateKelly} variant="outline" className="w-full">
          Calculate Optimal Stake
        </Button>
      </div>

      {result && (
        <div className={cn(
          "rounded-lg p-4 space-y-3 animate-slide-up",
          result.edge > 0 ? "bg-profit/10 border border-profit/20" : "bg-loss/10 border border-loss/20"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Edge</span>
            <span className={cn("font-mono font-bold", result.edge >= 0 ? "text-profit" : "text-loss")}>
              {result.edge >= 0 ? "+" : ""}{result.edge.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Full Kelly</span>
            <span className="font-mono text-foreground">{result.fullKelly.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fractional Kelly</span>
            <span className="font-mono text-foreground">{result.fractionalKelly.toFixed(2)}%</span>
          </div>
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Optimal Stake</span>
              <span className={cn(
                "font-mono text-lg font-bold",
                result.edge > 0 ? "text-profit" : "text-loss"
              )}>
                ${result.optimalStake.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
