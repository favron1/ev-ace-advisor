/**
 * Stale Line Hunter v1.0 — Fast stale line detection, runs every 5 minutes
 * Compares Pinnacle lines to Polymarket prices for games within 2 hours
 * Places immediate market orders when edge >= 3%
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

const MIN_EDGE = 3.0;
const SPORT_SLUGS = /^(nba|nhl|epl|sea|bun|lla|ucl|ufc|cbb)/;
const SPORTS = [
  'soccer_epl', 'soccer_italy_serie_a', 'soccer_germany_bundesliga',
  'soccer_spain_la_liga', 'soccer_uefa_champs_league',
  'basketball_nba', 'basketball_ncaab', 'icehockey_nhl', 'mma_mixed_martial_arts'
];

const DATA_DIR = path.join(__dirname, 'data');
const TRADE_LOG = path.join(DATA_DIR, 'stale-trades.jsonl');
const { logPaperTrade } = require('./paper-logger.cjs');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function log(msg) { console.log(`[${new Date().toISOString()}] [STALE] ${msg}`); }

function betSize(edgePct) {
  if (edgePct >= 5) return 15;
  if (edgePct >= 4) return 10;
  return 8;
}

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
        if (hoursUntil < 0 || hoursUntil > 2) continue; // Only within 2 hours
        games.push({
          sport, home: g.home_team, away: g.away_team,
          commence: g.commence_time, hoursUntil,
          outcomes: h2h.outcomes.map(o => ({ name: o.name, decimal: o.price, impliedProb: 1 / o.price }))
        });
      }
    } catch (e) { log(`Pinnacle fetch ${sport}: ${e.message}`); }
  }
  return games;
}

async function getPolymarkets() {
  const allEvents = [];
  for (let offset = 0; offset <= 400; offset += 100) {
    try {
      const resp = await fetch(`https://gamma-api.polymarket.com/events?closed=false&limit=100&order=volume24hr&ascending=false&offset=${offset}`);
      const evts = await resp.json();
      if (!Array.isArray(evts) || !evts.length) break;
      allEvents.push(...evts);
    } catch { break; }
  }
  const markets = [];
  for (const e of allEvents) {
    if (!e.title || !e.title.includes(' vs ')) continue;
    if (!SPORT_SLUGS.test(e.slug || '')) continue;
    for (const m of (e.markets || [])) {
      if (!m.clobTokenIds) continue;
      markets.push({
        id: m.id, question: m.question, eventTitle: e.title,
        outcomes: JSON.parse(m.outcomes || '[]'),
        prices: JSON.parse(m.outcomePrices || '[]').map(Number),
        tokenIds: JSON.parse(m.clobTokenIds || '[]')
      });
    }
  }
  return markets;
}

function fuzzyMatch(pinGame, polyMarket) {
  const text = `${polyMarket.question} ${polyMarket.eventTitle}`.toLowerCase();
  const home = pinGame.home.toLowerCase().split(' ').pop();
  const away = pinGame.away.toLowerCase().split(' ').pop();
  return text.includes(home) && text.includes(away);
}

async function hunt(client, paper = false) {
  const [pinGames, polyMarkets] = await Promise.all([getPinnacleGames(), getPolymarkets()]);
  log(`Pinnacle: ${pinGames.length} games within 2h | Poly: ${polyMarkets.length} markets`);

  let trades = 0;
  for (const game of pinGames) {
    const match = polyMarkets.find(pm => fuzzyMatch(game, pm));
    if (!match) continue;

    for (let i = 0; i < game.outcomes.length; i++) {
      const pin = game.outcomes[i];
      const polyIdx = match.outcomes.findIndex(o =>
        o.toLowerCase().includes(pin.name.toLowerCase().split(' ').pop())
      );
      if (polyIdx === -1) continue;

      const polyPrice = match.prices[polyIdx];
      const edge = (pin.impliedProb - polyPrice) * 100;

      if (edge < MIN_EDGE) continue;

      const size = betSize(edge);
      const tokenId = match.tokenIds[polyIdx];
      const shares = (size / polyPrice).toFixed(2);

      const mode = paper ? '📝 PAPER' : '🚨 LIVE';
      log(`${mode} STALE LINE: ${game.away} @ ${game.home} | ${pin.name}`);
      log(`   Pinnacle: ${(pin.impliedProb * 100).toFixed(1)}% | Poly: ${(polyPrice * 100).toFixed(1)}% | Edge: ${edge.toFixed(1)}%`);

      if (paper) {
        logPaperTrade({
          module: 'stale-line-hunter',
          game: `${game.away} @ ${game.home}`,
          outcome: pin.name, sport: game.sport,
          pinnacleProb: pin.impliedProb, polyPrice, edge: edge.toFixed(1),
          size, shares: parseFloat(shares), price: polyPrice,
          tokenId, marketId: match.id
        });
        log(`   📝 Paper trade logged: $${size} on ${pin.name} @ ${polyPrice}`);
        trades++;
      } else {
        log(`   Placing taker order: ${shares} shares @ ${polyPrice} ($${size})`);
        try {
          const book = await client.getOrderBook(tokenId);
          const bestAsk = book.asks && book.asks.length ? parseFloat(book.asks[0].price) : polyPrice;
          const takerPrice = Math.min(bestAsk + 0.01, 0.99);
          const takerShares = (size / takerPrice).toFixed(2);

          const result = await client.createAndPostOrder({
            tokenID: tokenId, price: takerPrice, side: 'BUY',
            size: parseFloat(takerShares), feeRateBps: 0, nonce: 0, expiration: 0
          }, 'GTC');

          log(`   ✅ Order placed: ${JSON.stringify(result.orderID || result)}`);
          trades++;

          const record = {
            timestamp: new Date().toISOString(),
            game: `${game.away} @ ${game.home}`,
            outcome: pin.name, sport: game.sport,
            pinnacleProb: pin.impliedProb, polyPrice, edge: edge.toFixed(1),
            size, shares: parseFloat(takerShares), price: takerPrice,
            tokenId, marketId: match.id, orderId: result.orderID || null
          };
          fs.appendFileSync(TRADE_LOG, JSON.stringify(record) + '\n');
        } catch (e) {
          log(`   ❌ Order failed: ${e.message}`);
        }
      }
    }
  }

  log(`Hunt complete. ${trades} trade(s) placed.`);
  return trades;
}

async function main() {
  ensureDataDir();
  const client = await createClient();
  log('Stale Line Hunter started');
  await hunt(client);
}

if (require.main === module) {
  main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
}

module.exports = { hunt, createClient };
