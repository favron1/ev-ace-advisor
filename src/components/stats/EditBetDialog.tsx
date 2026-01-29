import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import type { SignalLogEntry } from '@/hooks/useSignalStats';

interface EditBetDialogProps {
  bet: SignalLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<SignalLogEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EditBetDialog({ bet, open, onOpenChange, onSave, onDelete }: EditBetDialogProps) {
  const [eventName, setEventName] = useState('');
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [entryPrice, setEntryPrice] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [edgeAtSignal, setEdgeAtSignal] = useState('');
  const [outcome, setOutcome] = useState<'pending' | 'win' | 'loss' | 'void'>('pending');
  const [profitLoss, setProfitLoss] = useState('');
  const [isAutoCalculating, setIsAutoCalculating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Initialize form when bet changes
  useEffect(() => {
    if (bet) {
      setEventName(bet.event_name);
      setSide(bet.side as 'YES' | 'NO');
      setEntryPrice((bet.entry_price * 100).toFixed(0));
      setStakeAmount(bet.stake_amount?.toString() || '');
      setEdgeAtSignal(bet.edge_at_signal.toFixed(1));
      setOutcome((bet.outcome as 'pending' | 'win' | 'loss' | 'void') || 'pending');
      setProfitLoss(bet.profit_loss?.toFixed(2) || '');
      setIsAutoCalculating(bet.profit_loss === null);
    }
  }, [bet]);

  // Auto-calculate P/L when outcome changes
  useEffect(() => {
    if (!isAutoCalculating || !stakeAmount || !entryPrice) return;

    const stake = parseFloat(stakeAmount);
    const price = parseFloat(entryPrice) / 100;

    if (isNaN(stake) || isNaN(price) || price <= 0 || price >= 1) return;

    if (outcome === 'win') {
      const pl = stake * (1 - price) / price;
      setProfitLoss(pl.toFixed(2));
    } else if (outcome === 'loss') {
      setProfitLoss((-stake).toFixed(2));
    } else if (outcome === 'void') {
      setProfitLoss('0.00');
    } else {
      setProfitLoss('');
    }
  }, [outcome, stakeAmount, entryPrice, isAutoCalculating]);

  const handleSave = async () => {
    if (!bet) return;

    setSaving(true);
    try {
      const updates: Partial<SignalLogEntry> = {
        event_name: eventName,
        side,
        entry_price: parseFloat(entryPrice) / 100,
        stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
        edge_at_signal: parseFloat(edgeAtSignal),
        outcome: outcome === 'pending' ? null : outcome,
        profit_loss: profitLoss ? parseFloat(profitLoss) : null,
      };

      // Set settled_at if outcome is now set
      if (outcome !== 'pending' && !bet.settled_at) {
        (updates as Record<string, unknown>).settled_at = new Date().toISOString();
      }

      await onSave(bet.id, updates);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving bet:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!bet || !confirm('Are you sure you want to delete this bet?')) return;

    setDeleting(true);
    try {
      await onDelete(bet.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting bet:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleProfitLossChange = (value: string) => {
    setProfitLoss(value);
    setIsAutoCalculating(false);
  };

  if (!bet) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Bet</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Event Name */}
          <div className="grid gap-2">
            <Label htmlFor="eventName">Event Name</Label>
            <Input
              id="eventName"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
          </div>

          {/* Side */}
          <div className="grid gap-2">
            <Label>Side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as 'YES' | 'NO')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YES">YES</SelectItem>
                <SelectItem value="NO">NO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry Price & Stake */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="entryPrice">Entry Price (¢)</Label>
              <Input
                id="entryPrice"
                type="number"
                min="1"
                max="99"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="stakeAmount">Stake ($)</Label>
              <Input
                id="stakeAmount"
                type="number"
                min="0"
                step="0.01"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Edge */}
          <div className="grid gap-2">
            <Label htmlFor="edge">Edge (%)</Label>
            <Input
              id="edge"
              type="number"
              step="0.1"
              value={edgeAtSignal}
              onChange={(e) => setEdgeAtSignal(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as 'pending' | 'win' | 'loss' | 'void')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="win">Win</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* P/L */}
          <div className="grid gap-2">
            <Label htmlFor="profitLoss">
              P/L ($) {isAutoCalculating && outcome !== 'pending' && <span className="text-xs text-muted-foreground">(auto-calculated)</span>}
            </Label>
            <Input
              id="profitLoss"
              type="number"
              step="0.01"
              value={profitLoss}
              onChange={(e) => handleProfitLossChange(e.target.value)}
              placeholder={outcome === 'pending' ? 'Set status first' : ''}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="sm:mr-auto"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
