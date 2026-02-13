// ============================================================================
// WHALE WALLET TRACKER - Copy Trading Signal Generator
// ============================================================================
// Monitors known profitable Polymarket whale wallets (kch123, SeriouslySirius, etc.)
// and surfaces their positions as signals. When whales make large bets, evaluate
// if edge still exists at current prices for copy trading opportunities.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { detectSportFromText } from '../_shared/sports-config.ts';

// Polymarket CLOB API for position data
const CLOB_API_BASE = 'https://clob.polymarket.com';

// Minimum position size to consider (in USD)
const MIN_POSITION_SIZE = 1000;

// Position size tiers for signal strength
const POSITION_TIERS = {
  WHALE: 100000,    // $100k+ = whale-tier position
  LARGE: 50000,     // $50k+ = large position
  MEDIUM: 10000,    // $10k+ = medium position
  SMALL: 1000       // $1k+ = small position (minimum to track)
};

// Time window for detecting "fresh" positions (minutes)
const FRESH_POSITION_WINDOW = 30;

interface WhalePosition {
  wallet_address: string;
  whale_name: string;
  market_id: string;
  market_question: string;
  position_type: 'YES' | 'NO';
  shares: number;
  avg_price: number;
  current_value: number;
  is_new_position: boolean;
  position_size_tier: string;
  sport?: string;
  event_name?: string;
}

interface WhaleSignal {
  whale_name: string;
  wallet_address: string;
  market_id: string;
  event_name: string;
  recommended_outcome: string;
  side: 'YES' | 'NO';
  whale_position_size: number;
  whale_avg_price: number;
  current_market_price: number;
  price_movement_since_whale: number;
  signal_strength: 'WHALE_ELITE' | 'WHALE_STRONG' | 'WHALE_MEDIUM';
  confidence_score: number;
  urgency: 'critical' | 'high' | 'normal';
  copy_recommendation: 'STRONG_BUY' | 'BUY' | 'MONITOR' | 'AVOID';
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { whale_addresses = [], force_refresh = false } = await req.json();

    console.log(`🐋 Whale Tracker: Monitoring ${whale_addresses.length || 'ALL'} whale wallets`);

    // Get whale wallets to monitor
    const whaleWallets = await getWhaleWallets(supabase, whale_addresses);
    console.log(`📊 Tracking ${whaleWallets.length} active whale wallets`);

    // Fetch current positions for each whale
    const allPositions: WhalePosition[] = [];
    const whaleSignals: WhaleSignal[] = [];

    for (const whale of whaleWallets) {
      try {
        const positions = await fetchWhalePositions(whale.wallet_address, whale.whale_name);
        allPositions.push(...positions);
        
        // Analyze positions for trading signals
        const signals = await analyzeWhalePositions(supabase, positions, whale);
        whaleSignals.push(...signals);
        
        console.log(`🔍 ${whale.whale_name}: ${positions.length} positions, ${signals.length} signals`);
      } catch (error) {
        console.error(`❌ Failed to fetch positions for ${whale.whale_name}:`, error);
        continue;
      }
    }

    // Store positions in database
    await storeWhalePositions(supabase, allPositions);

    // Create trading signals for high-quality whale positions
    const premiumSignals = whaleSignals.filter(signal => 
      signal.signal_strength !== 'WHALE_MEDIUM' &&
      signal.copy_recommendation === 'STRONG_BUY'
    );

    await createWhaleSignals(supabase, premiumSignals);

    // Update whale activity timestamps
    await updateWhaleActivity(supabase, whaleWallets.map(w => w.wallet_address));

    console.log(`✅ Whale Tracking Complete:`);
    console.log(`   - ${allPositions.length} positions tracked`);
    console.log(`   - ${whaleSignals.length} potential signals`);
    console.log(`   - ${premiumSignals.length} premium signals created`);

    return new Response(JSON.stringify({
      success: true,
      whales_monitored: whaleWallets.length,
      positions_tracked: allPositions.length,
      signals_generated: whaleSignals.length,
      premium_signals: premiumSignals.length,
      position_breakdown: getPositionBreakdown(allPositions),
      signal_breakdown: getSignalBreakdown(whaleSignals),
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Whale tracker error:', error);
    return new Response(JSON.stringify({
      error: 'Whale tracking failed',
      details: (error as Error).message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getWhaleWallets(supabase: any, targetAddresses: string[] = []) {
  let query = supabase
    .from('whale_wallets')
    .select('*')
    .eq('is_active', true)
    .order('total_profit', { ascending: false });

  if (targetAddresses.length > 0) {
    query = query.in('wallet_address', targetAddresses);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching whale wallets:', error);
    throw error;
  }

  return data || [];
}

async function fetchWhalePositions(
  walletAddress: string, 
  whaleName: string
): Promise<WhalePosition[]> {
  
  // Fetch positions from Polymarket CLOB API
  const url = `${CLOB_API_BASE}/positions?user=${walletAddress}`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`CLOB API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const positions: WhalePosition[] = [];

  for (const position of data) {
    // Skip small positions
    const positionValue = parseFloat(position.size) * parseFloat(position.price);
    if (positionValue < MIN_POSITION_SIZE) continue;

    // Get market details
    const marketDetails = await fetchMarketDetails(position.market);
    if (!marketDetails) continue;

    // Detect sport and extract event name
    const sport = detectSportFromText(marketDetails.question);
    const eventName = extractEventName(marketDetails.question);

    const whalePosition: WhalePosition = {
      wallet_address: walletAddress,
      whale_name: whaleName,
      market_id: position.market,
      market_question: marketDetails.question,
      position_type: position.outcome === '1' ? 'YES' : 'NO',
      shares: parseFloat(position.size),
      avg_price: parseFloat(position.price),
      current_value: positionValue,
      is_new_position: isNewPosition(position.updated_at),
      position_size_tier: getPositionSizeTier(positionValue),
      sport: sport || undefined,
      event_name: eventName
    };

    positions.push(whalePosition);
  }

  return positions;
}

async function fetchMarketDetails(marketId: string): Promise<any> {
  const url = `${CLOB_API_BASE}/markets/${marketId}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn(`Failed to fetch market details for ${marketId}:`, error);
    return null;
  }
}

async function analyzeWhalePositions(
  supabase: any,
  positions: WhalePosition[],
  whale: any
): Promise<WhaleSignal[]> {
  
  const signals: WhaleSignal[] = [];

  for (const position of positions) {
    // Skip old positions unless they're whale-tier
    if (!position.is_new_position && position.position_size_tier !== 'WHALE') {
      continue;
    }

    // Get current market price from Polymarket
    const currentPrice = await getCurrentMarketPrice(position.market_id, position.position_type);
    if (!currentPrice) continue;

    // Calculate price movement since whale entry
    const priceMovement = currentPrice - position.avg_price;
    const priceMovementPct = (priceMovement / position.avg_price) * 100;

    // Determine signal strength based on whale tier and position size
    let signalStrength: 'WHALE_ELITE' | 'WHALE_STRONG' | 'WHALE_MEDIUM';
    
    if (whale.confidence_tier === 'elite' && position.current_value >= POSITION_TIERS.WHALE) {
      signalStrength = 'WHALE_ELITE';
    } else if (whale.confidence_tier === 'elite' || position.current_value >= POSITION_TIERS.LARGE) {
      signalStrength = 'WHALE_STRONG';  
    } else {
      signalStrength = 'WHALE_MEDIUM';
    }

    // Calculate confidence score
    const confidenceScore = calculateWhaleSignalConfidence(
      whale,
      position,
      priceMovementPct,
      currentPrice
    );

    // Determine copy recommendation
    let copyRec: 'STRONG_BUY' | 'BUY' | 'MONITOR' | 'AVOID';
    
    if (signalStrength === 'WHALE_ELITE' && priceMovementPct < 10 && currentPrice > 0.2) {
      copyRec = 'STRONG_BUY';
    } else if (signalStrength !== 'WHALE_MEDIUM' && priceMovementPct < 20 && currentPrice > 0.15) {
      copyRec = 'BUY';
    } else if (priceMovementPct < 30) {
      copyRec = 'MONITOR';
    } else {
      copyRec = 'AVOID'; // Price already moved too much
    }

    const signal: WhaleSignal = {
      whale_name: whale.whale_name,
      wallet_address: whale.wallet_address,
      market_id: position.market_id,
      event_name: position.event_name || position.market_question,
      recommended_outcome: `${position.position_type} (${whale.whale_name} ${formatCurrency(position.current_value)})`,
      side: position.position_type,
      whale_position_size: position.current_value,
      whale_avg_price: position.avg_price,
      current_market_price: currentPrice,
      price_movement_since_whale: priceMovementPct,
      signal_strength: signalStrength,
      confidence_score: confidenceScore,
      urgency: position.is_new_position ? 'critical' : 'high',
      copy_recommendation: copyRec
    };

    signals.push(signal);
  }

  return signals;
}

async function getCurrentMarketPrice(marketId: string, side: 'YES' | 'NO'): Promise<number | null> {
  try {
    const url = `${CLOB_API_BASE}/order-book/${marketId}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const orderBook = await response.json();
    
    // Get best ask price for the side (price to buy)
    const askSide = side === 'YES' ? orderBook.bids : orderBook.asks;
    if (!askSide || askSide.length === 0) return null;
    
    return parseFloat(askSide[0].price);
  } catch (error) {
    console.warn(`Failed to get current price for ${marketId}:`, error);
    return null;
  }
}

function calculateWhaleSignalConfidence(
  whale: any,
  position: WhalePosition,
  priceMovement: number,
  currentPrice: number
): number {
  let confidence = 50; // Base confidence

  // Whale tier bonus
  if (whale.confidence_tier === 'elite') {
    confidence += 30;
  } else if (whale.confidence_tier === 'strong') {
    confidence += 20;
  } else {
    confidence += 10;
  }

  // Position size bonus
  if (position.current_value >= POSITION_TIERS.WHALE) {
    confidence += 15;
  } else if (position.current_value >= POSITION_TIERS.LARGE) {
    confidence += 10;
  } else if (position.current_value >= POSITION_TIERS.MEDIUM) {
    confidence += 5;
  }

  // Fresh position bonus
  if (position.is_new_position) {
    confidence += 10;
  }

  // Price movement penalty (if price already moved a lot)
  if (Math.abs(priceMovement) > 20) {
    confidence -= 20;
  } else if (Math.abs(priceMovement) > 10) {
    confidence -= 10;
  }

  // Price level check (avoid very low probability bets)
  if (currentPrice < 0.1) {
    confidence -= 15;
  } else if (currentPrice > 0.9) {
    confidence -= 10;
  }

  // Specialization bonus
  if (position.sport && whale.specialization?.includes(position.sport.toLowerCase())) {
    confidence += 10;
  }

  return Math.max(0, Math.min(100, confidence));
}

async function storeWhalePositions(supabase: any, positions: WhalePosition[]) {
  if (positions.length === 0) return;

  const { error } = await supabase
    .from('whale_positions')
    .upsert(
      positions.map(pos => ({
        wallet_address: pos.wallet_address,
        market_id: pos.market_id,
        market_question: pos.market_question,
        event_name: pos.event_name,
        sport: pos.sport,
        position_type: pos.position_type,
        shares: pos.shares,
        avg_price: pos.avg_price,
        current_value: Math.round(pos.current_value * 100), // Store in cents
        detected_at: new Date().toISOString(),
        is_new_position: pos.is_new_position,
        position_confidence: pos.position_size_tier === 'WHALE' ? 'high' : 
                          pos.position_size_tier === 'LARGE' ? 'medium' : 'low'
      })),
      {
        onConflict: 'wallet_address,market_id,position_type',
        ignoreDuplicates: false
      }
    );

  if (error) {
    console.error('Error storing whale positions:', error);
    throw error;
  }
}

async function createWhaleSignals(supabase: any, signals: WhaleSignal[]) {
  if (signals.length === 0) return;

  const signalInserts = signals.map(signal => ({
    event_name: signal.event_name,
    recommended_outcome: signal.recommended_outcome,
    side: signal.side,
    polymarket_price: signal.current_market_price,
    bookmaker_probability: null, // No bookmaker comparison for whale signals
    edge_percent: Math.max(0, signal.whale_avg_price - signal.current_market_price) * 100,
    confidence_score: signal.confidence_score,
    urgency: signal.urgency,
    status: 'active',
    signal_factors: {
      whale_name: signal.whale_name,
      whale_position_size: signal.whale_position_size,
      whale_entry_price: signal.whale_avg_price,
      price_movement_pct: signal.price_movement_since_whale,
      signal_tier: signal.signal_strength.toLowerCase().replace('whale_', ''),
      bet_direction: signal.side === 'YES' ? 'BUY_YES' : 'BUY_NO',
      copy_recommendation: signal.copy_recommendation
    },
    created_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('signal_opportunities')
    .upsert(signalInserts, {
      onConflict: 'event_name,side',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('Error creating whale signals:', error);
    throw error;
  }
}

async function updateWhaleActivity(supabase: any, walletAddresses: string[]) {
  const { error } = await supabase
    .from('whale_wallets')
    .update({
      last_activity: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('wallet_address', walletAddresses);

  if (error && error.code !== 'PGRST116') {
    console.error('Error updating whale activity:', error);
  }
}

// Helper functions

function isNewPosition(updatedAt: string): boolean {
  const positionTime = new Date(updatedAt).getTime();
  const now = Date.now();
  const windowMs = FRESH_POSITION_WINDOW * 60 * 1000;
  
  return (now - positionTime) <= windowMs;
}

function getPositionSizeTier(value: number): string {
  if (value >= POSITION_TIERS.WHALE) return 'WHALE';
  if (value >= POSITION_TIERS.LARGE) return 'LARGE';
  if (value >= POSITION_TIERS.MEDIUM) return 'MEDIUM';
  return 'SMALL';
}

function extractEventName(question: string): string {
  // Extract clean event name from Polymarket question
  const patterns = [
    /Will (.+) beat (.+) on/i,
    /(.+) vs\.? (.+) - who/i,
    /(.+) @ (.+)/i
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match.length >= 3) {
      return `${match[1].trim()} vs ${match[2].trim()}`;
    }
  }

  return question.split(' - ')[0].split(' | ')[0];
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  } else {
    return `$${amount.toFixed(0)}`;
  }
}

function getPositionBreakdown(positions: WhalePosition[]) {
  return {
    total: positions.length,
    new_positions: positions.filter(p => p.is_new_position).length,
    by_tier: {
      whale: positions.filter(p => p.position_size_tier === 'WHALE').length,
      large: positions.filter(p => p.position_size_tier === 'LARGE').length,
      medium: positions.filter(p => p.position_size_tier === 'MEDIUM').length,
      small: positions.filter(p => p.position_size_tier === 'SMALL').length
    },
    by_sport: positions.reduce((acc, p) => {
      if (p.sport) {
        acc[p.sport] = (acc[p.sport] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>)
  };
}

function getSignalBreakdown(signals: WhaleSignal[]) {
  return {
    total: signals.length,
    by_strength: {
      elite: signals.filter(s => s.signal_strength === 'WHALE_ELITE').length,
      strong: signals.filter(s => s.signal_strength === 'WHALE_STRONG').length,
      medium: signals.filter(s => s.signal_strength === 'WHALE_MEDIUM').length
    },
    by_recommendation: {
      strong_buy: signals.filter(s => s.copy_recommendation === 'STRONG_BUY').length,
      buy: signals.filter(s => s.copy_recommendation === 'BUY').length,
      monitor: signals.filter(s => s.copy_recommendation === 'MONITOR').length,
      avoid: signals.filter(s => s.copy_recommendation === 'AVOID').length
    },
    avg_confidence: signals.reduce((sum, s) => sum + s.confidence_score, 0) / signals.length
  };
}