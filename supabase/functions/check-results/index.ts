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

    // Fetch pending placed bets from database
    const { data: pendingBets, error: fetchError } = await supabase
      .from('bet_history')
      .select('*')
      .eq('status', 'pending');

    if (fetchError) {
      console.error('Error fetching pending bets:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingBets?.length || 0} pending bets to check`);

    if (!pendingBets || pendingBets.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No pending bets to check',
        updated: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch scores from multiple leagues
    const leagues = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga'];
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

    // Check each pending bet against completed matches
    for (const bet of pendingBets) {
      const matchDesc = bet.match_description.toLowerCase();
      
      // Find matching completed game
      const matchingGame = allScores.find(game => {
        const homeTeam = game.home_team.toLowerCase();
        const awayTeam = game.away_team.toLowerCase();
        return matchDesc.includes(homeTeam) || matchDesc.includes(awayTeam);
      });

      if (matchingGame && matchingGame.scores) {
        const homeScore = parseInt(matchingGame.scores.find(s => s.name === matchingGame.home_team)?.score || '0');
        const awayScore = parseInt(matchingGame.scores.find(s => s.name === matchingGame.away_team)?.score || '0');
        
        console.log(`Match found: ${matchingGame.home_team} ${homeScore} - ${awayScore} ${matchingGame.away_team}`);
        console.log(`Bet selection: ${bet.selection}`);

        // Determine winner
        let actualWinner: string;
        if (homeScore > awayScore) {
          actualWinner = matchingGame.home_team;
        } else if (awayScore > homeScore) {
          actualWinner = matchingGame.away_team;
        } else {
          actualWinner = 'Draw';
        }

        // Check if bet won
        const selection = bet.selection.toLowerCase();
        const actualWinnerLower = actualWinner.toLowerCase();
        
        let betWon = false;
        if (selection.includes('draw') && actualWinner === 'Draw') {
          betWon = true;
        } else if (selection.includes(actualWinnerLower) || actualWinnerLower.includes(selection.replace(' to win', '').trim())) {
          betWon = true;
        } else if (selection.includes(matchingGame.home_team.toLowerCase()) && homeScore > awayScore) {
          betWon = true;
        } else if (selection.includes(matchingGame.away_team.toLowerCase()) && awayScore > homeScore) {
          betWon = true;
        }

        const status = betWon ? 'won' : 'lost';
        const profitLoss = betWon ? (bet.stake * bet.odds) - bet.stake : -bet.stake;

        console.log(`Bet ${bet.id}: ${status}, profit/loss: ${profitLoss}`);

        // Update bet in database
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
            
            console.log(`Updated profile for user ${bet.user_id}: ${totalBets} bets, ${totalWins} wins, ${totalProfit} profit`);
          }
        }
      }
    }

    console.log(`Updated ${updatedCount} bets`);

    return new Response(JSON.stringify({ 
      message: `Checked ${pendingBets.length} bets, updated ${updatedCount}`,
      updated: updatedCount,
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