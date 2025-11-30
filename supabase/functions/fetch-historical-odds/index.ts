import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sharp bookmakers - prioritize these for fair odds calculation
const SHARP_BOOKS = ['pinnacle', 'pinnacle_us', 'betfair_ex_uk', 'matchbook', 'sbobet'];

// League tiers for edge thresholds
const TIER_1_LEAGUES = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_france_ligue_one'];
const TIER_2_LEAGUES = ['soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_belgium_first_div'];

interface OddsEvent {
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

interface ScoreEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

interface HistoricalApiResponse {
  timestamp: string;
  data: OddsEvent[];
}

interface OutcomeData {
  name: string;
  odds: number[];
  sharpOdds: number[];
  bookmakers: string[];
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body.date || getDateDaysAgo(3);
    } catch {
      targetDate = getDateDaysAgo(3);
    }

    console.log(`Fetching historical odds for: ${targetDate}`);
    console.log('Using de-vigged fair probabilities strategy');

    const sports = TIER_1_LEAGUES;
    const valueBets: any[] = [];
    const matchExposure = new Map<string, number>(); // Track exposure per match
    
    // Step 1: Fetch completed match scores
    const matchScores = new Map<string, { home: number; away: number }>();
    
    for (const sport of sports) {
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`;
        console.log(`Fetching scores for ${sport}...`);
        
        const response = await fetch(scoresUrl);
        if (!response.ok) continue;
        
        const scores: ScoreEvent[] = await response.json();
        const completed = scores.filter(s => s.completed && s.scores);
        console.log(`${sport}: ${completed.length} completed matches`);
        
        for (const match of completed) {
          const key = normalizeTeamKey(match.home_team, match.away_team);
          const homeScore = parseInt(match.scores!.find(s => s.name === match.home_team)?.score || '0');
          const awayScore = parseInt(match.scores!.find(s => s.name === match.away_team)?.score || '0');
          matchScores.set(key, { home: homeScore, away: awayScore });
        }
      } catch (err) {
        console.error(`Error fetching ${sport} scores:`, err);
      }
    }
    
    console.log(`Loaded ${matchScores.size} completed matches`);

    // Step 2: Fetch historical odds
    for (const sport of sports) {
      const tier = getLeagueTier(sport);
      const minEdge = getMinEdge(tier);
      
      try {
        const histUrl = `https://api.the-odds-api.com/v4/historical/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk,eu&markets=h2h,totals&oddsFormat=decimal&date=${targetDate}`;
        console.log(`Trying historical endpoint for ${sport} (Tier ${tier}, min edge ${minEdge}%)...`);
        
        let events: OddsEvent[] = [];
        const histResponse = await fetch(histUrl);
        
        if (histResponse.ok) {
          const histData: HistoricalApiResponse = await histResponse.json();
          events = histData.data || [];
          console.log(`Historical: Got ${events.length} events for ${sport}`);
        } else {
          console.log(`Historical not available for ${sport}, skipping`);
          continue;
        }

        for (const event of events) {
          // FILTER: Minimum 3 bookmakers
          if (!event.bookmakers || event.bookmakers.length < 3) {
            continue;
          }
          
          const matchKey = normalizeTeamKey(event.home_team, event.away_team);
          const result = matchScores.get(matchKey);
          
          // Get or create match record
          const { data: existingMatch } = await supabase
            .from('matches')
            .select('id')
            .eq('home_team', event.home_team)
            .eq('away_team', event.away_team)
            .maybeSingle();
          
          let matchId: string;
          if (existingMatch) {
            matchId = existingMatch.id;
          } else {
            const { data: newMatch, error } = await supabase
              .from('matches')
              .insert({
                home_team: event.home_team,
                away_team: event.away_team,
                league: event.sport_title,
                match_date: event.commence_time,
              })
              .select('id')
              .single();
            
            if (error || !newMatch) continue;
            matchId = newMatch.id;
          }

          // Process H2H market with de-vigging
          const h2hOutcomes = extractOutcomeData(event, 'h2h');
          
          if (h2hOutcomes.length >= 2 && h2hOutcomes.every(o => o.odds.length >= 3)) {
            const fairValues = deVigOdds(h2hOutcomes);
            
            const selections = [
              { 
                name: event.home_team, 
                displayName: `${event.home_team} to win`,
                winner: result ? result.home > result.away : null
              },
              { 
                name: event.away_team, 
                displayName: `${event.away_team} to win`,
                winner: result ? result.away > result.home : null
              },
              { 
                name: 'Draw', 
                displayName: 'Draw',
                winner: result ? result.home === result.away : null
              },
            ];

            for (const sel of selections) {
              const outcomeData = h2hOutcomes.find(o => o.name === sel.name);
              const fair = fairValues.get(sel.name);
              
              if (!outcomeData || !fair || outcomeData.odds.length < 3) continue;
              
              const bestOdds = Math.max(...outcomeData.odds);
              
              // FILTER: Odds range 1.30 - 10.00
              if (bestOdds < 1.30 || bestOdds > 10.00) continue;
              
              const edge = ((bestOdds - fair.fairOdds) / fair.fairOdds) * 100;
              const ev = fair.fairProb * (bestOdds - 1) - (1 - fair.fairProb);
              
              // FILTER: Edge >= tier minimum, EV > 0
              if (edge < minEdge || ev <= 0) continue;
              
              // FILTER: Prefer EV >= 0.02 (2%)
              if (ev < 0.02) continue;
              
              const stake = calculateFractionalKelly(fair.fairProb, bestOdds);
              if (stake === 0) continue;
              
              // FILTER: Match exposure limit (3.5% max per match)
              const currentExposure = matchExposure.get(matchId) || 0;
              if (currentExposure + stake > 3.5) continue;
              matchExposure.set(matchId, currentExposure + stake);
              
              const confidence = determineConfidence(edge, outcomeData.bookmakers.length, bestOdds);
              
              let betResult = 'pending';
              let actualScore: string | null = null;
              let settledAt: string | null = null;
              
              if (result && sel.winner !== null) {
                betResult = sel.winner ? 'won' : 'lost';
                actualScore = `${result.home}-${result.away}`;
                settledAt = new Date().toISOString();
              }
              
              valueBets.push({
                match_id: matchId,
                market: '1x2',
                selection: sel.displayName,
                offered_odds: bestOdds,
                fair_odds: fair.fairOdds,
                implied_probability: 1 / bestOdds,
                actual_probability: fair.fairProb,
                expected_value: ev,
                edge: edge,
                confidence: confidence,
                min_odds: 1.30,
                suggested_stake_percent: stake,
                reasoning: `De-vigged edge: ${edge.toFixed(1)}%. Fair prob: ${(fair.fairProb * 100).toFixed(1)}%. Best: ${bestOdds.toFixed(2)} vs Fair: ${fair.fairOdds.toFixed(2)}. EV: ${(ev * 100).toFixed(1)}%. ${outcomeData.bookmakers.length} books. ${event.sport_title}`,
                meets_criteria: true,
                is_active: !result,
                result: betResult,
                actual_score: actualScore,
                settled_at: settledAt,
              });
            }
          }

          // Process totals market (Over/Under) with de-vigging
          if (result) {
            const totalGoals = result.home + result.away;
            const totalsOutcomes = extractTotalsOutcomeData(event);
            
            for (const [point, outcomes] of totalsOutcomes) {
              if (outcomes.over.odds.length < 3 || outcomes.under.odds.length < 3) continue;
              
              const allOutcomes: OutcomeData[] = [
                { name: 'Over', odds: outcomes.over.odds, sharpOdds: outcomes.over.sharpOdds, bookmakers: outcomes.over.bookmakers },
                { name: 'Under', odds: outcomes.under.odds, sharpOdds: outcomes.under.sharpOdds, bookmakers: outcomes.under.bookmakers }
              ];
              
              const fairValues = deVigOdds(allOutcomes);
              
              // Process Over
              const overFair = fairValues.get('Over');
              if (overFair) {
                const bestOverOdds = Math.max(...outcomes.over.odds);
                if (bestOverOdds >= 1.30 && bestOverOdds <= 10.00) {
                  const edge = ((bestOverOdds - overFair.fairOdds) / overFair.fairOdds) * 100;
                  const ev = overFair.fairProb * (bestOverOdds - 1) - (1 - overFair.fairProb);
                  
                  if (edge >= minEdge && ev >= 0.02) {
                    const stake = calculateFractionalKelly(overFair.fairProb, bestOverOdds);
                    const currentExposure = matchExposure.get(matchId) || 0;
                    
                    if (stake > 0 && currentExposure + stake <= 3.5) {
                      matchExposure.set(matchId, currentExposure + stake);
                      const confidence = determineConfidence(edge, outcomes.over.bookmakers.length, bestOverOdds);
                      
                      valueBets.push({
                        match_id: matchId,
                        market: 'over_under',
                        selection: `Over ${point}`,
                        offered_odds: bestOverOdds,
                        fair_odds: overFair.fairOdds,
                        implied_probability: 1 / bestOverOdds,
                        actual_probability: overFair.fairProb,
                        expected_value: ev,
                        edge: edge,
                        confidence: confidence,
                        min_odds: 1.30,
                        suggested_stake_percent: stake,
                        reasoning: `De-vigged Over ${point}. Edge: ${edge.toFixed(1)}%. EV: ${(ev * 100).toFixed(1)}%.`,
                        meets_criteria: true,
                        is_active: false,
                        result: totalGoals > point ? 'won' : 'lost',
                        actual_score: `${result.home}-${result.away}`,
                        settled_at: new Date().toISOString(),
                      });
                    }
                  }
                }
              }
              
              // Process Under
              const underFair = fairValues.get('Under');
              if (underFair) {
                const bestUnderOdds = Math.max(...outcomes.under.odds);
                if (bestUnderOdds >= 1.30 && bestUnderOdds <= 10.00) {
                  const edge = ((bestUnderOdds - underFair.fairOdds) / underFair.fairOdds) * 100;
                  const ev = underFair.fairProb * (bestUnderOdds - 1) - (1 - underFair.fairProb);
                  
                  if (edge >= minEdge && ev >= 0.02) {
                    const stake = calculateFractionalKelly(underFair.fairProb, bestUnderOdds);
                    const currentExposure = matchExposure.get(matchId) || 0;
                    
                    if (stake > 0 && currentExposure + stake <= 3.5) {
                      matchExposure.set(matchId, currentExposure + stake);
                      const confidence = determineConfidence(edge, outcomes.under.bookmakers.length, bestUnderOdds);
                      
                      valueBets.push({
                        match_id: matchId,
                        market: 'over_under',
                        selection: `Under ${point}`,
                        offered_odds: bestUnderOdds,
                        fair_odds: underFair.fairOdds,
                        implied_probability: 1 / bestUnderOdds,
                        actual_probability: underFair.fairProb,
                        expected_value: ev,
                        edge: edge,
                        confidence: confidence,
                        min_odds: 1.30,
                        suggested_stake_percent: stake,
                        reasoning: `De-vigged Under ${point}. Edge: ${edge.toFixed(1)}%. EV: ${(ev * 100).toFixed(1)}%.`,
                        meets_criteria: true,
                        is_active: false,
                        result: totalGoals < point ? 'won' : 'lost',
                        actual_score: `${result.home}-${result.away}`,
                        settled_at: new Date().toISOString(),
                      });
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport}:`, err);
      }
    }

    // Clear and insert
    console.log(`Clearing old data and inserting ${valueBets.length} value bets...`);
    await supabase.from('value_bets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (valueBets.length > 0) {
      const { error } = await supabase.from('value_bets').insert(valueBets);
      if (error) {
        console.error('Insert error:', error);
        throw error;
      }
    }

    const settled = valueBets.filter(b => b.result === 'won' || b.result === 'lost');
    const won = valueBets.filter(b => b.result === 'won');
    const avgEdge = valueBets.length > 0 ? valueBets.reduce((s, b) => s + b.edge, 0) / valueBets.length : 0;
    const avgEV = valueBets.length > 0 ? valueBets.reduce((s, b) => s + b.expected_value, 0) / valueBets.length : 0;
    
    return new Response(JSON.stringify({
      success: true,
      message: `Loaded ${valueBets.length} de-vigged value bets (${settled.length} settled, ${won.length} won)`,
      totalBets: valueBets.length,
      settledBets: settled.length,
      wonBets: won.length,
      winRate: settled.length > 0 ? `${((won.length / settled.length) * 100).toFixed(1)}%` : 'N/A',
      avgEdge: `${avgEdge.toFixed(1)}%`,
      avgEV: `${(avgEV * 100).toFixed(1)}%`,
      matchesWithResults: matchScores.size,
      strategy: 'De-vigged fair probabilities with 25% Kelly, 3-8% edge thresholds'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('.')[0] + 'Z';
}

function normalizeTeamKey(home: string, away: string): string {
  return `${home.toLowerCase().trim()}_${away.toLowerCase().trim()}`;
}

function extractOutcomeData(event: OddsEvent, marketKey: string): OutcomeData[] {
  const outcomeMap = new Map<string, OutcomeData>();
  
  for (const bm of event.bookmakers) {
    const market = bm.markets.find(m => m.key === marketKey);
    if (!market) continue;
    
    const isSharp = SHARP_BOOKS.includes(bm.key.toLowerCase());
    
    for (const outcome of market.outcomes) {
      let data = outcomeMap.get(outcome.name);
      if (!data) {
        data = { name: outcome.name, odds: [], sharpOdds: [], bookmakers: [] };
        outcomeMap.set(outcome.name, data);
      }
      
      data.odds.push(outcome.price);
      data.bookmakers.push(bm.title);
      
      if (isSharp) {
        data.sharpOdds.push(outcome.price);
      }
    }
  }
  
  return Array.from(outcomeMap.values());
}

function extractTotalsOutcomeData(event: OddsEvent): Map<number, { over: OutcomeData; under: OutcomeData }> {
  const totalsMap = new Map<number, { over: OutcomeData; under: OutcomeData }>();
  
  for (const bm of event.bookmakers) {
    const market = bm.markets.find(m => m.key === 'totals');
    if (!market) continue;
    
    const isSharp = SHARP_BOOKS.includes(bm.key.toLowerCase());
    
    for (const outcome of market.outcomes) {
      const point = outcome.point || 2.5;
      
      let data = totalsMap.get(point);
      if (!data) {
        data = {
          over: { name: 'Over', odds: [], sharpOdds: [], bookmakers: [] },
          under: { name: 'Under', odds: [], sharpOdds: [], bookmakers: [] }
        };
        totalsMap.set(point, data);
      }
      
      if (outcome.name === 'Over') {
        data.over.odds.push(outcome.price);
        data.over.bookmakers.push(bm.title);
        if (isSharp) data.over.sharpOdds.push(outcome.price);
      } else if (outcome.name === 'Under') {
        data.under.odds.push(outcome.price);
        data.under.bookmakers.push(bm.title);
        if (isSharp) data.under.sharpOdds.push(outcome.price);
      }
    }
  }
  
  return totalsMap;
}
