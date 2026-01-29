// ============================================================================
// SETTLE-BETS: Automatic bet settlement via Polymarket resolution checking
// ============================================================================
// Checks pending bets in signal_logs and queries Polymarket to determine
// if markets have resolved. Updates outcome and calculates P/L.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PendingBet {
  id: string;
  event_name: string;
  side: string;
  entry_price: number;
  stake_amount: number | null;
  polymarket_condition_id: string;
  created_at: string;
}

interface GammaMarketResponse {
  condition_id: string;
  closed: boolean;
  active: boolean;
  end_date_iso: string;
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
}

// ============================================================================
// P/L CALCULATION
// ============================================================================
function calculatePL(
  outcome: 'win' | 'loss' | 'void',
  stakeAmount: number,
  entryPrice: number
): number {
  if (outcome === 'win') {
    // P/L = stake * (1 - entry_price) / entry_price
    return stakeAmount * (1 - entryPrice) / entryPrice;
  } else if (outcome === 'loss') {
    return -stakeAmount;
  }
  // void = 0 (stake returned)
  return 0;
}

// ============================================================================
// CHECK SINGLE MARKET RESOLUTION
// ============================================================================
async function checkMarketResolution(
  conditionId: string
): Promise<{ resolved: boolean; yesWon: boolean | null; price: number | null }> {
  try {
    // Try Gamma API first
    const gammaUrl = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    const response = await fetch(gammaUrl);
    
    if (!response.ok) {
      console.log(`[SETTLE-BETS] Gamma API error for ${conditionId}: ${response.status}`);
      return { resolved: false, yesWon: null, price: null };
    }
    
    const markets = await response.json() as GammaMarketResponse[];
    
    if (!markets || markets.length === 0) {
      console.log(`[SETTLE-BETS] No market found for ${conditionId}`);
      return { resolved: false, yesWon: null, price: null };
    }
    
    const market = markets[0];
    
    // Check if market is closed
    if (market.closed || !market.active) {
      // Determine winner based on final prices
      // YES wins if YES price > 0.9 at close
      const yesToken = market.tokens?.find(t => t.outcome.toLowerCase() === 'yes');
      const yesPrice = yesToken?.price || 0;
      
      // Price of 0.99+ means YES won, 0.01- means NO won
      if (yesPrice >= 0.9) {
        return { resolved: true, yesWon: true, price: yesPrice };
      } else if (yesPrice <= 0.1) {
        return { resolved: true, yesWon: false, price: yesPrice };
      }
      
      // Market closed but not clearly resolved (might be void)
      return { resolved: true, yesWon: null, price: yesPrice };
    }
    
    // Also check if event date has passed significantly (24+ hours)
    if (market.end_date_iso) {
      const endDate = new Date(market.end_date_iso);
      const now = new Date();
      const hoursSinceEnd = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceEnd > 24) {
        console.log(`[SETTLE-BETS] Event ${conditionId} ended ${hoursSinceEnd.toFixed(1)}h ago but not marked closed`);
        // Flag for manual review by returning resolved but null winner
        return { resolved: true, yesWon: null, price: null };
      }
    }
    
    return { resolved: false, yesWon: null, price: null };
    
  } catch (error) {
    console.error(`[SETTLE-BETS] Error checking ${conditionId}:`, error);
    return { resolved: false, yesWon: null, price: null };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[SETTLE-BETS] Starting bet settlement check...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse optional request body for manual trigger
    let forceCheck = false;
    try {
      const body = await req.json();
      forceCheck = body?.force === true;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // ========================================================================
    // STEP 1: Get pending bets with condition_id
    // ========================================================================
    // Only check bets older than 2 hours (unless force mode)
    const minAge = forceCheck ? 0 : 2 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - minAge).toISOString();
    
    const { data: pendingBets, error: fetchError } = await supabase
      .from('signal_logs')
      .select('id, event_name, side, entry_price, stake_amount, polymarket_condition_id, created_at')
      .or('outcome.is.null,outcome.eq.pending')
      .not('polymarket_condition_id', 'is', null)
      .lt('created_at', cutoff)
      .limit(50);

    if (fetchError) throw fetchError;

    if (!pendingBets || pendingBets.length === 0) {
      console.log('[SETTLE-BETS] No pending bets to check');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending bets to check',
          checked: 0,
          settled: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SETTLE-BETS] Checking ${pendingBets.length} pending bets`);

    // ========================================================================
    // STEP 2: Check each bet's market resolution
    // ========================================================================
    let settledCount = 0;
    let checkedCount = 0;
    const results: Array<{ id: string; outcome: string; pl: number }> = [];

    for (const bet of pendingBets as PendingBet[]) {
      checkedCount++;
      
      const resolution = await checkMarketResolution(bet.polymarket_condition_id);
      
      if (!resolution.resolved) {
        continue;
      }

      // Determine bet outcome
      let outcome: 'win' | 'loss' | 'void';
      
      if (resolution.yesWon === null) {
        // Market resolved but unclear winner = void
        outcome = 'void';
      } else if (bet.side === 'YES') {
        outcome = resolution.yesWon ? 'win' : 'loss';
      } else {
        // bet.side === 'NO'
        outcome = resolution.yesWon ? 'loss' : 'win';
      }

      // Calculate P/L
      const stakeAmount = bet.stake_amount || 0;
      const profitLoss = calculatePL(outcome, stakeAmount, bet.entry_price);

      // Update the bet
      const { error: updateError } = await supabase
        .from('signal_logs')
        .update({
          outcome,
          profit_loss: profitLoss,
          settled_at: new Date().toISOString(),
          actual_result: resolution.yesWon,
        })
        .eq('id', bet.id);

      if (!updateError) {
        settledCount++;
        results.push({ id: bet.id, outcome, pl: profitLoss });
        console.log(`[SETTLE-BETS] Settled: ${bet.event_name.substring(0, 30)}... → ${outcome} (${profitLoss >= 0 ? '+' : ''}$${profitLoss.toFixed(2)})`);
      } else {
        console.error(`[SETTLE-BETS] Update error for ${bet.id}:`, updateError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[SETTLE-BETS] Complete in ${duration}ms: ${settledCount}/${checkedCount} settled`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: checkedCount,
        settled: settledCount,
        results,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SETTLE-BETS] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
