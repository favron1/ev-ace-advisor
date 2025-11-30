import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Parse request for optional date
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body.date || getDateDaysAgo(3);
    } catch {
      targetDate = getDateDaysAgo(3);
    }

    console.log(`Fetching historical odds for: ${targetDate}`);

    const sports = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga'];
    const valueBets: any[] = [];
    
    // Step 1: Fetch completed match scores (past 3 days)
    const matchScores = new Map<string, { home: number; away: number }>();
    
    for (const sport of sports) {
      try {
        // Try scores endpoint with daysFrom=3
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`;
        console.log(`Fetching scores for ${sport}: ${scoresUrl}`);
        
        const response = await fetch(scoresUrl);
        
        if (!response.ok) {
          const errText = await response.text();
          console.error(`Scores error ${sport}: ${response.status} - ${errText}`);
          
          // If scores endpoint fails, try to get from historical events endpoint
          // The historical endpoint includes completed events with scores
          continue;
        }
        
        const scores: ScoreEvent[] = await response.json();
        console.log(`Got ${scores.length} events from scores endpoint for ${sport}`);
        
        const completed = scores.filter(s => s.completed && s.scores);
        console.log(`${completed.length} completed with scores`);
        
        for (const match of completed) {
          const key = normalizeTeamKey(match.home_team, match.away_team);
          const homeScore = parseInt(match.scores!.find(s => s.name === match.home_team)?.score || '0');
          const awayScore = parseInt(match.scores!.find(s => s.name === match.away_team)?.score || '0');
          matchScores.set(key, { home: homeScore, away: awayScore });
          console.log(`Score: ${match.home_team} ${homeScore}-${awayScore} ${match.away_team}`);
        }
      } catch (err) {
        console.error(`Error fetching ${sport} scores:`, err);
      }
    }
    
    console.log(`Loaded ${matchScores.size} completed matches`);

    // Step 2: Try historical odds endpoint (paid tier), fallback to current odds
    for (const sport of sports) {
      try {
        // Try historical endpoint first
        const histUrl = `https://api.the-odds-api.com/v4/historical/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk,eu&markets=h2h,totals&oddsFormat=decimal&date=${targetDate}`;
        console.log(`Trying historical endpoint for ${sport}...`);
        
        let events: OddsEvent[] = [];
        const histResponse = await fetch(histUrl);
        
        if (histResponse.ok) {
          const histData: HistoricalApiResponse = await histResponse.json();
          events = histData.data || [];
          console.log(`Historical: Got ${events.length} events for ${sport}`);
        } else {
          // Fallback to current odds
          console.log(`Historical not available (${histResponse.status}), using current odds for ${sport}`);
          const currentUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk,eu&markets=h2h,totals&oddsFormat=decimal`;
          const currentResponse = await fetch(currentUrl);
          if (currentResponse.ok) {
            events = await currentResponse.json();
            console.log(`Current: Got ${events.length} events for ${sport}`);
          }
        }

        // Process each event
        for (const event of events) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;
          
          const matchKey = normalizeTeamKey(event.home_team, event.away_team);
          const result = matchScores.get(matchKey);
          
          // Create or find match record
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

          // Process H2H market
          const h2hOdds = extractOdds(event, 'h2h');
          
          const h2hSelections = [
            { 
              name: `${event.home_team} to win`, 
              odds: h2hOdds.get(event.home_team) || [],
              winner: result ? result.home > result.away : null
            },
            { 
              name: `${event.away_team} to win`, 
              odds: h2hOdds.get(event.away_team) || [],
              winner: result ? result.away > result.home : null
            },
            { 
              name: 'Draw', 
              odds: h2hOdds.get('Draw') || [],
              winner: result ? result.home === result.away : null
            },
          ];

          for (const sel of h2hSelections) {
            const bet = createValueBet(sel, matchId, '1x2', result, event);
            if (bet) valueBets.push(bet);
          }

          // Process totals market (if we have result)
          if (result) {
            const totalGoals = result.home + result.away;
            const totalsOdds = extractTotalsOdds(event);
            
            for (const [point, odds] of totalsOdds) {
              const overBet = createValueBet(
                { name: `Over ${point}`, odds: odds.over, winner: totalGoals > point },
                matchId, 'over_under', result, event
              );
              if (overBet) valueBets.push(overBet);
              
              const underBet = createValueBet(
                { name: `Under ${point}`, odds: odds.under, winner: totalGoals < point },
                matchId, 'over_under', result, event
              );
              if (underBet) valueBets.push(underBet);
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
    
    return new Response(JSON.stringify({
      success: true,
      message: `Loaded ${valueBets.length} value bets (${settled.length} settled, ${won.length} won)`,
      totalBets: valueBets.length,
      settledBets: settled.length,
      wonBets: won.length,
      winRate: settled.length > 0 ? `${((won.length / settled.length) * 100).toFixed(1)}%` : 'N/A',
      matchesWithResults: matchScores.size
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

function extractOdds(event: OddsEvent, marketKey: string): Map<string, number[]> {
  const oddsMap = new Map<string, number[]>();
  
  for (const bm of event.bookmakers) {
    const market = bm.markets.find(m => m.key === marketKey);
    if (!market) continue;
    
    for (const outcome of market.outcomes) {
      const existing = oddsMap.get(outcome.name) || [];
      existing.push(outcome.price);
      oddsMap.set(outcome.name, existing);
    }
  }
  
  return oddsMap;
}

function extractTotalsOdds(event: OddsEvent): Map<number, { over: number[]; under: number[] }> {
  const totalsMap = new Map<number, { over: number[]; under: number[] }>();
  
  for (const bm of event.bookmakers) {
    const market = bm.markets.find(m => m.key === 'totals');
    if (!market) continue;
    
    for (const outcome of market.outcomes) {
      const point = outcome.point || 2.5;
      const existing = totalsMap.get(point) || { over: [], under: [] };
      
      if (outcome.name === 'Over') {
        existing.over.push(outcome.price);
      } else if (outcome.name === 'Under') {
        existing.under.push(outcome.price);
      }
      
      totalsMap.set(point, existing);
    }
  }
  
  return totalsMap;
}

function createValueBet(
  sel: { name: string; odds: number[]; winner: boolean | null },
  matchId: string,
  market: string,
  result: { home: number; away: number } | undefined,
  event: OddsEvent
): any | null {
  if (sel.odds.length < 2) return null;
  
  const maxOdds = Math.max(...sel.odds);
  const avgOdds = sel.odds.reduce((a, b) => a + b, 0) / sel.odds.length;
  const fairOdds = avgOdds;
  const impliedProb = 1 / maxOdds;
  const actualProb = 1 / fairOdds;
  const edge = ((maxOdds - fairOdds) / fairOdds) * 100;
  const ev = (actualProb * (maxOdds - 1)) - (1 - actualProb);
  
  // Only include positive edge bets
  if (edge < 2 || ev < 0 || maxOdds < 1.3) return null;
  
  const confidence = edge > 10 ? 'high' : edge > 5 ? 'moderate' : 'low';
  
  let betResult: string = 'pending';
  let actualScore: string | null = null;
  let settledAt: string | null = null;
  
  if (result && sel.winner !== null) {
    betResult = sel.winner ? 'won' : 'lost';
    actualScore = `${result.home}-${result.away}`;
    settledAt = new Date().toISOString();
  }
  
  return {
    match_id: matchId,
    market: market,
    selection: sel.name,
    offered_odds: maxOdds,
    fair_odds: fairOdds,
    implied_probability: impliedProb,
    actual_probability: actualProb,
    expected_value: ev,
    edge: edge,
    confidence: confidence,
    min_odds: fairOdds,
    suggested_stake_percent: Math.min(edge * 0.5, 5),
    reasoning: `Edge: ${edge.toFixed(1)}%. Best odds: ${maxOdds.toFixed(2)} vs fair: ${fairOdds.toFixed(2)}. ${event.sport_title}`,
    meets_criteria: true,
    is_active: !result,
    result: betResult,
    actual_score: actualScore,
    settled_at: settledAt,
  };
}