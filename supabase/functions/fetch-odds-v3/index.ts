import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
        point?: number;
      }[];
    }[];
  }[];
}

type SportId = "soccer" | "basketball" | "tennis" | "afl" | "nrl";

function mapSportKey(sportKey: string): SportId | "other" {
  if (sportKey.startsWith("soccer_")) return "soccer";
  if (sportKey.startsWith("basketball_")) return "basketball";
  if (sportKey.startsWith("tennis_")) return "tennis";
  if (sportKey.startsWith("aussierules_")) return "afl";
  if (sportKey.startsWith("rugbyleague_")) return "nrl";
  return "other";
}

function allowedPrefixesFromSports(sports: string[]): string[] {
  const prefixes: string[] = [];
  if (sports.includes("soccer")) prefixes.push("soccer_");
  if (sports.includes("basketball")) prefixes.push("basketball_");
  if (sports.includes("tennis")) prefixes.push("tennis_");
  if (sports.includes("afl")) prefixes.push("aussierules_");
  if (sports.includes("nrl")) prefixes.push("rugbyleague_");
  return prefixes;
}

async function fetchActiveSportsIndex(oddsApiKey: string) {
  const sportsIndexUrl = `https://api.the-odds-api.com/v4/sports/?apiKey=${oddsApiKey}`;
  const resp = await fetch(sportsIndexUrl);
  if (!resp.ok) throw new Error(`Failed to fetch sports index: ${resp.status}`);
  return (await resp.json()) as Array<{ key: string; active: boolean }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oddsApiKey = Deno.env.get("ODDS_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!oddsApiKey) throw new Error("ODDS_API_KEY not configured");

    const body = (await req.json().catch(() => ({}))) as { sports?: string[] };
    const requestedSports = Array.isArray(body.sports) && body.sports.length > 0 ? body.sports : ["soccer"];
    const allowedPrefixes = allowedPrefixesFromSports(requestedSports);
    if (allowedPrefixes.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events_processed: 0, markets_processed: 0, reason: "No sports selected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sportsIndex = await fetchActiveSportsIndex(oddsApiKey);
    const sportKeys = sportsIndex
      .filter((s) => s.active && allowedPrefixes.some((p) => s.key.startsWith(p)))
      .map((s) => s.key);

    console.log(`fetch-odds-v3: requested=${requestedSports.join(",")}; keys=${sportKeys.length}`);

    // Regions note:
    // - Basketball + Tennis are often strongest in US markets
    // - Soccer exists across multiple regions
    // Using multi-region to maximize coverage.
    const regions = "us,au,uk,eu";
    const markets = "h2h,totals,spreads";

    let totalEvents = 0;
    let totalMarkets = 0;

    for (const sportKey of sportKeys) {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${oddsApiKey}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;
      console.log(`Fetching ${sportKey}...`);

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${sportKey}: ${response.status}`);
        continue;
      }

      const events: OddsApiEvent[] = await response.json();
      console.log(`Got ${events.length} events for ${sportKey}`);

      for (const event of events) {
        const startTimeUTC = new Date(event.commence_time);
        if (startTimeUTC <= new Date()) continue;

        const sport = mapSportKey(sportKey);
        if (sport === "other") continue;

        const league = event.sport_title;

        const { error: eventError } = await supabase
          .from("events")
          .upsert(
            {
              id: event.id,
              sport,
              league,
              home_team: event.home_team,
              away_team: event.away_team,
              start_time_utc: startTimeUTC.toISOString(),
              start_time_aedt: startTimeUTC.toISOString(),
              status: "upcoming",
              raw_payload: event,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          );

        if (eventError) {
          console.error(`Error upserting event ${event.id}:`, eventError);
          continue;
        }

        totalEvents++;

        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              const marketId = `${event.id}_${market.key}_${outcome.name}_${bookmaker.key}`;

              const { error: marketError } = await supabase
                .from("markets")
                .upsert(
                  {
                    id: marketId,
                    event_id: event.id,
                    market_type: market.key,
                    line: outcome.point ?? null,
                    selection: outcome.name,
                    odds_decimal: outcome.price,
                    bookmaker: bookmaker.title,
                    last_updated: new Date().toISOString(),
                  },
                  { onConflict: "id" },
                );

              if (marketError) {
                console.error(`Error upserting market ${marketId}:`, marketError);
                continue;
              }

              totalMarkets++;

              await supabase.from("odds_snapshots").insert({
                event_id: event.id,
                market_id: marketId,
                bookmaker: bookmaker.title,
                odds_decimal: outcome.price,
                captured_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_processed: totalEvents,
        markets_processed: totalMarkets,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in fetch-odds-v3:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
