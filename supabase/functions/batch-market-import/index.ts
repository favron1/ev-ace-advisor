 // ============================================================================
 // BATCH MARKET IMPORT EDGE FUNCTION
 // ============================================================================
 // Accepts parsed market data and upserts into polymarket_h2h_cache.
 // Attempts bookmaker matching using canonical team resolution.
 // ============================================================================
 
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 import { SPORTS_CONFIG, getSportCodeFromLeague } from '../_shared/sports-config.ts';
 import { resolveTeamName, teamId, makeTeamSetKey } from '../_shared/canonicalize.ts';
import { getAllTeamMappings } from '../_shared/team-mapping-cache.ts';
 
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
  details: Array<{ market: string; status: string; error?: string; conditionId?: string }>;
 }

type BookieIndexEntry = {
  // Vig-free fair probs keyed by canonical team id
  fairProbByTeamId: Record<string, number>;
  // Best available commence time (if present in signals)
  commence_time: string | null;
  // Debug: one sample event name used to build this entry
  sample_event_name: string;
};
 
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
 
      // Fetch user-defined team mappings for all sports (self-healing mechanism)
      const allUserMappings = await getAllTeamMappings(supabase);
      console.log(`[batch-import] Loaded ${allUserMappings.size} user-defined team mappings`);

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
      const bookieIndex = await buildBookieIndex(supabase, allUserMappings);
     console.log(`[batch-import] Built bookie index with ${bookieIndex.size} entries`);
 
     for (const market of markets) {
       const marketLabel = `${market.awayTeam} @ ${market.homeTeam}`;
 
       try {
          // Skip women's games - no bookmaker coverage, causes cross-gender mismatches
          const isWomensGame = 
            market.homeTeam.includes('(W)') || 
            market.awayTeam.includes('(W)') ||
            (market.rawText && market.rawText.includes('(W)'));
          if (isWomensGame) {
            result.failed++;
            result.details.push({ market: marketLabel, status: 'skipped', error: 'Womens game - no bookie coverage' });
            continue;
          }

         // Get sport code
         const sportCode = getSportCodeFromLeague(market.sport);
         if (!sportCode) {
           result.failed++;
           result.details.push({ market: marketLabel, status: 'failed', error: `Unknown sport: ${market.sport}` });
           continue;
         }
 
         const teamMap = SPORTS_CONFIG[sportCode]?.teamMap || {};
 
          // Build sport-specific user mappings lookup
          const sportPrefix = `${sportCode}|`;
          const sportUserMappings = new Map<string, string>();
          for (const [key, value] of allUserMappings) {
            if (key.startsWith(sportPrefix)) {
              sportUserMappings.set(key.slice(sportPrefix.length), value);
            }
          }

          // Resolve team names to canonical names (user mappings have priority)
          const homeResolved = resolveTeamName(market.homeTeam, sportCode, teamMap, sportUserMappings);
          const awayResolved = resolveTeamName(market.awayTeam, sportCode, teamMap, sportUserMappings);
 
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
 
      // Check if market already exists - prioritize REAL Polymarket entries (source != batch_import)
      // Look for any matching market by normalized team names
         const { data: existing } = await supabase
           .from('polymarket_h2h_cache')
        .select('id, condition_id, source, token_id_yes, token_id_no, yes_price')
           .or(`and(team_home_normalized.eq.${homeId},team_away_normalized.eq.${awayId}),and(team_home_normalized.eq.${awayId},team_away_normalized.eq.${homeId})`)
        .order('last_price_update', { ascending: false, nullsFirst: false }) // Most recently updated first
        .limit(10);
 
      // PRIORITY ORDER for selecting which market to update:
      // 1. Markets with valid token IDs (clob_verified, can actually trade)
      // 2. Markets with non-placeholder prices (not 0.5/0.5)
      // 3. Non-batch_import sources
      const prioritizedMarket = existing?.sort((a, b) => {
        // Token IDs = highest priority (actually tradeable)
        const aHasTokens = !!(a.token_id_yes && a.token_id_no);
        const bHasTokens = !!(b.token_id_yes && b.token_id_no);
        if (aHasTokens !== bHasTokens) return bHasTokens ? 1 : -1;
        
        // Non-placeholder prices (not 0.5) = second priority
        const aHasRealPrice = a.yes_price && Math.abs(a.yes_price - 0.5) > 0.01;
        const bHasRealPrice = b.yes_price && Math.abs(b.yes_price - 0.5) > 0.01;
        if (aHasRealPrice !== bHasRealPrice) return bHasRealPrice ? 1 : -1;
        
        // clob_verified > api > firecrawl > batch_import
        const sourceRank = (s: string | null) => {
          if (s === 'clob_verified') return 0;
          if (s === 'api') return 1;
          if (s === 'firecrawl') return 2;
          if (s === 'batch_import') return 3;
          return 4;
        };
        return sourceRank(a.source) - sourceRank(b.source);
      })[0];
      
      const existingMarket = prioritizedMarket;
 
         // Prepare upsert data
         const now = new Date().toISOString();
      
      // For existing real markets, only update prices - preserve condition_id and other metadata
      const priceUpdateData = {
           yes_price: market.homePrice,  // Home team = YES
           no_price: market.awayPrice,   // Away team = NO
        last_price_update: now,
        monitoring_status: 'watching',
        tradeable: !noLiquidity,
        untradeable_reason: noLiquidity ? 'NO_LIQUIDITY' : null,
      };
      
      // Full data for new entries
      const fullUpsertData = {
        event_title: eventTitle,
        question: `Will ${homeResolved || market.homeTeam} win?`,
        ...priceUpdateData,
           team_home: homeResolved || market.homeTeam,
           team_away: awayResolved || market.awayTeam,
           team_home_normalized: homeId,
           team_away_normalized: awayId,
           sport_category: market.sport,
           extracted_league: market.sport,
           market_type: 'h2h',
           event_date: today,
           source: 'batch_import',
         };
 
         if (existingMarket) {
        // Update existing - for real markets, only update prices; preserve their condition_id
        const isRealMarket = existingMarket.source !== 'batch_import';
           const { error } = await supabase
             .from('polymarket_h2h_cache')
          .update(isRealMarket ? priceUpdateData : fullUpsertData)
             .eq('id', existingMarket.id);
 
           if (error) throw error;
           result.updated++;
        result.details.push({ 
          market: marketLabel, 
          status: isRealMarket ? 'updated_real' : 'updated',
          conditionId: existingMarket.condition_id 
        });
        
        console.log(`[batch-import] Updated ${isRealMarket ? 'REAL' : 'batch'} market: ${marketLabel} (${existingMarket.condition_id}) -> YES=${market.homePrice}`);
        
        // CASCADE: Also update any existing signal_opportunities with this condition_id
        if (existingMarket.condition_id && market.homePrice > 0) {
          const { data: existingSignal } = await supabase
            .from('signal_opportunities')
            .select('id, bookmaker_prob_fair, status')
            .eq('polymarket_condition_id', existingMarket.condition_id)
            .neq('status', 'expired')
            .single();
          
          if (existingSignal) {
            const bookProb = existingSignal.bookmaker_prob_fair || 0.5;
            const polyPrice = market.homePrice;
            const newEdge = ((bookProb - polyPrice) / polyPrice) * 100;
            
            const { error: sigError } = await supabase
              .from('signal_opportunities')
              .update({
                polymarket_yes_price: polyPrice,
                polymarket_price: polyPrice,
                polymarket_updated_at: now,
                edge_percent: Math.max(0, newEdge),
                is_true_arbitrage: newEdge >= 2,
              })
              .eq('id', existingSignal.id);
            
            if (!sigError) {
              console.log(`[batch-import] CASCADE: Updated signal ${existingSignal.id} with new edge ${newEdge.toFixed(1)}%`);
            }
          }
        }
         } else {
           // Create new with synthetic condition_id
           const syntheticConditionId = `batch_${sportCode}_${teamSetKey}_${today}`;
           const { error } = await supabase
             .from('polymarket_h2h_cache')
             .insert({
            ...fullUpsertData,
               condition_id: syntheticConditionId,
               created_at: now,
             });
 
           if (error) throw error;
           result.created++;
           result.details.push({ market: marketLabel, status: 'created' });
         }
 
          // Check for bookmaker match
          const lookupKey = `${market.sport.toUpperCase()}|${teamSetKey}`;
         const bookie = bookieIndex.get(lookupKey);
         
         // Always upsert into event_watch_state so markets appear in Pipeline
         const eventKey = `poly_${existingMarket?.condition_id || `batch_${sportCode}_${teamSetKey}_${today}`}`;
         const condition = existingMarket?.condition_id || `batch_${sportCode}_${teamSetKey}_${today}`;
         
         const watchStateData: Record<string, unknown> = {
           event_key: eventKey,
           event_name: eventTitle,
           watch_state: 'monitored',
           commence_time: market.gameTime || null,
           polymarket_condition_id: condition,
           polymarket_question: `Will ${homeResolved || market.homeTeam} win?`,
           polymarket_yes_price: market.homePrice,
           polymarket_price: market.homePrice,
           polymarket_volume: null,
           polymarket_matched: !!bookie,
           source: 'batch_import',
           updated_at: new Date().toISOString(),
         };

         if (bookie) {
           result.bookieMatches++;
           const homeFair = bookie.fairProbByTeamId[homeId];
           if (typeof homeFair === 'number' && !Number.isNaN(homeFair)) {
             watchStateData.current_probability = homeFair;
             watchStateData.bookmaker_market_key = homeResolved || market.homeTeam;
             watchStateData.bookmaker_source = sportCode;
             watchStateData.commence_time = bookie.commence_time || market.gameTime || null;
           }
         }

         await supabase
           .from('event_watch_state')
           .upsert(watchStateData, { onConflict: 'event_key' });
 
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
async function buildBookieIndex(
  supabase: any,
  allUserMappings: Map<string, string>
): Promise<Map<string, BookieIndexEntry>> {
   const index = new Map<string, BookieIndexEntry>();
 
   try {
     // Get recent bookmaker signals (last 24h)
      const { data: signals } = await supabase
       .from('bookmaker_signals')
        .select('event_name, market_type, outcome, implied_probability, commence_time, captured_at')
       .eq('market_type', 'h2h')
       .gte('captured_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
 
     if (!signals) return index;
 
      // Group signals by (sport|teamSetKey) so we can compute vig-free fair probs
      // For each group we keep the latest probability per outcome.
      const grouped = new Map<
        string,
        {
          sportLabel: string;
          teamSetKey: string;
          latestByOutcomeId: Map<string, { prob: number; captured_at: string; commence_time: string | null }>;
          sample_event_name: string;
        }
      >();

      for (const sig of signals) {
        const s = sig as any;
        const eventName = String(s.event_name || '');
        const outcome = String(s.outcome || '');
        const prob = Number(s.implied_probability);
        const capturedAt = String(s.captured_at || '');
        const commence = (s.commence_time ? String(s.commence_time) : null) as string | null;
        if (!eventName || !outcome || !Number.isFinite(prob)) continue;

        // Parse event name to extract teams
        const match = eventName.match(/^(.+?)\s+vs\s+(.+)$/i);
        if (!match) continue;
        const team1 = match[1].trim();
        const team2 = match[2].trim();

        // Detect sport from team names
        for (const [code, config] of Object.entries(SPORTS_CONFIG)) {
          const team1Resolved = resolveTeamName(team1, code as keyof typeof SPORTS_CONFIG, config.teamMap);
          const team2Resolved = resolveTeamName(team2, code as keyof typeof SPORTS_CONFIG, config.teamMap);
          const outcomeResolved = resolveTeamName(outcome, code as keyof typeof SPORTS_CONFIG, config.teamMap);
          if (!team1Resolved || !team2Resolved || !outcomeResolved) continue;

          const id1 = teamId(team1Resolved);
          const id2 = teamId(team2Resolved);
          
          // Also try user mappings for outcome resolution
          const outcomeFromUser = allUserMappings.get(`${code}|${outcome.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()}`);
          const outcomeId = teamId(outcomeFromUser || outcomeResolved);
          const teamSetKey = makeTeamSetKey(id1, id2);
          const key = `${config.name.toUpperCase()}|${teamSetKey}`;

          if (!grouped.has(key)) {
            grouped.set(key, {
              sportLabel: config.name.toUpperCase(),
              teamSetKey,
              latestByOutcomeId: new Map(),
              sample_event_name: eventName,
            });
          }

          const g = grouped.get(key)!;
          const prev = g.latestByOutcomeId.get(outcomeId);
          if (!prev || (capturedAt && capturedAt > prev.captured_at)) {
            g.latestByOutcomeId.set(outcomeId, {
              prob,
              captured_at: capturedAt,
              commence_time: commence,
            });
          }
          break;
        }
      }

      // Compute vig-free probs per group
      for (const [key, g] of grouped) {
        const probs = Array.from(g.latestByOutcomeId.entries());
        if (probs.length < 2) continue; // Need both sides

        const total = probs.reduce((sum, [, v]) => sum + v.prob, 0);
        if (total <= 0) continue;

        const fairProbByTeamId: Record<string, number> = {};
        for (const [outcomeId, v] of probs) {
          fairProbByTeamId[outcomeId] = v.prob / total;
        }

        // Pick a commence time if any outcome has one
        const commence_time = probs.map(([, v]) => v.commence_time).find(Boolean) || null;

        index.set(key, {
          fairProbByTeamId,
          commence_time,
          sample_event_name: g.sample_event_name,
        });
      }
   } catch (err) {
     console.error('[batch-import] Failed to build bookie index:', err);
   }
 
   return index;
 }