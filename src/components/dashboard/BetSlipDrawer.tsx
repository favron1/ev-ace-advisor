import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Receipt, X, Check, XCircle, Clock, Send, ListChecks, RefreshCw, Loader2 } from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { cn } from "@/lib/utils";

export function BetSlipDrawer() {
  const {
    draftBets,
    placedBets,
    settledBets,
    removeFromSlip,
    updateStake,
    updateOdds,
    placeBets,
    checkResults,
    updateResult,
    undoResult,
    clearSlip,
    totalStake,
    potentialReturn,
    totalProfit,
    winCount,
    lossCount,
    isOpen,
    setIsOpen,
    isChecking,
    isPlacing
  } = useBetSlip();

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const winRate = settledBets.length > 0 ? (winCount / settledBets.length * 100) : 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-md bg-background border-border flex flex-col">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Receipt className="h-5 w-5 text-primary" />
            My Bet Slip
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="draft" className="flex-1 flex flex-col mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draft" className="gap-1 text-xs">
              <Clock className="h-3 w-3" />
              Draft ({draftBets.length})
            </TabsTrigger>
            <TabsTrigger value="placed" className="gap-1 text-xs">
              <Send className="h-3 w-3" />
              Placed ({placedBets.length})
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-1 text-xs">
              <ListChecks className="h-3 w-3" />
              Results ({settledBets.length})
            </TabsTrigger>
          </TabsList>

          {/* Draft Bets Tab */}
          <TabsContent value="draft" className="flex-1 flex flex-col">
            <div className="flex-1 space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto py-4">
              {draftBets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Receipt className="h-12 w-12 mb-4 opacity-30" />
                  <p className="font-medium">No draft bets</p>
                  <p className="text-sm">Add selections from the Best Bets table</p>
                </div>
              ) : (
                draftBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{bet.league}</p>
                        <p className="font-medium text-foreground text-sm">{bet.match}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(bet.commenceTime)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-loss"
                        onClick={() => removeFromSlip(bet.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-primary">{bet.selection}</p>
                      <span className="text-xs text-muted-foreground">@ {bet.bookmaker}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Odds</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="1.01"
                          value={bet.odds}
                          onChange={(e) => updateOdds(bet.id, parseFloat(e.target.value) || bet.odds)}
                          className="h-9 bg-background border-border font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Stake ($)</label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={bet.stake}
                          onChange={(e) => updateStake(bet.id, parseFloat(e.target.value) || 0)}
                          className="h-9 bg-background border-border font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Potential Return</span>
                      <span className="font-mono font-bold text-profit">
                        ${(bet.stake * bet.odds).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {draftBets.length > 0 && (
              <div className="border-t border-border pt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Stake</span>
                    <span className="font-mono font-medium text-foreground">${totalStake.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Potential Return</span>
                    <span className="font-mono font-bold text-profit text-lg">${potentialReturn.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={clearSlip}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                  <Button 
                    className="flex-1 bg-profit hover:bg-profit/90 text-background"
                    onClick={placeBets}
                    disabled={isPlacing}
                  >
                    {isPlacing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {isPlacing ? 'Placing...' : 'Place Bets'}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Placed Bets Tab */}
          <TabsContent value="placed" className="flex-1 flex flex-col">
            <div className="flex-1 space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto py-4">
              {placedBets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Send className="h-12 w-12 mb-4 opacity-30" />
                  <p className="font-medium">No placed bets</p>
                  <p className="text-sm">Place bets from the Draft tab</p>
                </div>
              ) : (
                placedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{bet.league}</p>
                        <p className="font-medium text-foreground text-sm">{bet.match}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(bet.commenceTime || bet.placedAt)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="px-2 py-1 rounded text-xs font-medium bg-primary/20 text-primary">
                          PLACED
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-loss"
                          onClick={() => removeFromSlip(bet.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-primary">{bet.selection}</p>
                      <span className="text-xs text-muted-foreground">@ {bet.bookmaker || 'Best odds'}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        ${bet.stake.toFixed(2)} @ {bet.odds}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        Return: ${(bet.stake * bet.odds).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-profit text-profit hover:bg-profit hover:text-background"
                        onClick={() => updateResult(bet.id, 'won')}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Won
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-loss text-loss hover:bg-loss hover:text-background"
                        onClick={() => updateResult(bet.id, 'lost')}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Lost
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {placedBets.length > 0 && (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total at Risk</span>
                  <span className="font-mono font-medium text-foreground">
                    ${placedBets.reduce((sum, b) => sum + b.stake, 0).toFixed(2)}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={checkResults}
                  disabled={isChecking}
                >
                  {isChecking ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isChecking ? 'Checking...' : 'Check Results Automatically'}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="flex flex-col">
            {/* Results Summary */}
            <div className="grid grid-cols-3 gap-3 pt-2 pb-4 border-b border-border">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{settledBets.length}</p>
                <p className="text-xs text-muted-foreground">Total Bets</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-profit">{winCount}</p>
                <p className="text-xs text-muted-foreground">Wins</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-loss">{lossCount}</p>
                <p className="text-xs text-muted-foreground">Losses</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 max-h-[calc(100vh-500px)] overflow-y-auto py-4">
              {settledBets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Check className="h-12 w-12 mb-4 opacity-30" />
                  <p className="font-medium">No results yet</p>
                  <p className="text-sm">Mark placed bets as won or lost</p>
                </div>
              ) : (
                settledBets.map((bet) => (
                  <div
                    key={bet.id}
                    className={cn(
                      "rounded-lg border p-3 space-y-2",
                      bet.status === 'won' ? "border-profit/30 bg-profit/5" : "border-loss/30 bg-loss/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{bet.league}</p>
                        <p className="font-medium text-foreground text-sm">{bet.match}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          bet.status === 'won' ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"
                        )}>
                          {bet.status === 'won' ? 'WON' : 'LOST'}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-loss"
                          onClick={() => removeFromSlip(bet.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{bet.selection} @ {bet.odds}</span>
                      <span className={cn(
                        "font-mono font-bold",
                        bet.status === 'won' ? "text-profit" : "text-loss"
                      )}>
                        {bet.status === 'won' ? '+' : ''}{bet.profitLoss?.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Stake: ${bet.stake.toFixed(2)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => undoResult(bet.id)}
                      >
                        Undo
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {settledBets.length > 0 && (
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Win Rate</span>
                  <span className="font-mono font-medium text-foreground">{winRate.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Profit/Loss</span>
                  <span className={cn(
                    "font-mono font-bold text-lg",
                    totalProfit >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}