/**
 * Correlated Stacker v1.0 — Stack correlated positions within the same event
 * When an edge is found on Team A win, also check draw NO and opponent NO
 */

const { ClobClient } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const CLOB_HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137;
const PRIVATE_KEY = '39eddbe61cd90309f66cb3230c4e3441f56a1ebe007c9d403ab46e75b23bd2a6';
const API_CREDS = {
  key: 'bab3d213-0e2c-c46e-e55b-f44667339838',
  secret: 'pJRVrh2WOxX4OqLOlmRQgeG1lAtrivbyuzRCBNFyUZk=',
  passphrase: 'e353c2d28934bac4990cf12825e5fcd7ffe9e93d888a823f19aa2087ee3d5a79'
};
const FUNDER = '0xFaC31C44748daf2d09c6aA26C62E06306B106d9F';
const ODDS_API_KEY = '9e9724f2663bc69badbecfe4daf61534';

const MIN_EDGE = 2.0;
const PRIMARY_SIZE = 10;
const CORRELATED_SIZE = 5; // 50% of primary
const SPORT_SLUGS = /^(nba|nhl|epl|sea|bun|lal|ucl|ufc|cbb|crint|atp|mlb|codmw|bundesliga|french)/;
const SPORTS = [
  'soccer_epl', 'soccer_italy_serie_a', 'soccer_germany_bundesliga',
  'soccer_spain_la_liga', 'soccer_uefa_champs_league',
  'basketball_nba', 'basketball_ncaab', 'icehockey_nhl', 'mma_mixed_martial_arts'
];

const DATA_DIR = path.join(__dirname, 'data');
const TRADE_LOG = path.join(DATA_DIR, 'correlated-trades.jsonl');
const { logPaperTrade } = require('./paper-logger.cjs');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function log(msg) { console.log(`[${new Date().toISOString()}] [STACK] ${msg}`); }

async function createClient() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  return new ClobClient(CLOB_HOST, CHAIN_ID, wallet, API_CREDS, 2, FUNDER);
}

async function getPinnacleGames() {
  const now = Date.now();
  const games = [];
  for (const sport of SPORTS) {
    try {
      const resp = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&bookmakers=pinnacle&oddsFormat=decimal`
      );
      const data = await resp.json();
      if (!Array.isArray(data)) continue;
      for (const g of data) {
        const pin = g.bookmakers?.find(b => b.key === 'pinnacle');
        if (!pin) continue;
        const h2h = pin.markets?.find(m => m.key === 'h2h');
        if (!h2h) continue;
        const hoursUntil = (new Date(g.commence_time) - now) / 3600000;
        if (hoursUntil < 0 || hoursUntil > 24) continue;
        games.push({
          sport, home: g.home_team, away: g.away_team,
          commence: g.commence_time, hoursUntil,
          outcomes: h2h.outcomes.map(o => ({ name: o.name, decimal: o.price, impliedProb: 1 / o.price }))
        });
      }
    } catch (e) { log(`Pinnacle ${sport}: ${e.message}`); }
  }
  return games;
}

async function getPolyEvents() {
  const all = [];
  for (let offset = 0; offset <= 400; offset += 100) {
    try {
      const resp = await fetch(`https://gamma-api.polymarket.com/events?closed=false&limit=100&order=volume24hr&ascending=false&offset=${offset}`);
      const evts = await resp.json();
      if (!Array.isArray(evts) || !evts.length) break;
      all.push(...evts);
    } catch { break; }
  }
  return all.filter(e => {
    if (!e.title || !e.title.includes(' vs ')) return false;
    return SPORT_SLUGS.test(e.slug || '');
  });
}

function fuzzyMatch(pinGame, text) {
  const t = text.toLowerCase();
  const home = pinGame.home.toLowerCase().split(' ').pop();
  const away = pinGame.away.toLowerCase().split(' ').pop();
  return t.includes(home) && t.includes(away);
}

async function placeOrder(client, tokenId, price, size, side, paper = false, meta = {}) {
  if (paper) {
    logPaperTrade({ module: 'correlated-stacker', side, price, size, tokenId, ...meta });
    return { success: true, orderId: 'PAPER', paper: true, shares: parseFloat((size / price).toFixed(2)) };
  }
  const shares = (size / price).toFixed(2);
  try {
    const result = await client.createAndPostOrder({
      tokenID: tokenId, price, side, size: parseFloat(shares),
      feeRateBps: 0, nonce: 0, expiration: 0
    }, 'GTC');
    return { success: true, orderId: result.orderID || result, shares: parseFloat(shares) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function stack(client, paper = false) {
  const [pinGames, polyEvents] = await Promise.all([getPinnacleGames(), getPolyEvents()]);
  log(`Pinnacle: ${pinGames.length} games | Poly events: ${polyEvents.length}`);

  let totalTrades = 0;

  for (const game of pinGames) {
    // Find matching Polymarket event (contains multiple markets)
    const event = polyEvents.find(e => fuzzyMatch(game, e.title));
    if (!event || !event.markets || event.markets.length < 1) continue;

    // Parse all markets in this event
    const parsedMarkets = event.markets.map(m => ({
      id: m.id,
      question: m.question || '',
      outcomes: JSON.parse(m.outcomes || '[]'),
      prices: JSON.parse(m.outcomePrices || '[]').map(Number),
      tokenIds: JSON.parse(m.clobTokenIds || '[]')
    }));

    // Find primary edge opportunities
    for (let i = 0; i < game.outcomes.length; i++) {
      const pin = game.outcomes[i];
      const teamName = pin.name.toLowerCase().split(' ').pop();

      // Find primary market match
      for (const pm of parsedMarkets) {
        const outcomeIdx = pm.outcomes.findIndex(o => o.toLowerCase().includes(teamName));
        if (outcomeIdx === -1) continue;

        const polyPrice = pm.prices[outcomeIdx];
        const edge = (pin.impliedProb - polyPrice) * 100;
        if (edge < MIN_EDGE) continue;

        log(`\n🎯 PRIMARY EDGE: ${game.away} @ ${game.home} — ${pin.name}`);
        log(`   Pinnacle: ${(pin.impliedProb * 100).toFixed(1)}% | Poly: ${(polyPrice * 100).toFixed(1)}% | Edge: ${edge.toFixed(1)}%`);

        // Place primary bet
        const primaryResult = await placeOrder(client, pm.tokenIds[outcomeIdx], polyPrice, PRIMARY_SIZE, 'BUY', paper, { type: 'primary', game: `${game.away} @ ${game.home}`, outcome: pin.name, edge: edge.toFixed(1) });
        if (primaryResult.success) {
          log(`   ✅ Primary: ${primaryResult.shares} shares @ ${polyPrice}`);
          totalTrades++;
          fs.appendFileSync(TRADE_LOG, JSON.stringify({
            timestamp: new Date().toISOString(), type: 'primary',
            game: `${game.away} @ ${game.home}`, outcome: pin.name,
            edge: edge.toFixed(1), price: polyPrice, size: PRIMARY_SIZE,
            orderId: primaryResult.orderId
          }) + '\n');
        } else {
          log(`   ❌ Primary failed: ${primaryResult.error}`);
        }

        // Now look for correlated bets in OTHER markets of the same event
        for (const corrMkt of parsedMarkets) {
          if (corrMkt.id === pm.id) continue; // Skip the primary market
          const q = corrMkt.question.toLowerCase();

          // Draw market — fade it (buy NO / sell YES)
          if (q.includes('draw')) {
            // Buy NO on draw = buy the NO token (index 1 typically)
            const noIdx = corrMkt.outcomes.findIndex(o => o.toLowerCase() === 'no');
            if (noIdx !== -1) {
              const noPrice = corrMkt.prices[noIdx];
              // If our team wins, draw doesn't happen — NO on draw is correlated
              if (noPrice > 0 && noPrice < 0.95) {
                log(`   📎 Correlated: Draw NO @ ${noPrice.toFixed(3)}`);
                const r = await placeOrder(client, corrMkt.tokenIds[noIdx], noPrice, CORRELATED_SIZE, 'BUY', paper, { type: 'correlated-draw-no', game: `${game.away} @ ${game.home}`, market: corrMkt.question });
                if (r.success) {
                  log(`     ${paper ? '📝' : '✅'} ${r.shares} shares`);
                  totalTrades++;
                  fs.appendFileSync(TRADE_LOG, JSON.stringify({
                    timestamp: new Date().toISOString(), type: 'correlated-draw-no', paper,
                    game: `${game.away} @ ${game.home}`, market: corrMkt.question,
                    price: noPrice, size: CORRELATED_SIZE, orderId: r.orderId
                  }) + '\n');
                } else {
                  log(`     ❌ ${r.error}`);
                }
              }
            }
            continue;
          }

          // Opponent win market — fade it (buy NO)
          const opponentName = (i === 0 ? game.away : game.home).toLowerCase().split(' ').pop();
          if (q.includes(opponentName) && q.includes('win')) {
            const noIdx = corrMkt.outcomes.findIndex(o => o.toLowerCase() === 'no');
            if (noIdx !== -1) {
              const noPrice = corrMkt.prices[noIdx];
              if (noPrice > 0 && noPrice < 0.95) {
                log(`   📎 Correlated: ${corrMkt.question} NO @ ${noPrice.toFixed(3)}`);
                const r = await placeOrder(client, corrMkt.tokenIds[noIdx], noPrice, CORRELATED_SIZE, 'BUY', paper, { type: 'correlated-opponent-no', game: `${game.away} @ ${game.home}`, market: corrMkt.question });
                if (r.success) {
                  log(`     ${paper ? '📝' : '✅'} ${r.shares} shares`);
                  totalTrades++;
                  fs.appendFileSync(TRADE_LOG, JSON.stringify({
                    timestamp: new Date().toISOString(), type: 'correlated-opponent-no', paper,
                    game: `${game.away} @ ${game.home}`, market: corrMkt.question,
                    price: noPrice, size: CORRELATED_SIZE, orderId: r.orderId
                  }) + '\n');
                } else {
                  log(`     ❌ ${r.error}`);
                }
              }
            }
          }
        }
      }
    }
  }

  log(`\nStack complete. ${totalTrades} total trades placed.`);
  return totalTrades;
}

async function main() {
  ensureDataDir();
  const client = await createClient();
  log('Correlated Stacker started');
  await stack(client);
}

if (require.main === module) {
  main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
}

module.exports = { stack, createClient };
