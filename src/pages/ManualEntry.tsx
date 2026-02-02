// ============================================================================
// MANUAL MARKET ENTRY - Add Polymarket events by screenshot/manual input
// ============================================================================
// This page allows manual entry of Polymarket markets that the automated
// system can't discover (e.g., NBA games without CLOB tokens yet).
// Once entered, they flow through the normal watch → active → signal pipeline.
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ManualMarketEntry {
  homeTeam: string;
  awayTeam: string;
  polyYesPrice: string;
  polyNoPrice: string;
  conditionId: string;
  gameDate: string;
  league: string;
}

const INITIAL_ENTRY: ManualMarketEntry = {
  homeTeam: '',
  awayTeam: '',
  polyYesPrice: '',
  polyNoPrice: '',
  conditionId: '',
  gameDate: '',
  league: 'NBA',
};

export default function ManualEntry() {
  const navigate = useNavigate();
  const [entry, setEntry] = useState<ManualMarketEntry>(INITIAL_ENTRY);
  const [submitting, setSubmitting] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState<Array<{
    teams: string;
    status: 'success' | 'error';
    message: string;
  }>>([]);

  const handleChange = (field: keyof ManualMarketEntry, value: string) => {
    setEntry(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!entry.homeTeam || !entry.awayTeam || !entry.polyYesPrice) {
      toast({
        title: 'Missing fields',
        description: 'Home team, away team, and YES price are required',
        variant: 'destructive',
      });
      return;
    }

    const yesPrice = parseFloat(entry.polyYesPrice);
    if (isNaN(yesPrice) || yesPrice <= 0 || yesPrice >= 1) {
      toast({
        title: 'Invalid price',
        description: 'YES price must be between 0.01 and 0.99',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('manual-market-entry', {
        body: {
          homeTeam: entry.homeTeam.trim(),
          awayTeam: entry.awayTeam.trim(),
          polyYesPrice: yesPrice,
          polyNoPrice: entry.polyNoPrice ? parseFloat(entry.polyNoPrice) : 1 - yesPrice,
          conditionId: entry.conditionId.trim() || null,
          gameDate: entry.gameDate || null,
          league: entry.league,
        },
      });

      if (error) throw error;

      const matchLabel = `${entry.awayTeam} @ ${entry.homeTeam}`;
      
      if (data.success) {
        setRecentSubmissions(prev => [{
          teams: matchLabel,
          status: 'success',
          message: data.message || 'Added to monitoring pipeline',
        }, ...prev.slice(0, 4)]);
        
        toast({
          title: 'Market Added',
          description: `${matchLabel} added to watch pipeline`,
        });
        
        // Reset form
        setEntry(INITIAL_ENTRY);
      } else {
        setRecentSubmissions(prev => [{
          teams: matchLabel,
          status: 'error',
          message: data.error || 'Failed to add market',
        }, ...prev.slice(0, 4)]);
        
        toast({
          title: 'Failed',
          description: data.error || 'Could not add market',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Manual entry error:', err);
      toast({
        title: 'Error',
        description: 'Failed to submit market entry',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Manual Market Entry</h1>
            <p className="text-sm text-muted-foreground">
              Add Polymarket events from screenshots for monitoring
            </p>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-2xl">
        <div className="space-y-6">
          {/* Instructions */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>1. Screenshot the Polymarket NBA page with the game you want to monitor</p>
              <p>2. Enter the team names and YES price from the screenshot below</p>
              <p>3. The system will match it to bookmaker odds and begin monitoring</p>
              <p>4. When movement is detected, you'll get signals in the main feed</p>
            </CardContent>
          </Card>

          {/* Entry Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Market
              </CardTitle>
              <CardDescription>
                Enter the details from your Polymarket screenshot
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Team Names */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="homeTeam">Home Team *</Label>
                    <Input
                      id="homeTeam"
                      placeholder="e.g., Lakers"
                      value={entry.homeTeam}
                      onChange={(e) => handleChange('homeTeam', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="awayTeam">Away Team *</Label>
                    <Input
                      id="awayTeam"
                      placeholder="e.g., Celtics"
                      value={entry.awayTeam}
                      onChange={(e) => handleChange('awayTeam', e.target.value)}
                    />
                  </div>
                </div>

                {/* Prices */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="polyYesPrice">YES Price * (0.01-0.99)</Label>
                    <Input
                      id="polyYesPrice"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.99"
                      placeholder="e.g., 0.45"
                      value={entry.polyYesPrice}
                      onChange={(e) => handleChange('polyYesPrice', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The price shown for home team to win
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="polyNoPrice">NO Price (optional)</Label>
                    <Input
                      id="polyNoPrice"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.99"
                      placeholder="Auto-calculated"
                      value={entry.polyNoPrice}
                      onChange={(e) => handleChange('polyNoPrice', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to auto-calculate
                    </p>
                  </div>
                </div>

                {/* Optional Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="gameDate">Game Date (optional)</Label>
                    <Input
                      id="gameDate"
                      type="date"
                      value={entry.gameDate}
                      onChange={(e) => handleChange('gameDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conditionId">Condition ID (optional)</Label>
                    <Input
                      id="conditionId"
                      placeholder="From URL if available"
                      value={entry.conditionId}
                      onChange={(e) => handleChange('conditionId', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Found in Polymarket URL
                    </p>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Adding to Pipeline...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Watch Pipeline
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          {recentSubmissions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentSubmissions.map((sub, i) => (
                    <div 
                      key={i}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        sub.status === 'success' 
                          ? 'bg-profit/10 text-profit' 
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {sub.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{sub.teams}</p>
                        <p className="text-xs opacity-80">{sub.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
