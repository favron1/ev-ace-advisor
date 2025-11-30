import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface AIAnalysis {
  isValid: boolean;
  confidence: "high" | "moderate" | "low";
  historicalTrend: string;
  marketSentiment: string;
  teamFormAnalysis: string;
  proTipsterView: string;
  riskFactors: string[];
  recommendation: "STRONG_BET" | "GOOD_BET" | "CAUTION" | "AVOID";
  adjustedStakePercent: number;
  enhancedReasoning: string;
}

interface EnhancedBet extends ValueBet {
  aiAnalysis: AIAnalysis;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bets } = await req.json() as { bets: ValueBet[] };
    
    if (!bets || bets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No bets provided for analysis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`AI analyzing ${bets.length} bets...`);

    // Prepare batch analysis prompt
    const betsContext = bets.map((bet, i) => `
BET ${i + 1}:
- Match: ${bet.event}
- Selection: ${bet.selection} (${bet.market})
- Odds: ${bet.offeredOdds.toFixed(2)} (Fair: ${bet.fairOdds.toFixed(2)})
- Edge: ${bet.edge.toFixed(1)}%
- EV: ${(bet.expectedValue * 100).toFixed(1)}%
- Confidence: ${bet.confidence}
- Bookmaker: ${bet.bookmaker}
- Kick-off: ${new Date(bet.commenceTime).toLocaleString()}
`).join('\n');

    const systemPrompt = `You are an elite sports betting analyst with decades of experience. You have comprehensive knowledge of:

1. **Historical Data & Trends**: Team performance over seasons, head-to-head records, home/away form, scoring patterns, defensive records
2. **Market Sentiment**: Where sharp money is flowing, line movements, public vs sharp betting patterns
3. **Pro Tipster Consensus**: What professional handicappers and betting syndicates typically favor in similar situations
4. **Team Form & Injuries**: Recent form (last 5-10 games), key player availability, tactical changes, managerial situations

Your task is to cross-check value bets identified by mathematical edge against these real-world factors.

IMPORTANT: Be realistic and critical. Not every mathematically good bet is actually good when context is considered. Look for:
- Is the mathematical edge justified by real factors?
- Are there hidden risks (injuries, motivation, fixture congestion)?
- Does market sentiment support or contradict this bet?
- What would sharp bettors think of this selection?

Output your analysis in strict JSON format for each bet.`;

    const userPrompt = `Analyze these ${bets.length} value bets. For EACH bet, provide a detailed cross-check analysis.

${betsContext}

For each bet, respond with a JSON array containing objects with this EXACT structure:
{
  "betIndex": <number 0-indexed>,
  "isValid": <boolean - true if bet still looks good after analysis>,
  "confidence": <"high" | "moderate" | "low">,
  "historicalTrend": <string - 1-2 sentences on historical data supporting/contradicting this bet>,
  "marketSentiment": <string - what the market movement suggests>,
  "teamFormAnalysis": <string - recent form of teams involved>,
  "proTipsterView": <string - what professional bettors would likely think>,
  "riskFactors": <array of strings - key risks to consider>,
  "recommendation": <"STRONG_BET" | "GOOD_BET" | "CAUTION" | "AVOID">,
  "adjustedStakePercent": <number - your recommended stake % (0.5-2.0)>,
  "enhancedReasoning": <string - 2-3 sentence summary combining all analysis>
}

Return ONLY a valid JSON array, no other text.`;

    console.log('Calling Lovable AI for analysis...');

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
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add funds.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing...');

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = aiContent;
    const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Clean up the string
    jsonStr = jsonStr.trim();
    
    let analyses: any[];
    try {
      analyses = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', jsonStr.substring(0, 500));
      // Fallback: return original bets with default analysis
      analyses = bets.map((_, i) => ({
        betIndex: i,
        isValid: true,
        confidence: 'moderate',
        historicalTrend: 'Historical analysis pending',
        marketSentiment: 'Market sentiment analysis pending',
        teamFormAnalysis: 'Form analysis pending',
        proTipsterView: 'Pro tipster consensus pending',
        riskFactors: ['Analysis incomplete'],
        recommendation: 'CAUTION',
        adjustedStakePercent: 1.0,
        enhancedReasoning: 'AI analysis could not be completed. Original mathematical edge remains valid.'
      }));
    }

    // Merge AI analysis with original bets
    const enhancedBets: EnhancedBet[] = bets.map((bet, index) => {
      const analysis = analyses.find((a: any) => a.betIndex === index) || analyses[index];
      
      const aiAnalysis: AIAnalysis = {
        isValid: analysis?.isValid ?? true,
        confidence: analysis?.confidence ?? bet.confidence,
        historicalTrend: analysis?.historicalTrend ?? 'No historical data available',
        marketSentiment: analysis?.marketSentiment ?? 'Market sentiment neutral',
        teamFormAnalysis: analysis?.teamFormAnalysis ?? 'Form data unavailable',
        proTipsterView: analysis?.proTipsterView ?? 'No tipster consensus available',
        riskFactors: analysis?.riskFactors ?? [],
        recommendation: analysis?.recommendation ?? 'CAUTION',
        adjustedStakePercent: analysis?.adjustedStakePercent ?? bet.suggestedStakePercent,
        enhancedReasoning: analysis?.enhancedReasoning ?? bet.reasoning
      };

      return {
        ...bet,
        aiAnalysis,
        // Update confidence based on AI analysis
        confidence: aiAnalysis.confidence,
        suggestedStakePercent: aiAnalysis.adjustedStakePercent,
        reasoning: aiAnalysis.enhancedReasoning
      };
    });

    // Sort by recommendation strength
    const recommendationOrder = { 'STRONG_BET': 0, 'GOOD_BET': 1, 'CAUTION': 2, 'AVOID': 3 };
    enhancedBets.sort((a, b) => {
      const orderDiff = recommendationOrder[a.aiAnalysis.recommendation] - recommendationOrder[b.aiAnalysis.recommendation];
      if (orderDiff !== 0) return orderDiff;
      return b.expectedValue - a.expectedValue;
    });

    const summary = {
      totalAnalyzed: enhancedBets.length,
      strongBets: enhancedBets.filter(b => b.aiAnalysis.recommendation === 'STRONG_BET').length,
      goodBets: enhancedBets.filter(b => b.aiAnalysis.recommendation === 'GOOD_BET').length,
      cautionBets: enhancedBets.filter(b => b.aiAnalysis.recommendation === 'CAUTION').length,
      avoidBets: enhancedBets.filter(b => b.aiAnalysis.recommendation === 'AVOID').length,
      validBets: enhancedBets.filter(b => b.aiAnalysis.isValid).length,
      timestamp: new Date().toISOString()
    };

    console.log(`AI analysis complete: ${summary.strongBets} strong, ${summary.goodBets} good, ${summary.cautionBets} caution, ${summary.avoidBets} avoid`);

    return new Response(
      JSON.stringify({ bets: enhancedBets, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI bet analysis:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
