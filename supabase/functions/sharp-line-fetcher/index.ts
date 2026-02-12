// ============================================================================
// SHARP LINE FETCHER - Cross-Platform Line Shopping Module
// ============================================================================
// Fetches odds from sharp sportsbooks (Pinnacle, Betfair, Circa) to establish
// "true" probability baseline for comparison against Polymarket odds.
// This is likely kch123's primary edge source.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Sharp bookmaker APIs and weights
const SHARP_BOOKMAKERS = {
  pinnacle: { 
    weight: 0.5, // Highest weight - most respected sharp book
    key: Deno.env.get('ODDS_API_KEY'),
    name: 'pinnacle'
  },
  betfair: { 
    weight: 0.3, // Exchange pricing, very sharp
    key: Deno.env.get('ODDS_API_KEY'),
    name: 'betfair_ex_eu'
  },
  circa: { 
    weight: 0.2, // US sharp book
    key: Deno.env.get('ODDS_API_KEY'),
    name: 'circa'
  }
};

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

interface SharpBookLine {
  bookmaker: string;
  sport: string;
  event_name: string;
  market_type: string; // 'h2h', 'spreads', 'totals'
  outcome: string;
  odds: number;
  implied_probability: number;
  line_value?: number; // For spreads (e.g., -4.5)
  total_value?: number; // For totals (e.g., 225.5)
  event_start_time: string;
  weight: number; // Bookmaker weight for consensus calculation
}

interface SharpConsensus {
  event_name: string;
  market_type: string;
  outcome: string;
  consensus_probability: number;
  confidence_score: number; // Based on agreement between sharp books
  contributing_books: string[];
  line_value?: number;
  total_value?: number;
}

// Sport endpoint mapping for Odds API
const SPORT_ENDPOINTS = {
  'NHL': 'icehockey_nhl',
  'NBA': 'basketball_nba', 
  'NFL': 'americanfootball_nfl',
  'EPL': 'soccer_epl',
  'NCAA': 'basketball_ncaab'
};

export default async function handler(req: Request) {
  // Enable CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sport, hours_ahead = 24 } = await req.json();
    
    console.log(`🎯 Sharp Line Fetcher: Fetching ${sport} lines for next ${hours_ahead}h`);

    // Get sport endpoint
    const oddsApiSport = SPORT_ENDPOINTS[sport as keyof typeof SPORT_ENDPOINTS];
    if (!oddsApiSport) {
      throw new Error(`Unsupported sport: ${sport}`);
    }

    // Fetch lines from all sharp books
    const sharpLines: SharpBookLine[] = [];
    const consensusMap = new Map<string, SharpBookLine[]>();

    for (const [bookKey, config] of Object.entries(SHARP_BOOKMAKERS)) {
      try {
        const lines = await fetchBookmakerLines(oddsApiSport, config.name, config.weight);
        sharpLines.push(...lines);
        
        // Group by event-market-outcome for consensus calculation
        lines.forEach(line => {
          const key = `${line.event_name}|${line.market_type}|${line.outcome}`;
          if (!consensusMap.has(key)) {
            consensusMap.set(key, []);
          }
          consensusMap.get(key)!.push(line);
        });
        
        console.log(`✅ Fetched ${lines.length} lines from ${bookKey}`);
      } catch (error) {
        console.error(`❌ Failed to fetch from ${bookKey}:`, error);
        // Continue with other books
      }
    }

    // Calculate sharp consensus for each market
    const sharpConsensus: SharpConsensus[] = [];
    
    for (const [key, lines] of consensusMap) {
      if (lines.length >= 2) { // Need at least 2 sharp books for consensus
        const consensus = calculateSharpConsensus(lines);
        if (consensus) {
          sharpConsensus.push(consensus);
        }
      }
    }

    // Store in database
    await storeSharpLines(supabase, sharpLines);
    await storeSharpConsensus(supabase, sharpConsensus);

    console.log(`📊 Sharp Line Summary: ${sharpLines.length} lines, ${sharpConsensus.length} consensus markets`);

    return new Response(JSON.stringify({
      success: true,
      lines_fetched: sharpLines.length,
      consensus_markets: sharpConsensus.length,
      sharp_books_used: Object.keys(SHARP_BOOKMAKERS).length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sharp line fetcher error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch sharp lines',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function fetchBookmakerLines(
  sport: string, 
  bookmaker: string, 
  weight: number
): Promise<SharpBookLine[]> {
  const apiKey = Deno.env.get('ODDS_API_KEY');
  if (!apiKey) {
    throw new Error('ODDS_API_KEY not configured');
  }

  // Fetch multiple market types
  const marketTypes = ['h2h', 'spreads', 'totals'];
  const allLines: SharpBookLine[] = [];

  for (const marketType of marketTypes) {
    try {
      const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${apiKey}&regions=us,eu&markets=${marketType}&bookmakers=${bookmaker}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`⚠️ ${bookmaker} ${marketType}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      for (const game of data) {
        const eventName = normalizeEventName(game.home_team, game.away_team);
        const startTime = game.commence_time;

        for (const book of game.bookmakers) {
          if (book.key !== bookmaker) continue;

          for (const market of book.markets) {
            if (market.key !== marketType) continue;

            for (const outcome of market.outcomes) {
              const line: SharpBookLine = {
                bookmaker: bookmaker,
                sport: sport,
                event_name: eventName,
                market_type: marketType,
                outcome: outcome.name,
                odds: outcome.price,
                implied_probability: 1 / outcome.price,
                event_start_time: startTime,
                weight: weight
              };

              // Add line/total values for spreads and totals
              if (marketType === 'spreads' && outcome.point) {
                line.line_value = outcome.point;
              }
              if (marketType === 'totals' && outcome.point) {
                line.total_value = outcome.point;
              }

              allLines.push(line);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to fetch ${bookmaker} ${marketType}:`, error.message);
    }
  }

  return allLines;
}

function calculateSharpConsensus(lines: SharpBookLine[]): SharpConsensus | null {
  if (lines.length < 2) return null;

  // Weight-average the implied probabilities
  let totalWeight = 0;
  let weightedProbSum = 0;

  for (const line of lines) {
    totalWeight += line.weight;
    weightedProbSum += line.implied_probability * line.weight;
  }

  const consensusProb = weightedProbSum / totalWeight;
  
  // Calculate confidence based on agreement between books
  const probabilities = lines.map(l => l.implied_probability);
  const avgProb = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
  const variance = probabilities.reduce((sum, p) => sum + Math.pow(p - avgProb, 2), 0) / probabilities.length;
  const stdDev = Math.sqrt(variance);
  
  // Confidence score: higher when books agree (low std dev)
  const confidenceScore = Math.max(0, 100 - (stdDev * 1000)); // Scale to 0-100

  return {
    event_name: lines[0].event_name,
    market_type: lines[0].market_type,
    outcome: lines[0].outcome,
    consensus_probability: consensusProb,
    confidence_score: confidenceScore,
    contributing_books: lines.map(l => l.bookmaker),
    line_value: lines[0].line_value,
    total_value: lines[0].total_value
  };
}

async function storeSharpLines(supabase: any, lines: SharpBookLine[]): Promise<void> {
  if (lines.length === 0) return;

  const { error } = await supabase
    .from('sharp_book_lines')
    .upsert(
      lines.map(line => ({
        event_name: line.event_name,
        sport: line.sport,
        market_type: line.market_type,
        outcome: line.outcome,
        bookmaker: line.bookmaker,
        odds: line.odds,
        implied_probability: line.implied_probability,
        line_value: line.line_value,
        total_value: line.total_value,
        event_start_time: line.event_start_time,
        is_sharp: true,
        captured_at: new Date().toISOString()
      })),
      { 
        onConflict: 'event_name,market_type,outcome,bookmaker',
        ignoreDuplicates: false 
      }
    );

  if (error) {
    console.error('Error storing sharp lines:', error);
    throw error;
  }
}

async function storeSharpConsensus(supabase: any, consensusData: SharpConsensus[]): Promise<void> {
  if (consensusData.length === 0) return;

  // Store consensus in a separate table for quick lookups
  const { error } = await supabase
    .from('sharp_consensus')
    .upsert(
      consensusData.map(consensus => ({
        event_name: consensus.event_name,
        market_type: consensus.market_type,
        outcome: consensus.outcome,
        consensus_probability: consensus.consensus_probability,
        confidence_score: consensus.confidence_score,
        contributing_books: consensus.contributing_books,
        line_value: consensus.line_value,
        total_value: consensus.total_value,
        calculated_at: new Date().toISOString()
      })),
      { 
        onConflict: 'event_name,market_type,outcome',
        ignoreDuplicates: false 
      }
    );

  if (error) {
    console.error('Error storing sharp consensus:', error);
    throw error;
  }
}

function normalizeEventName(homeTeam: string, awayTeam: string): string {
  // Normalize team names for consistent matching
  const normalize = (team: string) => team
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  return `${normalize(awayTeam)} @ ${normalize(homeTeam)}`;
}