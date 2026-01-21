import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecheckInput {
  event_id: string;
  selection: string;
  market_id?: string;
  event_name?: string;
  league?: string;
  sport?: string;
  start_time?: string;
}

interface MatchResult {
  status: 'won' | 'lost' | 'void' | 'pending';
  actual_score?: string;
  home_score?: number;
  away_score?: number;
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

    // Event hasn't started yet - recheck only updates ODDS from current market
    // We preserve the original model values (bet_score, edge, confidence) from the calibrated model
    // The recheck should NOT regenerate the analysis - that would be inconsistent with the original recommendation
    
    // Get current odds if we have event data
    let currentOdds: number | null = null;
    let currentImpliedProb: number | null = null;
    let bookmaker = 'Unknown';

    if (event?.markets) {
      const relevantMarkets = event.markets.filter(
        (m: any) => m.selection === selection
      );

      if (relevantMarkets.length > 0) {
        const bestMarket = relevantMarkets.reduce((best: any, current: any) => {
          return parseFloat(current.odds_decimal) > parseFloat(best.odds_decimal) ? current : best;
        }, relevantMarkets[0]);

        currentOdds = parseFloat(bestMarket.odds_decimal);
        currentImpliedProb = 1 / currentOdds;
        bookmaker = bestMarket.bookmaker;
      }
    }

    // If we found updated odds, return them - but DO NOT change model values
    if (currentOdds !== null) {
      console.log('=== RECHECK BET COMPLETE - Odds Updated ===');
      console.log('New odds:', currentOdds, 'from', bookmaker);

      return new Response(
        JSON.stringify({
          updated_odds: {
            odds_decimal: currentOdds,
            implied_probability: currentImpliedProb,
            bookmaker,
          },
          message: `Odds updated: ${currentOdds.toFixed(2)} @ ${bookmaker}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No odds update available - just confirm the bet is still valid
    console.log('=== RECHECK BET COMPLETE - No Updates ===');
    console.log('Could not find updated odds, keeping original values');

    return new Response(
      JSON.stringify({
        updated_odds: null,
        message: 'No updated odds found - original values preserved'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in recheck-bet:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
