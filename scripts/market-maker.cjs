/**
 * Market Maker v1.0 — Two-sided market making on high-volume Polymarket sports games
 * Posts bid/ask limit orders with 2-3 cent spreads, refreshes every 5 minutes
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

const MAX_TOTAL_EXPOSURE = 50;
const MIN_SIZE = 5;
const MAX_SIZE = 10;
const SPREAD_CENTS = 0.03;
const REFRESH_MS = 5 * 60 * 1000;
const SPORT_SLUGS = /^(nba|nhl|epl|sea|bun|lal|ucl|ufc|cbb|crint|atp|mlb|codmw|bundesliga|french)/;

const DATA_DIR = path.join(__dirname, 'data');
const REBATE_LOG = path.join(DATA_DIR, 'mm-rebates.jsonl');
const { logPaperTrade } = require('./paper-logger.cjs');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function log(msg) { console.log(`[${new Date().toISOString()}] [MM] ${msg}`); }

function logRebate(record) {
  fs.appendFileSync(REBATE_LOG, JSON.stringify(record) + '\n');
}

async function fetchGammaEvents() {
  const all = [];
  for (let offset = 0; offset <= 400; offset += 100) {
    try {
      const resp = await fetch(`https://gamma-api.polymarket.com/events?closed=false&limit=100&order=volume24hr&ascending=false&offset=${offset}`);
      const events = await resp.json();
      if (!Array.isArray(events) || !events.length) break;
      all.push(...events);
    } catch { break; }
  }
  return all.filter(e => {
    if (!e.title || !e.title.includes(' vs ')) return false;
    return SPORT_SLUGS.test(e.slug || '');
  });
}

function filterByTiming(events) {
  const now = Date.now();
  return events.filter(e => {
    if (!e.markets || !e.markets.length) return false;
    // Use endDate or any timing hint; fallback: include all
    const endDate = e.endDate ? new Date(e.endDate).getTime() : 0;
    if (!endDate) return true;
    const hoursUntil = (endDate - now) / 3600000;
    return hoursUntil >= 2 && hoursUntil <= 12;
  });
}

async function createClient() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const client = new ClobClient(CLOB_HOST, CHAIN_ID, wallet, API_CREDS, 2, FUNDER);
  log(`Client initialized: ${wallet.address}`);
  return client;
}

async function runCycle(client, paper = false) {
  let totalExposure = 0;
  const activeOrders = [];

  // Cancel all existing orders first
  try {
    log('Cancelling existing orders...');
    await client.cancelAll();
    log('All orders cancelled.');
  } catch (e) {
    log(`Cancel error (continuing): ${e.message}`);
  }

  const events = filterByTiming(await fetchGammaEvents());
  log(`Found ${events.length} game events in 2-12h window`);

  for (const event of events) {
    if (totalExposure >= MAX_TOTAL_EXPOSURE) {
      log(`Max exposure $${MAX_TOTAL_EXPOSURE} reached, stopping.`);
      break;
    }

    for (const market of (event.markets || [])) {
      if (totalExposure >= MAX_TOTAL_EXPOSURE) break;

      const tokenIds = JSON.parse(market.clobTokenIds || '[]');
      if (!tokenIds.length) continue;

      const tokenId = tokenIds[0]; // YES token
      try {
        const book = await client.getOrderBook(tokenId);
        const bestBid = book.bids && book.bids.length ? parseFloat(book.bids[0].price) : 0;
        const bestAsk = book.asks && book.asks.length ? parseFloat(book.asks[0].price) : 0;

        if (bestBid <= 0.05 || bestAsk <= 0.05 || bestAsk - bestBid < 0.01) {
          continue; // Skip illiquid or too-tight markets
        }

        const mid = (bestBid + bestAsk) / 2;
        const ourBid = Math.round((mid - SPREAD_CENTS / 2) * 100) / 100;
        const ourAsk = Math.round((mid + SPREAD_CENTS / 2) * 100) / 100;

        if (ourBid <= 0.01 || ourAsk >= 0.99) continue;

        const size = Math.min(MAX_SIZE, MAX_TOTAL_EXPOSURE - totalExposure, MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE));
        const bidShares = (size / ourBid).toFixed(2);
        const askShares = (size / ourAsk).toFixed(2);

        const mode = paper ? '📝 PAPER' : '💰 LIVE';
        log(`${mode} ${market.question || event.title}: bid ${ourBid} (${bidShares}sh) / ask ${ourAsk} (${askShares}sh)`);

        if (paper) {
          // Log as paper trade
          logPaperTrade({
            module: 'market-maker', event: event.title, market: market.question,
            bidPrice: ourBid, askPrice: ourAsk, spread: (ourAsk - ourBid).toFixed(3),
            bidShares: parseFloat(bidShares), askShares: parseFloat(askShares),
            sizePerSide: size.toFixed(2), tokenId
          });
          log(`  📝 Paper logged: bid ${ourBid} / ask ${ourAsk}`);
          activeOrders.push({ side: 'BOTH', tokenId, bid: ourBid, ask: ourAsk, paper: true });
        } else {
          // Place bid (BUY)
          try {
            const bidResult = await client.createAndPostOrder({
              tokenID: tokenId,
              price: ourBid,
              side: 'BUY',
              size: parseFloat(bidShares),
              feeRateBps: 0,
              nonce: 0,
              expiration: 0
            }, 'GTC');
            log(`  ✅ BID placed: ${JSON.stringify(bidResult.orderID || bidResult)}`);
            activeOrders.push({ side: 'BUY', tokenId, price: ourBid, size: bidShares });
          } catch (e) {
            log(`  ❌ BID failed: ${e.message}`);
          }

          // Place ask (SELL)
          try {
            const askResult = await client.createAndPostOrder({
              tokenID: tokenId,
              price: ourAsk,
              side: 'SELL',
              size: parseFloat(askShares),
              feeRateBps: 0,
              nonce: 0,
              expiration: 0
            }, 'GTC');
            log(`  ✅ ASK placed: ${JSON.stringify(askResult.orderID || askResult)}`);
            activeOrders.push({ side: 'SELL', tokenId, price: ourAsk, size: askShares });
          } catch (e) {
            log(`  ❌ ASK failed: ${e.message}`);
          }
        }

        totalExposure += size * 2;

        logRebate({
          timestamp: new Date().toISOString(),
          event: event.title,
          market: market.question,
          bid: ourBid,
          ask: ourAsk,
          spread: (ourAsk - ourBid).toFixed(3),
          sizePerSide: size.toFixed(2)
        });

        // Small delay between markets
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        log(`  Error on ${market.question}: ${e.message}`);
      }
    }
  }

  log(`Cycle complete. Total exposure: $${totalExposure.toFixed(2)}. Active orders: ${activeOrders.length}`);
  return activeOrders;
}

async function main() {
  ensureDataDir();
  const client = await createClient();

  log('Starting market maker — refresh every 5 min');
  await runCycle(client);

  setInterval(async () => {
    try { await runCycle(client); } catch (e) { log(`Cycle error: ${e.message}`); }
  }, REFRESH_MS);
}

if (require.main === module) {
  main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
}

module.exports = { runCycle, createClient };
