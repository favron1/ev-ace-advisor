import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BetStats {
  count: number;
  wins: number;
  losses: number;
  totalStaked: number;
  totalProfit: number;
  winRate: number;
  avgEdge: number;
}

interface DimensionStats {
  h2h: BetStats;
  spread: BetStats;
  total: BetStats;
  highLiquidity: BetStats;
  mediumLiquidity: BetStats;
  lowLiquidity: BetStats;
  edge5to10: BetStats;
  edge10to15: BetStats;
  edge15plus: BetStats;
}

function initStats(): BetStats {
  return { count: 0, wins: 0, losses: 0, totalStaked: 0, totalProfit: 0, winRate: 0, avgEdge: 0 };
}

function calculateWinRate(stats: BetStats): void {
  const settled = stats.wins + stats.losses;
  stats.winRate = settled > 0 ? (stats.wins / settled) * 100 : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all signal_logs with joined opportunity data
    const { data: logs, error: logsError } = await supabase
      .from("signal_logs")
      .select(`
        *,
        signal_opportunities (
          polymarket_volume,
          signal_tier,
          recommended_outcome
        )
      `)
      .not("outcome", "is", null)
      .in("outcome", ["win", "loss"]);

    if (logsError) throw logsError;

    if (!logs || logs.length < 3) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Not enough settled bets for analysis (need at least 3)" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get cache data for market type classification
    const conditionIds = logs
      .filter(l => l.polymarket_condition_id)
      .map(l => l.polymarket_condition_id);

    const { data: cacheData } = await supabase
      .from("polymarket_h2h_cache")
      .select("condition_id, market_type, volume, extracted_league")
      .in("condition_id", conditionIds);

    const cacheMap = new Map(cacheData?.map(c => [c.condition_id, c]) || []);

    // Initialize dimension stats
    const dimensions: DimensionStats = {
      h2h: initStats(),
      spread: initStats(),
      total: initStats(),
      highLiquidity: initStats(),
      mediumLiquidity: initStats(),
      lowLiquidity: initStats(),
      edge5to10: initStats(),
      edge10to15: initStats(),
      edge15plus: initStats(),
    };

    const overallStats = initStats();
    let totalEdge = 0;
    const recentWins: any[] = [];
    const recentLosses: any[] = [];
    const leagueStats = new Map<string, BetStats>();

    // Aggregate stats
    for (const log of logs) {
      const cache = cacheMap.get(log.polymarket_condition_id);
      const marketType = cache?.market_type || "h2h";
      const volume = cache?.volume || log.signal_opportunities?.polymarket_volume || 0;
      const league = cache?.extracted_league || "unknown";
      const edge = log.edge_at_signal || 0;
      const stake = log.stake_amount || 0;
      const profit = log.profit_loss || 0;
      const isWin = log.outcome === "win";

      // Overall
      overallStats.count++;
      overallStats.totalStaked += stake;
      overallStats.totalProfit += profit;
      totalEdge += edge;
      if (isWin) overallStats.wins++;
      else overallStats.losses++;

      // By market type
      const typeKey = marketType === "spread" ? "spread" : marketType === "total" ? "total" : "h2h";
      dimensions[typeKey].count++;
      dimensions[typeKey].totalStaked += stake;
      dimensions[typeKey].totalProfit += profit;
      dimensions[typeKey].avgEdge += edge;
      if (isWin) dimensions[typeKey].wins++;
      else dimensions[typeKey].losses++;

      // By liquidity tier
      let liquidityKey: "highLiquidity" | "mediumLiquidity" | "lowLiquidity";
      if (volume >= 100000) liquidityKey = "highLiquidity";
      else if (volume >= 50000) liquidityKey = "mediumLiquidity";
      else liquidityKey = "lowLiquidity";

      dimensions[liquidityKey].count++;
      dimensions[liquidityKey].totalStaked += stake;
      dimensions[liquidityKey].totalProfit += profit;
      dimensions[liquidityKey].avgEdge += edge;
      if (isWin) dimensions[liquidityKey].wins++;
      else dimensions[liquidityKey].losses++;

      // By edge range
      let edgeKey: "edge5to10" | "edge10to15" | "edge15plus";
      if (edge >= 15) edgeKey = "edge15plus";
      else if (edge >= 10) edgeKey = "edge10to15";
      else edgeKey = "edge5to10";

      dimensions[edgeKey].count++;
      dimensions[edgeKey].totalStaked += stake;
      dimensions[edgeKey].totalProfit += profit;
      dimensions[edgeKey].avgEdge += edge;
      if (isWin) dimensions[edgeKey].wins++;
      else dimensions[edgeKey].losses++;

      // By league
      if (!leagueStats.has(league)) leagueStats.set(league, initStats());
      const ls = leagueStats.get(league)!;
      ls.count++;
      ls.totalStaked += stake;
      ls.totalProfit += profit;
      ls.avgEdge += edge;
      if (isWin) ls.wins++;
      else ls.losses++;

      // Track recent wins/losses
      const betDetail = {
        event: log.event_name,
        edge: edge.toFixed(1),
        stake: stake.toFixed(0),
        profit: profit.toFixed(2),
        volume: (volume / 1000).toFixed(0) + "K",
        marketType,
        league,
      };
      
      if (isWin) recentWins.push(betDetail);
      else recentLosses.push(betDetail);
    }

    // Calculate win rates
    calculateWinRate(overallStats);
    overallStats.avgEdge = logs.length > 0 ? totalEdge / logs.length : 0;

    Object.values(dimensions).forEach(dim => {
      calculateWinRate(dim);
      if (dim.count > 0) dim.avgEdge = dim.avgEdge / dim.count;
    });

    leagueStats.forEach(ls => {
      calculateWinRate(ls);
      if (ls.count > 0) ls.avgEdge = ls.avgEdge / ls.count;
    });

    const roi = overallStats.totalStaked > 0 
      ? (overallStats.totalProfit / overallStats.totalStaked) * 100 
      : 0;

    // Build league summary
    const leagueSummary = Array.from(leagueStats.entries())
      .filter(([_, s]) => s.count >= 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, s]) => `${name}: ${s.count} bets, ${s.winRate.toFixed(0)}% win rate`)
      .join("\n");

    // Build AI prompt
    const prompt = `You are an expert sports betting analyst specializing in prediction market arbitrage. Analyze the following betting history and identify patterns that distinguish winning bets from losing bets.

BETTING HISTORY:
- Total Bets: ${overallStats.count}
- Win Rate: ${overallStats.winRate.toFixed(1)}%
- ROI: ${roi.toFixed(1)}%
- Total Profit/Loss: $${overallStats.totalProfit.toFixed(2)}

BY MARKET TYPE:
- H2H (Moneyline): ${dimensions.h2h.count} bets, ${dimensions.h2h.winRate.toFixed(0)}% win rate, $${dimensions.h2h.totalProfit.toFixed(0)} P/L
- Spreads: ${dimensions.spread.count} bets, ${dimensions.spread.winRate.toFixed(0)}% win rate, $${dimensions.spread.totalProfit.toFixed(0)} P/L
- Totals: ${dimensions.total.count} bets, ${dimensions.total.winRate.toFixed(0)}% win rate, $${dimensions.total.totalProfit.toFixed(0)} P/L

BY LIQUIDITY TIER:
- High ($100K+): ${dimensions.highLiquidity.count} bets, ${dimensions.highLiquidity.winRate.toFixed(0)}% win rate
- Medium ($50K-$100K): ${dimensions.mediumLiquidity.count} bets, ${dimensions.mediumLiquidity.winRate.toFixed(0)}% win rate
- Low (<$50K): ${dimensions.lowLiquidity.count} bets, ${dimensions.lowLiquidity.winRate.toFixed(0)}% win rate

BY EDGE RANGE:
- 5-10%: ${dimensions.edge5to10.count} bets, ${dimensions.edge5to10.winRate.toFixed(0)}% win rate
- 10-15%: ${dimensions.edge10to15.count} bets, ${dimensions.edge10to15.winRate.toFixed(0)}% win rate
- 15%+: ${dimensions.edge15plus.count} bets, ${dimensions.edge15plus.winRate.toFixed(0)}% win rate

BY LEAGUE:
${leagueSummary || "No league data available"}

RECENT LOSSES (last 5):
${recentLosses.slice(-5).map(l => `- ${l.event}: ${l.marketType}, ${l.volume} vol, ${l.edge}% edge, $${l.profit} loss`).join("\n") || "None"}

RECENT WINS (last 5):
${recentWins.slice(-5).map(w => `- ${w.event}: ${w.marketType}, ${w.volume} vol, ${w.edge}% edge, +$${w.profit} profit`).join("\n") || "None"}

Provide 3-5 specific, actionable recommendations to improve win rate and ROI. Focus on:
1. Which market types to prioritize or avoid
2. Minimum volume/liquidity thresholds
3. Edge requirements by market type
4. League or sport focus areas
5. Any patterns in the losses that can be avoided`;

    // Call Lovable AI with tool calling
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert sports betting analyst. Provide actionable recommendations based on betting data analysis." },
          { role: "user", content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_recommendations",
              description: "Submit betting strategy recommendations based on pattern analysis",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { 
                          type: "string", 
                          enum: ["market_type", "liquidity", "edge_threshold", "league_focus", "timing", "risk_management"]
                        },
                        priority: { 
                          type: "string", 
                          enum: ["low", "medium", "high", "critical"] 
                        },
                        recommendation: { type: "string" },
                        reasoning: { type: "string" },
                        expected_impact: { type: "string" }
                      },
                      required: ["category", "priority", "recommendation", "reasoning", "expected_impact"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "submit_recommendations" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    // Parse tool call response
    let recommendations: any[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        recommendations = args.recommendations || [];
      } catch (e) {
        console.error("Failed to parse AI recommendations:", e);
      }
    }

    // Dedupe and store recommendations
    const insertedIds: string[] = [];
    
    for (const rec of recommendations) {
      // Check for similar existing active recommendation
      const { data: existing } = await supabase
        .from("ai_advisor_logs")
        .select("id")
        .eq("status", "active")
        .eq("insight_category", rec.category)
        .ilike("recommendation", `%${rec.recommendation.substring(0, 50)}%`)
        .maybeSingle();

      if (existing) {
        // Update timestamp of existing
        await supabase
          .from("ai_advisor_logs")
          .update({ created_at: new Date().toISOString() })
          .eq("id", existing.id);
        insertedIds.push(existing.id);
      } else {
        // Insert new
        const { data: inserted, error: insertError } = await supabase
          .from("ai_advisor_logs")
          .insert({
            analysis_type: "pattern_analysis",
            insight_category: rec.category,
            recommendation: rec.recommendation,
            supporting_data: {
              reasoning: rec.reasoning,
              expected_impact: rec.expected_impact,
              stats_snapshot: {
                total_bets: overallStats.count,
                win_rate: overallStats.winRate,
                roi,
                by_market_type: {
                  h2h: { count: dimensions.h2h.count, winRate: dimensions.h2h.winRate },
                  spread: { count: dimensions.spread.count, winRate: dimensions.spread.winRate },
                  total: { count: dimensions.total.count, winRate: dimensions.total.winRate },
                },
                by_liquidity: {
                  high: { count: dimensions.highLiquidity.count, winRate: dimensions.highLiquidity.winRate },
                  medium: { count: dimensions.mediumLiquidity.count, winRate: dimensions.mediumLiquidity.winRate },
                  low: { count: dimensions.lowLiquidity.count, winRate: dimensions.lowLiquidity.winRate },
                }
              }
            },
            priority: rec.priority,
            status: "active"
          })
          .select("id")
          .single();

        if (!insertError && inserted) {
          insertedIds.push(inserted.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        recommendations_count: recommendations.length,
        inserted_ids: insertedIds,
        stats_summary: {
          total_bets: overallStats.count,
          win_rate: overallStats.winRate.toFixed(1),
          roi: roi.toFixed(1),
          total_profit: overallStats.totalProfit.toFixed(2)
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Analyze betting patterns error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
