/**
 * Whale Wallet Monitor - Copy Trade Signal Generation
 * Tracks successful Polymarket traders like kch123 and generates copy-trade signals
 * Based on research: kch123 made $11.1M with 1,800+ trades, specializing in NHL/CBB/NFL
 */

export interface WhaleWallet {
  address: string;
  name: string;
  total_pnl_usd: number;
  win_rate: number;
  avg_position_size: number;
  specialties: string[]; // ['NHL', 'CBB', 'NFL']
  trading_style: string; // 'value_betting', 'arbitrage', 'momentum', 'contrarian'
  last_active: string;
  track_since: string;
  status: 'active' | 'inactive' | 'suspended';
}

export interface WhalePosition {
  wallet_address: string;
  whale_name: string;
  condition_id: string;
  market_question: string;
  event_name: string;
  position_side: 'YES' | 'NO';
  shares_owned: number;
  current_value_usd: number;
  entry_price_avg: number;
  entry_timestamp: string;
  detected_at: string;
  position_size_category: 'small' | 'medium' | 'large' | 'whale'; // Based on whale's history
  market_type: 'h2h' | 'spread' | 'total' | 'futures';
  sport?: string;
}

export interface CopyTradeSignal {
  id: string;
  whale_name: string;
  whale_wallet: string;
  condition_id: string;
  event_name: string;
  recommended_side: 'YES' | 'NO';
  whale_entry_price: number;
  current_market_price: number;
  copy_trade_edge: number; // How much better/worse than whale's entry
  position_size_usd: number;
  confidence_score: number; // Based on whale's track record in this sport/market
  signal_type: 'new_position' | 'size_increase' | 'contrarian_entry';
  whale_conviction: 'low' | 'medium' | 'high' | 'max'; // Based on position size relative to whale's average
  time_since_whale_entry: number; // Minutes
  copy_window_remaining: number; // Minutes before signal expires
  whale_speciality_match: boolean; // True if this sport is whale's specialty
  market_liquidity_check: boolean; // True if enough liquidity to copy
}

// Known whale wallets from research
const KNOWN_WHALES: WhaleWallet[] = [
  {
    address: '0x6a7...33ee', // kch123 - actual address would be full
    name: 'kch123',
    total_pnl_usd: 11100000, // $11.1M from research
    win_rate: 0.62, // Estimated from research
    avg_position_size: 50000, // $50K average based on $1.8M day
    specialties: ['NHL', 'CBB', 'NFL'],
    trading_style: 'value_betting',
    last_active: new Date().toISOString(),
    track_since: '2024-01-01',
    status: 'active'
  },
  // Would add other top 10 whales from PANews research
  {
    address: '0xabc...123', // SeriouslySirius placeholder
    name: 'SeriouslySirius',
    total_pnl_usd: 3290000, // $3.29M/month from research
    win_rate: 0.533, // 53.3% real win rate from research
    avg_position_size: 25000,
    specialties: ['NBA', 'NFL', 'NHL'],
    trading_style: 'multi_directional_hedging',
    last_active: new Date().toISOString(),
    track_since: '2024-01-01',
    status: 'active'
  },
  {
    address: '0xdef...456', // DrPufferfish placeholder
    name: 'DrPufferfish',
    total_pnl_usd: 2060000, // $2.06M/month from research
    win_rate: 0.509, // 50.9% real win rate
    avg_position_size: 15000,
    specialties: ['Soccer', 'Futures'],
    trading_style: 'low_probability_portfolio',
    last_active: new Date().toISOString(),
    track_since: '2024-01-01',
    status: 'active'
  }
];

// Copy trade thresholds
const COPY_THRESHOLDS = {
  MIN_POSITION_SIZE: 1000, // $1K minimum to generate signal
  MAX_PRICE_DEVIATION: 0.10, // 10% max difference from whale entry price
  MAX_TIME_DELAY: 240, // 4 hours max delay from whale entry
  MIN_CONFIDENCE: 60, // Minimum confidence score to show signal
  LIQUIDITY_REQUIREMENT: 5000, // $5K minimum market liquidity
  WHALE_SIZE_MULTIPLIER: {
    'small': 1.0,   // Normal position for this whale
    'medium': 1.5,  // 1.5x average = medium conviction  
    'large': 2.5,   // 2.5x average = high conviction
    'whale': 5.0    // 5x+ average = max conviction (like kch123's Super Bowl)
  }
} as const;

export class WhaleWalletMonitor {
  private polymarketApiBase = 'https://clob.polymarket.com';
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Track positions for all active whale wallets
   */
  async trackAllWhalePositions(): Promise<WhalePosition[]> {
    const allPositions: WhalePosition[] = [];
    
    for (const whale of KNOWN_WHALES) {
      if (whale.status !== 'active') continue;
      
      try {
        const positions = await this.trackWalletPositions(whale.address, whale.name);
        allPositions.push(...positions);
        
        // Rate limiting between whales
        await this.sleep(1000);
      } catch (error) {
        console.error(`[WHALE-MONITOR] Error tracking ${whale.name}:`, error);
      }
    }
    
    console.log(`[WHALE-MONITOR] Tracked ${allPositions.length} total positions across ${KNOWN_WHALES.length} whales`);
    return allPositions;
  }

  /**
   * Track positions for a specific whale wallet
   */
  async trackWalletPositions(walletAddress: string, whaleName: string): Promise<WhalePosition[]> {
    try {
      // Call Polymarket API to get wallet positions
      const response = await fetch(`${this.polymarketApiBase}/positions?user=${walletAddress}&status=open`);
      
      if (!response.ok) {
        console.warn(`[WHALE-MONITOR] API error for ${whaleName}: ${response.status}`);
        return [];
      }
      
      const positionsData = await response.json();
      const positions: WhalePosition[] = [];
      
      for (const positionData of positionsData.positions || []) {
        const position = await this.parsePosition(positionData, walletAddress, whaleName);
        if (position) {
          positions.push(position);
        }
      }
      
      console.log(`[WHALE-MONITOR] Found ${positions.length} positions for ${whaleName}`);
      return positions;
      
    } catch (error) {
      console.error(`[WHALE-MONITOR] Error fetching positions for ${whaleName}:`, error);
      return [];
    }
  }

  /**
   * Parse raw position data into structured format
   */
  private async parsePosition(
    positionData: any,
    walletAddress: string,
    whaleName: string
  ): Promise<WhalePosition | null> {
    try {
      const whale = KNOWN_WHALES.find(w => w.name === whaleName);
      if (!whale) return null;

      const shares = parseFloat(positionData.shares_owned || '0');
      const value = parseFloat(positionData.current_value || '0');
      const entryPrice = parseFloat(positionData.average_price || '0');
      
      // Skip positions that are too small or invalid
      if (shares < 100 || value < COPY_THRESHOLDS.MIN_POSITION_SIZE || entryPrice <= 0) {
        return null;
      }

      // Determine position size category relative to whale's average
      const sizeCategory = this.categorizePositionSize(value, whale.avg_position_size);
      
      // Infer market type from question
      const marketType = this.inferMarketType(positionData.market_question || '');
      
      // Extract sport if possible
      const sport = this.extractSport(positionData.market_question || '');

      return {
        wallet_address: walletAddress,
        whale_name: whaleName,
        condition_id: positionData.condition_id,
        market_question: positionData.market_question || '',
        event_name: this.extractEventName(positionData.market_question || ''),
        position_side: positionData.outcome === 'Yes' ? 'YES' : 'NO',
        shares_owned: shares,
        current_value_usd: value,
        entry_price_avg: entryPrice,
        entry_timestamp: positionData.created_at || new Date().toISOString(),
        detected_at: new Date().toISOString(),
        position_size_category: sizeCategory,
        market_type: marketType,
        sport
      };
    } catch (error) {
      console.error('[WHALE-MONITOR] Position parsing error:', error);
      return null;
    }
  }

  /**
   * Generate copy trade signals from whale positions
   */
  async generateCopyTradeSignals(positions: WhalePosition[]): Promise<CopyTradeSignal[]> {
    const signals: CopyTradeSignal[] = [];
    
    for (const position of positions) {
      // Check if position is recent enough to copy
      const timeSinceEntry = Date.now() - new Date(position.entry_timestamp).getTime();
      const minutesSinceEntry = timeSinceEntry / (1000 * 60);
      
      if (minutesSinceEntry > COPY_THRESHOLDS.MAX_TIME_DELAY) {
        continue; // Too old to copy
      }
      
      // Get current market price
      const currentPrice = await this.getCurrentMarketPrice(position.condition_id, position.position_side);
      if (!currentPrice) continue;
      
      // Check if price hasn't moved too far from whale entry
      const priceDeviation = Math.abs(currentPrice - position.entry_price_avg) / position.entry_price_avg;
      if (priceDeviation > COPY_THRESHOLDS.MAX_PRICE_DEVIATION) {
        continue; // Price moved too much
      }
      
      // Check market liquidity
      const liquidityCheck = await this.checkMarketLiquidity(position.condition_id);
      if (!liquidityCheck) continue;
      
      const signal = await this.createCopyTradeSignal(position, currentPrice, minutesSinceEntry);
      if (signal && signal.confidence_score >= COPY_THRESHOLDS.MIN_CONFIDENCE) {
        signals.push(signal);
      }
    }
    
    return signals.sort((a, b) => b.confidence_score - a.confidence_score);
  }

  /**
   * Create a copy trade signal from a whale position
   */
  private async createCopyTradeSignal(
    position: WhalePosition,
    currentPrice: number,
    minutesSinceEntry: number
  ): Promise<CopyTradeSignal | null> {
    const whale = KNOWN_WHALES.find(w => w.name === position.whale_name);
    if (!whale) return null;

    // Calculate copy trade edge (negative = worse than whale's entry)
    const copyEdge = position.entry_price_avg - currentPrice;
    
    // Determine signal type
    let signalType: CopyTradeSignal['signal_type'] = 'new_position';
    if (minutesSinceEntry > 60) {
      signalType = 'contrarian_entry'; // Whale entered a while ago, market might have moved against
    }
    
    // Map position size category to conviction
    const convictionMap = {
      'small': 'low' as const,
      'medium': 'medium' as const,
      'large': 'high' as const,
      'whale': 'max' as const
    };
    
    // Check if this sport/market is whale's specialty
    const specialtyMatch = position.sport ? whale.specialties.includes(position.sport) : false;
    
    // Calculate confidence score
    const confidenceScore = this.calculateCopyConfidence(
      whale,
      position,
      copyEdge,
      minutesSinceEntry,
      specialtyMatch
    );

    // Time remaining to copy (signal expires after max delay)
    const copyWindowRemaining = COPY_THRESHOLDS.MAX_TIME_DELAY - minutesSinceEntry;

    return {
      id: `whale_${position.condition_id}_${Date.now()}`,
      whale_name: position.whale_name,
      whale_wallet: position.wallet_address,
      condition_id: position.condition_id,
      event_name: position.event_name,
      recommended_side: position.position_side,
      whale_entry_price: position.entry_price_avg,
      current_market_price: currentPrice,
      copy_trade_edge: copyEdge,
      position_size_usd: position.current_value_usd,
      confidence_score: confidenceScore,
      signal_type: signalType,
      whale_conviction: convictionMap[position.position_size_category],
      time_since_whale_entry: minutesSinceEntry,
      copy_window_remaining: Math.max(0, copyWindowRemaining),
      whale_speciality_match: specialtyMatch,
      market_liquidity_check: true // Already verified above
    };
  }

  /**
   * Calculate confidence score for copy trade signal
   */
  private calculateCopyConfidence(
    whale: WhaleWallet,
    position: WhalePosition,
    copyEdge: number,
    minutesSinceEntry: number,
    specialtyMatch: boolean
  ): number {
    let baseScore = 50; // Start at 50
    
    // Whale's overall track record
    baseScore += whale.win_rate * 30; // Up to +30 for high win rate
    baseScore += Math.min(whale.total_pnl_usd / 1000000, 10); // Up to +10 for $10M+ profit
    
    // Position size conviction boost
    const convictionBoost = COPY_THRESHOLDS.WHALE_SIZE_MULTIPLIER[position.position_size_category] * 5;
    baseScore += convictionBoost;
    
    // Specialty match bonus
    if (specialtyMatch) {
      baseScore += 15; // +15 for whale's specialty sport
    }
    
    // Copy edge factor (better entry = higher confidence)
    if (copyEdge > 0.05) baseScore += 10; // Getting better price than whale
    else if (copyEdge < -0.05) baseScore -= 15; // Getting worse price than whale
    
    // Timing factor (fresher = better)
    const timingBonus = Math.max(0, (240 - minutesSinceEntry) / 240) * 10; // Up to +10 for immediate copy
    baseScore += timingBonus;
    
    // Market type bonus (whale performs better in certain markets)
    if (position.market_type === 'spread' && whale.name === 'kch123') {
      baseScore += 10; // kch123 loves spread bets
    }
    
    return Math.min(95, Math.max(0, baseScore));
  }

  /**
   * Helper methods
   */
  private categorizePositionSize(value: number, avgSize: number): 'small' | 'medium' | 'large' | 'whale' {
    const ratio = value / avgSize;
    if (ratio >= 5.0) return 'whale';
    if (ratio >= 2.5) return 'large';
    if (ratio >= 1.5) return 'medium';
    return 'small';
  }

  private inferMarketType(question: string): 'h2h' | 'spread' | 'total' | 'futures' {
    const q = question.toLowerCase();
    if (q.includes('championship') || q.includes('winner') || q.includes('mvp')) return 'futures';
    if (q.includes('over') || q.includes('under') || q.includes('total')) return 'total';
    if (q.includes('spread') || q.includes('cover') || /[+-]\d+\.?\d*/.test(q)) return 'spread';
    return 'h2h';
  }

  private extractSport(question: string): string | undefined {
    const q = question.toLowerCase();
    if (q.includes('nhl') || q.includes('hockey')) return 'NHL';
    if (q.includes('nba') || q.includes('basketball')) return 'NBA';
    if (q.includes('nfl') || q.includes('football')) return 'NFL';
    if (q.includes('ncaa') || q.includes('college')) return 'CBB';
    if (q.includes('soccer') || q.includes('premier league')) return 'Soccer';
    return undefined;
  }

  private extractEventName(question: string): string {
    // Extract team names from question
    const vsMatch = question.match(/(.+?)\s+(?:vs?\.?\s+|@\s+|beat\s+)(.+?)(?:\s|$)/i);
    if (vsMatch) {
      return `${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`;
    }
    
    // Fallback to first 50 characters
    return question.slice(0, 50) + (question.length > 50 ? '...' : '');
  }

  private async getCurrentMarketPrice(conditionId: string, side: 'YES' | 'NO'): Promise<number | null> {
    try {
      const response = await fetch(`${this.polymarketApiBase}/markets/${conditionId}`);
      if (!response.ok) return null;
      
      const marketData = await response.json();
      const yesToken = marketData.tokens?.find((t: any) => t.outcome === 'Yes');
      
      if (!yesToken?.price) return null;
      
      const yesPrice = parseFloat(yesToken.price);
      return side === 'YES' ? yesPrice : (1 - yesPrice);
      
    } catch (error) {
      console.error('[WHALE-MONITOR] Price fetch error:', error);
      return null;
    }
  }

  private async checkMarketLiquidity(conditionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.polymarketApiBase}/markets/${conditionId}`);
      if (!response.ok) return false;
      
      const marketData = await response.json();
      const volume = parseFloat(marketData.volume || '0');
      
      return volume >= COPY_THRESHOLDS.LIQUIDITY_REQUIREMENT;
      
    } catch (error) {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get whale performance statistics
   */
  getWhaleStats(whaleName: string): WhaleWallet | null {
    return KNOWN_WHALES.find(w => w.name === whaleName) || null;
  }

  /**
   * Check if we should still copy a whale based on recent performance
   */
  async validateWhalePerformance(whaleName: string): Promise<boolean> {
    // This would typically check recent P&L and win rate
    // For now, return true for known whales
    return KNOWN_WHALES.some(w => w.name === whaleName && w.status === 'active');
  }
}

export default WhaleWalletMonitor;