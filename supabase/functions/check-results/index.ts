import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!ODDS_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending bets from bet_history
    const { data: pendingBets, error: fetchError } = await supabase
      .from('bet_history')
      .select('*')
      .eq('status', 'pending');

    if (fetchError) {
      console.error('Error fetching pending bet_history:', fetchError);
    }

    // Fetch pending bets from user_bets (new!)
    const { data: pendingUserBets, error: userBetsError } = await supabase
      .from('user_bets')
      .select('*')
      .eq('status', 'pending');

    if (userBetsError) {
      console.error('Error fetching pending user_bets:', userBetsError);
    }

    // Also fetch pending value_bets for simulation tracking
    const { data: pendingValueBets, error: valueBetsError } = await supabase
      .from('value_bets')
      .select(`
        id,
        selection,
        market,
        match_id,
        matches (
          id,
          home_team,
          away_team,
          match_date,
          league
        )
      `)
      .eq('result', 'pending')
      .not('match_id', 'is', null);

    if (valueBetsError) {
      console.error('Error fetching pending value bets:', valueBetsError);
    }

    console.log(`Found ${pendingBets?.length || 0} pending bet_history entries`);
    console.log(`Found ${pendingUserBets?.length || 0} pending user_bets entries`);
    console.log(`Found ${pendingValueBets?.length || 0} pending value_bets entries`);

    const hasPendingBets = 
      (pendingBets && pendingBets.length > 0) || 
      (pendingUserBets && pendingUserBets.length > 0) ||
      (pendingValueBets && pendingValueBets.length > 0);

    if (!hasPendingBets) {
      return new Response(JSON.stringify({ 
        message: 'No pending bets to check',
        updated: 0,
        userBetsUpdated: 0,
        valueBetsUpdated: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Expanded leagues to cover more matches including Argentina and Australia
    const leagues = [
      // Soccer
      'soccer_epl',
      'soccer_spain_la_liga',
      'soccer_spain_segunda_division',
      'soccer_germany_bundesliga',
      'soccer_italy_serie_a',
      'soccer_france_ligue_one',
      'soccer_argentina_primera_division',
      'soccer_australia_aleague',
      'soccer_belgium_first_div',
      'soccer_netherlands_eredivisie',
      'soccer_portugal_primeira_liga',
      'soccer_brazil_serie_a',
      // Tennis
      'tennis_atp_aus_open',
      'tennis_wta_aus_open',
      // Basketball
      'basketball_nba',
      'basketball_nbl',
    ];
    
    let allScores: ScoreEvent[] = [];

    for (const league of leagues) {
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${league}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`;
        console.log(`Fetching scores for ${league}...`);
        
        const response = await fetch(scoresUrl);
        if (response.ok) {
          const scores: ScoreEvent[] = await response.json();
          const completedScores = scores.filter(s => s.completed && s.scores);
          console.log(`Got ${completedScores.length} completed matches for ${league}`);
          allScores = [...allScores, ...completedScores];
        }
      } catch (e) {
        console.error(`Error fetching scores for ${league}:`, e);
      }
    }

    console.log(`Total completed matches with scores: ${allScores.length}`);

    let updatedCount = 0;
    const results: { id: string; status: string; profit_loss: number }[] = [];

    // Helper function to normalize team names for matching
    const normalizeTeamName = (name: string): string => {
      return name.toLowerCase()
        .replace(/\s+(fc|cf|sc|ac|afc|united|city|town)$/i, '')
        .replace(/^(fc|cf|sc|ac|afc)\s+/i, '')
        .trim();
    };

    // Helper to find matching game
    const findMatchingGame = (eventName: string, scores: ScoreEvent[]): ScoreEvent | undefined => {
      const eventLower = eventName.toLowerCase();
      
      return scores.find(game => {
        const homeNorm = normalizeTeamName(game.home_team);
        const awayNorm = normalizeTeamName(game.away_team);
        
        // Check if event contains both team names
        const hasHome = eventLower.includes(homeNorm) || eventLower.includes(game.home_team.toLowerCase());
        const hasAway = eventLower.includes(awayNorm) || eventLower.includes(game.away_team.toLowerCase());
        
        // Also check partial matches for first word
        const homeFirst = game.home_team.split(' ')[0].toLowerCase();
        const awayFirst = game.away_team.split(' ')[0].toLowerCase();
        const hasHomePartial = eventLower.includes(homeFirst) && homeFirst.length > 3;
        const hasAwayPartial = eventLower.includes(awayFirst) && awayFirst.length > 3;
        
        return (hasHome || hasHomePartial) && (hasAway || hasAwayPartial);
      });
    };

    // Helper to determine if bet won
    const determineBetResult = (
      selection: string, 
      homeTeam: string, 
      awayTeam: string, 
      homeScore: number, 
      awayScore: number
    ): boolean => {
      const sel = selection.toLowerCase();
      const homeLower = homeTeam.toLowerCase();
      const awayLower = awayTeam.toLowerCase();
      const homeFirst = homeTeam.split(' ')[0].toLowerCase();
      const awayFirst = awayTeam.split(' ')[0].toLowerCase();
      
      // Check for draw
      if (sel === 'draw' || sel === 'x') {
        return homeScore === awayScore;
      }
      
      // Check for home win
      if (sel === 'home' || sel.includes(homeLower) || sel.includes(homeFirst)) {
        return homeScore > awayScore;
      }
      
      // Check for away win
      if (sel === 'away' || sel.includes(awayLower) || sel.includes(awayFirst)) {
        return awayScore > homeScore;
      }
      
      // Check for over/under
      const totalGoals = homeScore + awayScore;
      if (sel.includes('over 2.5') || sel === 'over') {
        return totalGoals > 2.5;
      }
      if (sel.includes('under 2.5')) {
        return totalGoals < 2.5;
      }
      if (sel.includes('over 1.5')) {
        return totalGoals > 1.5;
      }
      if (sel.includes('under 1.5')) {
        return totalGoals < 1.5;
      }
      
      // Check for BTTS
      if (sel.includes('btts yes') || sel === 'btts') {
        return homeScore > 0 && awayScore > 0;
      }
      if (sel.includes('btts no')) {
        return homeScore === 0 || awayScore === 0;
      }
      
      return false;
    };

    // Check bet_history entries
    if (pendingBets && pendingBets.length > 0) {
      for (const bet of pendingBets) {
        const matchingGame = findMatchingGame(bet.match_description, allScores);

        if (matchingGame && matchingGame.scores) {
          const homeScore = parseInt(matchingGame.scores.find(s => s.name === matchingGame.home_team)?.score || '0');
          const awayScore = parseInt(matchingGame.scores.find(s => s.name === matchingGame.away_team)?.score || '0');
          
          console.log(`Match found: ${matchingGame.home_team} ${homeScore} - ${awayScore} ${matchingGame.away_team}`);
          console.log(`Bet selection: ${bet.selection}`);

          const betWon = determineBetResult(bet.selection, matchingGame.home_team, matchingGame.away_team, homeScore, awayScore);
          const status = betWon ? 'won' : 'lost';
          const profitLoss = betWon ? (bet.stake * bet.odds) - bet.stake : -bet.stake;

          console.log(`Bet ${bet.id}: ${status}, profit/loss: ${profitLoss}`);

          const { error: updateError } = await supabase
            .from('bet_history')
            .update({
              status,
              profit_loss: profitLoss,
              settled_at: new Date().toISOString()
            })
            .eq('id', bet.id);

          if (updateError) {
            console.error(`Error updating bet ${bet.id}:`, updateError);
          } else {
            updatedCount++;
            results.push({ id: bet.id, status, profit_loss: profitLoss });
            
            // Update user profile statistics
            const { data: userStats } = await supabase
              .from('bet_history')
              .select('stake, profit_loss, status')
              .eq('user_id', bet.user_id)
              .neq('status', 'pending');
            
            if (userStats) {
              const totalBets = userStats.length;
              const totalWins = userStats.filter(b => b.status === 'won').length;
              const totalProfit = userStats.reduce((sum, b) => sum + (b.profit_loss || 0), 0);
              
              await supabase
                .from('profiles')
                .update({
                  total_bets: totalBets,
                  total_wins: totalWins,
                  total_profit: totalProfit,
                  bankroll: 1000 + totalProfit,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', bet.user_id);
            }
          }
        }
      }
    }

    // Check user_bets entries (NEW!)
    let userBetsUpdated = 0;
    if (pendingUserBets && pendingUserBets.length > 0) {
      for (const bet of pendingUserBets) {
        // Check if match has started + 2 hours (likely finished)
        if (bet.start_time) {
          const startTime = new Date(bet.start_time).getTime();
          const now = Date.now();
          const twoHoursMs = 2 * 60 * 60 * 1000;
          
          if (now < startTime + twoHoursMs) {
            console.log(`Skipping user_bet ${bet.id}: match not yet finished`);
            continue;
          }
        }
        
        const matchingGame = findMatchingGame(bet.event_name, allScores);

        if (matchingGame && matchingGame.scores) {
          const homeScore = parseInt(matchingGame.scores.find(s => s.name === matchingGame.home_team)?.score || '0');
          const awayScore = parseInt(matchingGame.scores.find(s => s.name === matchingGame.away_team)?.score || '0');
          
          console.log(`User bet match found: ${matchingGame.home_team} ${homeScore} - ${awayScore} ${matchingGame.away_team}`);
          console.log(`Bet selection: ${bet.selection}`);

          const betWon = determineBetResult(bet.selection, matchingGame.home_team, matchingGame.away_team, homeScore, awayScore);
          const status = betWon ? 'won' : 'lost';
          const stakeUnits = bet.stake_units || 1;
          const profitLoss = betWon ? stakeUnits * (bet.odds - 1) : -stakeUnits;

          console.log(`User bet ${bet.id}: ${status}, profit/loss: ${profitLoss}`);

          const { error: updateError } = await supabase
            .from('user_bets')
            .update({
              status,
              profit_loss: profitLoss,
              settled_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', bet.id);

          if (updateError) {
            console.error(`Error updating user_bet ${bet.id}:`, updateError);
          } else {
            userBetsUpdated++;
            results.push({ id: bet.id, status, profit_loss: profitLoss });
          }
        }
      }
    }

    // Check value_bets entries
    let valueBetsUpdated = 0;
    if (pendingValueBets && pendingValueBets.length > 0) {
      for (const bet of pendingValueBets) {
        const match = bet.matches as unknown as { home_team: string; away_team: string } | null;
        if (!match) continue;

        const completedGame = allScores.find(score => {
          const homeMatch = score.home_team.toLowerCase().includes(match.home_team.toLowerCase().split(' ')[0]) ||
                           match.home_team.toLowerCase().includes(score.home_team.toLowerCase().split(' ')[0]);
          const awayMatch = score.away_team.toLowerCase().includes(match.away_team.toLowerCase().split(' ')[0]) ||
                           match.away_team.toLowerCase().includes(score.away_team.toLowerCase().split(' ')[0]);
          return homeMatch && awayMatch;
        });

        if (!completedGame || !completedGame.scores) continue;

        const homeScore = parseInt(completedGame.scores.find(s => s.name === completedGame.home_team)?.score || '0');
        const awayScore = parseInt(completedGame.scores.find(s => s.name === completedGame.away_team)?.score || '0');
        const scoreString = `${homeScore}-${awayScore}`;

        let won = false;
        const selection = bet.selection.toLowerCase();
        const market = bet.market;

        if (market === '1x2') {
          if (selection.includes('home') || selection.includes(match.home_team.toLowerCase())) {
            won = homeScore > awayScore;
          } else if (selection.includes('away') || selection.includes(match.away_team.toLowerCase())) {
            won = awayScore > homeScore;
          } else if (selection.includes('draw')) {
            won = homeScore === awayScore;
          }
        } else if (market === 'over_under') {
          const totalGoals = homeScore + awayScore;
          if (selection.includes('over 2.5')) won = totalGoals > 2.5;
          else if (selection.includes('under 2.5')) won = totalGoals < 2.5;
          else if (selection.includes('over 1.5')) won = totalGoals > 1.5;
          else if (selection.includes('under 1.5')) won = totalGoals < 1.5;
        } else if (market === 'btts') {
          const bothScored = homeScore > 0 && awayScore > 0;
          if (selection.includes('yes')) won = bothScored;
          else if (selection.includes('no')) won = !bothScored;
        }

        const { error: updateError } = await supabase
          .from('value_bets')
          .update({
            result: won ? 'won' : 'lost',
            actual_score: scoreString,
            settled_at: new Date().toISOString()
          })
          .eq('id', bet.id);

        if (!updateError) {
          valueBetsUpdated++;
          console.log(`Updated value_bet ${bet.id}: ${won ? 'won' : 'lost'} (${scoreString})`);
        }
      }
    }

    console.log(`Updated ${updatedCount} bet_history, ${userBetsUpdated} user_bets, ${valueBetsUpdated} value_bets`);

    return new Response(JSON.stringify({ 
      message: `Checked and updated ${updatedCount} bet_history, ${userBetsUpdated} user_bets, ${valueBetsUpdated} value_bets`,
      updated: updatedCount,
      userBetsUpdated,
      valueBetsUpdated,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in check-results function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
