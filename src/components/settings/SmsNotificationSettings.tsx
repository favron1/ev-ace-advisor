import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Phone, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SmsNotificationSettingsProps {
  userId: string;
}

export function SmsNotificationSettings({ userId }: SmsNotificationSettingsProps) {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);

  // E.164 format validation
  const validatePhone = (phone: string) => {
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    return e164Regex.test(phone);
  };

  useEffect(() => {
    const fetchPhone = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data?.phone_number) {
        setPhoneNumber(data.phone_number);
        setIsValid(validatePhone(data.phone_number));
      }
      setLoading(false);
    };
    
    fetchPhone();
  }, [userId]);

  const handlePhoneChange = (value: string) => {
    // Auto-add + if user starts typing numbers
    let formatted = value;
    if (value && !value.startsWith('+')) {
      formatted = '+' + value;
    }
    setPhoneNumber(formatted);
    setIsValid(validatePhone(formatted));
  };

  const handleSave = async () => {
    if (!isValid) {
      toast({
        title: 'Invalid phone number',
        description: 'Please enter a valid phone number in E.164 format (e.g., +61412345678)',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone_number: phoneNumber })
        .eq('user_id', userId);

      if (error) throw error;

      toast({ 
        title: 'Phone number saved',
        description: 'You will receive SMS alerts when edges are confirmed.',
      });
    } catch (err) {
      console.error('Failed to save phone:', err);
      toast({
        title: 'Error',
        description: 'Failed to save phone number',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone_number: null })
        .eq('user_id', userId);

      if (error) throw error;

      setPhoneNumber('');
      setIsValid(false);
      toast({ title: 'Phone number removed' });
    } catch (err) {
      console.error('Failed to clear phone:', err);
      toast({
        title: 'Error',
        description: 'Failed to remove phone number',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            SMS Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          SMS Notifications
        </CardTitle>
        <CardDescription>
          Receive text alerts when confirmed edges are detected—even while you sleep.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <div className="relative">
            <Input
              id="phone"
              type="tel"
              placeholder="+61 412 345 678"
              value={phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className={isValid ? 'pr-10 border-green-500/50' : ''}
            />
            {isValid && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Include country code (e.g., +61 for Australia, +1 for USA)
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleSave} 
            disabled={saving || !phoneNumber}
            className="flex-1"
          >
            {saving ? 'Saving...' : 'Save Phone Number'}
          </Button>
          {phoneNumber && (
            <Button 
              variant="outline" 
              onClick={handleClear}
              disabled={saving}
            >
              Clear
            </Button>
          )}
        </div>

        {phoneNumber && isValid && (
          <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            ✅ SMS alerts are active. You'll receive a text when an edge is confirmed overnight.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
