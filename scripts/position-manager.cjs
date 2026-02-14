/**
 * Position Manager v1.0 — Smart exit logic for open positions
 * Cuts losses at -15% if game >3h away, takes profit at 80% of max payout
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

const LOSS_THRESHOLD = -0.15; // -15%
const PROFIT_THRESHOLD = 0.80; // 80% of max payout
const MIN_HOURS_FOR_STOP = 3;

const DATA_DIR = path.join(__dirname, 'data');
const EXIT_LOG = path.join(DATA_DIR, 'exits.jsonl');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function log(msg) { console.log(`[${new Date().toISOString()}] [POS] ${msg}`); }

async function createClient() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  return new ClobClient(CLOB_HOST, CHAIN_ID, wallet, API_CREDS, 2, FUNDER);
}

function loadTrades() {
  // Aggregate trades from all log files
  const files = ['trade-log.jsonl', 'stale-trades.jsonl', 'correlated-trades.jsonl'];
  const trades = [];
  for (const f of files) {
    const fp = path.join(DATA_DIR, f);
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try { trades.push(JSON.parse(line)); } catch (e) { /* skip */ }
    }
  }
  return trades;
}

async function manage(client) {
  const trades = loadTrades();
  log(`Loaded ${trades.length} historical trades`);

  // Get open orders
  let openOrders = [];
  try {
    openOrders = await client.getOpenOrders();
    log(`Open orders: ${openOrders.length}`);
  } catch (e) {
    log(`Error fetching open orders: ${e.message}`);
  }

  // Check each trade that has a tokenId
  const seen = new Set();
  let exits = 0;

  for (const trade of trades) {
    const tokenId = trade.tokenId || trade.tokenID;
    if (!tokenId || seen.has(tokenId)) continue;
    seen.add(tokenId);

    try {
      const entryPrice = trade.price || trade.limitPrice;
      if (!entryPrice) continue;

      // Get current market price
      const book = await client.getOrderBook(tokenId);
      const bestBid = book.bids && book.bids.length ? parseFloat(book.bids[0].price) : 0;

      if (bestBid <= 0) continue;

      const pnlPct = (bestBid - entryPrice) / entryPrice;
      const maxPayout = 1.0; // Binary market pays $1
      const profitPct = (bestBid - entryPrice) / (maxPayout - entryPrice);

      const gameTime = trade.game_time || trade.commence;
      const hoursUntil = gameTime ? (new Date(gameTime) - Date.now()) / 3600000 : 999;

      const gameName = trade.game || trade.question || trade.outcome || tokenId.slice(0, 16);

      // Stop loss: losing >15% AND game >3h away
      if (pnlPct < LOSS_THRESHOLD && hoursUntil > MIN_HOURS_FOR_STOP) {
        log(`🔴 STOP LOSS: ${gameName} | Entry: ${entryPrice} | Now: ${bestBid} | PnL: ${(pnlPct * 100).toFixed(1)}%`);
        log(`   Game in ${hoursUntil.toFixed(1)}h — selling to cut losses`);

        try {
          const shares = trade.shares || (trade.size ? trade.size / entryPrice : 0);
          if (shares > 0) {
            const result = await client.createAndPostOrder({
              tokenID: tokenId, price: bestBid, side: 'SELL',
              size: parseFloat(parseFloat(shares).toFixed(2)),
              feeRateBps: 0, nonce: 0, expiration: 0
            }, 'GTC');
            log(`   ✅ Sell order placed: ${JSON.stringify(result.orderID || result)}`);
            exits++;
            fs.appendFileSync(EXIT_LOG, JSON.stringify({
              timestamp: new Date().toISOString(), type: 'stop-loss',
              game: gameName, tokenId, entryPrice, exitPrice: bestBid,
              pnlPct: (pnlPct * 100).toFixed(1), orderId: result.orderID || null
            }) + '\n');
          }
        } catch (e) {
          log(`   ❌ Sell failed: ${e.message}`);
        }
        continue;
      }

      // Take profit: gained >80% of max payout
      if (profitPct >= PROFIT_THRESHOLD) {
        log(`🟢 TAKE PROFIT: ${gameName} | Entry: ${entryPrice} | Now: ${bestBid} | Profit: ${(profitPct * 100).toFixed(1)}% of max`);

        try {
          const shares = trade.shares || (trade.size ? trade.size / entryPrice : 0);
          if (shares > 0) {
            const result = await client.createAndPostOrder({
              tokenID: tokenId, price: bestBid, side: 'SELL',
              size: parseFloat(parseFloat(shares).toFixed(2)),
              feeRateBps: 0, nonce: 0, expiration: 0
            }, 'GTC');
            log(`   ✅ Sell order placed: ${JSON.stringify(result.orderID || result)}`);
            exits++;
            fs.appendFileSync(EXIT_LOG, JSON.stringify({
              timestamp: new Date().toISOString(), type: 'take-profit',
              game: gameName, tokenId, entryPrice, exitPrice: bestBid,
              profitPct: (profitPct * 100).toFixed(1), orderId: result.orderID || null
            }) + '\n');
          }
        } catch (e) {
          log(`   ❌ Sell failed: ${e.message}`);
        }
        continue;
      }

      log(`⚪ HOLD: ${gameName} | Entry: ${entryPrice} | Now: ${bestBid} | PnL: ${(pnlPct * 100).toFixed(1)}%`);
    } catch (e) {
      log(`Error checking ${tokenId}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  log(`Position check complete. ${exits} exit(s) triggered.`);
  return exits;
}

async function main() {
  ensureDataDir();
  const client = await createClient();
  log('Position Manager started');
  await manage(client);
}

if (require.main === module) {
  main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
}

module.exports = { manage, createClient };
