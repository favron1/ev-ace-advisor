import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ManualPriceOverrideProps {
  eventId: string;
  field: 'polymarket_yes_price' | 'current_probability';
  currentValue: number | null;
  onSaved: () => void;
}

export function ManualPriceOverride({ eventId, field, currentValue, onSaved }: ManualPriceOverrideProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue ? (currentValue * 100).toFixed(0) : '');
  const { toast } = useToast();

  const handleSave = async () => {
    const numVal = parseFloat(value) / 100;
    if (isNaN(numVal) || numVal < 0 || numVal > 1) {
      toast({ title: 'Invalid price', description: 'Enter a value between 0-100', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('event_watch_state')
      .update({ [field]: numVal, updated_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Price updated' });
      setEditing(false);
      onSaved();
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="font-mono text-sm hover:text-primary transition-colors cursor-pointer"
        title="Click to override"
      >
        {currentValue != null ? `${(currentValue * 100).toFixed(0)}¢` : '—'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-6 w-14 text-xs font-mono px-1"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
        autoFocus
      />
      <span className="text-[10px] text-muted-foreground">¢</span>
      <Button size="sm" className="h-6 w-6 p-0" onClick={handleSave}>
        <Check className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing(false)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
