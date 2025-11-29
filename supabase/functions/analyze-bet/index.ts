import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  selection: string;
  offeredOdds: number;
  homeForm?: string;
  awayForm?: string;
  homeGoalsScored?: number;
  homeGoalsConceded?: number;
  awayGoalsScored?: number;
  awayGoalsConceded?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const data: AnalyzeRequest = await req.json();
    console.log('Analyzing bet:', data);

    const systemPrompt = `You are an expert sports betting analyst specializing in football (soccer). Your task is to analyze betting opportunities and provide data-driven insights.

You must respond with a valid JSON object containing:
- actualProbability: number (0-100, your estimated true probability)
- fairOdds: number (calculated as 100/actualProbability)
- expectedValue: number (calculated as (actualProbability/100 * offeredOdds) - 1)
- edge: number (percentage edge over the bookmaker)
- confidence: "low" | "moderate" | "high"
- suggestedStakePercent: number (1-5 based on Kelly Criterion)
- reasoning: string (brief 2-3 sentence rationale)
- meetsCriteria: boolean (true if EV > 0.05 and edge > 0)

Consider these factors:
1. Recent form (last 5 matches)
2. Head-to-head records
3. Goals scored/conceded patterns
4. League position and context
5. Market efficiency and value

Be conservative with probability estimates. Professional bettors typically find 2-5% edge.`;

    const userPrompt = `Analyze this betting opportunity:

Match: ${data.homeTeam} vs ${data.awayTeam}
League: ${data.league}
Market: ${data.market}
Selection: ${data.selection}
Offered Odds: ${data.offeredOdds}
${data.homeForm ? `Home Form (last 5): ${data.homeForm}` : ''}
${data.awayForm ? `Away Form (last 5): ${data.awayForm}` : ''}
${data.homeGoalsScored ? `Home Goals Scored (avg): ${data.homeGoalsScored}` : ''}
${data.homeGoalsConceded ? `Home Goals Conceded (avg): ${data.homeGoalsConceded}` : ''}
${data.awayGoalsScored ? `Away Goals Scored (avg): ${data.awayGoalsScored}` : ''}
${data.awayGoalsConceded ? `Away Goals Conceded (avg): ${data.awayGoalsConceded}` : ''}

Implied Probability: ${(100 / data.offeredOdds).toFixed(2)}%

Provide your analysis as a JSON object.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add funds to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices[0].message.content;
    
    // Parse JSON from the response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      // Provide fallback analysis
      const impliedProb = 100 / data.offeredOdds;
      analysis = {
        actualProbability: impliedProb - 2,
        fairOdds: 100 / (impliedProb - 2),
        expectedValue: -0.02,
        edge: -2,
        confidence: 'low',
        suggestedStakePercent: 0,
        reasoning: 'Unable to analyze. Consider manual review.',
        meetsCriteria: false
      };
    }

    console.log('Analysis result:', analysis);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-bet function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
