import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Receipt, X } from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { cn } from "@/lib/utils";

export function BetSlipDrawer() {
  const {
    slipBets,
    removeFromSlip,
    updateStake,
    updateOdds,
    clearSlip,
    totalStake,
    potentialReturn,
    isOpen,
    setIsOpen
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

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-md bg-background border-border">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Receipt className="h-5 w-5 text-primary" />
            My Bet Slip
            {slipBets.length > 0 && (
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {slipBets.length} selection{slipBets.length !== 1 ? 's' : ''}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
          {slipBets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-4 opacity-30" />
              <p className="font-medium">Your bet slip is empty</p>
              <p className="text-sm">Add selections from the Best Bets table</p>
            </div>
          ) : (
            slipBets.map((bet) => (
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

        {slipBets.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-border bg-background space-y-4">
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
              <Button className="flex-1 bg-profit hover:bg-profit/90 text-background">
                Place Bets
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
