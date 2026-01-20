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
    const { event_id, selection, event_name, league } = input;

    console.log('=== RECHECK BET START ===');
    console.log('Input:', { event_id, selection, event_name, league });

    // First try to get event from database
    let event = null;
    let homeTeam = '';
    let awayTeam = '';
    let eventStartTime: Date | null = null;

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
        eventStartTime = new Date(event.start_time_utc);
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
      
      // Get completed scores from the-odds-api
      const leagueMap: Record<string, string> = {
        'EPL': 'soccer_epl',
        'La Liga': 'soccer_spain_la_liga',
        'Serie A': 'soccer_italy_serie_a',
        'Bundesliga': 'soccer_germany_bundesliga',
        'Ligue 1': 'soccer_france_ligue_one',
        'A-League': 'soccer_australia_aleague',
        'MLS': 'soccer_usa_mls',
        'Argentina Primera': 'soccer_argentina_primera_division',
      };

      const sportKey = league ? leagueMap[league] || 'soccer' : 'soccer';
      
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${oddsApiKey}&daysFrom=3`;
        const scoresRes = await fetch(scoresUrl);
        
        if (scoresRes.ok) {
          const scores = await scoresRes.json();
          console.log(`Fetched ${scores.length} scores for ${sportKey}`);

          // Find matching game
          const matchingGame = scores.find((game: any) => {
            if (!game.completed || !game.scores) return false;
            
            const homeMatch = game.home_team.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) ||
                             homeTeam.toLowerCase().includes(game.home_team.toLowerCase().split(' ')[0]);
            const awayMatch = game.away_team.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0]) ||
                             awayTeam.toLowerCase().includes(game.away_team.toLowerCase().split(' ')[0]);
            
            return homeMatch && awayMatch;
          });

          if (matchingGame) {
            console.log('Found matching completed game:', matchingGame);
            
            const homeScore = matchingGame.scores.find((s: any) => s.name === matchingGame.home_team)?.score;
            const awayScore = matchingGame.scores.find((s: any) => s.name === matchingGame.away_team)?.score;
            
            if (homeScore !== undefined && awayScore !== undefined) {
              const hScore = parseInt(homeScore);
              const aScore = parseInt(awayScore);
              
              // Determine actual outcome
              let actualWinner = 'Draw';
              if (hScore > aScore) actualWinner = homeTeam;
              else if (aScore > hScore) actualWinner = awayTeam;
              
              // Check if our selection won
              let result: MatchResult['status'] = 'pending';
              
              // Handle different selection formats
              const selLower = selection.toLowerCase();
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

    // Event hasn't started yet - do the normal recheck for updated odds/analysis
    if (!perplexityApiKey) {
      return new Response(
        JSON.stringify({ 
          message: 'Cannot recheck - API not configured',
          updated_bet: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current odds if we have event data
    let currentOdds = 2.0; // default
    let currentImpliedProb = 0.5;
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

    // Send to Perplexity for updated analysis
    console.log('Getting updated analysis from Perplexity...');

    const systemPrompt = `You are a sports betting analyst. Analyze the latest data for a single bet and provide an updated assessment.

Return ONLY valid JSON with this structure:
{
  "model_probability": number (0-1, your estimated true probability),
  "edge": number (model_probability - implied_probability),
  "bet_score": number (50-100),
  "confidence": "high" | "medium" | "low",
  "rationale": "string (updated reasoning based on latest data)"
}`;

    const userPrompt = `EVENT: ${homeTeam} vs ${awayTeam}
LEAGUE: ${league || 'Unknown'}
SELECTION: ${selection}
CURRENT ODDS: ${currentOdds.toFixed(2)}
IMPLIED PROBABILITY: ${(currentImpliedProb * 100).toFixed(1)}%

Analyze this bet and provide updated probability estimates based on any recent news, injuries, or form changes.`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      }),
    });

    if (!perplexityResponse.ok) {
      throw new Error('Perplexity API error');
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Perplexity response');
    }

    // Parse JSON from response
    let jsonContent = content.trim();
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    }

    const analysis = JSON.parse(jsonContent.trim());

    // Calculate recommended stake (25% Kelly)
    const edge = analysis.edge || (analysis.model_probability - currentImpliedProb);
    const kellyStake = edge > 0 ? (0.25 * edge / (currentOdds - 1)) : 0.25;
    const stakeMultiplier = analysis.confidence === 'high' ? 1 : analysis.confidence === 'medium' ? 0.75 : 0.5;
    const recommendedStake = Math.min(Math.max(kellyStake * stakeMultiplier, 0.25), 1.5);

    const updatedBet = {
      event_id,
      market_id: input.market_id || '',
      sport: 'soccer',
      league: league || '',
      event_name: `${homeTeam} vs ${awayTeam}`,
      start_time: eventStartTime?.toISOString() || '',
      selection,
      selection_label: selection,
      odds_decimal: currentOdds,
      bookmaker,
      model_probability: analysis.model_probability,
      implied_probability: currentImpliedProb,
      edge: edge,
      bet_score: analysis.bet_score,
      confidence: analysis.confidence,
      recommended_stake_units: recommendedStake,
      rationale: analysis.rationale,
    };

    console.log('=== RECHECK BET COMPLETE ===');

    return new Response(
      JSON.stringify({
        updated_bet: updatedBet,
        message: 'Bet rechecked successfully'
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
