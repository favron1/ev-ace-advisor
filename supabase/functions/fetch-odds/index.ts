import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OddsApiResponse {
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
      }[];
    }[];
  }[];
}

interface ValueBet {
  id: string;
  event: string;
  selection: string;
  odds: number;
  fairOdds: number;
  edge: number;
  ev: number;
  confidence: "high" | "medium" | "low";
  sport: string;
  commenceTime: string;
  bookmaker: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    
    if (!oddsApiKey) {
      console.error('ODDS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch odds for soccer (football) - Premier League
    const sports = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga'];
    const allValueBets: ValueBet[] = [];

    for (const sport of sports) {
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
      
      console.log(`Fetching odds for ${sport}...`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch odds for ${sport}: ${response.status}`);
        continue;
      }

      const data: OddsApiResponse[] = await response.json();
      console.log(`Got ${data.length} events for ${sport}`);

      // Process each event and find value bets
      for (const event of data) {
        if (!event.bookmakers || event.bookmakers.length < 2) continue;

        // Get all odds for each outcome across bookmakers
        const outcomeOdds: { [key: string]: { odds: number; bookmaker: string }[] } = {};

        for (const bookmaker of event.bookmakers) {
          const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
          if (!h2hMarket) continue;

          for (const outcome of h2hMarket.outcomes) {
            if (!outcomeOdds[outcome.name]) {
              outcomeOdds[outcome.name] = [];
            }
            outcomeOdds[outcome.name].push({
              odds: outcome.price,
              bookmaker: bookmaker.title
            });
          }
        }

        // Calculate fair odds (average across bookmakers) and find value
        for (const [selection, oddsArray] of Object.entries(outcomeOdds)) {
          if (oddsArray.length < 2) continue;

          const avgOdds = oddsArray.reduce((sum, o) => sum + o.odds, 0) / oddsArray.length;
          const maxOdds = Math.max(...oddsArray.map(o => o.odds));
          const bestBookmaker = oddsArray.find(o => o.odds === maxOdds)!;

          // Calculate edge: how much better is the best odds vs fair odds
          const fairOdds = avgOdds;
          const edge = ((maxOdds - fairOdds) / fairOdds) * 100;

          // Only include if there's positive edge (value)
          if (edge > 2) {
            // Calculate EV: (probability * profit) - (1 - probability) * stake
            const impliedProb = 1 / fairOdds;
            const ev = (impliedProb * (maxOdds - 1) - (1 - impliedProb)) * 100;

            let confidence: "high" | "medium" | "low" = "low";
            if (edge > 10) confidence = "high";
            else if (edge > 5) confidence = "medium";

            allValueBets.push({
              id: `${event.id}-${selection}`,
              event: `${event.home_team} vs ${event.away_team}`,
              selection: selection,
              odds: maxOdds,
              fairOdds: fairOdds,
              edge: edge,
              ev: ev,
              confidence: confidence,
              sport: event.sport_title,
              commenceTime: event.commence_time,
              bookmaker: bestBookmaker.bookmaker
            });
          }
        }
      }
    }

    // Sort by edge (highest first) and limit to top 20
    allValueBets.sort((a, b) => b.edge - a.edge);
    const topBets = allValueBets.slice(0, 20);

    console.log(`Found ${allValueBets.length} value bets, returning top ${topBets.length}`);

    return new Response(
      JSON.stringify({ bets: topBets }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching odds:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
