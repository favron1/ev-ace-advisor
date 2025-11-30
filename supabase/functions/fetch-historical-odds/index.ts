import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHARP_BOOKS = ['pinnacle', 'pinnacle_us', 'betfair_ex_uk', 'matchbook', 'sbobet'];
const TIER_1_LEAGUES = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_france_ligue_one'];

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

interface OutcomeData {
  name: string;
  odds: number[];
  sharpOdds: number[];
  bookmakers: string[];
}

function deVigOdds(outcomes: OutcomeData[]): Map<string, { fairProb: number; fairOdds: number }> {
  const result = new Map<string, { fairProb: number; fairOdds: number }>();
  
  const hasSharpForAll = outcomes.every(o => o.sharpOdds.length > 0);
  
  let oddsToUse: { name: string; odds: number }[];
  
  if (hasSharpForAll) {
    oddsToUse = outcomes.map(o => ({
      name: o.name,
      odds: o.sharpOdds.reduce((a, b) => a + b, 0) / o.sharpOdds.length
    }));
  } else {
    oddsToUse = outcomes.map(o => {
      if (o.odds.length === 0) return { name: o.name, odds: 0 };
      const mean = o.odds.reduce((a, b) => a + b, 0) / o.odds.length;
      return { name: o.name, odds: mean };
    });
  }
  
  const rawProbs = oddsToUse.map(o => ({
    name: o.name,
    rawProb: o.odds > 0 ? 1 / o.odds : 0
  }));
  
  const overround = rawProbs.reduce((sum, p) => sum + p.rawProb, 0);
  if (overround === 0) return result;
  
  for (const p of rawProbs) {
    const fairProb = p.rawProb / overround;
    const fairOdds = fairProb > 0 ? 1 / fairProb : 0;
    result.set(p.name, { fairProb, fairOdds });
  }
  
  return result;
}

function calculateFractionalKelly(fairProb: number, bestOdds: number): number {
  const p = fairProb;
  const q = 1 - p;
  const b = bestOdds - 1;
  
  if (b <= 0) return 0;
  const kellyFull = (b * p - q) / b;
  if (kellyFull <= 0) return 0;
  
  const kellyFraction = kellyFull * 0.25;
  const stakePercent = kellyFraction * 100;
  
  return Math.max(0.25, Math.min(stakePercent, 1.5));
}

function determineConfidence(edge: number, bookCount: number, bestOdds: number): 'high' | 'moderate' | 'low' {
  let score = 0;
  if (edge >= 10) score += 3;
  else if (edge >= 5) score += 2;
  else if (edge >= 2) score += 1;
  if (bookCount >= 5) score += 2;
  else if (bookCount >= 3) score += 1;
  if (bestOdds >= 1.5 && bestOdds <= 5.0) score += 1;
  
  if (score >= 5) return 'high';
  if (score >= 3) return 'moderate';
  return 'low';
}

function normalizeTeamKey(home: string, away: string): string {
  return `${home.toLowerCase().trim()}|${away.toLowerCase().trim()}`;
}

function extractOutcomeData(event: OddsEvent, marketKey: string): OutcomeData[] {
  const outcomeMap = new Map<string, OutcomeData>();
  
  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find(m => m.key === marketKey);
    if (!market) continue;
    
    for (const outcome of market.outcomes) {
      if (!outcomeMap.has(outcome.name)) {
        outcomeMap.set(outcome.name, {
          name: outcome.name,
          odds: [],
          sharpOdds: [],
          bookmakers: []
        });
      }
      
      const data = outcomeMap.get(outcome.name)!;
      data.odds.push(outcome.price);
      data.bookmakers.push(bookmaker.key);
      
      if (SHARP_BOOKS.includes(bookmaker.key.toLowerCase())) {
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
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('=== STARTING HISTORICAL DATA FETCH ===');

    const sports = TIER_1_LEAGUES;
    const valueBets: any[] = [];
    const matchExposure = new Map<string, number>();
    const processedMatches = new Set<string>();
    
    // STEP 1: Fetch ALL completed matches from recent scores (last 3 days)
    const matchScores = new Map<string, { home: number; away: number; homeTeam: string; awayTeam: string }>();
    
    console.log('Fetching recent completed scores...');
    for (const sport of sports) {
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`;
        console.log(`Fetching ${sport} scores...`);
        
        const response = await fetch(scoresUrl);
        console.log(`${sport} scores response: ${response.status}`);
        
        if (!response.ok) {
          console.log(`${sport} scores failed: ${response.statusText}`);
          continue;
        }
        
        const scores: ScoreEvent[] = await response.json();
        const completed = scores.filter(s => s.completed && s.scores);
        console.log(`${sport}: ${completed.length} completed games with scores`);
        
        for (const match of completed) {
          const key = normalizeTeamKey(match.home_team, match.away_team);
          const homeScore = parseInt(match.scores!.find(s => s.name === match.home_team)?.score || '0');
          const awayScore = parseInt(match.scores!.find(s => s.name === match.away_team)?.score || '0');
          matchScores.set(key, { 
            home: homeScore, 
            away: awayScore,
            homeTeam: match.home_team,
            awayTeam: match.away_team
          });
        }
      } catch (err) {
        console.error(`Error fetching ${sport} scores:`, err);
      }
    }
    
    console.log(`Total completed matches with scores: ${matchScores.size}`);
    
    if (matchScores.size === 0) {
      console.log('No completed matches found, returning empty');
      return new Response(JSON.stringify({ 
        success: true, 
        betsFound: 0,
        message: 'No completed matches found in recent scores'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // STEP 2: For each completed match, try to get historical odds
    console.log('Fetching odds for completed matches...');
    
    for (const sport of sports) {
      try {
        // Get current/recent odds that might overlap with completed matches
        const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk,eu&markets=h2h&oddsFormat=decimal`;
        console.log(`Fetching ${sport} odds...`);
        
        const response = await fetch(oddsUrl);
        if (!response.ok) {
          console.log(`${sport} odds failed: ${response.statusText}`);
          continue;
        }
        
        const events: OddsEvent[] = await response.json();
        console.log(`${sport}: ${events.length} odds events`);
        
        for (const event of events) {
          if (valueBets.length >= 100) break;
          if (!event.bookmakers || event.bookmakers.length < 3) continue;
          
          const matchKey = normalizeTeamKey(event.home_team, event.away_team);
          if (processedMatches.has(matchKey)) continue;
          
          // Check if this match has completed scores
          const result = matchScores.get(matchKey);
          if (!result) continue;
          
          processedMatches.add(matchKey);
          console.log(`Found completed match: ${event.home_team} vs ${event.away_team} (${result.home}-${result.away})`);
          
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

          const h2hOutcomes = extractOutcomeData(event, 'h2h');
          
          if (h2hOutcomes.length >= 2 && h2hOutcomes.every(o => o.odds.length >= 2)) {
            const fairValues = deVigOdds(h2hOutcomes);
            
            const selections = [
              { name: event.home_team, displayName: `${event.home_team} to win`, winner: result.home > result.away },
              { name: event.away_team, displayName: `${event.away_team} to win`, winner: result.away > result.home },
              { name: 'Draw', displayName: 'Draw', winner: result.home === result.away },
            ];

            for (const sel of selections) {
              if (valueBets.length >= 100) break;
              
              const outcomeData = h2hOutcomes.find(o => o.name === sel.name);
              const fair = fairValues.get(sel.name);
              
              if (!outcomeData || !fair || outcomeData.odds.length < 2) continue;
              
              const bestOdds = Math.max(...outcomeData.odds);
              if (bestOdds < 1.20 || bestOdds > 15.00) continue;
              
              const edge = ((bestOdds - fair.fairOdds) / fair.fairOdds) * 100;
              const ev = fair.fairProb * (bestOdds - 1) - (1 - fair.fairProb);
              
              // LOWER threshold: edge >= 1% and EV > 0
              if (edge < 1 || ev <= 0) continue;
              
              const stake = calculateFractionalKelly(fair.fairProb, bestOdds);
              
              const currentExposure = matchExposure.get(matchId) || 0;
              if (currentExposure + stake > 5) continue;
              matchExposure.set(matchId, currentExposure + stake);
              
              const confidence = determineConfidence(edge, outcomeData.bookmakers.length, bestOdds);
              
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
                min_odds: 1.20,
                suggested_stake_percent: stake,
                reasoning: `De-vigged edge: ${edge.toFixed(1)}%. Fair prob: ${(fair.fairProb * 100).toFixed(1)}%. Best: ${bestOdds.toFixed(2)} vs Fair: ${fair.fairOdds.toFixed(2)}. EV: ${(ev * 100).toFixed(1)}%. ${outcomeData.bookmakers.length} books. ${event.sport_title}`,
                meets_criteria: true,
                is_active: false,
                result: sel.winner ? 'won' : 'lost',
                actual_score: `${result.home}-${result.away}`,
                settled_at: new Date().toISOString(),
              });
              
              console.log(`+ BET: ${sel.displayName} @ ${bestOdds.toFixed(2)} edge:${edge.toFixed(1)}% ${sel.winner ? 'WON' : 'LOST'}`);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing ${sport}:`, err);
      }
    }

    console.log(`\nTotal: ${valueBets.length} value bets with real results`);
    
    const wins = valueBets.filter(b => b.result === 'won').length;
    const losses = valueBets.filter(b => b.result === 'lost').length;
    console.log(`Results: ${wins} wins, ${losses} losses`);

    if (valueBets.length > 0) {
      await supabase.from('value_bets').delete().eq('is_active', false).not('result', 'is', null);
      
      const { error: insertError } = await supabase.from('value_bets').insert(valueBets);
      if (insertError) {
        console.error('Error inserting value bets:', insertError);
      } else {
        console.log(`Inserted ${valueBets.length} value bets`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      betsFound: valueBets.length,
      wins,
      losses,
      completedMatches: matchScores.size,
      winRate: valueBets.length > 0 ? ((wins / valueBets.length) * 100).toFixed(1) : 0,
      message: `Found ${valueBets.length} bets from ${matchScores.size} completed matches`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in fetch-historical-odds:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
