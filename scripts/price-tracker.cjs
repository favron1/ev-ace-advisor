#!/usr/bin/env node
/**
 * Price Tracker — stores Pinnacle + Polymarket snapshots over time
 * Detects line movements and divergences between the two
 * Run frequently close to kickoff for stale line exploitation
 */

const fs = require('fs');
const path = require('path');

const ODDS_API_KEY = '9e9724f2663bc69badbecfe4daf61534';
const HISTORY_DIR = path.join(__dirname, '..', 'data', 'price-history');
const ALERTS_FILE = path.join(__dirname, '..', 'data', 'movement-alerts.jsonl');

const SPORT_SLUGS = /^(nba|nhl|nfl|epl|sea|bun|lla|ucl|ufc|cbb|lig)/;
const ODDS_SPORTS = [
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a',
  'soccer_germany_bundesliga', 'soccer_uefa_champs_league',
  'basketball_nba', 'icehockey_nhl', 'mma_mixed_martial_arts'
];

// Movement thresholds
const PINNACLE_MOVE_THRESHOLD = 0.02;  // 2% move in Pinnacle = sharp money
const DIVERGENCE_THRESHOLD = 0.015;     // 1.5% divergence between Pinn move and Poly move
const EDGE_THRESHOLD = 0.01;            // 1% minimum edge to flag

async function getPolymarketEvents() {
  let events = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const resp = await fetch(`https://gamma-api.polymarket.com/events?closed=false&limit=100&order=volume24hr&ascending=false&offset=${offset}`);
    const data = await resp.json();
    if (!data.length) break;
    for (const e of data) {
      if (!e.title || !(e.title.includes(' vs ') || e.title.includes(' vs. '))) continue;
      if (!SPORT_SLUGS.test(e.slug || '')) continue;
      events.push(e);
    }
  }
  return events;
}

async function getPinnacleLines() {
  let games = [];
  for (const sport of ODDS_SPORTS) {
    try {
      const resp = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&bookmakers=pinnacle&oddsFormat=decimal`);
      const data = await resp.json();
      if (!Array.isArray(data)) continue;
      for (const g of data) {
        const pinn = g.bookmakers?.find(b => b.key === 'pinnacle');
        if (!pinn) continue;
        const market = pinn.markets?.find(m => m.key === 'h2h');
        if (!market) continue;
        const odds = {};
        market.outcomes.forEach(o => odds[o.name] = o.price);
        const hoursAway = (new Date(g.commence_time) - Date.now()) / 3600000;
        if (hoursAway < -2 || hoursAway > 168) continue;
        games.push({
          home: g.home_team, away: g.away_team, sport,
          commence: g.commence_time, hoursAway, odds
        });
      }
    } catch (e) { /* skip */ }
  }
  return games;
}

function fuzzyMatch(pinnGame, polyEvent) {
  const t = polyEvent.title.toLowerCase();
  const homeLast = pinnGame.home.toLowerCase().split(/\s+/).pop();
  const awayLast = pinnGame.away.toLowerCase().split(/\s+/).pop();
  return t.includes(homeLast) && t.includes(awayLast);
}

function getHistoryFile(slug) {
  return path.join(HISTORY_DIR, `${slug}.jsonl`);
}

function loadHistory(slug) {
  const file = getHistoryFile(slug);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function appendHistory(slug, snapshot) {
  const file = getHistoryFile(slug);
  fs.appendFileSync(file, JSON.stringify(snapshot) + '\n');
}

function appendAlert(alert) {
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(alert) + '\n');
}

async function run() {
  const now = new Date();
  console.log(`\n🔍 Price Tracker — ${now.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}`);

  // Fetch data
  const [polyEvents, pinnGames] = await Promise.all([
    getPolymarketEvents(),
    getPinnacleLines()
  ]);
  console.log(`📡 Poly: ${polyEvents.length} events | Pinnacle: ${pinnGames.length} games`);

  let snapshots = 0;
  let alerts = [];

  for (const pg of pinnGames) {
    const match = polyEvents.find(e => fuzzyMatch(pg, e));
    if (!match || !match.markets) continue;

    const vigTotal = Object.values(pg.odds).reduce((s, o) => s + 1 / o, 0);
    const slug = match.slug;

    // Build snapshot for this game
    const snapshot = {
      timestamp: now.toISOString(),
      hoursToKickoff: pg.hoursAway,
      outcomes: {}
    };

    for (const [team, decOdds] of Object.entries(pg.odds)) {
      const pinnProb = 1 / decOdds / vigTotal;
      const isDrawSearch = team === 'Draw';

      const polyMkt = match.markets.find(m => {
        const q = m.question.toLowerCase();
        if (isDrawSearch) return q.includes('draw');
        const teamLast = team.toLowerCase().split(' ').pop();
        return q.includes('win') && q.includes(teamLast) && !q.includes('ko') && !q.includes('tko');
      });

      if (!polyMkt || !polyMkt.clobTokenIds) continue;
      const polyPrice = JSON.parse(polyMkt.outcomePrices || '[]').map(Number)[0];

      snapshot.outcomes[team] = {
        pinnProb: Math.round(pinnProb * 1000) / 1000,
        polyPrice: Math.round(polyPrice * 1000) / 1000,
        edge: Math.round((pinnProb - polyPrice) * 1000) / 1000,
        pinnDecimal: decOdds,
        tokenId: JSON.parse(polyMkt.clobTokenIds || '[]')[0]
      };
    }

    if (Object.keys(snapshot.outcomes).length === 0) continue;

    // Load previous snapshots and detect movement
    const history = loadHistory(slug);
    const prevSnapshot = history.length > 0 ? history[history.length - 1] : null;

    if (prevSnapshot) {
      for (const [team, curr] of Object.entries(snapshot.outcomes)) {
        const prev = prevSnapshot.outcomes?.[team];
        if (!prev) continue;

        const pinnMove = curr.pinnProb - prev.pinnProb;
        const polyMove = curr.polyPrice - prev.polyPrice;
        const divergence = pinnMove - polyMove;
        const timeDelta = (new Date(snapshot.timestamp) - new Date(prevSnapshot.timestamp)) / 60000; // minutes

        // Detect: Pinnacle moved significantly but Polymarket didn't follow
        if (Math.abs(pinnMove) >= PINNACLE_MOVE_THRESHOLD && Math.abs(divergence) >= DIVERGENCE_THRESHOLD) {
          const alert = {
            type: 'STALE_LINE',
            timestamp: now.toISOString(),
            game: match.title,
            slug,
            team,
            hoursToKickoff: pg.hoursAway,
            pinnMove: Math.round(pinnMove * 1000) / 1000,
            polyMove: Math.round(polyMove * 1000) / 1000,
            divergence: Math.round(divergence * 1000) / 1000,
            currentEdge: curr.edge,
            minutesSinceLastScan: Math.round(timeDelta),
            polyPrice: curr.polyPrice,
            pinnProb: curr.pinnProb,
            tokenId: curr.tokenId
          };
          alerts.push(alert);
          appendAlert(alert);
          console.log(`🚨 STALE LINE: ${match.title} | ${team} | Pinn moved ${(pinnMove * 100).toFixed(1)}% but Poly only moved ${(polyMove * 100).toFixed(1)}% | Edge: ${(curr.edge * 100).toFixed(1)}%`);
        }

        // Detect: Polymarket moved without Pinnacle moving (fade opportunity)
        if (Math.abs(polyMove) >= PINNACLE_MOVE_THRESHOLD && Math.abs(pinnMove) < 0.005) {
          const alert = {
            type: 'POLY_DRIFT',
            timestamp: now.toISOString(),
            game: match.title,
            slug,
            team,
            hoursToKickoff: pg.hoursAway,
            pinnMove: Math.round(pinnMove * 1000) / 1000,
            polyMove: Math.round(polyMove * 1000) / 1000,
            currentEdge: curr.edge,
            minutesSinceLastScan: Math.round(timeDelta),
            polyPrice: curr.polyPrice,
            pinnProb: curr.pinnProb,
            tokenId: curr.tokenId
          };
          alerts.push(alert);
          appendAlert(alert);
          console.log(`🔄 POLY DRIFT: ${match.title} | ${team} | Poly moved ${(polyMove * 100).toFixed(1)}% but Pinn didn't move | Fade opportunity`);
        }
      }
    }

    // Save snapshot
    appendHistory(slug, snapshot);
    snapshots++;

    // Print current state
    const h = pg.hoursAway;
    const urgency = h <= 1 ? '🔴' : h <= 6 ? '🟡' : '⚪';
    const outcomes = Object.entries(snapshot.outcomes)
      .map(([t, o]) => `${t}: Pinn ${(o.pinnProb * 100).toFixed(1)}% Poly ${(o.polyPrice * 100).toFixed(1)}¢ Edge ${(o.edge * 100).toFixed(1)}%`)
      .join(' | ');
    console.log(`${urgency} ${match.title} (${h.toFixed(1)}h) | ${outcomes}`);
  }

  console.log(`\n📊 Stored ${snapshots} snapshots`);
  if (alerts.length) {
    console.log(`🚨 ${alerts.length} MOVEMENT ALERTS!`);
  } else {
    console.log(`✅ No movement alerts`);
  }

  return { snapshots, alerts };
}

run().catch(e => console.error('FATAL:', e));
