import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sharp bookmakers - same as analyze-value-bets
const SHARP_BOOKS = ['pinnacle', 'pinnacle_us', 'betfair_ex_uk', 'matchbook', 'sbobet'];

// League tiers for edge thresholds (same as original model)
const TIER_1_LEAGUES = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_france_ligue_one'];
const TIER_2_LEAGUES = ['soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_belgium_first_div'];

interface RecheckInput {
  event_id: string;
  selection: string;
  market_id?: string;
  event_name?: string;
  league?: string;
  sport?: string;
  start_time?: string;
  original_model_probability?: number;
}

interface MatchResult {
  status: 'won' | 'lost' | 'void' | 'pending';
  actual_score?: string;
  home_score?: number;
  away_score?: number;
}

interface OutcomeData {
  name: string;
  odds: number[];
  sharpOdds: number[];
  bookmakers: string[];
  bestOdds: number;
  bestBookmaker: string;
}

// De-vig odds to get fair probabilities (same logic as analyze-value-bets)
function deVigOdds(outcomes: OutcomeData[]): Map<string, { fairProb: number; fairOdds: number }> {
  const result = new Map<string, { fairProb: number; fairOdds: number }>();
  
  let oddsToUse: { name: string; odds: number }[] = [];
  const hasSharpForAll = outcomes.every(o => o.sharpOdds.length > 0);
  
  if (hasSharpForAll) {
    oddsToUse = outcomes.map(o => ({
      name: o.name,
      odds: o.sharpOdds.reduce((a, b) => a + b, 0) / o.sharpOdds.length
    }));
  } else {
    oddsToUse = outcomes.map(o => {
      if (o.odds.length === 0) return { name: o.name, odds: 0 };
      const mean = o.odds.reduce((a, b) => a + b, 0) / o.odds.length;
      const stdDev = Math.sqrt(o.odds.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / o.odds.length);
      const filtered = o.odds.filter(odd => Math.abs(odd - mean) <= 2 * stdDev);
      return {
        name: o.name,
        odds: filtered.length > 0 ? filtered.reduce((a, b) => a + b, 0) / filtered.length : mean
      };
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

// Calculate fractional Kelly stake with caps (same as original)
function calculateFractionalKelly(fairProb: number, bestOdds: number): number {
  const p = fairProb;
  const q = 1 - p;
  const b = bestOdds - 1;
  
  if (b <= 0) return 0;
  const kellyFull = (b * p - q) / b;
  if (kellyFull <= 0) return 0;
  
  const kellyFraction = kellyFull * 0.25;
  const stakePercent = kellyFraction * 100;
  
  if (stakePercent < 0.25) return 0.25;
  return Math.min(stakePercent, 1.5);
}

// Determine confidence based on edge (same logic as original)
function determineConfidence(edge: number, bookCount: number, bestOdds: number, hasSharp: boolean): 'high' | 'medium' | 'low' {
  const hasGoodLiquidity = bookCount >= 4;
  const hasGreatLiquidity = bookCount >= 6;
  const inOptimalOddsRange = bestOdds >= 1.5 && bestOdds <= 6.0;
  
  if (edge >= 12) return 'high';
  if (edge >= 8) return (hasSharp || hasGoodLiquidity || inOptimalOddsRange) ? 'high' : 'medium';
  if (edge >= 5) {
    if (hasSharp && hasGreatLiquidity && inOptimalOddsRange) return 'high';
    return 'medium';
  }
  if (edge >= 3) return (hasSharp || hasGoodLiquidity) ? 'medium' : 'low';
  return 'low';
}

// Calculate bet score (same formula as original model)
function calculateBetScore(edge: number, confidence: 'high' | 'medium' | 'low', bookCount: number): number {
  // Base score from edge (edge of 10% = 70 base score)
  const baseScore = Math.min(50 + (edge * 3), 85);
  
  // Confidence bonus
  const confidenceBonus = confidence === 'high' ? 10 : confidence === 'medium' ? 5 : 0;
  
  // Liquidity bonus (more books = more reliable)
  const liquidityBonus = Math.min(bookCount, 5);
  
  return Math.round(Math.min(baseScore + confidenceBonus + liquidityBonus, 100));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const input: RecheckInput = await req.json();
    const { event_id, selection, event_name, league, sport, start_time } = input;

    console.log('=== RECHECK BET START ===');
    console.log('Input:', { event_id, selection, event_name, league, sport, start_time });

    // First try to use start_time from input (passed from frontend)
    let event = null;
    let homeTeam = '';
    let awayTeam = '';
    let eventStartTime: Date | null = start_time ? new Date(start_time) : null;
    let detectedSport = sport || 'soccer';

    if (event_id && event_id !== event_name) {
      const { data: eventData } = await supabase
        .from('events')
        .select(`*, markets (*)`)
        .eq('id', event_id)
        .single();
      
      if (eventData) {
        event = eventData;
        homeTeam = event.home_team;
        awayTeam = event.away_team;
        if (!eventStartTime) {
          eventStartTime = new Date(event.start_time_utc);
        }
        detectedSport = event.sport || detectedSport;
      }
    }

    // If no event found, parse from event_name
    if (!event && event_name) {
      const parts = event_name.split(' vs ');
      if (parts.length === 2) {
        homeTeam = parts[0].trim();
        awayTeam = parts[1].trim();
      }
    }

    if (!homeTeam || !awayTeam) {
      return new Response(
        JSON.stringify({ 
          message: 'Could not determine teams from event',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    
    // Check if event has started (assume match is ~2 hours long)
    const matchDurationMs = 2 * 60 * 60 * 1000; // 2 hours
    const eventHasStarted = eventStartTime ? eventStartTime < now : false;
    const eventLikelyFinished = eventStartTime ? (now.getTime() - eventStartTime.getTime() > matchDurationMs) : false;

    console.log('Event timing:', { eventHasStarted, eventLikelyFinished, eventStartTime: eventStartTime?.toISOString() });

    // If event has likely finished, check for results via the-odds-api
    if (eventLikelyFinished && oddsApiKey) {
      console.log('Event likely finished, checking results...');
      console.log('Detected sport:', detectedSport, 'League:', league);
      
      // Get completed scores from the-odds-api
      const leagueMap: Record<string, string> = {
        // Soccer
        'EPL': 'soccer_epl',
        'La Liga': 'soccer_spain_la_liga',
        'Serie A': 'soccer_italy_serie_a',
        'Bundesliga': 'soccer_germany_bundesliga',
        'Ligue 1': 'soccer_france_ligue_one',
        'A-League': 'soccer_australia_aleague',
        'MLS': 'soccer_usa_mls',
        'Argentina Primera': 'soccer_argentina_primera_division',
        // Tennis
        'ATP Australian Open': 'tennis_atp_aus_open_singles',
        'WTA Australian Open': 'tennis_wta_aus_open_singles',
        'ATP French Open': 'tennis_atp_french_open',
        'WTA French Open': 'tennis_wta_french_open',
        'ATP Wimbledon': 'tennis_atp_wimbledon',
        'WTA Wimbledon': 'tennis_wta_wimbledon',
        'ATP US Open': 'tennis_atp_us_open',
        'WTA US Open': 'tennis_wta_us_open',
        // Basketball
        'NBA': 'basketball_nba',
        'Euroleague': 'basketball_euroleague',
      };

      // Determine sport key - try league map first, then fall back to sport-based default
      let sportKey = leagueMap[league || ''];
      if (!sportKey) {
        if (detectedSport === 'tennis') {
          // Default to ATP Australian Open for tennis if no specific league
          sportKey = 'tennis_atp_aus_open_singles';
        } else if (detectedSport === 'basketball') {
          sportKey = 'basketball_nba';
        } else {
          sportKey = 'soccer_epl';
        }
      }

      console.log('Using sport key:', sportKey);
      
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${oddsApiKey}&daysFrom=3`;
        const scoresRes = await fetch(scoresUrl);
        
        if (scoresRes.ok) {
          const scores = await scoresRes.json();
          console.log(`Fetched ${scores.length} scores for ${sportKey}`);

          // Find matching game - improved matching for tennis (uses last names)
          const matchingGame = scores.find((game: any) => {
            if (!game.completed || !game.scores) return false;
            
            // For tennis, match on last names since formatting varies
            const isTennis = detectedSport === 'tennis' || sportKey.includes('tennis');
            
            if (isTennis) {
              // Get last names for comparison
              const gameHomeLastName = game.home_team.split(' ').pop()?.toLowerCase() || '';
              const gameAwayLastName = game.away_team.split(' ').pop()?.toLowerCase() || '';
              const ourHomeLastName = homeTeam.split(' ').pop()?.toLowerCase() || '';
              const ourAwayLastName = awayTeam.split(' ').pop()?.toLowerCase() || '';
              
              // Check if last names match (in either order)
              const matchFound = 
                (gameHomeLastName === ourHomeLastName && gameAwayLastName === ourAwayLastName) ||
                (gameHomeLastName === ourAwayLastName && gameAwayLastName === ourHomeLastName) ||
                (gameHomeLastName.includes(ourHomeLastName) && gameAwayLastName.includes(ourAwayLastName)) ||
                (ourHomeLastName.includes(gameHomeLastName) && ourAwayLastName.includes(gameAwayLastName));
              
              if (matchFound) {
                console.log('Tennis match found:', { gameHomeLastName, gameAwayLastName, ourHomeLastName, ourAwayLastName });
              }
              return matchFound;
            }
            
            // Soccer/basketball matching (existing logic)
            const homeMatch = game.home_team.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) ||
                             homeTeam.toLowerCase().includes(game.home_team.toLowerCase().split(' ')[0]);
            const awayMatch = game.away_team.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0]) ||
                             awayTeam.toLowerCase().includes(game.away_team.toLowerCase().split(' ')[0]);
            
            return homeMatch && awayMatch;
          });

          if (matchingGame) {
            console.log('Found matching completed game:', JSON.stringify(matchingGame));
            
            const homeScore = matchingGame.scores.find((s: any) => s.name === matchingGame.home_team)?.score;
            const awayScore = matchingGame.scores.find((s: any) => s.name === matchingGame.away_team)?.score;
            
            if (homeScore !== undefined && awayScore !== undefined) {
              const hScore = parseInt(homeScore);
              const aScore = parseInt(awayScore);
              
              // Determine actual winner (for tennis, this is set score)
              let actualWinner = 'Draw';
              let gameWinner = matchingGame.home_team;
              if (hScore > aScore) {
                actualWinner = homeTeam;
                gameWinner = matchingGame.home_team;
              } else if (aScore > hScore) {
                actualWinner = awayTeam;
                gameWinner = matchingGame.away_team;
              }

              console.log('Score analysis:', { hScore, aScore, actualWinner, gameWinner, selection });
              
              // Check if our selection won
              let result: MatchResult['status'] = 'pending';
              
              // Handle different selection formats
              const selLower = selection.toLowerCase();
              
              // For tennis - match on last name
              const isTennis = detectedSport === 'tennis' || sportKey.includes('tennis');
              const selectionLastName = selection.split(' ').pop()?.toLowerCase() || '';
              const gameWinnerLastName = gameWinner.split(' ').pop()?.toLowerCase() || '';
              
              if (isTennis) {
                // Tennis: compare last names
                const homeLastName = homeTeam.split(' ').pop()?.toLowerCase() || '';
                const awayLastName = awayTeam.split(' ').pop()?.toLowerCase() || '';
                
                const selectedHome = selectionLastName === homeLastName || selLower.includes(homeLastName);
                const selectedAway = selectionLastName === awayLastName || selLower.includes(awayLastName);
                const winnerIsHome = gameWinnerLastName === matchingGame.home_team.split(' ').pop()?.toLowerCase();
                
                if (selectedHome) {
                  result = winnerIsHome && hScore > aScore ? 'won' : 'lost';
                } else if (selectedAway) {
                  result = !winnerIsHome && aScore > hScore ? 'won' : 'lost';
                }
                
                console.log('Tennis result:', { selectionLastName, gameWinnerLastName, selectedHome, selectedAway, winnerIsHome, result });
              } else {
                // Soccer/basketball logic
                const isHomeSelection = selLower.includes(homeTeam.toLowerCase().split(' ')[0]) || 
                                       homeTeam.toLowerCase().includes(selLower.split(' ')[0]);
                const isAwaySelection = selLower.includes(awayTeam.toLowerCase().split(' ')[0]) ||
                                       awayTeam.toLowerCase().includes(selLower.split(' ')[0]);
                const isDrawSelection = selLower === 'draw' || selLower === 'x';
                
                if (isHomeSelection) {
                  result = actualWinner === homeTeam ? 'won' : 'lost';
                } else if (isAwaySelection) {
                  result = actualWinner === awayTeam ? 'won' : 'lost';
                } else if (isDrawSelection) {
                  result = hScore === aScore ? 'won' : 'lost';
                } else if (selLower.includes('over') || selLower.includes('under')) {
                  // Handle over/under
                  const totalGoals = hScore + aScore;
                  const lineMatch = selection.match(/(\d+\.?\d*)/);
                  if (lineMatch) {
                    const line = parseFloat(lineMatch[1]);
                    if (selLower.includes('over')) {
                      result = totalGoals > line ? 'won' : 'lost';
                    } else {
                      result = totalGoals < line ? 'won' : 'lost';
                    }
                  }
                } else if (selLower === 'btts yes' || selLower === 'both teams to score - yes') {
                  result = (hScore > 0 && aScore > 0) ? 'won' : 'lost';
                } else if (selLower === 'btts no' || selLower === 'both teams to score - no') {
                  result = (hScore === 0 || aScore === 0) ? 'won' : 'lost';
                }
              }

              console.log('Result determined:', { result, actualWinner, selection, hScore, aScore });

              return new Response(
                JSON.stringify({
                  updated_bet: null,
                  result: {
                    status: result,
                    actual_score: `${hScore}-${aScore}`,
                    home_score: hScore,
                    away_score: aScore,
                    winner: actualWinner,
                  },
                  message: result === 'won' ? '✅ Bet won!' : result === 'lost' ? '❌ Bet lost' : 'Match completed'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            console.log('No matching completed game found in scores');
          }
        }
      } catch (scoreError) {
        console.error('Error fetching scores:', scoreError);
      }
    }

    // If event has started but not finished, return message
    if (eventHasStarted && !eventLikelyFinished) {
      return new Response(
        JSON.stringify({ 
          message: 'Match is currently in progress',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= EVENT HASN'T STARTED - FETCH FRESH ODDS FROM THE-ODDS-API =============
    // Use the SAME logic as the original model to calculate fair probability, edge, bet score
    
    if (!oddsApiKey) {
      return new Response(
        JSON.stringify({ 
          message: 'Cannot recheck - odds API not configured',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Event not started, fetching fresh odds from the-odds-api...');

    // Map league to sport key
    const leagueToSportKey: Record<string, string> = {
      'EPL': 'soccer_epl',
      'La Liga': 'soccer_spain_la_liga',
      'Serie A': 'soccer_italy_serie_a',
      'Bundesliga': 'soccer_germany_bundesliga',
      'Ligue 1': 'soccer_france_ligue_one',
      'A-League': 'soccer_australia_aleague',
      'MLS': 'soccer_usa_mls',
      'Primera División - Argentina': 'soccer_argentina_primera_division',
      'Argentina Primera': 'soccer_argentina_primera_division',
      'Eredivisie': 'soccer_netherlands_eredivisie',
      'Primeira Liga': 'soccer_portugal_primeira_liga',
    };

    let sportKey = leagueToSportKey[league || ''] || 'soccer_epl';
    console.log('Using sport key:', sportKey, 'for league:', league);

    try {
      // Fetch current odds for this sport
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${oddsApiKey}&regions=au,uk,eu&markets=h2h&oddsFormat=decimal`;
      const oddsRes = await fetch(oddsUrl);
      
      if (!oddsRes.ok) {
        console.error('Odds API error:', await oddsRes.text());
        throw new Error('Failed to fetch odds');
      }

      const events = await oddsRes.json();
      console.log(`Fetched ${events.length} events for ${sportKey}`);

      // Find matching event
      const matchingEvent = events.find((e: any) => {
        const homeMatch = e.home_team.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) ||
                         homeTeam.toLowerCase().includes(e.home_team.toLowerCase().split(' ')[0]);
        const awayMatch = e.away_team.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0]) ||
                         awayTeam.toLowerCase().includes(e.away_team.toLowerCase().split(' ')[0]);
        return homeMatch && awayMatch;
      });

      if (!matchingEvent) {
        console.log('No matching event found in odds API');
        return new Response(
          JSON.stringify({
            updated_bet: null,
            message: 'Event not found in current odds - may have started or finished'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Found matching event:', matchingEvent.home_team, 'vs', matchingEvent.away_team);

      // Extract outcome data (same logic as analyze-value-bets)
      const outcomeMap = new Map<string, OutcomeData>();
      
      for (const bm of matchingEvent.bookmakers || []) {
        const market = bm.markets?.find((m: any) => m.key === 'h2h');
        if (!market) continue;
        
        for (const outcome of market.outcomes || []) {
          const existing: OutcomeData = outcomeMap.get(outcome.name) || {
            name: outcome.name,
            odds: [] as number[],
            sharpOdds: [] as number[],
            bookmakers: [] as string[],
            bestOdds: 0,
            bestBookmaker: ''
          };
          
          (existing.odds as number[]).push(outcome.price);
          (existing.bookmakers as string[]).push(bm.key);
          
          if (SHARP_BOOKS.includes(bm.key)) {
            (existing.sharpOdds as number[]).push(outcome.price);
          }
          
          if (outcome.price > existing.bestOdds) {
            existing.bestOdds = outcome.price;
            existing.bestBookmaker = bm.title || bm.key;
          }
          
          outcomeMap.set(outcome.name, existing);
        }
      }

      const outcomes = Array.from(outcomeMap.values());
      
      if (outcomes.length === 0) {
        return new Response(
          JSON.stringify({
            updated_bet: null,
            message: 'No odds available for this event'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // De-vig to get fair probabilities (SAME LOGIC AS ORIGINAL MODEL)
      const fairProbabilities = deVigOdds(outcomes);
      
      // Find the outcome that matches our selection
      let matchedOutcome: OutcomeData | null = null;
      const selLower = selection.toLowerCase();
      
      for (const outcome of outcomes) {
        const outcomeLower = outcome.name.toLowerCase();
        if (outcomeLower === selLower || 
            selLower.includes(outcomeLower.split(' ')[0]) ||
            outcomeLower.includes(selLower.split(' ')[0])) {
          matchedOutcome = outcome;
          break;
        }
      }

      if (!matchedOutcome) {
        console.log('Could not match selection to outcome:', selection);
        return new Response(
          JSON.stringify({
            updated_bet: null,
            message: `Selection "${selection}" not found in current market`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fairData = fairProbabilities.get(matchedOutcome.name);
      if (!fairData) {
        return new Response(
          JSON.stringify({
            updated_bet: null,
            message: 'Could not calculate fair probability'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const bestOdds = matchedOutcome.bestOdds;
      const bestBookmaker = matchedOutcome.bestBookmaker;
      const impliedProb = 1 / bestOdds;
      const fairProb = fairData.fairProb;
      const fairOdds = fairData.fairOdds;
      
      // Edge = (best odds / fair odds - 1) as percentage (same formula)
      const edge = ((bestOdds / fairOdds) - 1) * 100;
      const hasSharp = matchedOutcome.sharpOdds.length > 0;
      const bookCount = matchedOutcome.bookmakers.length;
      
      // Calculate confidence and bet score using SAME LOGIC
      const confidence = determineConfidence(edge, bookCount, bestOdds, hasSharp);
      const betScore = calculateBetScore(edge, confidence, bookCount);
      
      // Calculate Kelly stake
      const kellyStake = calculateFractionalKelly(fairProb, bestOdds);

      console.log('=== RECHECK COMPLETE ===');
      console.log({
        selection: matchedOutcome.name,
        bestOdds,
        bestBookmaker,
        fairOdds: fairOdds.toFixed(2),
        fairProb: (fairProb * 100).toFixed(1) + '%',
        edge: edge.toFixed(1) + '%',
        confidence,
        betScore,
        kellyStake: kellyStake.toFixed(2) + 'u'
      });

      const updatedBet = {
        event_id: matchingEvent.id,
        market_id: input.market_id || '',
        sport: detectedSport,
        league: league || '',
        event_name: `${matchingEvent.home_team} vs ${matchingEvent.away_team}`,
        start_time: matchingEvent.commence_time,
        selection: matchedOutcome.name,
        selection_label: matchedOutcome.name,
        odds_decimal: bestOdds,
        bookmaker: bestBookmaker,
        model_probability: fairProb,
        implied_probability: impliedProb,
        edge: edge / 100,  // Store as decimal
        bet_score: betScore,
        confidence,
        recommended_stake_units: kellyStake,
        rationale: `Rechecked: Fair ${(fairProb * 100).toFixed(0)}% vs Implied ${(impliedProb * 100).toFixed(0)}%. ${hasSharp ? 'Sharp line used.' : ''} ${bookCount} books.`,
      };

      return new Response(
        JSON.stringify({
          updated_bet: updatedBet,
          message: `Updated: ${bestOdds.toFixed(2)} @ ${bestBookmaker}, Edge ${edge.toFixed(1)}%, Score ${betScore}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (oddsError) {
      console.error('Error fetching fresh odds:', oddsError);
      return new Response(
        JSON.stringify({
          updated_bet: null,
          message: 'Could not fetch updated odds'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in recheck-bet:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
