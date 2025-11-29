import { useState } from "react";
import { Brain, Loader2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { BetAnalysis } from "@/types/betting";

export function MatchAnalyzer() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<BetAnalysis | null>(null);
  
  const [formData, setFormData] = useState({
    homeTeam: "",
    awayTeam: "",
    league: "",
    market: "1x2",
    selection: "",
    offeredOdds: "",
    homeForm: "",
    awayForm: "",
  });

  const analyzebet = async () => {
    if (!formData.homeTeam || !formData.awayTeam || !formData.selection || !formData.offeredOdds) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setAnalysis(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          homeTeam: formData.homeTeam,
          awayTeam: formData.awayTeam,
          league: formData.league,
          market: formData.market,
          selection: formData.selection,
          offeredOdds: parseFloat(formData.offeredOdds),
          homeForm: formData.homeForm,
          awayForm: formData.awayForm,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      
      toast({
        title: "Analysis Complete",
        description: data.analysis.meetsCriteria 
          ? "Value bet detected! Check the results below."
          : "No significant value found in this bet.",
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">AI Bet Analyzer</h3>
          <p className="text-sm text-muted-foreground">Get AI-powered value assessment</p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Home Team *</Label>
            <Input
              placeholder="Liverpool"
              value={formData.homeTeam}
              onChange={(e) => setFormData({ ...formData, homeTeam: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Away Team *</Label>
            <Input
              placeholder="Arsenal"
              value={formData.awayTeam}
              onChange={(e) => setFormData({ ...formData, awayTeam: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">League</Label>
            <Input
              placeholder="Premier League"
              value={formData.league}
              onChange={(e) => setFormData({ ...formData, league: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Market</Label>
            <Select value={formData.market} onValueChange={(v) => setFormData({ ...formData, market: v })}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1x2">Win/Draw/Win</SelectItem>
                <SelectItem value="over_under">Over/Under</SelectItem>
                <SelectItem value="btts">Both Teams to Score</SelectItem>
                <SelectItem value="handicap">Handicap</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Selection *</Label>
            <Input
              placeholder="Liverpool Win"
              value={formData.selection}
              onChange={(e) => setFormData({ ...formData, selection: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Offered Odds *</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="2.10"
              value={formData.offeredOdds}
              onChange={(e) => setFormData({ ...formData, offeredOdds: e.target.value })}
              className="font-mono bg-muted border-border"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Home Form (Last 5)</Label>
            <Input
              placeholder="WWDLW"
              maxLength={5}
              value={formData.homeForm}
              onChange={(e) => setFormData({ ...formData, homeForm: e.target.value.toUpperCase() })}
              className="font-mono bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Away Form (Last 5)</Label>
            <Input
              placeholder="WLDWL"
              maxLength={5}
              value={formData.awayForm}
              onChange={(e) => setFormData({ ...formData, awayForm: e.target.value.toUpperCase() })}
              className="font-mono bg-muted border-border"
            />
          </div>
        </div>

        <Button onClick={analyzebet} disabled={isLoading} variant="glow" className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Brain className="h-4 w-4" />
              Analyze Bet
            </>
          )}
        </Button>
      </div>

      {analysis && (
        <div className={cn(
          "rounded-lg p-5 space-y-4 animate-slide-up border",
          analysis.meetsCriteria 
            ? "bg-profit/10 border-profit/20" 
            : "bg-muted border-border"
        )}>
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground">Analysis Results</h4>
            {analysis.meetsCriteria ? (
              <div className="flex items-center gap-1 text-profit">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">Value Detected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">No Value</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Actual Probability</p>
              <p className="font-mono font-bold text-foreground">{analysis.actualProbability.toFixed(1)}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Fair Odds</p>
              <p className="font-mono font-bold text-foreground">{analysis.fairOdds.toFixed(2)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Expected Value</p>
              <p className={cn(
                "font-mono font-bold",
                analysis.expectedValue >= 0 ? "text-profit" : "text-loss"
              )}>
                {analysis.expectedValue >= 0 ? "+" : ""}{(analysis.expectedValue * 100).toFixed(1)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Edge</p>
              <p className={cn(
                "font-mono font-bold",
                analysis.edge >= 0 ? "text-profit" : "text-loss"
              )}>
                {analysis.edge >= 0 ? "+" : ""}{analysis.edge.toFixed(1)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className={cn(
                "font-medium capitalize",
                analysis.confidence === "high" ? "text-profit" :
                analysis.confidence === "moderate" ? "text-warning" : "text-muted-foreground"
              )}>
                {analysis.confidence}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggested Stake</p>
              <p className="font-mono font-bold text-foreground">{analysis.suggestedStakePercent}%</p>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">AI Reasoning</p>
            <p className="text-sm text-foreground">{analysis.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  );
}
