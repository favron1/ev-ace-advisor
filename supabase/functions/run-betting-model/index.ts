import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModelInput {
  sports: string[];
  engine: 'team_sports' | 'horse' | 'greyhound';
  window_hours: number;
  bankroll_units: number;
  max_daily_exposure_pct: number;
  max_per_event_exposure_pct: number;
  max_bets: number;
}

interface RecommendedBet {
  event_id: string;
  market_id: string;
  sport: string;
  league: string;
  event_name: string;
  start_time: string;
  selection: string;
  selection_label: string;
  odds_decimal: number;
  bookmaker: string;
  model_probability: number;
  implied_probability: number;
  edge: number;
  bet_score: number;
  confidence: 'high' | 'medium' | 'low';
  recommended_stake_units: number;
  rationale: string;
  // NEW: CLV and correlation tracking
  steam_move?: boolean;
  correlation_penalty?: number;
}

interface TeamStats {
  team: string;
  team_id?: number;
  league_position?: number;
  points_per_game?: number;
  recent_form?: string;
  goals_scored_last_5?: number;
  goals_conceded_last_5?: number;
  xg_for_last_5?: number;
  xg_against_last_5?: number;
  xg_difference?: number;
  home_xg_for?: number;
  home_xg_against?: number;
  away_xg_for?: number;
  away_xg_against?: number;
  matches_last_7_days?: number;
  matches_last_14_days?: number;
  team_rating?: number;
  home_record?: string;
  away_record?: string;
  home_goals_for?: number;
  home_goals_against?: number;
  away_goals_for?: number;
  away_goals_against?: number;
  days_rest?: number;
  injuries?: string[];
  qualitative_tags?: string[];
  stats_complete: boolean;
}

// Get current time in AEDT ISO format
function getNowAEDT(): string {
  const now = new Date();
  return now.toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' }).replace(' ', 'T') + '+11:00';
}

// Scrape sports data using Firecrawl search - enhanced for structured stats
async function scrapeMatchData(
  teams: { home: string; away: string; league: string; sport: string }[],
  firecrawlApiKey: string
): Promise<Record<string, any>> {
  const scrapedData: Record<string, any> = {};
  
  async function firecrawlSearch(query: string, limit: number = 3): Promise<any[]> {
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          tbs: 'qdr:w',
          scrapeOptions: { formats: ['markdown'] }
        }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data?.map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.markdown?.substring(0, 1500) || r.description || ''
      })) || [];
    } catch {
      return [];
    }
  }

  const matchPromises = teams.slice(0, 8).map(async (match) => {
    const matchKey = `${match.home} vs ${match.away}`;
    console.log(`Scraping enriched data: ${matchKey}`);
    
    try {
      const [
        homeFormResults,
        awayFormResults,
        statsResults,
        injuryResults,
        newsResults
      ] = await Promise.all([
        firecrawlSearch(`"${match.home}" ${match.league} last 5 matches results form 2024-25`, 2),
        firecrawlSearch(`"${match.away}" ${match.league} last 5 matches results form 2024-25`, 2),
        firecrawlSearch(`"${match.home}" OR "${match.away}" xG goals scored conceded statistics ${match.league}`, 2),
        firecrawlSearch(`"${match.home}" OR "${match.away}" injuries suspensions team news lineup`, 3),
        firecrawlSearch(`"${match.home}" OR "${match.away}" transfer starting eleven squad news`, 2)
      ]);

      const enrichedData = {
        home_team_form: homeFormResults,
        away_team_form: awayFormResults,
        team_stats: statsResults,
        injuries_suspensions: injuryResults,
        transfers_news: newsResults,
        summary: `
=== ${match.home} FORM & STATS ===
${homeFormResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No form data'}

=== ${match.away} FORM & STATS ===
${awayFormResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No form data'}

=== TEAM STATISTICS (xG, Goals) ===
${statsResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No stats data'}

=== INJURIES & SUSPENSIONS ===
${injuryResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No injury data'}

=== TRANSFERS & NEWS ===
${newsResults.map(r => `[${r.title}]\n${r.content}`).join('\n---\n') || 'No news data'}
`
      };

      return { matchKey, data: enrichedData };
    } catch (error) {
      console.error(`Error scraping ${matchKey}:`, error);
      return { matchKey, data: null };
    }
  });

  const results = await Promise.all(matchPromises);
  
  for (const result of results) {
    if (result.data) {
      scrapedData[result.matchKey] = result.data;
    }
  }

  return scrapedData;
}

// Calculate correlation penalty for portfolio concentration
function calculateCorrelationPenalty(
  bet: any,
  existingBets: any[],
  maxPerLeague: number = 2,
  maxPerTimeCluster: number = 3
): number {
  let penalty = 0;
  
  // Count bets in same league
  const sameLeagueBets = existingBets.filter(b => b.league === bet.league);
  if (sameLeagueBets.length >= maxPerLeague) {
    penalty += 5 * (sameLeagueBets.length - maxPerLeague + 1);
  }
  
  // Count bets in same 2-hour time cluster
  const betTime = new Date(bet.start_time).getTime();
  const sameTimeBets = existingBets.filter(b => {
    const existingTime = new Date(b.start_time).getTime();
    return Math.abs(betTime - existingTime) < 2 * 60 * 60 * 1000; // 2 hours
  });
  if (sameTimeBets.length >= maxPerTimeCluster) {
    penalty += 3 * (sameTimeBets.length - maxPerTimeCluster + 1);
  }
  
  return penalty;
}

// Send enhanced data to Perplexity for betting decisions
async function analyzeWithPerplexity(
  eventsWithOdds: any[],
  scrapedData: Record<string, any>,
  context: any,
  perplexityApiKey: string
): Promise<any> {
  
  const eventsPayload = eventsWithOdds.map(event => {
    const matchKey = `${event.home_team} vs ${event.away_team}`;
    const scraped = scrapedData[matchKey] || {};
    
    return {
      event_id: event.event_id,
      sport: event.sport,
      league: event.league,
      home_team: event.home_team,
      away_team: event.away_team,
      start_time_aedt: event.start_time_aedt,
      // Enhanced structured stats
      home_team_stats: event.home_team_stats,
      away_team_stats: event.away_team_stats,
      rating_differential: (event.home_team_stats?.team_rating || 1500) - (event.away_team_stats?.team_rating || 1500),
      // Scraped qualitative data
      scraped_data: scraped.summary || 'No scraped data available',
      // Market odds with movement
      markets: event.markets
    };
  });

  // Enhanced prompt with v2.0 framework
  const systemPrompt = `You are an institutional-grade sports betting analyst and quantitative decision engine (v2.0).

CRITICAL RULE: You MUST return 3-5 recommended bets from the available matches. NEVER return an empty array.

NEW DATA AVAILABLE (use these for better model probability):
- team_rating: Elo-style rating (1500 base) incorporating form, xG, position
- xg_for_last_5, xg_against_last_5: Expected goals last 5 matches
- xg_difference: Net xG differential (positive = attacking strength)
- matches_last_7_days, matches_last_14_days: Schedule congestion
- home_xg_for/against, away_xg_for/against: Venue-specific xG splits
- qualitative_tags: Structured flags like ["hot_streak", "injury_crisis", "rested_squad"]
- rating_differential: Pre-calculated home rating minus away rating
- steam_move: Flag if odds moved >5% (indicates sharp money)

STEP 1: CALCULATE MODEL PROBABILITY
Use RATING DIFFERENTIAL as primary input:
- Rating diff > +100: Home heavily favored
- Rating diff +50 to +100: Home slight favorite
- Rating diff -50 to +50: Close match
- Rating diff < -100: Away heavily favored

Adjust for:
- xG differential (more reliable than raw goals)
- Schedule fatigue (matches_last_7_days > 2 = negative adjustment)
- Qualitative tags (injury_crisis = -5%, hot_streak = +3%)
- Home/away venue xG splits

STEP 2: CALCULATE EDGE & BET SCORE
Edge = Model Probability - Implied Probability (1/odds)

BET SCORE (0-100) FORMULA:
- Base: 50
- Edge bonus: +edge * 200 (e.g., 5% edge = +10 points)
- Data quality: +10 if xG available, +5 if form available
- Steam move alignment: +5 if your pick aligns with sharp money
- Fatigue factor: -5 if matches_last_7_days > 2 on your pick
- Correlation penalty: -5 if too many bets in same league/time

Only bets with score >= 70 will be shown to user.

CONFIDENCE LEVELS:
- "high": bet_score >= 80, rating differential supports pick, xG confirms
- "medium": bet_score 70-79, some metrics support
- "low": bet_score < 70 (will be filtered out)

STAKE SIZING (25% Kelly):
stake = 0.25 * edge / (odds - 1)
Apply confidence multiplier: high=100%, medium=75%
Min 0.25u, Max 1.5u

PORTFOLIO RULES (CRITICAL):
- Maximum 2 bets per league in this batch
- Maximum 3 bets in same 2-hour kickoff window
- Apply -5 correlation penalty for violations

Return VALID JSON ONLY with this exact structure.`;

  const userPrompt = `CONTEXT:
{
  "timezone": "Australia/Sydney",
  "now_aedt": "${context.now_aedt}",
  "bankroll_units": ${context.bankroll_units},
  "max_daily_exposure_pct": ${context.max_daily_exposure_pct},
  "max_per_event_exposure_pct": ${context.max_per_event_exposure_pct},
  "max_bets": ${context.max_bets},
  "engine": "${context.engine}",
  "min_bet_score": 70,
  "max_per_league": 2,
  "max_per_time_cluster": 3
}

EVENTS WITH STRUCTURED STATS AND ODDS:
${JSON.stringify(eventsPayload, null, 2)}

IMPORTANT:
1. Use the team_rating and rating_differential as PRIMARY inputs for model probability
2. Cross-reference with xG data for validation
3. Check qualitative_tags for edge cases
4. Apply correlation penalties if recommending multiple bets in same league
5. Steam moves indicate sharp money - align when possible

Return your analysis as VALID JSON:
{
  "recommended_bets": [
    {
      "event_id": "string",
      "market_id": "string",
      "sport": "string",
      "league": "string",
      "selection": "string",
      "selection_label": "string (e.g., 'Newcastle Jets to Win')",
      "odds_decimal": number,
      "bookmaker": "string",
      "model_probability": number (0-1),
      "implied_probability": number (0-1),
      "edge": number (model_prob - implied_prob),
      "bet_score": number (70-100 to pass filter),
      "confidence": "high" | "medium",
      "recommended_stake_units": number (0.25-1.5),
      "steam_move": boolean,
      "correlation_penalty": number (0 or negative),
      "rationale": "string (cite rating differential, xG, specific tags)"
    }
  ],
  "portfolio_summary": {
    "total_stake_units": number,
    "bankroll_units": number,
    "expected_value_units": number,
    "league_distribution": { "league_name": count }
  },
  "rejected_for_correlation": ["list of bets dropped due to portfolio rules"]
}`;

  console.log('Sending enhanced data to Perplexity (v2.0)...');

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
      max_tokens: 4000
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Perplexity API error:', errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const citations = data.citations || [];

  console.log(`Perplexity responded with ${citations.length} citations`);

  if (!content) {
    throw new Error('No content in Perplexity response');
  }

  console.log('Perplexity raw content preview:', content.substring(0, 600));

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

  const parsed = JSON.parse(jsonContent.trim());
  console.log('Perplexity parsed keys:', Object.keys(parsed || {}));
  console.log('Perplexity recommended_bets count:', Array.isArray(parsed?.recommended_bets) ? parsed.recommended_bets.length : 'n/a');

  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    const input: ModelInput = await req.json();
    
    const {
      sports = ['soccer'],
      engine = 'team_sports',
      window_hours = 12,
      bankroll_units = 100,
      max_daily_exposure_pct = 0.10,
      max_per_event_exposure_pct = 0.03,
      max_bets = 10
    } = input;

    console.log('=== BETTING MODEL v2.0 START ===');
    console.log('Input:', { sports, window_hours, max_bets });

    // STEP 1: Query events and odds from database
    const now = new Date();
    const windowEnd = new Date(now.getTime() + window_hours * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`*, markets (*)`)
      .in('sport', sports)
      .eq('status', 'upcoming')
      .gte('start_time_utc', now.toISOString())
      .lte('start_time_utc', windowEnd.toISOString())
      .order('start_time_utc', { ascending: true })
      .limit(15);

    if (eventsError) {
      throw new Error(`Error fetching events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          recommended_bets: [],
          reason: 'No upcoming events found. Click "Refresh Odds" first to fetch latest odds data.',
          events_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`STEP 1: Found ${events.length} events`);

    // STEP 2: Call scrape-match-data to get enhanced stats
    console.log('STEP 2: Fetching enhanced stats via scrape-match-data...');
    
    let enhancedEventData: any[] = [];
    try {
      const scrapeResponse = await supabase.functions.invoke('scrape-match-data', {
        body: { sports, window_hours, max_events: 10 }
      });
      
      if (scrapeResponse.data?.raw_data?.complete) {
        enhancedEventData = scrapeResponse.data.raw_data.complete;
        console.log(`Got enhanced stats for ${enhancedEventData.length} complete events`);
      }
    } catch (scrapeError) {
      console.error('Failed to fetch enhanced stats:', scrapeError);
    }

    // STEP 3: Also scrape with Firecrawl for qualitative data
    console.log('STEP 3: Scraping qualitative data with Firecrawl...');
    
    const teamsToScrape = events.map(e => ({
      home: e.home_team,
      away: e.away_team,
      league: e.league,
      sport: e.sport
    }));

    const scrapedData = await scrapeMatchData(teamsToScrape, firecrawlApiKey);
    console.log(`Scraped qualitative data for ${Object.keys(scrapedData).length} matches`);

    // STEP 4: Merge events with enhanced stats
    const eventsWithOdds = events.map(event => {
      // Find enhanced stats from scrape-match-data
      const enhanced = enhancedEventData.find((e: any) => 
        e.match === `${event.home_team} vs ${event.away_team}`
      );
      
      // Get best odds for each selection
      const bestOdds: Record<string, { odds: number; bookmaker: string; market_id: string }> = {};
      
      for (const market of event.markets || []) {
        const key = `${market.market_type}_${market.selection}`;
        const odds = parseFloat(market.odds_decimal);
        if (!bestOdds[key] || odds > bestOdds[key].odds) {
          bestOdds[key] = { odds, bookmaker: market.bookmaker, market_id: market.id };
        }
      }

      return {
        event_id: event.id,
        sport: event.sport,
        league: event.league,
        home_team: event.home_team,
        away_team: event.away_team,
        start_time_aedt: event.start_time_aedt,
        // Enhanced team stats
        home_team_stats: enhanced?.home_team_stats || null,
        away_team_stats: enhanced?.away_team_stats || null,
        // Markets with best odds
        markets: Object.entries(bestOdds).map(([key, data]) => {
          const [marketType, selection] = key.split('_');
          const enhancedOdds = enhanced?.odds?.find((o: any) => o.selection === selection);
          return {
            market_id: data.market_id,
            type: marketType === 'h2h' ? 'moneyline' : marketType,
            selection,
            odds_decimal: data.odds,
            bookmaker: data.bookmaker,
            implied_probability: (1 / data.odds).toFixed(4),
            steam_move: enhancedOdds?.steam_move || false,
            odds_movement: enhancedOdds?.odds_movement
          };
        })
      };
    });

    // Filter to only events with complete stats
    const eventsWithCompleteStats = eventsWithOdds.filter(e => 
      e.home_team_stats?.stats_complete && e.away_team_stats?.stats_complete
    );

    console.log(`STEP 4: ${eventsWithCompleteStats.length}/${eventsWithOdds.length} events have complete stats`);

    if (eventsWithCompleteStats.length === 0) {
      // Fall back to all events if none have complete stats
      console.log('No events with complete stats, using all events');
    }

    const eventsForAnalysis = eventsWithCompleteStats.length > 0 ? eventsWithCompleteStats : eventsWithOdds;

    // STEP 5: Send to Perplexity for analysis
    console.log('STEP 5: Sending to Perplexity for quantitative analysis...');
    
    const nowAEDT = getNowAEDT();
    
    const modelResponse = await analyzeWithPerplexity(
      eventsForAnalysis,
      scrapedData,
      {
        now_aedt: nowAEDT,
        bankroll_units,
        max_daily_exposure_pct,
        max_per_event_exposure_pct,
        max_bets,
        engine
      },
      perplexityApiKey
    );

    console.log('STEP 5: Perplexity analysis complete');

    // STEP 6: Validate, apply correlation penalties, enforce limits
    const MIN_BET_SCORE = 70;
    const MAX_PER_LEAGUE = 2;
    const maxDailyUnits = bankroll_units * max_daily_exposure_pct;
    const maxPerEventUnits = bankroll_units * max_per_event_exposure_pct;
    
    let totalStake = 0;
    const validatedBets: RecommendedBet[] = [];
    const rejectedBets: { selection: string; bet_score: number; reason: string }[] = [];
    const leagueCounts: Record<string, number> = {};

    for (const bet of modelResponse.recommended_bets || []) {
      // STRICT FILTER 1: Bet Score >= 70
      if ((bet.bet_score || 0) < MIN_BET_SCORE) {
        rejectedBets.push({ 
          selection: bet.selection_label || bet.selection, 
          bet_score: bet.bet_score || 0, 
          reason: `Bet Score ${bet.bet_score} < ${MIN_BET_SCORE}` 
        });
        continue;
      }
      
      // STRICT FILTER 2: Max per league
      const leagueCount = leagueCounts[bet.league] || 0;
      if (leagueCount >= MAX_PER_LEAGUE) {
        rejectedBets.push({ 
          selection: bet.selection_label || bet.selection, 
          bet_score: bet.bet_score || 0, 
          reason: `League cap: already have ${MAX_PER_LEAGUE} bets in ${bet.league}` 
        });
        continue;
      }
      
      // Apply correlation penalty if applicable
      const correlationPenalty = calculateCorrelationPenalty(bet, validatedBets);
      const adjustedBetScore = (bet.bet_score || 0) - correlationPenalty;
      
      if (adjustedBetScore < MIN_BET_SCORE) {
        rejectedBets.push({ 
          selection: bet.selection_label || bet.selection, 
          bet_score: adjustedBetScore, 
          reason: `Correlation penalty dropped score from ${bet.bet_score} to ${adjustedBetScore}` 
        });
        continue;
      }
      
      const cappedStake = Math.min(bet.recommended_stake_units || 0.5, maxPerEventUnits);
      if (totalStake + cappedStake > maxDailyUnits) continue;
      if (validatedBets.length >= max_bets) break;
      
      const event = events.find(e => e.id === bet.event_id);
      
      totalStake += cappedStake;
      leagueCounts[bet.league] = (leagueCounts[bet.league] || 0) + 1;
      
      validatedBets.push({ 
        ...bet, 
        event_name: event ? `${event.home_team} vs ${event.away_team}` : bet.selection_label,
        start_time: event?.start_time_aedt || '',
        recommended_stake_units: cappedStake,
        confidence: bet.confidence || (bet.bet_score >= 80 ? 'high' : 'medium'),
        correlation_penalty: correlationPenalty > 0 ? -correlationPenalty : 0
      });
    }

    console.log(`STEP 6: ${rejectedBets.length} bets rejected, ${validatedBets.length} passed`);
    console.log('League distribution:', leagueCounts);

    // STEP 7: Save to database
    if (userId && validatedBets.length > 0) {
      const betsToInsert = validatedBets.map(bet => {
        const event = events.find(e => e.id === bet.event_id);
        return {
          user_id: userId,
          event_id: bet.event_id,
          market_id: bet.market_id,
          sport: bet.sport,
          league: bet.league,
          event_name: event ? `${event.home_team} vs ${event.away_team}` : bet.selection_label,
          selection_label: bet.selection_label,
          odds_taken: bet.odds_decimal,
          bookmaker: bet.bookmaker,
          model_probability: bet.model_probability,
          implied_probability: bet.implied_probability,
          edge: bet.edge,
          bet_score: bet.bet_score,
          recommended_stake_units: bet.recommended_stake_units,
          rationale: bet.rationale,
          engine,
          result: 'pending'
        };
      });

      await supabase.from('model_bets').insert(betsToInsert);
      console.log(`Saved ${betsToInsert.length} bets to database`);
    }

    console.log('=== BETTING MODEL v2.0 COMPLETE ===');

    return new Response(
      JSON.stringify({
        recommended_bets: validatedBets,
        rejected_bets: rejectedBets,
        portfolio_summary: {
          total_stake_units: totalStake,
          bankroll_units,
          expected_value_units: validatedBets.reduce((sum, bet) => 
            sum + ((bet.edge || 0) * (bet.recommended_stake_units || 0)), 0),
          league_distribution: leagueCounts
        },
        events_analyzed: events.length,
        events_with_complete_stats: eventsWithCompleteStats.length,
        matches_scraped: Object.keys(scrapedData).length,
        min_bet_score: MIN_BET_SCORE,
        max_per_league: MAX_PER_LEAGUE,
        reason: validatedBets.length === 0 
          ? `No bets met criteria. ${rejectedBets.length} rejected (score < ${MIN_BET_SCORE} or league cap).` 
          : undefined,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in run-betting-model:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
