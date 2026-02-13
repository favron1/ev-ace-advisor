// ============================================================================
// CORRELATED MULTI-LEG DETECTOR - kch123 Strategy Implementation
// ============================================================================
// Detects when multiple Polymarket markets for the same event (spread, moneyline, 
// totals) all show +EV simultaneously. Enables position stacking like kch123's
// $1.8M Super Bowl strategy across 5 correlated markets.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
// BankrollConfig inlined to avoid importing from src/ (not available in edge runtime)
interface BankrollConfig {
  total_bankroll: number;
  max_position_pct: number;
  max_total_exposure_pct: number;
  kelly_multiplier: number;
  min_edge_for_kelly: number;
  correlation_reduction: number;
}

// Correlation scoring thresholds
const CORRELATION_LEVELS = {
  PERFECT: 0.95,    // Same team, same outcome (ML + Futures)
  HIGH: 0.80,       // Same team, related outcomes (Spread + ML)  
  MEDIUM: 0.60,     // Same event, different markets (Team Total + Spread)
  LOW: 0.40         // Same event, independent markets (Total + Spread different teams)
};

// Minimum requirements for multi-leg opportunities
const MULTI_LEG_REQUIREMENTS = {
  MIN_LEGS: 2,              // Minimum 2 correlated markets
  MAX_LEGS: 5,              // Maximum 5 legs (avoid over-correlation)
  MIN_TOTAL_EDGE: 8,        // Minimum 8% combined edge
  MIN_LEG_EDGE: 2,          // Minimum 2% edge per leg
  MIN_CONFIDENCE: 65        // Minimum confidence per leg
};

// Risk concentration limits
const RISK_LIMITS = {
  MAX_SINGLE_EVENT: 0.15,   // Max 15% of bankroll on single event
  MAX_CORRELATION: 0.25,    // Max 25% in correlated positions
  CORRELATION_DISCOUNT: 0.3  // 30% position size discount for correlation
};

interface CorrelatedLeg {
  signal_id: string;
  event_name: string;
  market_type: string;       // 'h2h', 'spread', 'totals', 'futures'
  outcome: string;
  side: 'YES' | 'NO';
  polymarket_price: number;
  edge_percent: number;
  confidence_score: number;
  kelly_fraction: number;
  suggested_stake: number;
  sport: string;
  event_start_time?: string;
}

interface MultiLegOpportunity {
  id: string;
  event_name: string;
  sport: string;
  legs: CorrelatedLeg[];
  correlation_matrix: number[][];
  total_edge_estimate: number;
  avg_correlation: number;
  max_correlation: number;
  combined_kelly_fraction: number;
  risk_concentration: number;
  recommended_total_stake: number;
  position_sizing_strategy: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
  execution_priority: number;
  warnings: string[];
}

const DEFAULT_BANKROLL_CONFIG: BankrollConfig = {
  total_bankroll: 10000,
  max_position_pct: 0.10,
  max_total_exposure_pct: 0.25,
  kelly_multiplier: 0.5,
  min_edge_for_kelly: 0.03,
  correlation_reduction: 0.3
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      sport, 
      lookback_hours = 4, 
      bankroll_config = DEFAULT_BANKROLL_CONFIG 
    } = await req.json();

    console.log(`🎯 Multi-Leg Detector: Analyzing ${sport || 'ALL'} for correlated opportunities`);

    // Get active signals with sufficient edge
    const activeSignals = await getActiveSignals(supabase, sport, lookback_hours);
    console.log(`📊 Found ${activeSignals.length} active signals to analyze`);

    // Group signals by event for correlation analysis
    const eventGroups = groupSignalsByEvent(activeSignals);
    console.log(`🎯 Grouped into ${eventGroups.size} unique events`);

    // Detect multi-leg opportunities
    const multiLegOpportunities: MultiLegOpportunity[] = [];

    for (const [eventName, signals] of eventGroups) {
      if (signals.length >= MULTI_LEG_REQUIREMENTS.MIN_LEGS) {
        const opportunity = analyzeMultiLegOpportunity(
          eventName,
          signals,
          bankroll_config
        );
        
        if (opportunity) {
          multiLegOpportunities.push(opportunity);
        }
      }
    }

    // Rank opportunities by execution priority
    const rankedOpportunities = multiLegOpportunities
      .sort((a, b) => b.execution_priority - a.execution_priority);

    // Store high-quality opportunities in database
    const premiumOpportunities = rankedOpportunities.filter(opp => 
      opp.total_edge_estimate >= MULTI_LEG_REQUIREMENTS.MIN_TOTAL_EDGE &&
      opp.avg_correlation >= CORRELATION_LEVELS.MEDIUM &&
      opp.warnings.length === 0
    );

    await storeMultiLegOpportunities(supabase, premiumOpportunities);

    console.log(`✅ Multi-Leg Analysis Complete:`);
    console.log(`   - ${eventGroups.size} events analyzed`);
    console.log(`   - ${multiLegOpportunities.length} opportunities found`);
    console.log(`   - ${premiumOpportunities.length} premium opportunities stored`);

    return new Response(JSON.stringify({
      success: true,
      events_analyzed: eventGroups.size,
      opportunities_found: multiLegOpportunities.length,
      premium_opportunities: premiumOpportunities.length,
      opportunities: rankedOpportunities.slice(0, 10), // Top 10
      correlation_stats: calculateCorrelationStats(multiLegOpportunities),
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Multi-leg detector error:', error);
    return new Response(JSON.stringify({
      error: 'Multi-leg detection failed',
      details: (error as Error).message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getActiveSignals(supabase: any, sport?: string, lookbackHours: number = 4) {
  let query = supabase
    .from('signal_opportunities')
    .select(`
      id,
      event_name,
      recommended_outcome,
      side,
      polymarket_price,
      edge_percent,
      confidence_score,
      polymarket_market_id,
      expires_at,
      created_at,
      signal_factors,
      kelly_fraction,
      suggested_stake_cents
    `)
    .eq('status', 'active')
    .gte('edge_percent', MULTI_LEG_REQUIREMENTS.MIN_LEG_EDGE)
    .gte('confidence_score', MULTI_LEG_REQUIREMENTS.MIN_CONFIDENCE)
    .gte('created_at', new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString())
    .order('edge_percent', { ascending: false })
    .limit(100);

  if (sport) {
    // Filter by sport in event name (simple approach)
    query = query.or(`event_name.ilike.%${sport}%,signal_factors->>sport.eq.${sport}`);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching active signals:', error);
    throw error;
  }

  return data || [];
}

function groupSignalsByEvent(signals: any[]): Map<string, any[]> {
  const eventGroups = new Map<string, any[]>();

  for (const signal of signals) {
    const eventKey = normalizeEventName(signal.event_name);
    
    if (!eventGroups.has(eventKey)) {
      eventGroups.set(eventKey, []);
    }
    
    eventGroups.get(eventKey)!.push(signal);
  }

  return eventGroups;
}

function analyzeMultiLegOpportunity(
  eventName: string,
  signals: any[],
  bankrollConfig: BankrollConfig
): MultiLegOpportunity | null {
  
  // Filter for quality legs
  const qualityLegs = signals.filter(signal => 
    signal.edge_percent >= MULTI_LEG_REQUIREMENTS.MIN_LEG_EDGE &&
    signal.confidence_score >= MULTI_LEG_REQUIREMENTS.MIN_CONFIDENCE
  );

  if (qualityLegs.length < MULTI_LEG_REQUIREMENTS.MIN_LEGS) {
    return null;
  }

  // Limit to max legs to avoid over-correlation
  const selectedLegs = qualityLegs
    .sort((a, b) => b.edge_percent - a.edge_percent)
    .slice(0, MULTI_LEG_REQUIREMENTS.MAX_LEGS);

  // Convert to CorrelatedLeg objects
  const legs: CorrelatedLeg[] = selectedLegs.map(signal => ({
    signal_id: signal.id,
    event_name: signal.event_name,
    market_type: inferMarketType(signal.recommended_outcome),
    outcome: signal.recommended_outcome,
    side: signal.side,
    polymarket_price: signal.polymarket_price,
    edge_percent: signal.edge_percent,
    confidence_score: signal.confidence_score,
    kelly_fraction: signal.kelly_fraction || 0.02,
    suggested_stake: (signal.suggested_stake_cents || 0) / 100,
    sport: inferSport(signal.event_name),
    event_start_time: signal.expires_at
  }));

  // Calculate correlation matrix
  const correlationMatrix = calculateCorrelationMatrix(legs);
  const avgCorrelation = calculateAverageCorrelation(correlationMatrix);
  const maxCorrelation = Math.max(...correlationMatrix.flat());

  // Calculate combined metrics
  const totalEdge = legs.reduce((sum, leg) => sum + leg.edge_percent, 0);
  const combinedKelly = calculateCombinedKelly(legs, correlationMatrix, bankrollConfig);
  const riskConcentration = calculateRiskConcentration(legs, correlationMatrix);

  // Position sizing with correlation adjustment
  const correlationDiscount = 1 - (avgCorrelation * RISK_LIMITS.CORRELATION_DISCOUNT);
  const recommendedTotalStake = combinedKelly * bankrollConfig.total_bankroll * correlationDiscount;

  // Generate warnings
  const warnings = generateMultiLegWarnings(legs, avgCorrelation, totalEdge, riskConcentration);

  // Determine position sizing strategy
  let positionStrategy: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
  if (avgCorrelation >= CORRELATION_LEVELS.HIGH && totalEdge >= 15) {
    positionStrategy = 'AGGRESSIVE';
  } else if (avgCorrelation >= CORRELATION_LEVELS.MEDIUM && totalEdge >= 10) {
    positionStrategy = 'MODERATE';
  } else {
    positionStrategy = 'CONSERVATIVE';
  }

  // Calculate execution priority
  const executionPriority = calculateExecutionPriority(
    legs, totalEdge, avgCorrelation, warnings.length
  );

  return {
    id: generateMultiLegId(eventName, legs.length),
    event_name: eventName,
    sport: legs[0]?.sport || 'UNKNOWN',
    legs,
    correlation_matrix: correlationMatrix,
    total_edge_estimate: totalEdge,
    avg_correlation: avgCorrelation,
    max_correlation: maxCorrelation,
    combined_kelly_fraction: combinedKelly,
    risk_concentration: riskConcentration,
    recommended_total_stake: Math.round(recommendedTotalStake),
    position_sizing_strategy: positionStrategy,
    execution_priority: executionPriority,
    warnings
  };
}

function calculateCorrelationMatrix(legs: CorrelatedLeg[]): number[][] {
  const n = legs.length;
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0; // Perfect self-correlation
      } else {
        matrix[i][j] = calculatePairwiseCorrelation(legs[i], legs[j]);
      }
    }
  }

  return matrix;
}

function calculatePairwiseCorrelation(leg1: CorrelatedLeg, leg2: CorrelatedLeg): number {
  // Same outcome, same market = perfect correlation
  if (leg1.side === leg2.side && leg1.market_type === leg2.market_type) {
    return CORRELATION_LEVELS.PERFECT;
  }

  // Same team/side, different markets = high correlation
  if (leg1.side === leg2.side && 
      (leg1.market_type !== leg2.market_type)) {
    return CORRELATION_LEVELS.HIGH;
  }

  // Related markets for same event = medium correlation  
  if (isRelatedMarket(leg1.market_type, leg2.market_type)) {
    return CORRELATION_LEVELS.MEDIUM;
  }

  // Same event, independent markets = low correlation
  return CORRELATION_LEVELS.LOW;
}

function calculateCombinedKelly(
  legs: CorrelatedLeg[], 
  correlationMatrix: number[][],
  bankrollConfig: BankrollConfig
): number {
  
  // Simplified Kelly for correlated bets:
  // Reduce individual Kelly fractions based on correlation
  
  let combinedKelly = 0;
  const avgCorrelation = calculateAverageCorrelation(correlationMatrix);
  
  for (const leg of legs) {
    // Reduce Kelly fraction based on correlation with other legs
    const correlationAdjustment = 1 - (avgCorrelation * bankrollConfig.correlation_reduction);
    const adjustedKelly = leg.kelly_fraction * correlationAdjustment;
    combinedKelly += adjustedKelly;
  }

  // Apply conservative multiplier
  return Math.min(combinedKelly * bankrollConfig.kelly_multiplier, 0.15); // Cap at 15%
}

function calculateRiskConcentration(
  legs: CorrelatedLeg[],
  correlationMatrix: number[][]
): number {
  // Estimate maximum loss if all correlated legs fail
  const totalStake = legs.reduce((sum, leg) => sum + leg.suggested_stake, 0);
  const avgCorrelation = calculateAverageCorrelation(correlationMatrix);
  
  // Risk increases with correlation (correlated positions fail together)
  return totalStake * (1 + avgCorrelation);
}

async function storeMultiLegOpportunities(supabase: any, opportunities: MultiLegOpportunity[]) {
  if (opportunities.length === 0) return;

  const inserts = opportunities.map(opp => ({
    event_name: opp.event_name,
    sport: opp.sport,
    event_start_time: opp.legs[0]?.event_start_time,
    legs: JSON.stringify(opp.legs),
    total_edge_estimate: opp.total_edge_estimate,
    correlation_score: opp.avg_correlation,
    risk_concentration: opp.risk_concentration,
    kelly_sizing_recommendation: opp.combined_kelly_fraction,
    recommended_bankroll_pct: (opp.recommended_total_stake / DEFAULT_BANKROLL_CONFIG.total_bankroll) * 100,
    status: 'active',
    created_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('multi_leg_opportunities')
    .upsert(inserts, {
      onConflict: 'event_name',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('Error storing multi-leg opportunities:', error);
    throw error;
  }
}

// Helper functions

function normalizeEventName(eventName: string): string {
  return eventName
    .toLowerCase()
    .replace(/\s+vs\s+|\s+@\s+|\s+-\s+/g, ' vs ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function inferMarketType(outcome: string): string {
  const lower = outcome.toLowerCase();
  
  if (lower.includes('spread') || lower.includes('-') || lower.includes('+')) {
    return 'spread';
  } else if (lower.includes('total') || lower.includes('over') || lower.includes('under')) {
    return 'totals';
  } else if (lower.includes('championship') || lower.includes('winner') || lower.includes('champion')) {
    return 'futures';
  } else {
    return 'h2h'; // Default to head-to-head/moneyline
  }
}

function inferSport(eventName: string): string {
  const lower = eventName.toLowerCase();
  
  if (lower.match(/\b(nhl|hockey|bruins|rangers|leafs|penguins|lightning|blackhawks)\b/)) {
    return 'NHL';
  } else if (lower.match(/\b(nba|basketball|lakers|celtics|warriors|heat|knicks)\b/)) {
    return 'NBA';
  } else if (lower.match(/\b(nfl|football|chiefs|eagles|patriots|cowboys|bills)\b/)) {
    return 'NFL';
  } else if (lower.match(/\b(ncaa|college|duke|unc|gonzaga|kentucky)\b/)) {
    return 'NCAA';
  }
  
  return 'UNKNOWN';
}

function isRelatedMarket(type1: string, type2: string): boolean {
  const relatedPairs = [
    ['h2h', 'spread'],      // Moneyline and spread
    ['spread', 'totals'],   // Spread and total  
    ['h2h', 'futures']      // Current game and season outcome
  ];
  
  return relatedPairs.some(pair => 
    (pair.includes(type1) && pair.includes(type2)) &&
    type1 !== type2
  );
}

function calculateAverageCorrelation(matrix: number[][]): number {
  let sum = 0;
  let count = 0;
  
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix[i].length; j++) {
      sum += matrix[i][j];
      count++;
    }
  }
  
  return count > 0 ? sum / count : 0;
}

function generateMultiLegWarnings(
  legs: CorrelatedLeg[],
  avgCorrelation: number,
  totalEdge: number,
  riskConcentration: number
): string[] {
  
  const warnings: string[] = [];
  
  if (avgCorrelation >= CORRELATION_LEVELS.HIGH) {
    warnings.push('High correlation - positions may move together');
  }
  
  if (totalEdge < MULTI_LEG_REQUIREMENTS.MIN_TOTAL_EDGE) {
    warnings.push(`Low combined edge: ${totalEdge.toFixed(1)}%`);
  }
  
  if (riskConcentration > RISK_LIMITS.MAX_SINGLE_EVENT * DEFAULT_BANKROLL_CONFIG.total_bankroll) {
    warnings.push('Risk concentration exceeds single-event limit');
  }
  
  const lowConfidenceLegs = legs.filter(leg => leg.confidence_score < 70).length;
  if (lowConfidenceLegs > 0) {
    warnings.push(`${lowConfidenceLegs} legs have low confidence`);
  }
  
  if (legs.length > 3) {
    warnings.push('High number of legs increases execution complexity');
  }
  
  return warnings;
}

function calculateExecutionPriority(
  legs: CorrelatedLeg[],
  totalEdge: number,
  avgCorrelation: number,
  warningCount: number
): number {
  
  let priority = 0;
  
  // Edge contribution (40% of priority)
  priority += (totalEdge / 20) * 40;
  
  // Correlation bonus (20% of priority) - higher correlation = higher priority for stacking
  priority += (avgCorrelation / 1) * 20;
  
  // Confidence contribution (25% of priority)
  const avgConfidence = legs.reduce((sum, leg) => sum + leg.confidence_score, 0) / legs.length;
  priority += (avgConfidence / 100) * 25;
  
  // Warning penalty (15% of priority)
  priority += Math.max(0, 15 - (warningCount * 5));
  
  return Math.round(priority);
}

function generateMultiLegId(eventName: string, legCount: number): string {
  const eventHash = eventName.replace(/\s+/g, '').toLowerCase().slice(0, 8);
  const timestamp = Date.now().toString().slice(-6);
  return `multileg-${eventHash}-${legCount}legs-${timestamp}`;
}

function calculateCorrelationStats(opportunities: MultiLegOpportunity[]) {
  if (opportunities.length === 0) {
    return { avg_correlation: 0, max_correlation: 0, avg_legs: 0, total_opportunities: 0 };
  }

  return {
    avg_correlation: opportunities.reduce((sum, opp) => sum + opp.avg_correlation, 0) / opportunities.length,
    max_correlation: Math.max(...opportunities.map(opp => opp.max_correlation)),
    avg_legs: opportunities.reduce((sum, opp) => sum + opp.legs.length, 0) / opportunities.length,
    total_opportunities: opportunities.length,
    by_strategy: {
      aggressive: opportunities.filter(opp => opp.position_sizing_strategy === 'AGGRESSIVE').length,
      moderate: opportunities.filter(opp => opp.position_sizing_strategy === 'MODERATE').length,
      conservative: opportunities.filter(opp => opp.position_sizing_strategy === 'CONSERVATIVE').length
    }
  };
}