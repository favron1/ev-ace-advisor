import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket CLOB API for live prices
const CLOB_API_BASE = 'https://clob.polymarket.com';

// Odds API for bookmaker data
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sport mappings for Odds API
const SPORT_MAPPINGS: Record<string, string> = {
  'NBA': 'basketball_nba',
  'NFL': 'americanfootball_nfl',
  'NHL': 'icehockey_nhl',
  'UFC': 'mma_mixed_martial_arts',
  'MMA': 'mma_mixed_martial_arts',
  'Tennis': 'tennis_atp_us_open', // Will need dynamic selection
  'EPL': 'soccer_epl',
};

// Sharp books for weighting
const SHARP_BOOKS = ['pinnacle', 'betfair', 'betfair_ex_eu'];

// Normalize team name for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate fair probability by removing vig
function calculateFairProb(homeOdds: number, awayOdds: number, targetTeam: 'home' | 'away'): number {
  const homeProb = 1 / homeOdds;
  const awayProb = 1 / awayOdds;
  const totalProb = homeProb + awayProb;
  
  // Remove vig
  const homeFair = homeProb / totalProb;
  const awayFair = awayProb / totalProb;
  
  return targetTeam === 'home' ? homeFair : awayFair;
}

// Calculate net edge after fees
function calculateNetEdge(rawEdge: number, volume: number, stakeAmount: number = 100): {
  netEdge: number;
  platformFee: number;
  spreadCost: number;
  slippage: number;
} {
  // Platform fee (1% on profits)
  const platformFee = rawEdge > 0 ? rawEdge * 0.01 : 0;
  
  // Spread based on volume
  let spreadCost = 0.03; // 3% default for thin markets
  if (volume >= 500000) spreadCost = 0.005;
  else if (volume >= 100000) spreadCost = 0.01;
  else if (volume >= 50000) spreadCost = 0.015;
  else if (volume >= 10000) spreadCost = 0.02;
  
  // Slippage based on stake vs volume
  let slippage = 0.03;
  if (volume > 0) {
    const ratio = stakeAmount / volume;
    if (ratio < 0.001) slippage = 0.002;
    else if (ratio < 0.005) slippage = 0.005;
    else if (ratio < 0.01) slippage = 0.01;
    else if (ratio < 0.02) slippage = 0.02;
  }
  
  const netEdge = rawEdge - platformFee - spreadCost - slippage;
  
  return { netEdge, platformFee, spreadCost, slippage };
}

// Format time until event
function formatTimeUntil(eventDate: Date): string {
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 1) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Send SMS alert
async function sendSmsAlert(
  supabase: any,
  event: any,
  polyPrice: number,
  bookmakerFairProb: number,
  rawEdge: number,
  netEdge: number,
  volume: number,
  stakeAmount: number
): Promise<boolean> {
  try {
    // Get user phone number
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone_number')
      .not('phone_number', 'is', null)
      .limit(1);
    
    if (!profiles || profiles.length === 0 || !profiles[0].phone_number) {
      console.log('[POLY-MONITOR] No phone number configured for SMS alerts');
      return false;
    }
    
    const phoneNumber = profiles[0].phone_number;
    const eventDate = new Date(event.commence_time);
    const timeUntil = formatTimeUntil(eventDate);
    const netEv = (netEdge * stakeAmount).toFixed(2);
    
    const message = `🎯 EDGE DETECTED: ${event.event_name}
Market: ${event.polymarket_question?.substring(0, 50) || 'H2H'}
Polymarket: ${(polyPrice * 100).toFixed(0)}¢ ($${(volume / 1000).toFixed(0)}K vol)
Bookmaker Fair: ${(bookmakerFairProb * 100).toFixed(0)}%
Raw Edge: +${(rawEdge * 100).toFixed(1)}%
Net EV: +$${netEv} on $${stakeAmount} stake
Time: ${timeUntil} until start
ACT NOW - window may close`;

    // Call send-sms-alert function
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        to: phoneNumber,
        message: message,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('[POLY-MONITOR] SMS send failed:', error);
      return false;
    }
    
    console.log('[POLY-MONITOR] SMS alert sent successfully');
    return true;
  } catch (error) {
    console.error('[POLY-MONITOR] SMS alert error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-MONITOR] Starting unified polling loop...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!oddsApiKey) {
      throw new Error('ODDS_API_KEY not configured');
    }

    const now = new Date();

    // Load all MONITORED events
    const { data: monitoredEvents, error: loadError } = await supabase
      .from('event_watch_state')
      .select('*')
      .eq('watch_state', 'monitored')
      .gt('commence_time', now.toISOString())
      .order('commence_time', { ascending: true });

    if (loadError) {
      throw new Error(`Failed to load events: ${loadError.message}`);
    }

    console.log(`[POLY-MONITOR] Loaded ${monitoredEvents?.length || 0} monitored events`);

    if (!monitoredEvents || monitoredEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          events_polled: 0,
          edges_found: 0,
          alerts_sent: 0,
          message: 'No monitored events to poll',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get scan config for stake amount
    const { data: scanConfig } = await supabase
      .from('arbitrage_config')
      .select('default_stake_amount')
      .limit(1)
      .single();

    const stakeAmount = scanConfig?.default_stake_amount || 100;

    // Fetch bookmaker odds for NBA H2H (primary sport)
    console.log('[POLY-MONITOR] Fetching bookmaker H2H odds...');
    
    const oddsUrl = `${ODDS_API_BASE}/sports/basketball_nba/odds/?apiKey=${oddsApiKey}&markets=h2h&regions=us,uk,eu&oddsFormat=decimal`;
    const oddsResponse = await fetch(oddsUrl);
    
    let bookmakerGames: any[] = [];
    if (oddsResponse.ok) {
      bookmakerGames = await oddsResponse.json();
      console.log(`[POLY-MONITOR] Loaded ${bookmakerGames.length} NBA games from bookmakers`);
    } else {
      console.error(`[POLY-MONITOR] Odds API error: ${oddsResponse.status}`);
    }

    // Process each monitored event
    let edgesFound = 0;
    let alertsSent = 0;
    let eventsExpired = 0;

    for (const event of monitoredEvents) {
      try {
        // Check if event has started
        const eventStart = new Date(event.commence_time);
        if (eventStart <= now) {
          // Mark as expired
          await supabase
            .from('event_watch_state')
            .update({ watch_state: 'expired', updated_at: now.toISOString() })
            .eq('id', event.id);
          eventsExpired++;
          continue;
        }

        // Fetch fresh Polymarket price
        let livePolyPrice = event.polymarket_yes_price || 0.5;
        let liveVolume = event.polymarket_volume || 0;

        if (event.polymarket_condition_id) {
          try {
            const clobUrl = `${CLOB_API_BASE}/markets/${event.polymarket_condition_id}`;
            const clobResponse = await fetch(clobUrl);
            
            if (clobResponse.ok) {
              const marketData = await clobResponse.json();
              livePolyPrice = parseFloat(marketData.tokens?.[0]?.price || livePolyPrice);
              liveVolume = parseFloat(marketData.volume || liveVolume);
            }
          } catch (e) {
            console.log(`[POLY-MONITOR] CLOB fetch failed for ${event.event_key}, using cached price`);
          }
        }

        // Find matching bookmaker game
        let bookmakerFairProb: number | null = null;
        let matchedGame: any = null;

        const eventNameNorm = normalizeTeamName(event.event_name);
        
        for (const game of bookmakerGames) {
          const homeNorm = normalizeTeamName(game.home_team);
          const awayNorm = normalizeTeamName(game.away_team);
          
          // Check if event name contains both team names
          const containsHome = eventNameNorm.includes(homeNorm) || homeNorm.split(' ').some((w: string) => eventNameNorm.includes(w));
          const containsAway = eventNameNorm.includes(awayNorm) || awayNorm.split(' ').some((w: string) => eventNameNorm.includes(w));
          
          if (containsHome || containsAway) {
            matchedGame = game;
            
            // Get consensus odds from multiple bookmakers
            const h2hMarkets = game.bookmakers
              ?.flatMap((b: any) => b.markets?.filter((m: any) => m.key === 'h2h') || [])
              || [];
            
            if (h2hMarkets.length >= 2) {
              // Calculate average fair probability weighted toward sharp books
              let totalWeight = 0;
              let weightedProb = 0;
              
              for (const bm of game.bookmakers || []) {
                const h2h = bm.markets?.find((m: any) => m.key === 'h2h');
                if (!h2h) continue;
                
                const homeOutcome = h2h.outcomes?.find((o: any) => o.name === game.home_team);
                const awayOutcome = h2h.outcomes?.find((o: any) => o.name === game.away_team);
                
                if (!homeOutcome || !awayOutcome) continue;
                
                // Determine which team we're betting on based on Polymarket question
                const targetTeam = containsHome ? 'home' : 'away';
                const fairProb = calculateFairProb(homeOutcome.price, awayOutcome.price, targetTeam);
                
                const weight = SHARP_BOOKS.includes(bm.key) ? 1.5 : 1.0;
                weightedProb += fairProb * weight;
                totalWeight += weight;
              }
              
              if (totalWeight > 0) {
                bookmakerFairProb = weightedProb / totalWeight;
              }
            }
            break;
          }
        }

        // Update event state with fresh prices
        await supabase
          .from('event_watch_state')
          .update({
            polymarket_yes_price: livePolyPrice,
            polymarket_volume: liveVolume,
            last_poly_refresh: now.toISOString(),
            polymarket_matched: bookmakerFairProb !== null,
            current_probability: bookmakerFairProb,
            updated_at: now.toISOString(),
          })
          .eq('id', event.id);

        // Check for edge
        if (bookmakerFairProb !== null && liveVolume >= 10000) {
          const rawEdge = bookmakerFairProb - livePolyPrice;
          
          if (rawEdge >= 0.02) { // 2% raw edge threshold
            const { netEdge, platformFee, spreadCost, slippage } = calculateNetEdge(rawEdge, liveVolume, stakeAmount);
            
            console.log(`[POLY-MONITOR] Potential edge: ${event.event_name} - Raw: ${(rawEdge * 100).toFixed(1)}%, Net: ${(netEdge * 100).toFixed(1)}%`);
            
            if (netEdge >= 0.02) { // 2% net edge required
              edgesFound++;
              
              // Create signal opportunity
              const { data: signal, error: signalError } = await supabase
                .from('signal_opportunities')
                .insert({
                  event_name: event.event_name,
                  side: 'YES',
                  polymarket_price: livePolyPrice,
                  bookmaker_probability: bookmakerFairProb,
                  bookmaker_prob_fair: bookmakerFairProb,
                  edge_percent: rawEdge * 100,
                  confidence_score: Math.min(85, 50 + Math.floor(netEdge * 500)),
                  urgency: eventStart.getTime() - now.getTime() < 3600000 ? 'critical' : 
                          eventStart.getTime() - now.getTime() < 14400000 ? 'high' : 'normal',
                  is_true_arbitrage: true,
                  polymarket_market_id: null,
                  polymarket_match_confidence: 0.9,
                  polymarket_yes_price: livePolyPrice,
                  polymarket_volume: liveVolume,
                  polymarket_updated_at: now.toISOString(),
                  signal_strength: netEdge * 100,
                  status: 'active',
                  signal_factors: {
                    raw_edge: rawEdge * 100,
                    net_edge: netEdge * 100,
                    platform_fee: platformFee * 100,
                    spread_cost: spreadCost * 100,
                    slippage: slippage * 100,
                    volume: liveVolume,
                    bookmaker_count: matchedGame?.bookmakers?.length || 0,
                  },
                })
                .select()
                .single();

              if (signalError) {
                console.error(`[POLY-MONITOR] Failed to create signal: ${signalError.message}`);
              } else {
                console.log(`[POLY-MONITOR] Signal created: ${signal.id}`);
                
                // Send SMS alert IMMEDIATELY
                const alertSent = await sendSmsAlert(
                  supabase,
                  event,
                  livePolyPrice,
                  bookmakerFairProb,
                  rawEdge,
                  netEdge,
                  liveVolume,
                  stakeAmount
                );
                
                if (alertSent) {
                  alertsSent++;
                  
                  // Mark event as alerted
                  await supabase
                    .from('event_watch_state')
                    .update({ watch_state: 'alerted', updated_at: now.toISOString() })
                    .eq('id', event.id);
                }
              }
            }
          }
        }
      } catch (eventError) {
        console.error(`[POLY-MONITOR] Error processing event ${event.event_key}:`, eventError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[POLY-MONITOR] Complete: ${monitoredEvents.length} polled, ${edgesFound} edges, ${alertsSent} alerts, ${eventsExpired} expired in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        events_polled: monitoredEvents.length,
        events_expired: eventsExpired,
        edges_found: edgesFound,
        alerts_sent: alertsSent,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POLY-MONITOR] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
