/**
 * Whale Orchestrator v2.0 — Coordinates all whale strategy modules
 * Auto-detects balance: real trades when funded, paper trades when broke
 * 
 * - Market Maker: every 5 min
 * - Stale Line Hunter: every 5 min (offset by 2.5 min from MM)
 * - Correlated Stacker: every 10 min
 * - Position Manager: every 15 min
 */

const { runCycle: mmCycle, createClient: mmClient } = require('./market-maker.cjs');
const { hunt, createClient: slhClient } = require('./stale-line-hunter.cjs');
const { stack, createClient: csClient } = require('./correlated-stacker.cjs');
const { manage, createClient: pmClient } = require('./position-manager.cjs');
const { getAvailableBalance, MIN_BALANCE_FOR_TRADING } = require('./paper-logger.cjs');

function log(msg) { console.log(`[${new Date().toISOString()}] [ORCH] ${msg}`); }

async function checkMode() {
  const balance = await getAvailableBalance();
  const paper = balance < MIN_BALANCE_FOR_TRADING;
  if (paper) {
    log(`💰 Balance: $${balance.toFixed(2)} — PAPER TRADE MODE (need $${MIN_BALANCE_FOR_TRADING}+)`);
  } else {
    log(`💰 Balance: $${balance.toFixed(2)} — LIVE TRADING MODE`);
  }
  return { paper, balance };
}

async function safeRun(name, fn) {
  try {
    log(`▶ Starting ${name}...`);
    await fn();
    log(`✅ ${name} complete`);
  } catch (e) {
    log(`❌ ${name} error: ${e.message}`);
  }
}

async function main() {
  log('🐋 Whale Orchestrator v2.0 starting up...');
  log('   Paper trade fallback: ON — switches automatically based on balance');

  // Initialize all clients
  const [mm, slh, cs, pm] = await Promise.all([
    mmClient(), slhClient(), csClient(), pmClient()
  ]);
  log('All CLOB clients initialized');

  // Check initial mode
  let { paper } = await checkMode();

  // Run everything once immediately
  await safeRun('Market Maker', () => mmCycle(mm, paper));
  await safeRun('Stale Line Hunter', () => hunt(slh, paper));
  await safeRun('Correlated Stacker', () => stack(cs, paper));
  await safeRun('Position Manager', () => manage(pm));

  // Re-check balance every cycle
  async function runWithBalanceCheck(name, fn, client) {
    const { paper: p } = await checkMode();
    await safeRun(name, () => fn(client, p));
  }

  // Market Maker: every 5 min
  setInterval(() => runWithBalanceCheck('Market Maker', mmCycle, mm), 5 * 60 * 1000);

  // Stale Line Hunter: every 5 min, offset by 2.5 min
  setTimeout(() => {
    runWithBalanceCheck('Stale Line Hunter', hunt, slh);
    setInterval(() => runWithBalanceCheck('Stale Line Hunter', hunt, slh), 5 * 60 * 1000);
  }, 2.5 * 60 * 1000);

  // Correlated Stacker: every 10 min
  setInterval(() => runWithBalanceCheck('Correlated Stacker', stack, cs), 10 * 60 * 1000);

  // Position Manager: every 15 min (no paper mode needed — it just manages existing positions)
  setInterval(() => safeRun('Position Manager', () => manage(pm)), 15 * 60 * 1000);

  log('🐋 All modules scheduled. Running indefinitely...');
  log('   MM: every 5 min | SLH: every 5 min | CS: every 10 min | PM: every 15 min');
  log('   Balance checked each cycle — auto-switches between live/paper');
}

if (require.main === module) {
  main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
}

module.exports = { main };
