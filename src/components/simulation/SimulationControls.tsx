import { Play, RotateCcw, Loader2, Database, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import type { SimulationConfig } from "@/pages/Simulation";

interface SimulationControlsProps {
  config: SimulationConfig;
  setConfig: (config: SimulationConfig) => void;
  onRun: () => void;
  onReset: () => void;
  onCheckResults: () => void;
  onFetchHistorical: () => void;
  isRunning: boolean;
  isCheckingResults: boolean;
  isFetchingHistorical: boolean;
  progress: number;
  availableBets: number;
  settledBets: number;
}

export function SimulationControls({
  config,
  setConfig,
  onRun,
  onReset,
  onCheckResults,
  onFetchHistorical,
  isRunning,
  isCheckingResults,
  isFetchingHistorical,
  progress,
  availableBets,
  settledBets,
}: SimulationControlsProps) {
  const updateConfig = (key: keyof SimulationConfig, value: any) => {
    setConfig({ ...config, [key]: value });
  };

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Simulation Settings</h3>
        <div className="flex flex-col items-end gap-1 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="h-4 w-4" />
            {availableBets} bets available
          </div>
          <div className="text-xs text-primary">
            {settledBets} with real results
          </div>
        </div>
      </div>

      {/* Fetch Historical Data Button */}
      <Button
        onClick={onFetchHistorical}
        variant="default"
        className="w-full"
        disabled={isFetchingHistorical || isRunning || isCheckingResults}
      >
        {isFetchingHistorical ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {isFetchingHistorical ? 'Fetching...' : 'Fetch Historical Data'}
      </Button>
      
      <p className="text-xs text-muted-foreground">
        Fetches past matches with odds and real results for backtesting
      </p>

      {/* Check Results Button */}
      <Button
        onClick={onCheckResults}
        variant="outline"
        className="w-full"
        disabled={isCheckingResults || isRunning || isFetchingHistorical}
      >
        {isCheckingResults ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        {isCheckingResults ? 'Checking...' : 'Update Match Results'}
      </Button>

      {/* Number of Bets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Number of Bets</Label>
          <span className="text-sm font-mono text-primary">{config.numberOfBets}</span>
        </div>
        <Slider
          value={[config.numberOfBets]}
          onValueChange={([v]) => updateConfig('numberOfBets', v)}
          min={10}
          max={1000}
          step={10}
        />
        <p className="text-xs text-muted-foreground">
          Will cycle through available bets if needed
        </p>
      </div>

      {/* Initial Bankroll */}
      <div className="space-y-2">
        <Label>Initial Bankroll ($)</Label>
        <Input
          type="number"
          value={config.initialBankroll}
          onChange={(e) => updateConfig('initialBankroll', parseFloat(e.target.value) || 1000)}
          className="font-mono"
        />
      </div>

      {/* Staking Strategy */}
      <div className="space-y-2">
        <Label>Staking Strategy</Label>
        <Select
          value={config.stakingStrategy}
          onValueChange={(v) => updateConfig('stakingStrategy', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed Stake</SelectItem>
            <SelectItem value="kelly">Kelly Criterion (¼ Kelly)</SelectItem>
            <SelectItem value="percentage">Percentage of Bankroll</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stake Amount (conditional) */}
      {config.stakingStrategy === 'fixed' && (
        <div className="space-y-2">
          <Label>Fixed Stake ($)</Label>
          <Input
            type="number"
            value={config.fixedStake}
            onChange={(e) => updateConfig('fixedStake', parseFloat(e.target.value) || 10)}
            className="font-mono"
          />
        </div>
      )}

      {config.stakingStrategy === 'percentage' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Bankroll Percentage</Label>
            <span className="text-sm font-mono text-primary">{config.bankrollPercentage}%</span>
          </div>
          <Slider
            value={[config.bankrollPercentage]}
            onValueChange={([v]) => updateConfig('bankrollPercentage', v)}
            min={0.5}
            max={10}
            step={0.5}
          />
        </div>
      )}

      {/* Filters Section */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-medium text-foreground mb-4">Filters</h4>

        {/* Edge Range */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <Label>Edge Range (%)</Label>
            <span className="text-sm font-mono text-primary">
              {config.minEdge}% - {config.maxEdge}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={config.minEdge}
              onChange={(e) => updateConfig('minEdge', parseFloat(e.target.value) || 0)}
              placeholder="Min"
              className="font-mono text-sm"
            />
            <Input
              type="number"
              value={config.maxEdge}
              onChange={(e) => updateConfig('maxEdge', parseFloat(e.target.value) || 100)}
              placeholder="Max"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Odds Range */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <Label>Odds Range</Label>
            <span className="text-sm font-mono text-primary">
              {config.minOdds} - {config.maxOdds}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.1"
              value={config.minOdds}
              onChange={(e) => updateConfig('minOdds', parseFloat(e.target.value) || 1.01)}
              placeholder="Min"
              className="font-mono text-sm"
            />
            <Input
              type="number"
              step="0.1"
              value={config.maxOdds}
              onChange={(e) => updateConfig('maxOdds', parseFloat(e.target.value) || 100)}
              placeholder="Max"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Confidence Level */}
        <div className="space-y-2">
          <Label>Confidence Level</Label>
          <Select
            value={config.confidenceLevel}
            onValueChange={(v) => updateConfig('confidenceLevel', v as any)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="high">High Only</SelectItem>
              <SelectItem value="moderate">Moderate Only</SelectItem>
              <SelectItem value="low">Low Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Running simulation...</span>
            <span className="font-mono text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-4">
        <Button
          onClick={onReset}
          variant="outline"
          className="flex-1"
          disabled={isRunning}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button
          onClick={onRun}
          className="flex-1 bg-primary hover:bg-primary/90"
          disabled={isRunning || availableBets === 0}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {isRunning ? 'Running...' : 'Run Simulation'}
        </Button>
      </div>
    </div>
  );
}
