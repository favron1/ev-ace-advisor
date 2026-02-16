/**
 * Edge Scanner v2.0 — Enhanced with trading, P&L tracking, and smart timing
 * Compares Pinnacle sharp lines vs Polymarket prices and places optimized trades
 */

import { createClobClient, ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// API Keys and Config
const ODDS_API_KEY = '9e9724f2663bc69badbecfe4daf61534';
const MIN_EDGE_PCT = 2.0;
const MAX_BET_SIZE = 10; // Max $10 per bet
const MAX_TOTAL_PER_RUN = 50; // Max $50 total per scan run
const MIN_LIQUIDITY_RATIO = 0.5; // Best bid must be >= 50% of entry price

// Sport timing preferences (hours before game time)
const SPORT_TIMING = {
  'soccer_epl': { min: 6, max: 24 },
  'soccer_italy_serie_a': { min: 6, max: 24 },
  'basketball_nba': { min: 2, max: 6 },
  'basketball_ncaab': { min: 2, max: 6 },
  'icehockey_nhl': { min: 2, max: 8 },
  'mma_mixed_martial_arts': { min: 6, max: 24 }
};

const SPORTS = Object.keys(SPORT_TIMING);

// CLOB Configuration
const CLOB_CONFIG = {
  walletPrivateKey: process.env.POLY_PRIVATE_KEY || '39eddbe61cd90309f66cb3230c4e3441f56a1ebe007c9d403ab46e75b23bd2a6',
  apiKey: process.env.POLY_CLOB_API_KEY || 'bab3d213-0e2c-c46e-e55b-f44667339838',
  secret: process.env.POLY_CLOB_SECRET || 'pJRVrh2WOxX4OqLOlmRQgeG1lAtrivbyuzRCBNFyUZk=',
  passphrase: process.env.POLY_CLOB_PASSPHRASE || 'e353c2d28934bac4990cf12825e5fcd7ffe9e93d888a823f19aa2087ee3d5a79',
  chainId: process.env.POLY_CHAIN_ID || 137
};

// File paths
const DATA_DIR = path.join(process.cwd(), 'data');
const TRADE_LOG_PATH = path.join(DATA_DIR, 'trade-log.jsonl');

class EdgeScanner {
  constructor() {
    this.totalSpentThisRun = 0;
    this.tradesPlaced = [];
    this.clobClient = null;
    this.wallet = null;
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  async initializeClob() {
    try {
      this.wallet = new ethers.Wallet(CLOB_CONFIG.walletPrivateKey);
      
      this.clobClient = createClobClient({
        host: 'https://clob.polymarket.com',
        key: CLOB_CONFIG.apiKey,
        secret: CLOB_CONFIG.secret,
        passphrase: CLOB_CONFIG.passphrase,
        walletAddress: this.wallet.address,
        chainId: parseInt(CLOB_CONFIG.chainId),
        signatureType: 2,
        funder: '0xFaC31C44748daf2d09c6aA26C62E06306B106d9F'
      });

      console.log(`✅ CLOB client initialized for wallet: ${this.wallet.address}`);
    } catch (error) {
      console.error('❌ Failed to initialize CLOB client:', error.message);
      throw error;
    }
  }

  async getPinnacleOdds() {
    const allGames = [];
    const now = Date.now();
    
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
          
          const gameTime = new Date(g.commence_time);
          const hoursUntil = (gameTime - now) / 3600000;
          
          // Apply 24-hour window filter
          if (hoursUntil > 24) continue;
          
          // Apply sport-specific timing preferences
          const timing = SPORT_TIMING[sport];
          if (hoursUntil < timing.min || hoursUntil > timing.max) continue;
          
          allGames.push({
            sport,
            home: g.home_team,
            away: g.away_team,
            commence: g.commence_time,
            hoursUntil: hoursUntil.toFixed(1),
            gameTime: gameTime.toISOString(),
            outcomes: h2h.outcomes.map(o => ({
              name: o.name,
              decimal: o.price,
              impliedProb: 1 / o.price
            }))
          });
        }
      } catch (e) {
        console.error(`Error fetching ${sport}:`, e.message);
      }
    }
    return allGames;
  }

  async getPolymarketGameMarkets() {
    // Use tag_slug to query each sport — this is how Polymarket's sports UI works.
    // The generic /events endpoint doesn't reliably return game markets via slug regex.
    const SPORT_TAGS = ['nba', 'nhl', 'ncaab', 'epl', 'serie-a', 'bundesliga', 'la-liga', 'ucl', 'ufc', 'ligue-1', 'mls', 'mlb', 'atp', 'cricket'];
    let allMarkets = [];
    
    for (const tag of SPORT_TAGS) {
      for (let offset = 0; offset < 500; offset += 50) {
        try {
          const resp = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=${tag}&limit=50&active=true&closed=false&offset=${offset}`);
          const events = await resp.json();
          if (!events.length) break;
          
          // Filter to actual game events (vs futures/props)
          const gameEvents = events.filter(e => {
            const title = e.title || '';
            return title.includes(' vs ') || title.includes(' vs. ');
          });
          
          for (const event of gameEvents) {
            if (!event.markets) continue;
            for (const m of event.markets) {
              if (!m.clobTokenIds) continue;
              allMarkets.push({
                id: m.id,
                conditionId: m.conditionId,
                question: m.question,
                eventTitle: event.title,
                eventSlug: event.slug,
                sport: tag,
                outcomes: JSON.parse(m.outcomes || '[]'),
                prices: JSON.parse(m.outcomePrices || '[]').map(Number),
                tokenIds: JSON.parse(m.clobTokenIds || '[]'),
                volume24h: parseFloat(m.volume24hr || 0),
                bestBid: m.bestBid || 0,
                bestAsk: m.bestAsk || 0
              });
            }
          }
        } catch (e) {
          console.error(`Error fetching ${tag} offset ${offset}:`, e.message);
          break;
        }
      }
    }
    
    console.log(`📡 Found ${allMarkets.length} markets across ${SPORT_TAGS.length} sports`);
    return allMarkets;
  }

  async checkOrderbook(tokenId) {
    try {
      const book = await this.clobClient.getOrderbook(tokenId);
      const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
      const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 0;
      return { bestBid, bestAsk };
    } catch (error) {
      console.error(`Error fetching orderbook for token ${tokenId}:`, error.message);
      return { bestBid: 0, bestAsk: 0 };
    }
  }

  fuzzyMatch(pinnacleGame, polyMarket) {
    // Match against both question and event title for better coverage
    const searchText = `${polyMarket.question} ${polyMarket.eventTitle || ''}`.toLowerCase();
    const home = pinnacleGame.home.toLowerCase().split(' ').pop();
    const away = pinnacleGame.away.toLowerCase().split(' ').pop();
    return searchText.includes(home) && searchText.includes(away);
  }

  async placeTrade(opportunity) {
    if (this.totalSpentThisRun >= MAX_TOTAL_PER_RUN) {
      console.log(`❌ Skip trade: Total spending limit reached ($${MAX_TOTAL_PER_RUN})`);
      return null;
    }

    const betSize = Math.min(MAX_BET_SIZE, MAX_TOTAL_PER_RUN - this.totalSpentThisRun);
    
    try {
      // Check orderbook liquidity
      const { bestBid, bestAsk } = await this.checkOrderbook(opportunity.tokenId);
      const entryPrice = opportunity.limitPrice;
      
      if (bestBid < entryPrice * MIN_LIQUIDITY_RATIO) {
        console.log(`❌ Skip trade: Insufficient liquidity (bid: ${bestBid.toFixed(3)}, required: ${(entryPrice * MIN_LIQUIDITY_RATIO).toFixed(3)})`);
        return null;
      }

      // Calculate shares needed for bet size
      const shares = betSize / entryPrice;
      
      // Place limit order
      const order = {
        tokenId: opportunity.tokenId,
        side: 'BUY',
        size: shares.toString(),
        price: entryPrice.toString()
      };

      console.log(`🎯 Placing order: ${shares.toFixed(2)} shares @ $${entryPrice.toFixed(3)} (${opportunity.side})`);
      
      const result = await this.clobClient.createOrder(order);
      
      this.totalSpentThisRun += betSize;
      
      const tradeRecord = {
        timestamp: new Date().toISOString(),
        market_id: opportunity.marketId,
        question: opportunity.game,
        side: opportunity.side,
        shares: shares,
        price: entryPrice,
        edge_estimate: parseFloat(opportunity.edge.replace('%', '')),
        game_time: opportunity.gameTime,
        league: opportunity.sport,
        order_id: result.orderId,
        bet_amount: betSize
      };

      // Log trade
      this.logTrade(tradeRecord);
      this.tradesPlaced.push(tradeRecord);
      
      console.log(`✅ Trade placed: Order ID ${result.orderId}`);
      return tradeRecord;
      
    } catch (error) {
      console.error(`❌ Trade failed:`, error.message);
      return null;
    }
  }

  logTrade(tradeRecord) {
    const logLine = JSON.stringify(tradeRecord) + '\n';
    fs.appendFileSync(TRADE_LOG_PATH, logLine);
  }

  async checkSettledMarkets() {
    if (!fs.existsSync(TRADE_LOG_PATH)) return [];

    const trades = fs.readFileSync(TRADE_LOG_PATH, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    const results = [];

    for (const trade of trades) {
      try {
        // Check if market has resolved
        const marketResp = await fetch(`https://gamma-api.polymarket.com/markets/${trade.market_id}`);
        if (!marketResp.ok) continue;
        
        const market = await marketResp.json();
        
        if (market.closed && market.resolvedBy) {
          // Market is settled, check outcome
          const winningOutcome = market.winningOutcome;
          const tradeOutcome = trade.side === 'BUY' ? 1 : 0; // Assuming binary outcomes
          
          const won = winningOutcome === tradeOutcome;
          const pnl = won ? trade.shares * (1 - trade.price) : -trade.bet_amount;
          
          results.push({
            ...trade,
            settled: true,
            won,
            pnl,
            winning_outcome: winningOutcome,
            settlement_time: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error(`Error checking market ${trade.market_id}:`, error.message);
      }
    }

    return results;
  }

  async scan() {
    console.log(`[${new Date().toISOString()}] 🔍 Enhanced Edge Scanner v2.0 running...\n`);
    
    try {
      await this.initializeClob();
    } catch (error) {
      console.log('⚠️  CLOB initialization failed - running in analysis-only mode');
    }

    const [pinnacle, polyMarkets] = await Promise.all([
      this.getPinnacleOdds(),
      this.getPolymarketGameMarkets()
    ]);
    
    console.log(`📊 Pinnacle: ${pinnacle.length} games in optimal timing windows`);
    console.log(`📊 Polymarket: ${polyMarkets.length} game markets\n`);
    
    const opportunities = [];
    
    for (const game of pinnacle) {
      const polyMatch = polyMarkets.find(pm => this.fuzzyMatch(game, pm));
      if (!polyMatch) continue;
      
      for (let i = 0; i < game.outcomes.length; i++) {
        const pin = game.outcomes[i];
        const polyIdx = polyMatch.outcomes.findIndex(o => 
          o.toLowerCase().includes(pin.name.toLowerCase().split(' ').pop())
        );
        if (polyIdx === -1) continue;
        
        const polyPrice = polyMatch.prices[polyIdx];
        const edge = (pin.impliedProb - polyPrice) * 100;
        
        if (edge >= MIN_EDGE_PCT) {
          opportunities.push({
            sport: game.sport,
            game: `${game.away} @ ${game.home}`,
            gameTime: game.gameTime,
            hoursUntil: game.hoursUntil,
            outcome: pin.name,
            pinnacleImplied: (pin.impliedProb * 100).toFixed(1) + '%',
            polyPrice: (polyPrice * 100).toFixed(1) + '%',
            edge: edge.toFixed(1) + '%',
            tokenId: polyMatch.tokenIds[polyIdx],
            marketId: polyMatch.id,
            side: 'BUY',
            limitPrice: polyPrice
          });
        }
      }
    }
    
    if (opportunities.length === 0) {
      console.log(`💤 No edges >= ${MIN_EDGE_PCT}% found in timing windows.`);
    } else {
      console.log(`🚨 ${opportunities.length} EDGE(S) FOUND:\n`);
      
      for (const opp of opportunities) {
        console.log(`[${opp.sport}] ${opp.game} (${opp.hoursUntil}h away)`);
        console.log(`  ${opp.outcome}: Pinnacle ${opp.pinnacleImplied} vs Poly ${opp.polyPrice} → EDGE: ${opp.edge}`);
        
        // Place trade if CLOB is available and within limits
        if (this.clobClient && this.totalSpentThisRun < MAX_TOTAL_PER_RUN) {
          await this.placeTrade(opp);
        } else if (!this.clobClient) {
          console.log(`  📝 Analysis only: BUY at ${opp.polyPrice} | Token: ${opp.tokenId.slice(0,20)}...`);
        } else {
          console.log(`  💰 Skipped: Daily limit reached ($${MAX_TOTAL_PER_RUN})`);
        }
        console.log('');
      }
    }

    // Check settled markets
    console.log('\n📈 Checking settled markets...');
    const settledResults = await this.checkSettledMarkets();
    if (settledResults.length > 0) {
      console.log(`✅ Found ${settledResults.length} settled market(s):`);
      let totalPnL = 0;
      settledResults.forEach(result => {
        totalPnL += result.pnl;
        console.log(`  ${result.won ? '🟢 WIN' : '🔴 LOSS'}: ${result.question} | P&L: $${result.pnl.toFixed(2)}`);
      });
      console.log(`📊 Total P&L from settled markets: $${totalPnL.toFixed(2)}`);
    }

    // Summary
    console.log(`\n📋 Run Summary:`);
    console.log(`   💰 Total spent this run: $${this.totalSpentThisRun.toFixed(2)} / $${MAX_TOTAL_PER_RUN}`);
    console.log(`   🎯 Trades placed: ${this.tradesPlaced.length}`);
    console.log(`   ⏰ Optimal timing windows active for: ${pinnacle.length} games`);
    
    return {
      opportunities,
      tradesPlaced: this.tradesPlaced,
      totalSpent: this.totalSpentThisRun,
      settledResults
    };
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const scanner = new EdgeScanner();
  scanner.scan().catch(console.error);
}

export { EdgeScanner };