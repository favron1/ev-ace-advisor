// V2 SCANNER — Uses series_id for NCAAB/NBA/NHL/UFC and tag_slug for EPL/La Liga
// Fixes all matching bugs: both-teams-in-event, no KO/TKO markets, proper outcome-price pairing

const fs = require("fs");
const ODDS_KEY = "9e9724f2663bc69badbecfe4daf61534";

// Sport configs: seriesId OR tagSlug for Polymarket, oddsKey for Odds API
const SPORTS = {
  ncaab: { seriesId: "10470", oddsKey: "basketball_ncaab", binary: true },
  nba:   { seriesId: "10345", oddsKey: "basketball_nba", binary: true },
  nhl:   { seriesId: "10346", oddsKey: "icehockey_nhl", binary: true },
  ufc:   { seriesId: "38",    oddsKey: "mma_mixed_martial_arts", binary: true },
  epl:   { tagSlug: "epl",    oddsKey: "soccer_epl", binary: false },
  laliga:{ seriesId: "10193", oddsKey: "soccer_spain_la_liga", binary: false },
  seriea:{ seriesId: "10203", oddsKey: "soccer_italy_serie_a", binary: false },
  bundesliga:{ seriesId: "10194", oddsKey: "soccer_germany_bundesliga", binary: false },
  ligue1:{ seriesId: "10195", oddsKey: "soccer_france_ligue_one", binary: false },
  ucl:   { seriesId: "10204", oddsKey: "soccer_uefa_champs_league", binary: false },
  mls:   { seriesId: "10189", oddsKey: "soccer_usa_mls", binary: false },
};

// Team name normalization
function normalize(name) {
  return (name || "").toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|ssc|rc|as|ca|vfl|fsv|rb|sv|bsc|tsg|1\.)(?:\s|$)/gi, " ")
    .replace(/\bcity\b/g, "")
    .replace(/\bunited\b/g, "")
    .replace(/\bwanderers\b/g, "")
    .replace(/\bnittany lions\b/g, "")
    .replace(/\bbluejays\b|blue jays\b/g, "")
    .replace(/\bbears\b|\btigers\b|\bbulldogs\b|\beagles\b|\bhawks\b|\bcardinals\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(oddsTeam, polyText) {
  const n1 = normalize(oddsTeam);
  const n2 = normalize(polyText);
  if (!n1 || !n2) return false;
  
  // Check if any meaningful word (>4 chars) from odds team appears in poly text
  // Use >4 chars to avoid "Real" matching across Real Sociedad/Real Oviedo/Real Madrid
  const words1 = n1.split(" ").filter(w => w.length > 4);
  if (words1.length === 0) {
    // Fallback: use all words >2 chars but require exact match
    const fw = n1.split(" ").filter(w => w.length > 2);
    return fw.length > 0 && fw.every(w => n2.split(" ").includes(w));
  }
  const words2 = n2.split(" ");
  
  // At least one significant word must match exactly
  return words1.some(w => words2.includes(w));
}

// Is this a moneyline/winner market? (exclude KO, TKO, spreads, O/U, BTTS, etc.)
function isMoneylineMarket(question) {
  const q = (question || "").toLowerCase();
  if (q.includes("ko or tko") || q.includes("knockout") || q.includes("by ko") || q.includes("by tko")) return false;
  if (q.includes("submission") || q.includes("decision") || q.includes("by points")) return false;
  if (q.includes("o/u") || q.includes("over/under") || q.includes("spread")) return false;
  if (q.includes("both teams") || q.includes("btts")) return false;
  if (q.includes("draw")) return false;
  if (q.includes("manager") || q.includes("champion") || q.includes("relegated") || q.includes("trophy")) return false;
  if (q.includes("top 4") || q.includes("finish in") || q.includes("win the 20")) return false;
  if (q.includes("round of")) return false;
  return true;
}

// Get consensus probability from multiple bookmakers (weighted by 1/vig)
function getConsensusProb(game, teamName) {
  let weightedProb = 0, totalWeight = 0;
  
  for (const bm of game.bookmakers || []) {
    const mkt = (bm.markets || []).find(m => m.key === "h2h");
    if (!mkt) continue;
    
    const overround = mkt.outcomes.reduce((s, o) => s + 1 / o.price, 0);
    if (overround <= 0) continue;
    const weight = 1 / Math.max(overround - 1, 0.001);
    
    // Find this team's outcome
    const outcome = mkt.outcomes.find(o => {
      const on = normalize(o.name);
      const tn = normalize(teamName);
      const oWords = on.split(" ").filter(w => w.length > 3);
      const tWords = tn.split(" ").filter(w => w.length > 3);
      return oWords.some(w => tWords.some(tw => tw.includes(w) || w.includes(tw)));
    });
    
    if (!outcome) continue;
    const fairProb = (1 / outcome.price) / overround;
    weightedProb += fairProb * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? { prob: weightedProb / totalWeight, books: Math.round(totalWeight / 100) } : null;
}

async function getPolyEvents(sport, cfg) {
  const events = [];
  if (cfg.seriesId) {
    for (let off = 0; off < 600; off += 100) {
      const r = await fetch(`https://gamma-api.polymarket.com/events?series_id=${cfg.seriesId}&limit=100&offset=${off}&active=true&closed=false`);
      const d = await r.json();
      if (!d.length) break;
      events.push(...d);
    }
  } else if (cfg.tagSlug) {
    for (let off = 0; off < 200; off += 100) {
      const r = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=${cfg.tagSlug}&limit=100&offset=${off}&active=true&closed=false`);
      const d = await r.json();
      if (!d.length) break;
      // Filter to game events only (has "vs" in title)
      events.push(...d.filter(e => (e.title || "").includes(" vs")));
    }
  }
  return events;
}

async function getOddsGames(oddsKey) {
  const r = await fetch(`https://api.the-odds-api.com/v4/sports/${oddsKey}/odds/?apiKey=${ODDS_KEY}&regions=us,eu,uk,au&markets=h2h&oddsFormat=decimal`);
  if (!r.ok) return [];
  return r.json();
}

async function scanSport(sport, cfg) {
  console.log(`\n🔍 Scanning ${sport.toUpperCase()}...`);
  
  const [polyEvents, oddsGames] = await Promise.all([
    getPolyEvents(sport, cfg),
    getOddsGames(cfg.oddsKey),
  ]);
  
  console.log(`  Poly: ${polyEvents.length} events | Odds: ${oddsGames.length} games`);
  
  const edges = [];
  
  for (const game of oddsGames) {
    const gameStart = new Date(game.commence_time);
    const hoursAway = (gameStart - Date.now()) / 3600000;
    if (hoursAway < 0 || hoursAway > 168) continue;
    
    // Find matching Poly event — BOTH teams must be in event title or market questions
    for (const event of polyEvents) {
      const allText = (event.title || "") + " " + (event.markets || []).map(m => m.question || "").join(" ");
      
      if (!teamsMatch(game.home_team, allText) || !teamsMatch(game.away_team, allText)) continue;
      
      // Found a match! Now scan each market for moneyline edges
      for (const market of event.markets || []) {
        if (!market.active || market.closed) continue;
        if (!isMoneylineMarket(market.question)) continue;
        
        const outcomes = JSON.parse(market.outcomes || "[]");
        const prices = JSON.parse(market.outcomePrices || "[]");
        if (outcomes.length < 2 || prices.length < 2) continue;
        
        // Check each outcome
        for (let i = 0; i < outcomes.length; i++) {
          const outcomeName = outcomes[i];
          const polyPrice = parseFloat(prices[i]);
          if (polyPrice <= 0.01 || polyPrice >= 0.99) continue;
          
          // Which team does this outcome represent?
          let matchedTeam = null;
          if (teamsMatch(game.home_team, outcomeName)) matchedTeam = game.home_team;
          else if (teamsMatch(game.away_team, outcomeName)) matchedTeam = game.away_team;
          // For "Yes" outcomes in "Will Team X win..." format:
          else if (outcomeName === "Yes" || outcomeName === "No") {
            const q = market.question || "";
            if (teamsMatch(game.home_team, q)) matchedTeam = outcomeName === "Yes" ? game.home_team : null;
            else if (teamsMatch(game.away_team, q)) matchedTeam = outcomeName === "Yes" ? game.away_team : null;
            // For "No" — it means NOT this team winning, so skip (complex)
            if (outcomeName === "No") continue;
          }
          
          if (!matchedTeam) continue;
          
          const consensus = getConsensusProb(game, matchedTeam);
          if (!consensus || consensus.books < 5) continue;
          
          const edge = consensus.prob - polyPrice;
          if (edge < 0.015) continue; // Min 1.5% edge
          
          const tokenId = market.clobTokenIds ? JSON.parse(market.clobTokenIds)[i] : null;
          const liquidity = parseFloat(market.liquidity || 0);
          
          edges.push({
            sport, binary: cfg.binary,
            event: event.title, market: market.question,
            side: `${matchedTeam} (${outcomeName})`,
            sharpProb: consensus.prob, polyPrice, edge: edge * 100,
            books: consensus.books, liquidity, hoursAway,
            tokenId,
            conditionId: market.conditionId,
          });
        }
        
        // Also check FADE (buy NO side for overpriced favorites)
        // ONLY for binary team-name markets (e.g. "Cavaliers" vs "Nets")
        // Skip Yes/No markets — "No" on "Will Arsenal win?" includes draws, can't fade cleanly
        const isBinaryTeamMarket = outcomes.length === 2 && 
          outcomes.every(o => o !== "Yes" && o !== "No" && o !== "Over" && o !== "Under");
        
        if (isBinaryTeamMarket) {
        for (let i = 0; i < outcomes.length; i++) {
          const outcomeName = outcomes[i];
          const polyPrice = parseFloat(prices[i]);
          if (polyPrice <= 0.01 || polyPrice >= 0.99) continue;
          
          let matchedTeam = null;
          if (teamsMatch(game.home_team, outcomeName)) matchedTeam = game.home_team;
          else if (teamsMatch(game.away_team, outcomeName)) matchedTeam = game.away_team;
          
          if (!matchedTeam) continue;
          
          const consensus = getConsensusProb(game, matchedTeam);
          if (!consensus || consensus.books < 5) continue;
          
          // FADE: if Poly overprices this team, buy the OTHER side
          const noPrice = 1 - polyPrice;
          const noSharp = 1 - consensus.prob;
          const fadeEdge = noSharp - noPrice;
          
          if (fadeEdge < 0.015) continue;
          
          // Get the NO token (opposite index)
          const noIdx = i === 0 ? 1 : 0;
          const noTokenId = market.clobTokenIds ? JSON.parse(market.clobTokenIds)[noIdx] : null;
          const liquidity = parseFloat(market.liquidity || 0);
          
          edges.push({
            sport, binary: cfg.binary,
            event: event.title, market: market.question,
            side: `${matchedTeam} NO (fade)`,
            sharpProb: noSharp, polyPrice: noPrice, edge: fadeEdge * 100,
            books: consensus.books, liquidity, hoursAway,
            tokenId: noTokenId,
            conditionId: market.conditionId,
          });
        }
      }
      } // close isBinaryTeamMarket
      break; // Only match first event per game
    }
  }
  
  return edges;
}

async function main() {
  console.log("=== V2 POLYMARKET EDGE SCAN ===");
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  let allEdges = [];
  
  for (const [sport, cfg] of Object.entries(SPORTS)) {
    try {
      const edges = await scanSport(sport, cfg);
      console.log(`  → ${edges.length} edges found`);
      allEdges.push(...edges);
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Deduplicate by tokenId
  const seen = new Set();
  allEdges = allEdges.filter(e => {
    const key = e.tokenId || (e.market + e.side);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Sort by edge descending
  allEdges.sort((a, b) => b.edge - a.edge);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TOTAL EDGES: ${allEdges.length}`);
  console.log(`${"=".repeat(60)}\n`);
  
  // Show top edges
  for (const e of allEdges.slice(0, 40)) {
    const icon = e.binary ? "🏀" : "⚽";
    console.log(`${icon} [${e.sport.toUpperCase().padEnd(10)}] ${e.side.padEnd(40)} | Sharp: ${(e.sharpProb*100).toFixed(1)}% | Poly: ${(e.polyPrice*100).toFixed(1)}¢ | Edge: ${e.edge.toFixed(1)}% | ${e.books}bk | $${e.liquidity.toFixed(0)} | ${e.hoursAway.toFixed(0)}h`);
  }
  
  // Bettable now: ≥2% edge, ≥$100 liq, <48h, has token
  const bettable = allEdges.filter(e => e.edge >= 2.0 && e.liquidity >= 100 && e.hoursAway < 48 && e.tokenId);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`BETTABLE NOW (≥2%, ≥$100 liq, <48h): ${bettable.length}`);
  console.log(`${"=".repeat(60)}\n`);
  
  for (const e of bettable) {
    console.log(`  ✅ [${e.sport.toUpperCase()}] ${e.side} @ ${(e.polyPrice*100).toFixed(1)}¢ | Edge: ${e.edge.toFixed(1)}% | ${e.hoursAway.toFixed(0)}h | Liq: $${e.liquidity.toFixed(0)}`);
  }
  
  // === STAKE STRATEGY ===
  // Based on sharp confidence + edge size + book agreement
  // Higher confidence = bigger bet. Scale with bankroll.
  const BANKROLL = 350; // Update this or pass via env
  const MAX_DEPLOYED_PCT = 0.75; // Never deploy more than 75%
  const maxDeploy = BANKROLL * MAX_DEPLOYED_PCT;
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`STAKE STRATEGY (Bankroll: $${BANKROLL})`);
  console.log(`${"=".repeat(60)}\n`);
  
  for (const e of bettable) {
    // Tier 1: Sharp ≥60% AND edge ≥10% → 12-15% bankroll
    // Tier 2: Sharp ≥55% AND edge ≥5% → 8-10% bankroll
    // Tier 3: Sharp ≥50% AND edge ≥3% → 5-7% bankroll
    // Tier 4: Edge ≥1.5% → 3-4% bankroll
    let pct, tier;
    if (e.sharpProb >= 0.60 && e.edge >= 10) {
      pct = 0.12 + Math.min(e.edge / 100, 0.03); // 12-15%
      tier = "🔥 TIER 1 (HIGH CONVICTION)";
    } else if (e.sharpProb >= 0.55 && e.edge >= 5) {
      pct = 0.08 + Math.min(e.edge / 200, 0.02); // 8-10%
      tier = "⚡ TIER 2 (STRONG)";
    } else if (e.sharpProb >= 0.50 && e.edge >= 3) {
      pct = 0.05 + Math.min(e.edge / 200, 0.02); // 5-7%
      tier = "📊 TIER 3 (MODERATE)";
    } else {
      pct = 0.03 + Math.min(e.edge / 300, 0.01); // 3-4%
      tier = "📉 TIER 4 (LEAN)";
    }
    
    // Book agreement bonus: >15 books = +1%, >20 books = +2%
    if (e.books >= 20) pct += 0.02;
    else if (e.books >= 15) pct += 0.01;
    
    const stake = Math.min(Math.round(BANKROLL * pct), maxDeploy * 0.25); // Cap single bet at 25% of max
    const shares = Math.floor(stake / e.polyPrice);
    
    e.stake = stake;
    e.shares = shares;
    e.tier = tier;
    
    console.log(`${tier}`);
    console.log(`  ${e.sport.toUpperCase()} | ${e.side} | Sharp: ${(e.sharpProb*100).toFixed(1)}% | Poly: ${(e.polyPrice*100).toFixed(1)}¢ | Edge: ${e.edge.toFixed(1)}% | ${e.books} books`);
    console.log(`  → $${stake} (${(pct*100).toFixed(1)}% bankroll) = ${shares}sh @ ${(e.polyPrice*100).toFixed(1)}¢\n`);
  }
  
  const totalStake = bettable.reduce((s, e) => s + (e.stake || 0), 0);
  console.log(`Total recommended: $${totalStake} / $${maxDeploy.toFixed(0)} max (${(totalStake/BANKROLL*100).toFixed(1)}% of bankroll)`);

  // Save results
  fs.writeFileSync("/tmp/poly-scan/v2-results.json", JSON.stringify({ allEdges, bettable, timestamp: new Date().toISOString() }, null, 2));
  console.log("\nSaved to /tmp/poly-scan/v2-results.json");
}

main().catch(e => console.error("FATAL:", e));
