import { supabase } from '@/integrations/supabase/client';
import type { 
  SignalOpportunity, 
  PolymarketMarket, 
  BookmakerSignal,
  SignalLog,
  ArbitrageConfig,
  SignalDetectionResult 
} from '@/types/arbitrage';

export const arbitrageApi = {
  // Fetch active signal opportunities
  async getActiveSignals(): Promise<SignalOpportunity[]> {
    const { data, error } = await supabase
      .from('signal_opportunities')
      .select('*')
      .eq('status', 'active')
      .order('confidence_score', { ascending: false });
    
    if (error) throw error;
    return (data || []) as unknown as SignalOpportunity[];
  },

  // Fetch Polymarket markets
  async getPolymarketMarkets(): Promise<PolymarketMarket[]> {
    const { data, error } = await supabase
      .from('polymarket_markets')
      .select('*')
      .eq('status', 'active')
      .order('volume', { ascending: false });
    
    if (error) throw error;
    return (data || []) as unknown as PolymarketMarket[];
  },

  // Fetch recent bookmaker signals
  async getBookmakerSignals(limit = 50): Promise<BookmakerSignal[]> {
    const { data, error } = await supabase
      .from('bookmaker_signals')
      .select('*')
      .order('captured_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return (data || []) as unknown as BookmakerSignal[];
  },

  // Fetch signal logs for performance tracking
  async getSignalLogs(limit = 100): Promise<SignalLog[]> {
    const { data, error } = await supabase
      .from('signal_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return (data || []) as unknown as SignalLog[];
  },

  // Get user's arbitrage config
  async getConfig(userId: string): Promise<ArbitrageConfig | null> {
    const { data, error } = await supabase
      .from('arbitrage_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) throw error;
    return data as unknown as ArbitrageConfig | null;
  },

  // Update user's arbitrage config
  async updateConfig(userId: string, config: Partial<ArbitrageConfig>): Promise<ArbitrageConfig> {
    const { data, error } = await supabase
      .from('arbitrage_config')
      .upsert({
        user_id: userId,
        ...config,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as unknown as ArbitrageConfig;
  },

  // Trigger signal detection
  async runSignalDetection(): Promise<SignalDetectionResult> {
    const { data, error } = await supabase.functions.invoke('detect-signals', {
      body: {}
    });
    
    if (error) throw error;
    return data as SignalDetectionResult;
  },

  // Refresh signals without API calls
  async refreshSignals(): Promise<{
    refreshed: number;
    expired: number;
    updated: number;
    unchanged: number;
  }> {
    const { data, error } = await supabase.functions.invoke('refresh-signals', {
      body: {}
    });
    
    if (error) throw error;
    return data;
  },

  // Dismiss a signal
  async dismissSignal(signalId: string): Promise<void> {
    const { error } = await supabase
      .from('signal_opportunities')
      .update({ status: 'dismissed' })
      .eq('id', signalId);
    
    if (error) throw error;
  },

  // Mark signal as executed with stake tracking
  async executeSignal(signalId: string, entryPrice: number, stakeAmount?: number): Promise<void> {
    const { data: signal } = await supabase
      .from('signal_opportunities')
      .select('*')
      .eq('id', signalId)
      .single();
    
    if (!signal) throw new Error('Signal not found');

    // Update signal status
    await supabase
      .from('signal_opportunities')
      .update({ status: 'executed' })
      .eq('id', signalId);

    // Create log entry with stake tracking
    await supabase
      .from('signal_logs')
      .insert({
        opportunity_id: signalId,
        event_name: (signal as any).event_name,
        side: (signal as any).side,
        entry_price: entryPrice,
        edge_at_signal: (signal as any).edge_percent,
        confidence_at_signal: (signal as any).confidence_score,
        outcome: 'pending',
        stake_amount: stakeAmount || null,
        polymarket_condition_id: (signal as any).polymarket_condition_id || null,
      });
  }
};
