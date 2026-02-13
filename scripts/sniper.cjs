#!/usr/bin/env node
/**
 * Sniper — Dynamic scanning that ramps up frequency as games approach
 * 
 * Runs continuously:
 *   > 6h to kickoff: sleep 30 min
 *   6-1h to kickoff: sleep 5 min
 *   < 1h to kickoff: sleep 2 min
 *   No games within 8h: sleep 30 min
 * 
 * Usage: node scripts/sniper.js
 * Runs until killed. Use with caffeinate.
 */

const { execSync } = require('child_process');
const path = require('path');

const TRACKER_SCRIPT = path.join(__dirname, 'price-tracker.cjs');

async function getNextKickoff() {
  // Quick check: what's the nearest game on Polymarket?
  try {
    const resp = await fetch('https://gamma-api.polymarket.com/events?closed=false&limit=100&order=volume24hr&ascending=false');
    const events = await resp.json();
    const SPORT_SLUGS = /^(nba|nhl|nfl|epl|sea|bun|lla|ucl|ufc|cbb|lig)/;
    
    let nearest = Infinity;
    for (const e of events) {
      if (!e.title || !(e.title.includes(' vs ') || e.title.includes(' vs. '))) continue;
      if (!SPORT_SLUGS.test(e.slug || '')) continue;
      
      // Extract date from slug (format: sport-team1-team2-YYYY-MM-DD)
      const dateMatch = e.slug.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        // Approximate: most games are evening local time, so add 19h UTC
        const gameDate = new Date(dateMatch[1] + 'T19:00:00Z');
        const hoursAway = (gameDate - Date.now()) / 3600000;
        if (hoursAway > -2 && hoursAway < nearest) {
          nearest = hoursAway;
        }
      }
    }
    return nearest;
  } catch (e) {
    return 24; // default to far away
  }
}

function getSleepMs(hoursToKickoff) {
  if (hoursToKickoff <= 1) return 2 * 60 * 1000;     // 2 min
  if (hoursToKickoff <= 3) return 5 * 60 * 1000;     // 5 min
  if (hoursToKickoff <= 6) return 10 * 60 * 1000;    // 10 min
  return 30 * 60 * 1000;                              // 30 min
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🎯 Sniper started — dynamic price tracking');
  console.log('   Press Ctrl+C to stop\n');

  let scanCount = 0;

  while (true) {
    scanCount++;
    const startTime = Date.now();

    // Run price tracker
    try {
      console.log(`\n━━━ Scan #${scanCount} ━━━`);
      execSync(`node ${TRACKER_SCRIPT}`, { stdio: 'inherit', timeout: 120000 });
    } catch (e) {
      console.error('Tracker error:', e.message?.slice(0, 200));
    }

    // Determine next scan interval
    const hoursToNext = await getNextKickoff();
    const sleepMs = getSleepMs(hoursToNext);
    const sleepMin = Math.round(sleepMs / 60000);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n⏱️  Scan took ${elapsed}s | Next game ~${hoursToNext.toFixed(1)}h away | Next scan in ${sleepMin}min`);

    await sleep(sleepMs);
  }
}

main().catch(e => console.error('FATAL:', e));
