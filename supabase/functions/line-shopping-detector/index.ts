// ============================================================================
// LINE SHOPPING DETECTOR - Core kch123 Strategy Implementation
// ============================================================================
// Compares Polymarket odds against sharp bookmaker consensus to identify
// value betting opportunities. When Polymarket offers better odds than
// the "true" probability (as determined by sharp books), flag as +EV.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Line shopping tier thresholds
const LINE_SHOPPING_TIERS = {
  PREMIUM: 0.05,   // 5%+ edge vs sharp consensus
  VALUE: 0.03,     // 3-5% edge vs sharp consensus  
  FAIR: 0.03,      // Within 3% of sharp consensus
  AVOID: -0.99     // Polymarket offering worse odds
};

// Minimum sharp book confidence for reliable signals
const MIN_SHARP_CONFIDENCE = 60; // 0-100 scale

// Minimum number of contributing sharp books
const MIN_SHARP_BOOKS = 2;

interface LineShoppingSignal {
  polymarket_market_id: string;
  event_name: string;
  polymarket_side: 'YES' | 'NO';
  polymarket_price: number;
  sharp_consensus_prob: number;
  sharp_confidence: number;
  price_edge: number; // Positive = Polymarket offers better price
  contributing_books: string[];
  line_shopping_tier: string;
  market_type: string;
  sport: string;
  recommended_action: 'BUY' | 'AVOID' | 'MONITOR';
  confidence_score: number;
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

    const { sport, lookback_hours = 2 } = await req.json();

    console.log(`🎯 Line Shopping Detector: Analyzing ${sport || 'ALL'} markets vs sharp consensus`);

    // Get active Polymarket positions that match sharp book data
    const polymarketMarkets = await getPolymarketMarkets(supabase, sport, lookback_hours);
    console.log(`📊 Found ${polymarketMarkets.length} active Polymarket markets`);

    // Get sharp consensus data
    const sharpConsensus = await getSharpConsensus(supabase, sport, lookback_hours);
    console.log(`📊 Found ${sharpConsensus.length} sharp consensus markets`);

    // Match and analyze line shopping opportunities  
    const lineShoppingSignals: LineShoppingSignal[] = [];
    
    for (const polyMarket of polymarketMarkets) {
      const matchingSharp = findMatchingSharpConsensus(polyMarket, sharpConsensus);
      
      if (matchingSharp) {
        const signals = analyzeLineShoppingOpportunity(polyMarket, matchingSharp);
        lineShoppingSignals.push(...signals);
      }
    }

    // Filter for high-quality signals only
    const qualitySignals = lineShoppingSignals.filter(signal => 
      signal.sharp_confidence >= MIN_SHARP_CONFIDENCE &&
      signal.contributing_books.length >= MIN_SHARP_BOOKS &&
      signal.line_shopping_tier !== 'AVOID'
    );

    // Update existing signals with line shopping data
    await updateSignalsWithLineShoppingData(supabase, qualitySignals);

    // Create new signals for premium line shopping opportunities
    const newSignals = qualitySignals.filter(signal => 
      signal.line_shopping_tier === 'PREMIUM' && 
      signal.price_edge >= 0.04 // 4%+ edge threshold for new signals
    );

    await createLineShoppingSignals(supabase, newSignals);

    console.log(`✅ Line Shopping Analysis Complete:`);
    console.log(`   - ${lineShoppingSignals.length} opportunities analyzed`);
    console.log(`   - ${qualitySignals.length} quality signals identified`);
    console.log(`   - ${newSignals.length} new premium signals created`);

    return new Response(JSON.stringify({
      success: true,
      opportunities_analyzed: lineShoppingSignals.length,
      quality_signals: qualitySignals.length,
      new_premium_signals: newSignals.length,
      line_shopping_breakdown: getLineShoppingBreakdown(qualitySignals),
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Line shopping detector error:', error);
    return new Response(JSON.stringify({
      error: 'Line shopping detection failed',
      details: (error as Error).message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getPolymarketMarkets(supabase: any, sport?: string, lookbackHours: number = 2) {
  let query = supabase
    .from('polymarket_h2h_cache')
    .select(`
      market_id,
      question,
      description,
      yes_price,
      no_price,
      volume,
      last_updated,
      end_date
    `)
    .eq('status', 'active')
    .gte('last_updated', new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString())
    .order('volume', { ascending: false })
    .limit(200);

  if (sport) {
    query = query.ilike('question', `%${sport}%`);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching Polymarket markets:', error);
    throw error;
  }

  return data || [];
}

async function getSharpConsensus(supabase: any, sport?: string, lookbackHours: number = 2) {
  let query = supabase
    .from('sharp_consensus')
    .select('*')
    .gte('calculated_at', new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString())
    .gte('confidence_score', MIN_SHARP_CONFIDENCE)
    .order('confidence_score', { ascending: false });

  if (sport) {
    query = query.eq('sport', sport);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching sharp consensus:', error);
    throw error;
  }

  return data || [];
}

function findMatchingSharpConsensus(polyMarket: any, sharpConsensus: any[]): any | null {
  // Extract team names from Polymarket question
  const polyTeams = extractTeamsFromQuestion(polyMarket.question);
  if (!polyTeams) return null;

  // Find matching sharp consensus by team names (fuzzy matching)
  for (const sharp of sharpConsensus) {
    if (isMatchingEvent(polyTeams, sharp.event_name)) {
      return sharp;
    }
  }

  return null;
}

function analyzeLineShoppingOpportunity(
  polyMarket: any, 
  sharpConsensus: any
): LineShoppingSignal[] {
  const signals: LineShoppingSignal[] = [];
  
  // Analyze YES side
  const yesEdge = polyMarket.yes_price - (1 - sharpConsensus.consensus_probability);
  const yesSignal = createLineShoppingSignal(
    polyMarket,
    sharpConsensus,
    'YES',
    polyMarket.yes_price,
    yesEdge
  );
  if (yesSignal) signals.push(yesSignal);

  // Analyze NO side  
  const noEdge = polyMarket.no_price - sharpConsensus.consensus_probability;
  const noSignal = createLineShoppingSignal(
    polyMarket,
    sharpConsensus,
    'NO', 
    polyMarket.no_price,
    noEdge
  );
  if (noSignal) signals.push(noSignal);

  return signals;
}

function createLineShoppingSignal(
  polyMarket: any,
  sharpConsensus: any,
  side: 'YES' | 'NO',
  polyPrice: number,
  priceEdge: number
): LineShoppingSignal | null {
  
  // Determine line shopping tier
  let tier: string;
  let recommendedAction: 'BUY' | 'AVOID' | 'MONITOR';
  
  if (priceEdge >= LINE_SHOPPING_TIERS.PREMIUM) {
    tier = 'PREMIUM';
    recommendedAction = 'BUY';
  } else if (priceEdge >= LINE_SHOPPING_TIERS.VALUE) {
    tier = 'VALUE'; 
    recommendedAction = 'BUY';
  } else if (Math.abs(priceEdge) <= LINE_SHOPPING_TIERS.FAIR) {
    tier = 'FAIR';
    recommendedAction = 'MONITOR';
  } else {
    tier = 'AVOID';
    recommendedAction = 'AVOID';
  }

  // Skip negative edge signals
  if (priceEdge < 0) return null;

  // Calculate confidence score (0-100)
  const confidenceScore = Math.min(100, 
    sharpConsensus.confidence_score * 0.7 + // 70% from sharp book agreement
    (priceEdge * 100) * 0.3 // 30% from edge magnitude
  );

  return {
    polymarket_market_id: polyMarket.market_id,
    event_name: normalizeEventName(polyMarket.question),
    polymarket_side: side,
    polymarket_price: polyPrice,
    sharp_consensus_prob: sharpConsensus.consensus_probability,
    sharp_confidence: sharpConsensus.confidence_score,
    price_edge: priceEdge,
    contributing_books: sharpConsensus.contributing_books,
    line_shopping_tier: tier,
    market_type: sharpConsensus.market_type || 'h2h',
    sport: sharpConsensus.sport || 'UNKNOWN',
    recommended_action: recommendedAction,
    confidence_score: confidenceScore
  };
}

async function updateSignalsWithLineShoppingData(supabase: any, signals: LineShoppingSignal[]) {
  for (const signal of signals) {
    const { error } = await supabase
      .from('signal_opportunities')
      .update({
        sharp_consensus_prob: signal.sharp_consensus_prob,
        sharp_line_edge: signal.price_edge,
        line_shopping_tier: signal.line_shopping_tier,
        updated_at: new Date().toISOString()
      })
      .eq('polymarket_market_id', signal.polymarket_market_id)
      .eq('side', signal.polymarket_side);

    if (error && error.code !== 'PGRST116') { // Ignore "no rows updated" 
      console.error('Error updating signal with line shopping data:', error);
    }
  }
}

async function createLineShoppingSignals(supabase: any, signals: LineShoppingSignal[]) {
  if (signals.length === 0) return;

  const signalInserts = signals.map(signal => ({
    polymarket_market_id: signal.polymarket_market_id,
    event_name: signal.event_name,
    recommended_outcome: `${signal.polymarket_side} (${signal.price_edge.toFixed(3)} edge vs sharp)`,
    side: signal.polymarket_side,
    polymarket_price: signal.polymarket_price,
    bookmaker_probability: signal.sharp_consensus_prob,
    edge_percent: signal.price_edge * 100,
    confidence_score: signal.confidence_score,
    urgency: signal.line_shopping_tier === 'PREMIUM' ? 'high' : 'normal',
    status: 'active',
    is_true_arbitrage: true,
    sharp_consensus_prob: signal.sharp_consensus_prob,
    sharp_line_edge: signal.price_edge,
    line_shopping_tier: signal.line_shopping_tier,
    signal_factors: {
      line_shopping_edge: signal.price_edge,
      sharp_books: signal.contributing_books,
      sharp_confidence: signal.sharp_confidence,
      bet_direction: signal.polymarket_side === 'YES' ? 'BUY_YES' : 'BUY_NO'
    },
    created_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('signal_opportunities')
    .upsert(signalInserts, {
      onConflict: 'polymarket_market_id,side',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('Error creating line shopping signals:', error);
    throw error;
  }
}

function extractTeamsFromQuestion(question: string): string[] | null {
  // Extract team names from various Polymarket question formats
  const patterns = [
    /Will (.+) beat (.+) on/i,  // "Will Team A beat Team B on..."
    /(.+) vs\.? (.+) - who will win/i, // "Team A vs Team B - who will win"
    /(.+) @ (.+)/i, // "Away @ Home"
    /(.+) - (.+) \| (.+)/i // "Team A - Team B | League"
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match.length >= 3) {
      return [match[1].trim(), match[2].trim()];
    }
  }

  return null;
}

function isMatchingEvent(polyTeams: string[], sharpEventName: string): boolean {
  const sharpLower = sharpEventName.toLowerCase();
  const poly1 = polyTeams[0].toLowerCase();
  const poly2 = polyTeams[1].toLowerCase();

  // Check if both team names appear in sharp event name
  return (sharpLower.includes(poly1) || sharpLower.includes(poly2)) &&
         (sharpLower.includes(poly1) && sharpLower.includes(poly2));
}

function normalizeEventName(question: string): string {
  // Extract clean event name from Polymarket question
  const teams = extractTeamsFromQuestion(question);
  if (teams) {
    return `${teams[0]} vs ${teams[1]}`;
  }
  
  // Fallback to first part of question
  return question.split(' - ')[0].split(' | ')[0];
}

function getLineShoppingBreakdown(signals: LineShoppingSignal[]) {
  return {
    premium: signals.filter(s => s.line_shopping_tier === 'PREMIUM').length,
    value: signals.filter(s => s.line_shopping_tier === 'VALUE').length,
    fair: signals.filter(s => s.line_shopping_tier === 'FAIR').length,
    avg_edge: signals.reduce((sum, s) => sum + s.price_edge, 0) / signals.length,
    avg_confidence: signals.reduce((sum, s) => sum + s.confidence_score, 0) / signals.length
  };
}