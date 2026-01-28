import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Edit3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ManualPriceInputProps {
  signalId: string;
  eventName: string;
  currentPolyPrice?: number;
  onUpdate: () => void;
}

export function ManualPriceInput({ signalId, eventName, currentPolyPrice, onUpdate }: ManualPriceInputProps) {
  const [open, setOpen] = useState(false);
  const [yesPrice, setYesPrice] = useState(currentPolyPrice ? (currentPolyPrice * 100).toString() : '');
  const [volume, setVolume] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    const priceNum = parseFloat(yesPrice);
    if (isNaN(priceNum) || priceNum < 1 || priceNum > 99) {
      toast({
        title: 'Invalid Price',
        description: 'Enter a price between 1 and 99 cents',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Get current signal to calculate edge
      const { data: signal } = await supabase
        .from('signal_opportunities')
        .select('bookmaker_prob_fair')
        .eq('id', signalId)
        .single();

      if (!signal) throw new Error('Signal not found');

      const polyPrice = priceNum / 100;
      const bookmakerProb = signal.bookmaker_prob_fair || 0.5;
      const edge = ((bookmakerProb - polyPrice) / polyPrice) * 100;

      const { error } = await supabase
        .from('signal_opportunities')
        .update({
          polymarket_yes_price: polyPrice,
          polymarket_price: polyPrice,
          polymarket_volume: volume ? parseFloat(volume) : null,
          polymarket_updated_at: new Date().toISOString(),
          is_true_arbitrage: true,
          polymarket_match_confidence: 1.0,
          edge_percent: Math.max(0, edge),
        })
        .eq('id', signalId);

      if (error) throw error;

      toast({
        title: 'Price Updated',
        description: `Set Polymarket price to ${priceNum}¢ (${edge.toFixed(1)}% edge)`,
      });
      
      setOpen(false);
      onUpdate();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update price',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
          <Edit3 className="h-3 w-3" />
          Set Poly Price
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Manual Polymarket Price</DialogTitle>
          <DialogDescription className="text-xs">
            {eventName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="yesPrice">YES Price (cents)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="yesPrice"
                type="number"
                min="1"
                max="99"
                placeholder="e.g. 58"
                value={yesPrice}
                onChange={(e) => setYesPrice(e.target.value)}
                className="text-lg font-mono"
              />
              <span className="text-muted-foreground">¢</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the current YES price from Polymarket (1-99)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="volume">Volume (optional)</Label>
            <Input
              id="volume"
              type="number"
              placeholder="e.g. 750000"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Price'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
