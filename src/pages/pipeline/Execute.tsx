import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/terminal/Header';
import { PipelineStepper } from '@/components/pipeline/PipelineStepper';
import { ExecutionDecision } from '@/components/terminal/ExecutionDecision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, CheckCircle, X, Clock, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePipelineData, type PipelineEvent } from '@/hooks/usePipelineData';
import { analyzeExecution } from '@/lib/execution-engine';
import type { SignalOpportunity } from '@/types/arbitrage';

export default function Execute() {
  const { loading, counts, fetchEvents, getEventsByStage, promoteEvents, dismissEvents } = usePipelineData();
  const [stakes, setStakes] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const executingEvents = getEventsByStage('executing');

  const getStake = (id: string) => parseFloat(stakes[id] || '100') || 100;

  const buildSignalLike = (event: PipelineEvent): SignalOpportunity => ({
    id: event.id,
    event_name: event.event_name,
    side: 'YES',
    polymarket_price: event.polymarket_yes_price || 0,
    polymarket_yes_price: event.polymarket_yes_price || 0,
    polymarket_volume: event.polymarket_volume || 0,
    polymarket_match_confidence: 1,
    bookmaker_probability: event.current_probability || 0,
    bookmaker_prob_fair: event.current_probability || 0,
    edge_percent: ((event.current_probability || 0) - (event.polymarket_yes_price || 0)) * 100,
    is_true_arbitrage: true,
    movement_confirmed: (event.movement_pct || 0) > 0,
    confidence_score: 70,
    urgency: 'normal',
    status: 'active',
    signal_tier: 'strong',
    created_at: event.created_at,
    signal_factors: null,
    signal_strength: null,
    movement_velocity: event.movement_velocity || null,
    core_logic_version: 'v1.1',
  } as SignalOpportunity);

  const isGameStarted = (event: PipelineEvent) => {
    if (!event.commence_time) return false;
    return new Date(event.commence_time).getTime() < Date.now();
  };

  const handleMarkPlaced = useCallback(async (event: PipelineEvent) => {
    const stake = getStake(event.id);
    setPlacing(event.id);

    try {
      const edge = ((event.current_probability || 0) - (event.polymarket_yes_price || 0)) * 100;

      const { error } = await supabase.from('signal_logs').insert({
        event_name: event.event_name,
        side: 'YES',
        entry_price: event.polymarket_yes_price || 0,
        edge_at_signal: edge,
        confidence_at_signal: 70,
        stake_amount: stake,
        polymarket_condition_id: event.polymarket_condition_id,
        outcome: 'pending',
        core_logic_version: 'v1.3',
      });

      if (error) throw error;

      await promoteEvents([event.id], 'settled');
      toast({ title: 'Bet placed!', description: `${event.event_name} — $${stake} staked` });
    } catch (err) {
      toast({ title: 'Failed to place bet', description: String(err), variant: 'destructive' });
    } finally {
      setPlacing(null);
    }
  }, [stakes, promoteEvents, toast]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Pipeline</h1>
            <p className="text-xs text-muted-foreground">Stage 4: Execution — Place Bets</p>
          </div>
        </div>

        <PipelineStepper counts={counts} />

        <ScrollArea className="h-[calc(100vh-180px)]">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : executingEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No events ready for execution. Promote from Watching.</div>
          ) : (
            <div className="space-y-4">
              {executingEvents.map(event => {
                const signalLike = buildSignalLike(event);
                const analysis = analyzeExecution(signalLike, getStake(event.id));
                const started = isGameStarted(event);

                return (
                  <Card key={event.id} className={started ? 'opacity-60 border-red-500/30' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm truncate flex-1">{event.event_name}</CardTitle>
                        <div className="flex items-center gap-2">
                          {started && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                              <Lock className="h-2.5 w-2.5 mr-0.5" /> STARTED
                            </Badge>
                          )}
                          {event.commence_time && (
                            <Badge variant="outline" className="text-[10px]">
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              {new Date(event.commence_time).toLocaleString()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ExecutionDecision analysis={analysis} showBreakdown />

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs text-muted-foreground">Stake $</span>
                          <Input
                            className="h-8 w-24 text-sm font-mono"
                            type="number"
                            value={stakes[event.id] || '100'}
                            onChange={e => setStakes(s => ({ ...s, [event.id]: e.target.value }))}
                          />
                        </div>
                        <Button
                          variant="profit"
                          size="sm"
                          disabled={started || placing === event.id}
                          onClick={() => handleMarkPlaced(event)}
                          className="gap-1"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          {placing === event.id ? 'Placing...' : 'Mark as Placed'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissEvents([event.id])}
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </main>
    </div>
  );
}
