 // ============================================================================
 // BATCH MARKET IMPORT EDGE FUNCTION
 // ============================================================================
 // Accepts parsed market data and upserts into polymarket_h2h_cache.
 // Attempts bookmaker matching using canonical team resolution.
 // ============================================================================
 
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 import { SPORTS_CONFIG, getSportCodeFromLeague } from '../_shared/sports-config.ts';
 import { resolveTeamName, teamId, makeTeamSetKey } from '../_shared/canonicalize.ts';
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 interface BatchMarket {
   sport: string;
   gameTime: string;
   homeTeam: string;
   awayTeam: string;
   homePrice: number;
   awayPrice: number;
   rawText?: string;
 }
 
 interface ImportResult {
   created: number;
   updated: number;
   failed: number;
   noLiquidity: number;
   bookieMatches: number;
   details: Array<{ market: string; status: string; error?: string }>;
 }
 
 Deno.serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL')!,
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
     );
 
     const { markets } = await req.json() as { markets: BatchMarket[] };
 
     if (!markets || !Array.isArray(markets) || markets.length === 0) {
       return new Response(
         JSON.stringify({ error: 'No markets provided' }),
         { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     console.log(`[batch-import] Processing ${markets.length} markets`);
 
     const result: ImportResult = {
       created: 0,
       updated: 0,
       failed: 0,
       noLiquidity: 0,
       bookieMatches: 0,
       details: [],
     };
 
     // Get today's date for event_date
     const today = new Date().toISOString().split('T')[0];
 
     // Build bookmaker index for matching
     const bookieIndex = await buildBookieIndex(supabase);
     console.log(`[batch-import] Built bookie index with ${bookieIndex.size} entries`);
 
     for (const market of markets) {
       const marketLabel = `${market.awayTeam} @ ${market.homeTeam}`;
 
       try {
         // Get sport code
         const sportCode = getSportCodeFromLeague(market.sport);
         if (!sportCode) {
           result.failed++;
           result.details.push({ market: marketLabel, status: 'failed', error: `Unknown sport: ${market.sport}` });
           continue;
         }
 
         const teamMap = SPORTS_CONFIG[sportCode]?.teamMap || {};
 
         // Resolve team names to canonical names
         const homeResolved = resolveTeamName(market.homeTeam, sportCode, teamMap);
         const awayResolved = resolveTeamName(market.awayTeam, sportCode, teamMap);
 
         // Generate IDs for matching
         const homeId = homeResolved ? teamId(homeResolved) : teamId(market.homeTeam);
         const awayId = awayResolved ? teamId(awayResolved) : teamId(market.awayTeam);
         const teamSetKey = makeTeamSetKey(homeId, awayId);
 
         // Check if no liquidity
         const noLiquidity = market.homePrice === 0 && market.awayPrice === 0;
         if (noLiquidity) {
           result.noLiquidity++;
         }
 
         // Build event title (away @ home format for consistency)
         const eventTitle = `${awayResolved || market.awayTeam} vs ${homeResolved || market.homeTeam}`;
 
         // Check if market already exists (by team names + date)
         const { data: existing } = await supabase
           .from('polymarket_h2h_cache')
           .select('id, condition_id')
           .or(`and(team_home_normalized.eq.${homeId},team_away_normalized.eq.${awayId}),and(team_home_normalized.eq.${awayId},team_away_normalized.eq.${homeId})`)
           .eq('event_date', today)
           .limit(1);
 
         const existingMarket = existing?.[0];
 
         // Prepare upsert data
         const now = new Date().toISOString();
         const upsertData = {
           event_title: eventTitle,
           question: `Will ${homeResolved || market.homeTeam} win?`,
           yes_price: market.homePrice,  // Home team = YES
           no_price: market.awayPrice,   // Away team = NO
           team_home: homeResolved || market.homeTeam,
           team_away: awayResolved || market.awayTeam,
           team_home_normalized: homeId,
           team_away_normalized: awayId,
           sport_category: market.sport,
           extracted_league: market.sport,
           market_type: 'h2h',
           event_date: today,
           source: 'batch_import',
           last_price_update: now,
           tradeable: !noLiquidity,
           untradeable_reason: noLiquidity ? 'NO_LIQUIDITY' : null,
           monitoring_status: 'active',
         };
 
         if (existingMarket) {
           // Update existing
           const { error } = await supabase
             .from('polymarket_h2h_cache')
             .update(upsertData)
             .eq('id', existingMarket.id);
 
           if (error) throw error;
           result.updated++;
           result.details.push({ market: marketLabel, status: 'updated' });
         } else {
           // Create new with synthetic condition_id
           const syntheticConditionId = `batch_${sportCode}_${teamSetKey}_${today}`;
           const { error } = await supabase
             .from('polymarket_h2h_cache')
             .insert({
               ...upsertData,
               condition_id: syntheticConditionId,
               created_at: now,
             });
 
           if (error) throw error;
           result.created++;
           result.details.push({ market: marketLabel, status: 'created' });
         }
 
         // Check for bookmaker match
         const lookupKey = `${market.sport.toUpperCase()}|${teamSetKey}`;
         if (bookieIndex.has(lookupKey)) {
           result.bookieMatches++;
         }
 
       } catch (err) {
         console.error(`[batch-import] Failed to process ${marketLabel}:`, err);
         result.failed++;
         result.details.push({ 
           market: marketLabel, 
           status: 'failed', 
           error: err instanceof Error ? err.message : 'Unknown error' 
         });
       }
     }
 
     console.log(`[batch-import] Complete: created=${result.created}, updated=${result.updated}, failed=${result.failed}, bookieMatches=${result.bookieMatches}`);
 
     return new Response(
       JSON.stringify(result),
       { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (err) {
     console.error('[batch-import] Error:', err);
     return new Response(
       JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });
 
 /**
  * Build an index of bookmaker signals for O(1) matching
  * Key format: "SPORT|teamA_id|teamB_id" (alphabetical)
  */
async function buildBookieIndex(supabase: any): Promise<Map<string, boolean>> {
   const index = new Map<string, boolean>();
 
   try {
     // Get recent bookmaker signals (last 24h)
     const { data: signals } = await supabase
       .from('bookmaker_signals')
       .select('event_name, market_type')
       .eq('market_type', 'h2h')
       .gte('captured_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
 
     if (!signals) return index;
 
     for (const sig of signals) {
       // Parse event name to extract teams
      const eventName = (sig as any).event_name as string;
      const match = eventName.match(/^(.+?)\s+vs\s+(.+)$/i);
       if (!match) continue;
 
       const team1 = match[1].trim();
       const team2 = match[2].trim();
 
       // Detect sport from team names
       for (const [code, config] of Object.entries(SPORTS_CONFIG)) {
         const team1Resolved = resolveTeamName(team1, code as keyof typeof SPORTS_CONFIG, config.teamMap);
         const team2Resolved = resolveTeamName(team2, code as keyof typeof SPORTS_CONFIG, config.teamMap);
 
         if (team1Resolved && team2Resolved) {
           const id1 = teamId(team1Resolved);
           const id2 = teamId(team2Resolved);
           const key = `${config.name.toUpperCase()}|${makeTeamSetKey(id1, id2)}`;
           index.set(key, true);
           break;
         }
       }
     }
   } catch (err) {
     console.error('[batch-import] Failed to build bookie index:', err);
   }
 
   return index;
 }