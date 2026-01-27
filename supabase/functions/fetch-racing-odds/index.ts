import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Racing sport keys from The Odds API
const RACING_SPORTS = {
  horse: [
    "horse_racing_au",
    "horse_racing_uk",
    "horse_racing_us",
    "horse_racing_nz",
  ],
  greyhound: [
    "greyhound_racing_au",
    "greyhound_racing_uk",
  ],
};

// Region mappings
const REGION_SPORTS = {
  aus: ["horse_racing_au", "greyhound_racing_au"],
  nz: ["horse_racing_nz"],
  uk: ["horse_racing_uk", "greyhound_racing_uk"],
  ire: ["horse_racing_uk"], // Ireland often grouped with UK
  usa: ["horse_racing_us"],
  hk: [], // Hong Kong not directly supported by The Odds API
};

interface RacingOddsRequest {
  racing_types?: string[]; // ['horse', 'greyhound']
  regions?: string[]; // ['aus', 'uk', 'usa', etc.]
  hours_ahead?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ODDS_API_KEY = Deno.env.get("ODDS_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!ODDS_API_KEY) throw new Error("ODDS_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: RacingOddsRequest = await req.json().catch(() => ({}));
    const racingTypes = body.racing_types || ["horse", "greyhound"];
    const regions = body.regions || ["aus", "uk"];
    const hoursAhead = body.hours_ahead || 24;

    console.log(`[Racing Odds] Fetching for types: ${racingTypes.join(", ")}, regions: ${regions.join(", ")}`);

    // Build list of sport keys to fetch
    const sportKeysToFetch = new Set<string>();
    
    for (const region of regions) {
      const regionSports = REGION_SPORTS[region as keyof typeof REGION_SPORTS] || [];
      for (const sportKey of regionSports) {
        // Check if this sport matches the racing types we want
        if (racingTypes.includes("horse") && sportKey.includes("horse")) {
          sportKeysToFetch.add(sportKey);
        }
        if (racingTypes.includes("greyhound") && sportKey.includes("greyhound")) {
          sportKeysToFetch.add(sportKey);
        }
      }
    }

    console.log(`[Racing Odds] Sport keys to fetch: ${[...sportKeysToFetch].join(", ")}`);

    const allEvents: any[] = [];
    const cutoffTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);

    // Fetch odds for each racing sport
    for (const sportKey of sportKeysToFetch) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=au,uk,eu,us&markets=h2h&oddsFormat=decimal`;
        
        console.log(`[Racing Odds] Fetching ${sportKey}...`);
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`[Racing Odds] Failed to fetch ${sportKey}: ${response.status}`);
          continue;
        }

        const events = await response.json();
        console.log(`[Racing Odds] Got ${events.length} events from ${sportKey}`);

        // Filter to upcoming races within time window
        for (const event of events) {
          const startTime = new Date(event.commence_time);
          if (startTime <= cutoffTime && startTime > new Date()) {
            allEvents.push({
              ...event,
              sport_key: sportKey,
              is_horse: sportKey.includes("horse"),
              is_greyhound: sportKey.includes("greyhound"),
            });
          }
        }
      } catch (err) {
        console.error(`[Racing Odds] Error fetching ${sportKey}:`, err);
      }
    }

    console.log(`[Racing Odds] Total filtered events: ${allEvents.length}`);

    // Process and store events
    let eventsProcessed = 0;
    let runnersProcessed = 0;
    let marketsProcessed = 0;

    for (const event of allEvents) {
      try {
        // Determine sport type and extract track info
        const sport = event.is_horse ? "horse" : "greyhound";
        const trackMatch = event.sport_title?.match(/^(.+?)\s*(?:-|–)\s*Race\s+(\d+)/i);
        const track = trackMatch ? trackMatch[1].trim() : event.sport_title || "Unknown";
        const raceNumber = trackMatch ? parseInt(trackMatch[2]) : 1;
        
        // Determine country from sport key
        let country = "AU";
        if (event.sport_key.includes("_uk")) country = "UK";
        if (event.sport_key.includes("_us")) country = "US";
        if (event.sport_key.includes("_nz")) country = "NZ";

        // Upsert racing event
        const { data: raceEvent, error: eventError } = await supabase
          .from("racing_events")
          .upsert({
            external_id: event.id,
            sport,
            track,
            track_country: country,
            race_number: raceNumber,
            race_name: event.sport_title,
            distance_m: 0, // Not available from Odds API
            start_time_utc: event.commence_time,
            start_time_local: event.commence_time, // Would need TZ conversion
            status: "upcoming",
            field_size: event.outcomes?.length || 0,
            raw_payload: event,
          }, { onConflict: "external_id" })
          .select()
          .single();

        if (eventError) {
          console.error(`[Racing Odds] Error upserting event:`, eventError);
          continue;
        }

        eventsProcessed++;

        // Process runners (outcomes from h2h market)
        const h2hMarket = event.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h");
        const outcomes = h2hMarket?.outcomes || [];

        for (let i = 0; i < outcomes.length; i++) {
          const outcome = outcomes[i];
          
          // Upsert runner
          const { data: runner, error: runnerError } = await supabase
            .from("racing_runners")
            .upsert({
              event_id: raceEvent.id,
              runner_number: i + 1,
              runner_name: outcome.name,
              barrier_box: i + 1, // Approximation - real barrier not in API
            }, { onConflict: "event_id,runner_number" })
            .select()
            .single();

          if (runnerError) {
            console.error(`[Racing Odds] Error upserting runner:`, runnerError);
            continue;
          }

          runnersProcessed++;

          // Process odds from all bookmakers
          for (const bookmaker of event.bookmakers || []) {
            const market = bookmaker.markets?.find((m: any) => m.key === "h2h");
            const runnerOdds = market?.outcomes?.find((o: any) => o.name === outcome.name);
            
            if (runnerOdds) {
              const { error: marketError } = await supabase
                .from("racing_markets")
                .insert({
                  event_id: raceEvent.id,
                  runner_id: runner.id,
                  bookmaker: bookmaker.key,
                  market_type: "win",
                  odds_decimal: runnerOdds.price,
                });

              if (!marketError) marketsProcessed++;
            }
          }
        }
      } catch (err) {
        console.error(`[Racing Odds] Error processing event:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_processed: eventsProcessed,
        runners_processed: runnersProcessed,
        markets_processed: marketsProcessed,
        sport_keys_checked: [...sportKeysToFetch],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Racing Odds] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
