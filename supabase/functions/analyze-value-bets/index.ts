import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sharp bookmakers - prioritize these for fair odds calculation
const SHARP_BOOKS = ['pinnacle', 'pinnacle_us', 'betfair_ex_uk', 'matchbook', 'sbobet'];

// League tiers for edge thresholds
const TIER_1_LEAGUES = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_france_ligue_one'];
const TIER_2_LEAGUES = ['soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_belgium_first_div'];

interface OddsApiResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    last_update: string;
    markets: {
      key: string;
      outcomes: { name: string; price: number; point?: number }[];
    }[];
  }[];
}

interface OutcomeData {
  name: string;
  odds: number[];
  sharpOdds: number[];
  bookmakers: string[];
  bestOdds: number;
  bestBookmaker: string;
}

interface ValueBet {
  id: string;
  event: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  market: string;
  offeredOdds: number;
  fairOdds: number;
  fairProbability: number;
  impliedProbability: number;
  expectedValue: number;
  edge: number;
  confidence: "high" | "moderate" | "low";
  suggestedStakePercent: number;
  kellyStake: number;
  reasoning: string;
  meetsCriteria: boolean;
  minOdds: number;
  sport: string;
  commenceTime: string;
  bookmaker: string;
  bookmakerCount: number;
}

// Get league tier for edge threshold
function getLeagueTier(sportKey: string): number {
  if (TIER_1_LEAGUES.includes(sportKey)) return 1;
  if (TIER_2_LEAGUES.includes(sportKey)) return 2;
  return 3;
}

// Get minimum edge based on league tier
function getMinEdge(tier: number): number {
  switch (tier) {
    case 1: return 3;  // 3% for tier 1
    case 2: return 5;  // 5% for tier 2
    default: return 8; // 8% for unknown/minor leagues
  }
}

// De-vig odds to get fair probabilities
function deVigOdds(outcomes: OutcomeData[]): Map<string, { fairProb: number; fairOdds: number }> {
  const result = new Map<string, { fairProb: number; fairOdds: number }>();
  
  // Prefer sharp book odds if available
  let oddsToUse: { name: string; odds: number }[] = [];
  
  // Check if we have sharp book odds for all outcomes
  const hasSharpForAll = outcomes.every(o => o.sharpOdds.length > 0);
  
  if (hasSharpForAll) {
    // Use average of sharp book odds
    oddsToUse = outcomes.map(o => ({
      name: o.name,
      odds: o.sharpOdds.reduce((a, b) => a + b, 0) / o.sharpOdds.length
    }));
    console.log('Using sharp book odds for de-vig');
  } else {
    // Use average of all odds (excluding obvious outliers)
    oddsToUse = outcomes.map(o => {
      if (o.odds.length === 0) return { name: o.name, odds: 0 };
      
      // Remove outliers (odds > 2 std dev from mean)
      const mean = o.odds.reduce((a, b) => a + b, 0) / o.odds.length;
      const stdDev = Math.sqrt(o.odds.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / o.odds.length);
      const filtered = o.odds.filter(odd => Math.abs(odd - mean) <= 2 * stdDev);
      
      return {
        name: o.name,
        odds: filtered.length > 0 ? filtered.reduce((a, b) => a + b, 0) / filtered.length : mean
      };
    });
  }
  
  // Calculate raw implied probabilities
  const rawProbs = oddsToUse.map(o => ({
    name: o.name,
    rawProb: o.odds > 0 ? 1 / o.odds : 0
  }));
  
  // Calculate overround (sum of all implied probabilities)
  const overround = rawProbs.reduce((sum, p) => sum + p.rawProb, 0);
  
  if (overround === 0) return result;
  
  // De-vig: divide each probability by overround to normalize to 100%
  for (const p of rawProbs) {
    const fairProb = p.rawProb / overround;
    const fairOdds = fairProb > 0 ? 1 / fairProb : 0;
    result.set(p.name, { fairProb, fairOdds });
  }
  
  return result;
}

// Calculate fractional Kelly stake with caps
function calculateFractionalKelly(fairProb: number, bestOdds: number): number {
  const p = fairProb;
  const q = 1 - p;
  const b = bestOdds - 1;
  
  if (b <= 0) return 0;
  
  // Full Kelly: (bp - q) / b
  const kellyFull = (b * p - q) / b;
  
  if (kellyFull <= 0) return 0;
  
  // Use 25% Kelly to reduce variance
  const kellyFraction = kellyFull * 0.25;
  
  // Apply caps: 0.25% to 1.5% of bankroll
  const stakePercent = kellyFraction * 100;
  
  if (stakePercent < 0.25) return 0; // Skip if below minimum
  return Math.min(stakePercent, 1.5); // Cap at 1.5%
}

// Determine confidence level
function determineConfidence(edge: number, bookCount: number, bestOdds: number): 'high' | 'moderate' | 'low' {
  let score = 0;
  
  if (edge >= 10) score += 3;
  else if (edge >= 6) score += 2;
  else if (edge >= 3) score += 1;
  
  if (bookCount >= 5) score += 2;
  else if (bookCount >= 3) score += 1;
  
  if (bestOdds >= 1.5 && bestOdds <= 5.0) score += 1;
  
  if (score >= 5) return 'high';
  if (score >= 3) return 'moderate';
  return 'low';
}

// Generate reasoning
function generateReasoning(
  selection: string,
  edge: number,
  ev: number,
  fairProb: number,
  bestOdds: number,
  fairOdds: number,
  bookCount: number,
  hasSharp: boolean,
  tier: number
): string {
  const reasons: string[] = [];
  
  if (edge >= 8) {
    reasons.push(`Strong de-vigged value with ${edge.toFixed(1)}% edge`);
  } else if (edge >= 5) {
    reasons.push(`Solid value opportunity with ${edge.toFixed(1)}% edge`);
  } else {
    reasons.push(`Value detected with ${edge.toFixed(1)}% edge`);
  }
  
  reasons.push(`Fair prob: ${(fairProb * 100).toFixed(1)}%`);
  reasons.push(`Best: ${bestOdds.toFixed(2)} vs Fair: ${fairOdds.toFixed(2)}`);
  reasons.push(`EV: ${(ev * 100).toFixed(1)}%`);
  
  if (hasSharp) {
    reasons.push('Sharp line used');
  }
  
  reasons.push(`${bookCount} bookmakers`);
  reasons.push(`Tier ${tier} league`);
  
  return reasons.join('. ') + '.';
}

// Extract outcome data from event
function extractOutcomeData(event: OddsApiResponse, marketKey: string): OutcomeData[] {
  const outcomeMap = new Map<string, OutcomeData>();
  
  for (const bm of event.bookmakers) {
    const market = bm.markets.find(m => m.key === marketKey);
    if (!market) continue;
    
    const isSharp = SHARP_BOOKS.includes(bm.key.toLowerCase());
    
    for (const outcome of market.outcomes) {
      const key = marketKey === 'totals' 
        ? `${outcome.name} ${outcome.point || ''}`.trim()
        : outcome.name;
        
      let data = outcomeMap.get(key);
      if (!data) {
        data = { 
          name: key, 
          odds: [], 
          sharpOdds: [], 
          bookmakers: [],
          bestOdds: 0,
          bestBookmaker: ''
        };
        outcomeMap.set(key, data);
      }
      
      data.odds.push(outcome.price);
      data.bookmakers.push(bm.title);
      
      if (outcome.price > data.bestOdds) {
        data.bestOdds = outcome.price;
        data.bestBookmaker = bm.title;
      }
      
      if (isSharp) {
        data.sharpOdds.push(outcome.price);
      }
    }
  }
  
  return Array.from(outcomeMap.values());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    
    if (!oddsApiKey) {
      console.error('ODDS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing value bets with de-vigged fair probabilities strategy');

    const sports = [
      'soccer_epl',
      'soccer_spain_la_liga', 
      'soccer_germany_bundesliga',
      'soccer_italy_serie_a',
      'soccer_france_ligue_one'
    ];
    
    const allValueBets: ValueBet[] = [];
    const matchExposure = new Map<string, number>(); // Track exposure per match

    for (const sport of sports) {
      const tier = getLeagueTier(sport);
      const minEdge = getMinEdge(tier);
      
      const markets = ['h2h', 'totals'];
      
      for (const market of markets) {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=eu,uk&markets=${market}&oddsFormat=decimal`;
        
        console.log(`Fetching ${market} odds for ${sport} (Tier ${tier}, min edge ${minEdge}%)...`);
        
        try {
          const response = await fetch(url);
          
          if (!response.ok) {
            console.error(`Failed to fetch ${market} odds for ${sport}: ${response.status}`);
            continue;
          }

          const data: OddsApiResponse[] = await response.json();
          console.log(`Got ${data.length} events for ${sport} ${market}`);

          for (const event of data) {
            // FILTER: Minimum 3 bookmakers
            if (!event.bookmakers || event.bookmakers.length < 3) continue;

            const outcomes = extractOutcomeData(event, market);
            
            // Group outcomes for de-vigging (need all outcomes for a market together)
            let outcomeGroups: OutcomeData[][] = [];
            
            if (market === 'h2h') {
              // H2H: Home, Away, Draw are one group
              outcomeGroups = [outcomes];
            } else {
              // Totals: Group Over/Under by point value
              const byPoint = new Map<string, OutcomeData[]>();
              for (const o of outcomes) {
                const point = o.name.split(' ')[1] || '2.5';
                const existing = byPoint.get(point) || [];
                existing.push(o);
                byPoint.set(point, existing);
              }
              outcomeGroups = Array.from(byPoint.values()).filter(g => g.length === 2);
            }
            
            for (const group of outcomeGroups) {
              // FILTER: Need at least 3 bookmakers per outcome
              if (!group.every(o => o.odds.length >= 3)) continue;
              
              const fairValues = deVigOdds(group);
              const hasSharp = group.some(o => o.sharpOdds.length > 0);
              
              for (const outcome of group) {
                const fair = fairValues.get(outcome.name);
                if (!fair) continue;
                
                const bestOdds = outcome.bestOdds;
                
                // FILTER: Odds range 1.30 - 10.00
                if (bestOdds < 1.30 || bestOdds > 10.00) continue;
                
                const edge = ((bestOdds - fair.fairOdds) / fair.fairOdds) * 100;
                const ev = fair.fairProb * (bestOdds - 1) - (1 - fair.fairProb);
                
                // FILTER: Edge >= tier minimum
                if (edge < minEdge) continue;
                
                // FILTER: EV > 0, prefer >= 0.02 (2%)
                if (ev <= 0 || ev < 0.02) continue;
                
                const stake = calculateFractionalKelly(fair.fairProb, bestOdds);
                if (stake === 0) continue;
                
                // FILTER: Match exposure limit (3.5% max per match)
                const matchKey = `${event.home_team}_${event.away_team}`;
                const currentExposure = matchExposure.get(matchKey) || 0;
                if (currentExposure + stake > 3.5) continue;
                matchExposure.set(matchKey, currentExposure + stake);
                
                const confidence = determineConfidence(edge, outcome.bookmakers.length, bestOdds);
                
                const reasoning = generateReasoning(
                  outcome.name,
                  edge,
                  ev,
                  fair.fairProb,
                  bestOdds,
                  fair.fairOdds,
                  outcome.bookmakers.length,
                  hasSharp,
                  tier
                );

                allValueBets.push({
                  id: `${event.id}-${market}-${outcome.name}`,
                  event: `${event.home_team} vs ${event.away_team}`,
                  homeTeam: event.home_team,
                  awayTeam: event.away_team,
                  selection: outcome.name,
                  market: market === 'h2h' ? '1X2' : 'Over/Under',
                  offeredOdds: bestOdds,
                  fairOdds: fair.fairOdds,
                  fairProbability: fair.fairProb,
                  impliedProbability: 1 / bestOdds,
                  expectedValue: ev,
                  edge: edge,
                  confidence: confidence,
                  suggestedStakePercent: stake,
                  kellyStake: stake,
                  reasoning: reasoning,
                  meetsCriteria: true,
                  minOdds: 1.30,
                  sport: event.sport_title,
                  commenceTime: event.commence_time,
                  bookmaker: outcome.bestBookmaker,
                  bookmakerCount: outcome.bookmakers.length
                });
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching ${market} for ${sport}:`, err);
        }
      }
    }

    // Sort by expected value (highest first)
    allValueBets.sort((a, b) => b.expectedValue - a.expectedValue);
    
    // Return all qualifying bets
    const topBets = allValueBets.slice(0, 50);

    console.log(`Found ${allValueBets.length} de-vigged value bets meeting criteria, returning top ${topBets.length}`);

    // Calculate summary stats
    const summary = {
      totalBets: topBets.length,
      highConfidence: topBets.filter(b => b.confidence === "high").length,
      moderateConfidence: topBets.filter(b => b.confidence === "moderate").length,
      lowConfidence: topBets.filter(b => b.confidence === "low").length,
      avgEdge: topBets.length > 0 ? topBets.reduce((sum, b) => sum + b.edge, 0) / topBets.length : 0,
      avgEV: topBets.length > 0 ? topBets.reduce((sum, b) => sum + b.expectedValue, 0) / topBets.length : 0,
      totalSuggestedStake: topBets.reduce((sum, b) => sum + b.suggestedStakePercent, 0),
      timestamp: new Date().toISOString(),
      strategy: 'De-vigged fair probabilities with 25% Kelly, tiered edge thresholds (3-8%)'
    };

    return new Response(
      JSON.stringify({ bets: topBets, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing value bets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
