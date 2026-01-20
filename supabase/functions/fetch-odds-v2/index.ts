import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Map The Odds API sport keys to our sport types
function mapSportKey(sportKey: string): string {
  if (sportKey.startsWith('soccer')) return 'soccer';
  if (sportKey.startsWith('basketball')) return 'basketball';
  if (sportKey.startsWith('aussierules')) return 'afl';
  if (sportKey.startsWith('rugbyleague')) return 'nrl';
  if (sportKey.startsWith('tennis')) return 'tennis';
  return 'soccer';
}

// Convert UTC to AEDT (Australia/Sydney)
function toAEDT(utcDateString: string): Date {
  const utcDate = new Date(utcDateString);
  // Create formatter for Australia/Sydney timezone
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Get the parts and construct the AEDT date
  const parts = formatter.formatToParts(utcDate);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  
  const year = parseInt(getPart('year'));
  const month = parseInt(getPart('month')) - 1;
  const day = parseInt(getPart('day'));
  const hour = parseInt(getPart('hour'));
  const minute = parseInt(getPart('minute'));
  const second = parseInt(getPart('second'));
  
  return new Date(year, month, day, hour, minute, second);
}

// Get current time in AEDT
function getNowAEDT(): Date {
  return toAEDT(new Date().toISOString());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!oddsApiKey) {
      throw new Error('ODDS_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const nowAEDT = getNowAEDT();
    
    // Sports to fetch from The Odds API
    const sports = [
      'soccer_epl',
      'soccer_australia_aleague',
      'soccer_spain_la_liga',
      'soccer_germany_bundesliga',
      'soccer_italy_serie_a',
      'soccer_france_ligue_one',
      'basketball_nba',
      'basketball_nbl',
      'aussierules_afl',
      'rugbyleague_nrl'
    ];

    let totalEvents = 0;
    let totalMarkets = 0;

    for (const sportKey of sports) {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${oddsApiKey}&regions=au&markets=h2h,totals,spreads&oddsFormat=decimal`;
      
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
        
        // Skip events that have already started (compare actual instants)
        if (startTimeUTC <= new Date()) {
          console.log(`Skipping past event: ${event.home_team} vs ${event.away_team}`);
          continue;
        }

        // Determine league from sport_title
        const league = event.sport_title;
        const sport = mapSportKey(sportKey);

        // Upsert event
        const { error: eventError } = await supabase
          .from('events')
          .upsert({
            id: event.id,
            sport: sport,
            league: league,
            home_team: event.home_team,
            away_team: event.away_team,
            start_time_utc: startTimeUTC.toISOString(),
            // Store the same instant; frontend renders it in Australia/Sydney
            start_time_aedt: startTimeUTC.toISOString(),
            status: 'upcoming',
            raw_payload: event,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (eventError) {
          console.error(`Error upserting event ${event.id}:`, eventError);
          continue;
        }

        totalEvents++;

        // Process bookmakers and markets
        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              const marketId = `${event.id}_${market.key}_${outcome.name}_${bookmaker.key}`;
              
              // Upsert market
              const { error: marketError } = await supabase
                .from('markets')
                .upsert({
                  id: marketId,
                  event_id: event.id,
                  market_type: market.key,
                  line: outcome.point || null,
                  selection: outcome.name,
                  odds_decimal: outcome.price,
                  bookmaker: bookmaker.title,
                  last_updated: new Date().toISOString()
                }, { onConflict: 'id' });

              if (marketError) {
                console.error(`Error upserting market ${marketId}:`, marketError);
                continue;
              }

              totalMarkets++;

              // Insert odds snapshot for CLV tracking
              await supabase
                .from('odds_snapshots')
                .insert({
                  event_id: event.id,
                  market_id: marketId,
                  bookmaker: bookmaker.title,
                  odds_decimal: outcome.price,
                  captured_at: new Date().toISOString()
                });
            }
          }
        }
      }
    }

    // Clean up old events (completed or past)
    const { error: cleanupError } = await supabase
      .from('events')
      .update({ status: 'completed' })
      .lt('start_time_utc', new Date().toISOString())
      .eq('status', 'upcoming');

    if (cleanupError) {
      console.error('Error cleaning up old events:', cleanupError);
    }

    console.log(`Processed ${totalEvents} events with ${totalMarkets} markets`);

    return new Response(
      JSON.stringify({
        success: true,
        events_processed: totalEvents,
        markets_processed: totalMarkets,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-odds-v2:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
