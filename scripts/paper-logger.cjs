/**
 * Paper Trade Logger — shared utility for logging paper trades when funds are low
 */
const fs = require('fs');
const path = require('path');

const PAPER_LOG = path.join(__dirname, 'data', 'paper-trades.jsonl');

function ensureDataDir() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function logPaperTrade(trade) {
  ensureDataDir();
  const record = {
    ...trade,
    paper: true,
    timestamp: trade.timestamp || new Date().toISOString()
  };
  fs.appendFileSync(PAPER_LOG, JSON.stringify(record) + '\n');
  return record;
}

/**
 * Check available USDC balance on the proxy wallet via Polymarket API
 * Falls back to $0 if check fails
 */
async function getAvailableBalance() {
  try {
    const resp = await fetch('https://clob.polymarket.com/get-balance-allowance?asset_type=USDC', {
      headers: { 'Authorization': `Bearer bab3d213-0e2c-c46e-e55b-f44667339838` }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return parseFloat(data.balance || '0') / 1e6; // USDC has 6 decimals
  } catch (e) {
    // Fallback: check on-chain via public RPC
    try {
      const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
      const PROXY = '0xFaC31C44748daf2d09c6aA26C62E06306B106d9F';
      const resp = await fetch('https://polygon-rpc.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{
            to: USDC_E,
            data: '0x70a08231000000000000000000000000' + PROXY.slice(2).toLowerCase()
          }, 'latest']
        })
      });
      const data = await resp.json();
      return parseInt(data.result || '0x0', 16) / 1e6;
    } catch {
      return 0;
    }
  }
}

const MIN_BALANCE_FOR_TRADING = 3; // Need at least $3 to place real trades

module.exports = { logPaperTrade, getAvailableBalance, MIN_BALANCE_FOR_TRADING, PAPER_LOG };
