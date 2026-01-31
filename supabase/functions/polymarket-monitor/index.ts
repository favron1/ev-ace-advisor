// ============================================================================
// LAYER 1: CORE ALGORITHM - PROTECTED
// ============================================================================
// This file is part of the signal detection engine.
// DO NOT MODIFY unless explicitly requested.
// Changes here affect signal detection, edge calculation, and data accuracy.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  buildSportEndpoints,
  detectSportFromText,
  SPORTS_CONFIG,
  getSportCodeFromLeague,
} from '../_shared/sports-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Polymarket CLOB API for live prices
const CLOB_API_BASE = 'https://clob.polymarket.com';

// Odds API for bookmaker data
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Build sport endpoints dynamically from unified config
const SPORT_ENDPOINTS = buildSportEndpoints();

// Sharp books for weighting
const SHARP_BOOKS = ['pinnacle', 'betfair', 'betfair_ex_eu'];

// AI resolution cache - persists across poll cycles
const aiResolvedNames = new Map<string, { homeTeam: string; awayTeam: string } | null>();

// ============= NICKNAME EXPANSION (FAST LOCAL MATCHING) =============

// Build reverse nickname map: "flyers" -> "Philadelphia Flyers", "bruins" -> "Boston Bruins"
function buildNicknameMap(sportCode: string): Map<string, string> {
  const map = new Map<string, string>();
  const config = SPORTS_CONFIG[sportCode as keyof typeof SPORTS_CONFIG];
  if (!config?.teamMap) return map;
  
  // Add abbreviation -> full name
  for (const [abbr, fullName] of Object.entries(config.teamMap)) {
    map.set(abbr.toLowerCase(), fullName);
    
    // Extract nickname from full name: "Philadelphia Flyers" -> "flyers"
    const parts = fullName.split(' ');
    if (parts.length >= 2) {
      const nickname = parts[parts.length - 1].toLowerCase();
      map.set(nickname, fullName);
      
      // Also add city name
      const city = parts.slice(0, -1).join(' ').toLowerCase();
      map.set(city, fullName);
    }
  }
  
  return map;
}

// Try to expand abbreviated team names using local team maps
function expandTeamNamesLocally(
  eventName: string,
  sport: string
): { homeTeam: string; awayTeam: string } | null {
  const sportCode = getSportCodeFromLeague(sport);
  if (!sportCode) return null;
  
  const nicknameMap = buildNicknameMap(sportCode);
  if (nicknameMap.size === 0) return null;
  
  // Parse "Team A vs Team B" or "Team A vs. Team B"
  const vsMatch = eventName.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!vsMatch) return null;
  
  const team1Raw = vsMatch[1].trim().toLowerCase();
  const team2Raw = vsMatch[2].trim().toLowerCase();
  
  // Try to find full names for both teams
  let team1Full: string | null = null;
  let team2Full: string | null = null;
  
  // Direct lookup first
  if (nicknameMap.has(team1Raw)) {
    team1Full = nicknameMap.get(team1Raw)!;
  }
  if (nicknameMap.has(team2Raw)) {
    team2Full = nicknameMap.get(team2Raw)!;
  }
  
  // Try partial matching if direct lookup failed
  if (!team1Full) {
    for (const [key, fullName] of nicknameMap) {
      if (team1Raw.includes(key) || key.includes(team1Raw)) {
        team1Full = fullName;
        break;
      }
    }
  }
  if (!team2Full) {
    for (const [key, fullName] of nicknameMap) {
      if (team2Raw.includes(key) || key.includes(team2Raw)) {
        team2Full = fullName;
        break;
      }
    }
  }
  
  // Only return if BOTH teams resolved
  if (team1Full && team2Full) {
    return { homeTeam: team1Full, awayTeam: team2Full };
  }
  
  return null;
}

// ============= DIRECT ODDS API FUZZY MATCHING =============
// Fast, reliable fallback before AI - directly matches against Odds API game list

interface FuzzyMatchResult {
  game: any;
  homeTeam: string;
  awayTeam: string;
  similarity: number;
}

// Calculate similarity between two strings (Jaccard-like on words)
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }
  
  return intersection / Math.min(words1.size, words2.size);
}

// Direct fuzzy match against Odds API games - faster and more reliable than AI
function findDirectOddsApiMatch(
  eventName: string,
  bookmakerGames: any[],
  minSimilarity: number = 0.5
): FuzzyMatchResult | null {
  if (!eventName || bookmakerGames.length === 0) return null;
  
  const eventNorm = eventName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  let bestMatch: FuzzyMatchResult | null = null;
  let bestScore = 0;
  
  for (const game of bookmakerGames) {
    const homeTeam = game.home_team || '';
    const awayTeam = game.away_team || '';
    
    // Build full game name for comparison
    const gameFullName = `${homeTeam} vs ${awayTeam}`;
    
    // Calculate similarity
    const similarity = calculateSimilarity(eventNorm, gameFullName.toLowerCase());
    
    if (similarity >= minSimilarity && similarity > bestScore) {
      // Additional validation: at least one team's nickname should appear in event
      const homeNickname = homeTeam.split(' ').pop()?.toLowerCase() || '';
      const awayNickname = awayTeam.split(' ').pop()?.toLowerCase() || '';
      
      const homeInEvent = homeNickname.length > 2 && eventNorm.includes(homeNickname);
      const awayInEvent = awayNickname.length > 2 && eventNorm.includes(awayNickname);
      
      if (homeInEvent || awayInEvent) {
        bestScore = similarity;
        bestMatch = { game, homeTeam, awayTeam, similarity };
      }
    }
  }
  
  if (bestMatch) {
    console.log(`[POLY-MONITOR] FUZZY MATCH: "${eventName}" → ${bestMatch.homeTeam} vs ${bestMatch.awayTeam} (${(bestMatch.similarity * 100).toFixed(0)}% sim)`);
  }
  
  return bestMatch;
}

// ============= END DIRECT ODDS API FUZZY MATCHING =============

// Track AI calls per run to avoid timeouts
let aiCallsThisRun = 0;
const MAX_AI_CALLS_PER_RUN = 15; // Increased from 5 for better match rate

// Resolve abbreviated team names using AI
async function resolveTeamNamesWithAI(
  eventName: string,
  sport: string
): Promise<{ homeTeam: string; awayTeam: string } | null> {
  const cacheKey = `${eventName}|${sport}`;
  
  // Check cache first
  if (aiResolvedNames.has(cacheKey)) {
    const cached = aiResolvedNames.get(cacheKey);
    if (cached) {
      console.log(`[POLY-MONITOR] AI cache hit: "${eventName}" → ${cached.homeTeam} vs ${cached.awayTeam}`);
    }
    return cached || null;
  }
  
  // Limit AI calls per run to prevent timeouts
  if (aiCallsThisRun >= MAX_AI_CALLS_PER_RUN) {
    return null;
  }
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('[POLY-MONITOR] No LOVABLE_API_KEY - skipping AI resolution');
    return null;
  }

  aiCallsThisRun++;
  
  // IMPROVED PROMPT: Require EXACT team name presence in query
  // Prevents AI from returning semantically related but wrong games
  const prompt = `Find the EXACT ${sport} matchup for: "${eventName}"

CRITICAL RULES:
1. Your response MUST contain BOTH teams that appear in the query
2. If the query says "Flyers vs Bruins", you MUST return teams containing "Flyers" AND "Bruins"
3. If no exact match exists, respond with confidence "low"
4. Return the full official team names (e.g., "Philadelphia Flyers" not just "Flyers")

Example: "Flyers vs Bruins" → {"home_team": "Philadelphia Flyers", "away_team": "Boston Bruins"}`;

  try {
    // Add timeout to AI call (8 seconds max, increased from 5)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { 
            role: "system", 
            content: "You are a sports team name resolver for US professional sports (NHL, NBA, NFL, NCAA). CRITICAL: You must ONLY return team names that appear in the user's query. Never return teams that aren't mentioned. If unsure, use low confidence." 
          },
          { role: "user", content: prompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "resolve_matchup",
            description: "Return the full official team names for a matchup. Teams MUST be from the input query.",
            parameters: {
              type: "object",
              properties: {
                home_team: { type: "string", description: "Full official name of first team from query (e.g. 'Philadelphia Flyers')" },
                away_team: { type: "string", description: "Full official name of second team from query (e.g. 'Boston Bruins')" },
                confidence: { type: "string", enum: ["high", "medium", "low"], description: "Use 'low' if teams in query don't match standard team names" }
              },
              required: ["home_team", "away_team", "confidence"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "resolve_matchup" } }
      }),
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[POLY-MONITOR] AI resolution failed: ${response.status}`);
      aiResolvedNames.set(cacheKey, null);
      return null;
    }
    
    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.log('[POLY-MONITOR] AI returned no tool call');
      aiResolvedNames.set(cacheKey, null);
      return null;
    }

    const args = JSON.parse(toolCall.function.arguments);
    
    if (args.confidence === 'low') {
      console.log(`[POLY-MONITOR] AI low confidence for "${eventName}" - skipping`);
      aiResolvedNames.set(cacheKey, null);
      return null;
    }

    const result = { homeTeam: args.home_team, awayTeam: args.away_team };
    
    // NEW: Validate AI response contains teams from the original query
    // Prevents AI from returning wrong games (e.g., "Pelicans" for "Blazers vs Knicks")
    const eventNorm = eventName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const homeNorm = args.home_team.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const awayNorm = args.away_team.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    // Extract last words (nicknames) from resolved teams
    const homeNickname = homeNorm.split(' ').pop() || '';
    const awayNickname = awayNorm.split(' ').pop() || '';
    
    // At least one team's nickname must appear in the original query
    const homeInQuery = homeNickname.length > 2 && eventNorm.includes(homeNickname);
    const awayInQuery = awayNickname.length > 2 && eventNorm.includes(awayNickname);
    
    if (!homeInQuery && !awayInQuery) {
      console.log(`[POLY-MONITOR] AI INVALID: resolved teams "${args.home_team}" / "${args.away_team}" not found in "${eventName}" - REJECTING`);
      aiResolvedNames.set(cacheKey, null);
      return null;
    }
    
    aiResolvedNames.set(cacheKey, result);
    console.log(`[POLY-MONITOR] AI resolved "${eventName}" → ${result.homeTeam} vs ${result.awayTeam} (${args.confidence}, validated)`);
    
    return result;
  } catch (error) {
    console.error('[POLY-MONITOR] AI resolution error:', error);
    aiResolvedNames.set(cacheKey, null);
    return null;
  }
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Detect sport from text - uses shared config
function detectSportFromTextLocal(title: string, question: string): string | null {
  const combined = `${title} ${question}`;
  
  // Use shared detection first
  const detected = detectSportFromText(combined);
  if (detected) return detected;
  
  // No fallback patterns needed - using shared config for core 4 sports only
  const fallbackPatterns: Array<{ patterns: RegExp[]; sport: string }> = [];
  
  for (const { patterns, sport } of fallbackPatterns) {
    if (patterns.some(p => p.test(combined))) {
      return sport;
    }
  }
  
  return null;
}

// Generate event key for movement detection
function generateEventKey(eventName: string, outcome: string): string {
  return `${eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')}::${outcome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

// Calculate fair probability by removing vig (supports 2-way and 3-way markets)
function calculateFairProb(odds: number[], targetIndex: number): number {
  const probs = odds.map(o => 1 / o);
  const totalProb = probs.reduce((a, b) => a + b, 0);
  return probs[targetIndex] / totalProb;
}

// Calculate net edge after fees - now uses actual spread if available
function calculateNetEdge(
  rawEdge: number, 
  volume: number, 
  stakeAmount: number = 100,
  actualSpreadPct: number | null = null
): {
  netEdge: number;
  platformFee: number;
  spreadCost: number;
  slippage: number;
} {
  const platformFee = rawEdge > 0 ? rawEdge * 0.01 : 0;
  
  let spreadCost = actualSpreadPct !== null ? actualSpreadPct : 0.03;
  if (actualSpreadPct === null) {
    if (volume >= 500000) spreadCost = 0.005;
    else if (volume >= 100000) spreadCost = 0.01;
    else if (volume >= 50000) spreadCost = 0.015;
    else if (volume >= 10000) spreadCost = 0.02;
  }
  
  let slippage = 0.03;
  if (volume > 0) {
    const ratio = stakeAmount / volume;
    if (ratio < 0.001) slippage = 0.002;
    else if (ratio < 0.005) slippage = 0.005;
    else if (ratio < 0.01) slippage = 0.01;
    else if (ratio < 0.02) slippage = 0.02;
  }
  
  return { netEdge: rawEdge - platformFee - spreadCost - slippage, platformFee, spreadCost, slippage };
}

// ============= MOVEMENT DETECTION FUNCTIONS =============

interface MovementResult {
  triggered: boolean;
  velocity: number;
  booksConfirming: number;
  direction: 'shortening' | 'drifting' | null;
}

// Get movement threshold based on baseline probability (probability-relative)
function getMovementThreshold(baselineProb: number): number {
  // 3% move from 20% is massive, 3% from 75% is less meaningful
  return Math.max(0.02, 0.12 * baselineProb);
}

// Check if recent move accounts for 70%+ of total movement (recency bias)
function checkRecencyBias(snapshots: any[]): boolean {
  if (snapshots.length < 2) return false;
  
  const oldest = snapshots[0].implied_probability;
  const newest = snapshots[snapshots.length - 1].implied_probability;
  const totalMove = Math.abs(newest - oldest);
  
  if (totalMove < 0.01) return false; // Negligible total movement
  
  // Find price ~10 minutes ago
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentSnapshot = snapshots.find((s: any) => new Date(s.captured_at) >= tenMinAgo);
  
  if (!recentSnapshot) return true; // All movement is recent
  
  const recentMove = Math.abs(newest - recentSnapshot.implied_probability);
  return (recentMove / totalMove) >= 0.70;
}

// Check that no sharp book moved meaningfully in opposite direction
function checkNoCounterMoves(movements: { book: string; change: number; direction: number }[]): boolean {
  if (movements.length === 0) return false;
  
  const primaryDirection = movements[0].direction;
  
  for (const movement of movements) {
    // If any book moved meaningfully (>=2%) in opposite direction, fail
    if (movement.direction !== primaryDirection && Math.abs(movement.change) >= 0.02) {
      return false;
    }
  }
  
  return true;
}

// Main movement detection function
async function detectSharpMovement(
  supabase: any,
  eventKey: string,
  outcome: string
): Promise<MovementResult> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  // Get last 30 minutes of sharp book data for this event/outcome
  const { data: snapshots, error } = await supabase
    .from('sharp_book_snapshots')
    .select('*')
    .eq('event_key', eventKey)
    .eq('outcome', outcome)
    .gte('captured_at', thirtyMinAgo.toISOString())
    .order('captured_at', { ascending: true });
  
  if (error || !snapshots || snapshots.length < 2) {
    return { triggered: false, velocity: 0, booksConfirming: 0, direction: null };
  }
  
  // Group by bookmaker
  const byBook: Record<string, any[]> = {};
  for (const snap of snapshots) {
    if (!byBook[snap.bookmaker]) {
      byBook[snap.bookmaker] = [];
    }
    byBook[snap.bookmaker].push(snap);
  }
  
  // Calculate movement for each sharp book
  const movements: { book: string; change: number; direction: number }[] = [];
  const sharpBooks = ['pinnacle', 'betfair', 'circa', 'betonline', 'bookmaker'];
  
  for (const book of sharpBooks) {
    const bookSnapshots = byBook[book];
    if (!bookSnapshots || bookSnapshots.length < 2) continue;
    
    const oldest = bookSnapshots[0].implied_probability;
    const newest = bookSnapshots[bookSnapshots.length - 1].implied_probability;
    const change = newest - oldest;
    
    // Probability-relative threshold
    const threshold = getMovementThreshold(oldest);
    
    if (Math.abs(change) >= threshold) {
      // Check recency bias
      if (checkRecencyBias(bookSnapshots)) {
        movements.push({
          book,
          change,
          direction: Math.sign(change),
        });
      }
    }
  }
  
  // Coordination check: ≥2 books, same direction, no counter-moves
  if (movements.length >= 2) {
    if (checkNoCounterMoves(movements)) {
      const avgVelocity = movements.reduce((sum, m) => sum + Math.abs(m.change), 0) / movements.length;
      const direction = movements[0].direction > 0 ? 'shortening' : 'drifting';
      
      return {
        triggered: true,
        velocity: avgVelocity,
        booksConfirming: movements.length,
        direction,
      };
    }
  }
  
  return { triggered: false, velocity: 0, booksConfirming: 0, direction: null };
}

// Determine signal tier based on movement + edge
// High-edge (10%+) signals get promoted to at least "strong" tier for SMS eligibility
function calculateSignalTier(
  movementTriggered: boolean,
  netEdge: number
): 'elite' | 'strong' | 'static' {
  // High edge alone (10%+) qualifies as at least strong - ensures SMS gets sent
  if (netEdge >= 0.10) {
    return movementTriggered ? 'elite' : 'strong';
  }
  
  if (!movementTriggered) return 'static';
  if (netEdge >= 0.05) return 'elite';
  if (netEdge >= 0.03) return 'strong';
  return 'static';
}

// ============= END MOVEMENT DETECTION =============

// Batch fetch CLOB prices for multiple tokens - with chunking for large payloads
async function fetchClobPrices(tokenIds: string[]): Promise<Map<string, { bid: number; ask: number }>> {
  const priceMap = new Map<string, { bid: number; ask: number }>();
  
  if (tokenIds.length === 0) return priceMap;
  
  // Chunk tokens to avoid payload size limits (max 50 tokens per request = 100 price entries)
  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
    chunks.push(tokenIds.slice(i, i + CHUNK_SIZE));
  }
  
  console.log(`[POLY-MONITOR] Fetching CLOB prices in ${chunks.length} chunks (${tokenIds.length} tokens)`);
  
  for (const chunk of chunks) {
    try {
      // Build request body: array of { token_id, side } for both BUY and SELL
      const requestBody = chunk.flatMap(tokenId => [
        { token_id: tokenId, side: 'BUY' },
        { token_id: tokenId, side: 'SELL' },
      ]);
      
      const response = await fetch(`${CLOB_API_BASE}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[POLY-MONITOR] CLOB prices chunk failed: ${response.status} - ${errorText.substring(0, 100)}`);
        continue; // Continue with next chunk
      }
      
      const data = await response.json();
      
      // Response format: { "token_id": { "BUY": "0.55", "SELL": "0.57" }, ... }
      for (const [tokenId, priceData] of Object.entries(data)) {
        if (typeof priceData === 'object' && priceData !== null) {
          const pd = priceData as Record<string, string>;
          // BUY = what you pay to buy = ask price
          // SELL = what you receive when selling = bid price
          priceMap.set(tokenId, {
            bid: parseFloat(pd.SELL || '0'),
            ask: parseFloat(pd.BUY || '0'),
          });
        }
      }
    } catch (error) {
      console.error('[POLY-MONITOR] CLOB chunk price fetch error:', error);
    }
  }
  
  console.log(`[POLY-MONITOR] CLOB prices: got ${priceMap.size} token prices`);
  return priceMap;
}

// Fetch spreads for tokens - with chunking
async function fetchClobSpreads(tokenIds: string[]): Promise<Map<string, number>> {
  const spreadMap = new Map<string, number>();
  
  if (tokenIds.length === 0) return spreadMap;
  
  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
    chunks.push(tokenIds.slice(i, i + CHUNK_SIZE));
  }
  
  for (const chunk of chunks) {
    try {
      const response = await fetch(`${CLOB_API_BASE}/spreads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map(id => ({ token_id: id }))),
      });
      
      if (!response.ok) {
        console.log(`[POLY-MONITOR] CLOB spreads chunk failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      for (const [tokenId, spread] of Object.entries(data)) {
        if (typeof spread === 'string' || typeof spread === 'number') {
          spreadMap.set(tokenId, parseFloat(String(spread)));
        }
      }
    } catch (error) {
      console.error('[POLY-MONITOR] CLOB spreads chunk error:', error);
    }
  }
  
  return spreadMap;
}

// Format time until event
function formatTimeUntil(eventDate: Date): string {
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return hours >= 1 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Send SMS alert - only for ELITE and STRONG signals
async function sendSmsAlert(
  supabase: any,
  event: any,
  polyPrice: number,
  bookmakerFairProb: number,
  rawEdge: number,
  netEdge: number,
  volume: number,
  stakeAmount: number,
  marketType: string,
  teamName: string | null,
  signalTier: string,
  movementVelocity: number,
  betSide: 'YES' | 'NO',
  movementDirection: 'shortening' | 'drifting' | null
): Promise<boolean> {
  // CRITICAL GATE: Check if event has already started (prevents alerts for finished games)
  const eventDate = new Date(event.commence_time);
  const now = new Date();
  
  if (eventDate <= now) {
    console.log(`[POLY-MONITOR] SMS BLOCKED: ${event.event_name} has already started (${eventDate.toISOString()} <= ${now.toISOString()})`);
    return false;
  }
  
  // Also block if event is more than 24h away (bad timestamp)
  const hoursUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil > 24) {
    console.log(`[POLY-MONITOR] SMS BLOCKED: ${event.event_name} is ${hoursUntil.toFixed(1)}h away (>24h window)`);
    return false;
  }
  
  // Send SMS for ALL new signals that make it to the signal feed
  console.log(`[POLY-MONITOR] Sending SMS: tier=${signalTier}, edge=${(rawEdge * 100).toFixed(1)}%`);
  
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone_number')
      .not('phone_number', 'is', null)
      .limit(1);
    
    if (!profiles || profiles.length === 0 || !profiles[0].phone_number) {
      console.log('[POLY-MONITOR] No phone number configured');
      return false;
    }
    
    const phoneNumber = profiles[0].phone_number;
    const eventDate = new Date(event.commence_time);
    const timeUntil = formatTimeUntil(eventDate);
    const netEv = (netEdge * stakeAmount).toFixed(2);
    
    // Team-centric labeling: BET ON [team] TO WIN
    const tierEmoji = signalTier === 'elite' ? '🚨' : '🎯';
    
    // Movement direction text
    const movementText = movementDirection === 'shortening' 
      ? `SHORTENING +${(movementVelocity * 100).toFixed(1)}%`
      : movementDirection === 'drifting'
        ? `DRIFTING ${(movementVelocity * 100).toFixed(1)}%`
        : '';
    
    const message = `${tierEmoji} ${signalTier.toUpperCase()}: ${event.event_name}
BET ON ${teamName} TO WIN
Poly: ${(polyPrice * 100).toFixed(0)}¢ ($${(volume / 1000).toFixed(0)}K)
Book: ${(bookmakerFairProb * 100).toFixed(0)}%
Edge: +${(rawEdge * 100).toFixed(1)}% raw, +$${netEv} net EV
Sharp books ${movementText}
⏰ ${timeUntil} - ACT NOW`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to: phoneNumber, message }),
    });
    
    if (!response.ok) {
      console.error('[POLY-MONITOR] SMS failed:', await response.text());
      return false;
    }
    
    console.log(`[POLY-MONITOR] SMS sent for ${signalTier} signal`);
    return true;
  } catch (error) {
    console.error('[POLY-MONITOR] SMS error:', error);
    return false;
  }
}

// Fetch bookmaker odds for a sport
async function fetchBookmakerOdds(sport: string, markets: string, apiKey: string): Promise<any[]> {
  try {
    const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${apiKey}&markets=${markets}&regions=us,uk,eu&oddsFormat=decimal`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`[POLY-MONITOR] Odds API error for ${sport}: ${response.status}`);
      }
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[POLY-MONITOR] Failed to fetch ${sport}:`, error);
    return [];
  }
}

// Match Polymarket event to bookmaker game
// Enhanced return type for H2H markets - includes BOTH team indices
interface H2HMatchResult {
  game: any;
  marketKey: string;
  // For H2H: both indices so we can calculate both fair probs
  yesTeamIndex: number;  // Index in bookmaker outcomes for YES team (first in Polymarket title)
  noTeamIndex: number;   // Index in bookmaker outcomes for NO team (second in Polymarket title)
  yesTeamName: string;   // Full name of YES team
  noTeamName: string;    // Full name of NO team
  // Legacy fields for non-H2H markets
  targetIndex: number;
  teamName: string;
}

function findBookmakerMatch(
  eventName: string,
  question: string,
  marketType: string,
  bookmakerGames: any[],
  polymarketEventDate?: Date | null  // NEW: Optional Polymarket event date for validation
): H2HMatchResult | null {
  const eventNorm = normalizeName(`${eventName} ${question}`);
  
  // Parse Polymarket title to get YES/NO teams
  // In Polymarket H2H: "Team A vs Team B" → YES = Team A, NO = Team B
  const titleParts = eventName.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*-\s*.*)?$/i);
  const polyYesTeam = titleParts?.[1]?.trim() || '';
  const polyNoTeam = titleParts?.[2]?.trim() || '';
  const polyYesNorm = normalizeName(polyYesTeam);
  const polyNoNorm = normalizeName(polyNoTeam);
  
  // Extract nicknames (last word) for matching
  const yesNickname = polyYesNorm.split(' ').pop() || '';
  const noNickname = polyNoNorm.split(' ').pop() || '';
  
  for (const game of bookmakerGames) {
    // DATE VALIDATION: Prevent cross-game matching (e.g., matching Feb 2 Polymarket market with Jan 31 bookmaker game)
    if (polymarketEventDate && game.commence_time) {
      const bookmakerDate = new Date(game.commence_time);
      const hoursDiff = Math.abs(polymarketEventDate.getTime() - bookmakerDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) {
        // Dates are too far apart - this is likely a different game (same teams, different date)
        console.log(`[POLY-MONITOR] DATE MISMATCH: "${eventName}" poly=${polymarketEventDate.toISOString()} vs book=${bookmakerDate.toISOString()} (${hoursDiff.toFixed(0)}h diff) - SKIPPING`);
        continue;
      }
    }
    
    const homeNorm = normalizeName(game.home_team);
    const awayNorm = normalizeName(game.away_team);
    
    const homeWords = homeNorm.split(' ').filter((w: string) => w.length > 2);
    const awayWords = awayNorm.split(' ').filter((w: string) => w.length > 2);
    
    const containsHome = homeWords.some((w: string) => eventNorm.includes(w));
    const containsAway = awayWords.some((w: string) => eventNorm.includes(w));
    
    if (!containsHome && !containsAway) continue;
    
    let targetMarketKey = 'h2h';
    if (marketType === 'total') targetMarketKey = 'totals';
    else if (marketType === 'spread') targetMarketKey = 'spreads';
    
    const bookmaker = game.bookmakers?.[0];
    const market = bookmaker?.markets?.find((m: any) => m.key === targetMarketKey);
    
    if (!market || !market.outcomes) continue;
    
    // For H2H markets, use 3-tier matching: exact → token-overlap → reject
    if (targetMarketKey === 'h2h') {
      // Enhanced normalization: strip common prefixes/suffixes
      const norm = (s: string) => normalizeName(s)
        .replace(/\b(fc|sc|afc|cf|bc|the)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      const yesFull = norm(polyYesTeam);
      const noFull = norm(polyNoTeam);
      
      // TIER 1: Exact normalized name match
      const exactIndex = (team: string) =>
        market.outcomes.findIndex((o: any) => norm(o.name) === team);
      
      let yesOutcomeIndex = exactIndex(yesFull);
      let noOutcomeIndex = exactIndex(noFull);
      let matchMethod = 'exact';
      
      // TIER 2: Token overlap fallback (requires ≥2 shared tokens)
      if (yesOutcomeIndex === -1 || noOutcomeIndex === -1) {
        const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));
        const overlapScore = (a: Set<string>, b: Set<string>) => {
          let hit = 0;
          for (const t of a) if (b.has(t)) hit++;
          return hit;
        };
        
        const yesTok = tokens(polyYesTeam);
        const noTok = tokens(polyNoTeam);
        
        const bestMatchIndex = (teamTok: Set<string>, excludeIdx: number = -1) => {
          let best = -1, bestScore = 0;
          market.outcomes.forEach((o: any, i: number) => {
            if (i === excludeIdx) return; // Prevent matching same outcome twice
            const s = overlapScore(teamTok, tokens(o.name));
            if (s > bestScore) { bestScore = s; best = i; }
          });
          return { best, bestScore };
        };
        
        if (yesOutcomeIndex === -1) {
          const { best, bestScore } = bestMatchIndex(yesTok);
          if (bestScore >= 2) {
            yesOutcomeIndex = best;
            matchMethod = 'token-overlap';
          }
        }
        if (noOutcomeIndex === -1) {
          const { best, bestScore } = bestMatchIndex(noTok, yesOutcomeIndex);
          if (bestScore >= 2) {
            noOutcomeIndex = best;
            matchMethod = 'token-overlap';
          }
        }
      }
      
      // TIER 3: Reject if neither tier succeeds
      if (yesOutcomeIndex === -1 || noOutcomeIndex === -1) {
        console.log(`[POLY-MONITOR] MATCH: failed for "${eventName}" → YES="${polyYesTeam}", NO="${polyNoTeam}" (yesIdx=${yesOutcomeIndex}, noIdx=${noOutcomeIndex})`);
        continue;
      }
      
      // Ensure they're different outcomes (not matching same team twice)
      if (yesOutcomeIndex === noOutcomeIndex) {
        console.log(`[POLY-MONITOR] MATCH: same-team collision for "${eventName}" → both indices=${yesOutcomeIndex}`);
        continue;
      }
      
      const yesTeamName = market.outcomes[yesOutcomeIndex]?.name || polyYesTeam;
      const noTeamName = market.outcomes[noOutcomeIndex]?.name || polyNoTeam;
      
      console.log(`[POLY-MONITOR] MATCH: ${matchMethod} for "${eventName}" → YES=${yesTeamName}(idx${yesOutcomeIndex}), NO=${noTeamName}(idx${noOutcomeIndex})`);
      
      return { 
        game, 
        marketKey: targetMarketKey, 
        yesTeamIndex: yesOutcomeIndex,
        noTeamIndex: noOutcomeIndex,
        yesTeamName,
        noTeamName,
        // Legacy fields (use YES team as default)
        targetIndex: yesOutcomeIndex, 
        teamName: yesTeamName 
      };
    }
    
    // Non-H2H markets (totals, spreads) - use original logic
    let targetIndex = 0;
    let teamName = '';
    
    if (targetMarketKey === 'totals') {
      const isOver = /\bover\b/i.test(question);
      targetIndex = market.outcomes.findIndex((o: any) => 
        isOver ? o.name.toLowerCase().includes('over') : o.name.toLowerCase().includes('under')
      );
      teamName = isOver ? 'Over' : 'Under';
    } else {
      // Spreads or other - original fallback
      if (containsHome && !containsAway) {
        targetIndex = market.outcomes.findIndex((o: any) => normalizeName(o.name).includes(homeNorm.split(' ').pop() || ''));
        teamName = game.home_team;
      } else if (containsAway && !containsHome) {
        targetIndex = market.outcomes.findIndex((o: any) => normalizeName(o.name).includes(awayNorm.split(' ').pop() || ''));
        teamName = game.away_team;
      } else {
        targetIndex = 0;
        teamName = market.outcomes[0]?.name || game.home_team;
      }
    }
    
    if (targetIndex === -1) {
      targetIndex = 0;
      teamName = market.outcomes[0]?.name || '';
    }
    
    if (!teamName && market.outcomes[targetIndex]) {
      teamName = market.outcomes[targetIndex].name;
    }
    
    return { 
      game, 
      marketKey: targetMarketKey, 
      yesTeamIndex: targetIndex,
      noTeamIndex: targetIndex === 0 ? 1 : 0,
      yesTeamName: teamName,
      noTeamName: market.outcomes[targetIndex === 0 ? 1 : 0]?.name || '',
      targetIndex, 
      teamName 
    };
  }
  
  return null;
}

// Calculate fair probability from all bookmakers
// CRITICAL FIX: For NHL, filter out Draw outcomes and renormalize to 2-way market
// CRITICAL FIX #2: Outlier protection - reject extreme probabilities from data glitches
function calculateConsensusFairProb(
  game: any, 
  marketKey: string, 
  targetIndex: number,
  sport: string = '' // Pass sport to handle 3-way to 2-way conversion
): number | null {
  let totalWeight = 0;
  let weightedProb = 0;
  
  // NHL uses 3-way markets (Home/Draw/Away) but Polymarket is 2-way
  const isIceHockey = sport.toUpperCase() === 'NHL';
  
  for (const bookmaker of game.bookmakers || []) {
    const market = bookmaker.markets?.find((m: any) => m.key === marketKey);
    if (!market?.outcomes || market.outcomes.length < 2) continue;
    
    let outcomes = [...market.outcomes]; // Clone to avoid mutation
    let adjustedTargetIndex = targetIndex;
    
    // CRITICAL FIX #1: For NHL, filter out Draw/Tie and renormalize to 2-way
    if (isIceHockey && outcomes.length >= 3) {
      // Find Draw/Tie index before filtering
      const drawIndex = outcomes.findIndex((o: any) => 
        o.name.toLowerCase().includes('draw') || o.name.toLowerCase() === 'tie'
      );
      
      // Filter out Draw/Tie outcomes
      outcomes = outcomes.filter((o: any) => 
        !o.name.toLowerCase().includes('draw') && o.name.toLowerCase() !== 'tie'
      );
      
      // Adjust target index if Draw was before our target
      if (drawIndex !== -1 && drawIndex < targetIndex) {
        adjustedTargetIndex = Math.max(0, targetIndex - 1);
      }
      
      // Ensure we still have 2 outcomes after filtering
      if (outcomes.length < 2) continue;
    }
    
    const odds = outcomes.map((o: any) => o.price);
    if (odds.some((o: number) => isNaN(o) || o <= 1)) continue;
    
    // calculateFairProb already normalizes to 100%, so this handles renormalization
    const fairProb = calculateFairProb(odds, Math.min(adjustedTargetIndex, odds.length - 1));
    
    // OUTLIER PROTECTION: Reject extreme probabilities (>92% or <8%)
    // Real H2H sporting events rarely have 12+ to 1 favorites
    // This protects against data glitches like Betfair showing 99% for a 50/50 game
    if (fairProb > 0.92 || fairProb < 0.08) {
      console.log(`[POLY-MONITOR] OUTLIER REJECTED: ${bookmaker.key} fairProb=${(fairProb * 100).toFixed(1)}% for ${game.home_team} vs ${game.away_team}`);
      continue; // Skip this bookmaker's data point
    }
    
    const weight = SHARP_BOOKS.includes(bookmaker.key) ? 1.5 : 1.0;
    
    weightedProb += fairProb * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedProb / totalWeight : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[POLY-MONITOR] Starting multi-sport polling with movement detection...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('ODDS_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!oddsApiKey) {
      throw new Error('ODDS_API_KEY not configured');
    }

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Load markets marked for monitoring - filter to sports with bookmaker coverage
    // This is the "Scan Once, Monitor Continuously" architecture
    // CRITICAL FIX: Include ALL market types (H2H, Totals, Spreads), not just those with extracted_league
    const supportedSports = Object.keys(SPORT_ENDPOINTS); // ['NHL', 'NBA', 'NCAA', 'NFL']
    
    // First, load API-sourced markets with volume filter + 24h window
    const { data: apiMarkets, error: apiLoadError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .in('monitoring_status', ['watching', 'triggered'])
      .eq('status', 'active')
      .in('extracted_league', supportedSports)
      .or('source.is.null,source.eq.api')
      .gte('volume', 5000) // Volume filter only for API-sourced markets
      .gte('event_date', now.toISOString()) // Only future events
      .lte('event_date', in24Hours.toISOString()) // Within 24 hours
      .order('event_date', { ascending: true })
      .limit(150);

    // Second, load Firecrawl-sourced markets WITHOUT volume filter + 24h window
    const { data: firecrawlMarkets, error: fcLoadError } = await supabase
      .from('polymarket_h2h_cache')
      .select('*')
      .in('monitoring_status', ['watching', 'triggered'])
      .eq('status', 'active')
      .eq('source', 'firecrawl')
      .in('extracted_league', supportedSports)
      .gte('event_date', now.toISOString()) // Only future events
      .lte('event_date', in24Hours.toISOString()) // Within 24 hours
      .order('event_date', { ascending: true })
      .limit(100);

    // Combine both sets (deduplicated by condition_id)
    const seenIds = new Set<string>();
    const watchedMarkets: typeof apiMarkets = [];
    
    for (const market of [...(apiMarkets || []), ...(firecrawlMarkets || [])]) {
      if (!seenIds.has(market.condition_id)) {
        seenIds.add(market.condition_id);
        watchedMarkets.push(market);
      }
    }
    
    if (apiLoadError) throw new Error(`Failed to load markets: ${apiLoadError.message}`);

    console.log(`[POLY-MONITOR] Loaded ${watchedMarkets?.length || 0} watched markets from cache`);

    if (!watchedMarkets || watchedMarkets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events_polled: 0, edges_found: 0, message: 'No markets to monitor - run Full Scan first' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get matching event_watch_state entries for these markets
    const marketConditionIds = watchedMarkets.map(m => m.condition_id).filter(Boolean);
    
    const { data: monitoredEvents } = await supabase
      .from('event_watch_state')
      .select('*')
      .in('polymarket_condition_id', marketConditionIds)
      .gt('commence_time', now.toISOString());

    // Build cache map from watchedMarkets (already have all the data)
    const cacheMap = new Map(watchedMarkets.map(c => [c.condition_id, c]));

    // Build lookup map from event_watch_state for additional data
    const eventStateMap = new Map((monitoredEvents || []).map(e => [e.polymarket_condition_id, e]));
    
    // Transform watchedMarkets into eventsToProcess format
    // This ensures we process ALL watched markets, even those without event_watch_state entries
    const eventsToProcess = watchedMarkets
      .filter(m => new Date(m.event_date) > now) // Only future events
      .map(market => {
        // Use existing event_watch_state data if available, otherwise create synthetic entry
        const existingState = eventStateMap.get(market.condition_id);
        return existingState || {
          id: null, // No DB id for synthetic entries
          event_key: `poly_${market.condition_id}`,
          event_name: market.event_title || market.question,
          polymarket_condition_id: market.condition_id,
          polymarket_question: market.question,
          polymarket_yes_price: market.yes_price,
          polymarket_volume: market.volume,
          commence_time: market.event_date,
          last_poly_refresh: market.last_price_update,
          watch_state: 'monitored',
        };
      });

    console.log(`[POLY-MONITOR] Processing ${eventsToProcess.length} markets (${eventStateMap.size} with event_watch_state)`);

    // Group events by detected sport
    // CRITICAL FIX: For markets with null extracted_league, try to detect from event_title
    const sportGroups: Map<string, typeof eventsToProcess> = new Map();
    
    for (const event of eventsToProcess) {
      const cache = cacheMap.get(event.polymarket_condition_id);
      let sport = cache?.extracted_league;
      
      // Fallback: try to detect sport from event_title if extracted_league is null
      if (!sport || sport === 'Sports' || sport === 'Unknown') {
        const eventTitle = cache?.event_title || event.event_name || '';
        const question = cache?.question || event.polymarket_question || '';
        sport = detectSportFromTextLocal(eventTitle, question) || 'Unknown';
      }
      
      if (!sportGroups.has(sport)) {
        sportGroups.set(sport, []);
      }
      sportGroups.get(sport)!.push(event);
    }

    console.log(`[POLY-MONITOR] Sport groups: ${[...sportGroups.keys()].join(', ')}`);

    // Collect all token IDs for batch CLOB fetch (limit to 100 per batch to avoid payload errors)
    const allTokenIds: string[] = [];
    for (const market of watchedMarkets) {
      if (market.token_id_yes) allTokenIds.push(market.token_id_yes);
    }

    // Batch fetch CLOB prices and spreads
    console.log(`[POLY-MONITOR] Batch fetching CLOB prices for ${allTokenIds.length} tokens`);
    const [clobPrices, clobSpreads] = await Promise.all([
      fetchClobPrices(allTokenIds),
      fetchClobSpreads(allTokenIds),
    ]);
    console.log(`[POLY-MONITOR] Got ${clobPrices.size} prices, ${clobSpreads.size} spreads from CLOB`);

    // === CRITICAL: Update ALL active signals with fresh price data ===
    // This ensures signals show current timestamps even if they no longer meet edge thresholds
    const { data: activeSignals } = await supabase
      .from('signal_opportunities')
      .select('id, polymarket_condition_id')
      .eq('status', 'active');
    
    if (activeSignals && activeSignals.length > 0) {
      let priceUpdatesCount = 0;
      
      for (const signal of activeSignals) {
        // Find matching cache entry
        const cache = [...cacheMap.values()].find(c => c.condition_id === signal.polymarket_condition_id);
        if (!cache?.token_id_yes) continue;
        
        // Get fresh price from CLOB, or fall back to cache
        let freshPrice = 0;
        if (clobPrices.has(cache.token_id_yes)) {
          const prices = clobPrices.get(cache.token_id_yes)!;
          freshPrice = prices.ask > 0 ? prices.ask : prices.bid;
        } else {
          // Fallback to cache yes_price if CLOB didn't return this token
          freshPrice = cache.yes_price || 0;
        }
        
        if (freshPrice > 0) {
          await supabase
            .from('signal_opportunities')
            .update({
              polymarket_yes_price: freshPrice,
              polymarket_price: freshPrice,
              polymarket_volume: cache.volume || 0,
              polymarket_updated_at: now.toISOString(),
            })
            .eq('id', signal.id);
          
          priceUpdatesCount++;
        }
      }
      
      console.log(`[POLY-MONITOR] Refreshed prices for ${priceUpdatesCount}/${activeSignals.length} active signals`);
    }

    // Fetch bookmaker data for each sport group
    const allBookmakerData: Map<string, any[]> = new Map();
    
    for (const [sport] of sportGroups) {
      const endpoint = SPORT_ENDPOINTS[sport];
      if (!endpoint) {
        console.log(`[POLY-MONITOR] No endpoint for sport: ${sport}`);
        continue;
      }
      
      const games = await fetchBookmakerOdds(endpoint.sport, endpoint.markets, oddsApiKey);
      allBookmakerData.set(sport, games);
      console.log(`[POLY-MONITOR] Loaded ${games.length} ${sport} games`);
    }

    // Get stake amount
    const { data: scanConfig } = await supabase
      .from('arbitrage_config')
      .select('default_stake_amount')
      .limit(1)
      .single();

    const stakeAmount = scanConfig?.default_stake_amount || 100;

    // Process each event
    let edgesFound = 0;
    let alertsSent = 0;
    let eventsExpired = 0;
    let eventsMatched = 0;
    let movementConfirmedCount = 0;

    for (const event of eventsToProcess) {
      try {
        // Check if event started
        const eventStart = new Date(event.commence_time);
        if (eventStart <= now) {
          await supabase
            .from('event_watch_state')
            .update({ watch_state: 'expired', updated_at: now.toISOString() })
            .eq('id', event.id);
          eventsExpired++;
          continue;
        }

        // Get cache info
        const cache = cacheMap.get(event.polymarket_condition_id);
        const sport = cache?.extracted_league || 'Unknown';
        const marketType = cache?.market_type || 'h2h';
        const tokenIdYes = cache?.token_id_yes;
        
        // Get bookmaker data for this sport
        const bookmakerGames = allBookmakerData.get(sport) || [];

        // Get price from CLOB batch results (preferred) or fallback to single fetch
        let livePolyPrice = event.polymarket_yes_price || 0.5;
        let liveVolume = event.polymarket_volume || 0;
        let bestBid: number | null = null;
        let bestAsk: number | null = null;
        let spreadPct: number | null = null;
        
        // Try CLOB batch prices first
        if (tokenIdYes && clobPrices.has(tokenIdYes)) {
          const prices = clobPrices.get(tokenIdYes)!;
          bestBid = prices.bid;
          bestAsk = prices.ask;
          livePolyPrice = bestAsk > 0 ? bestAsk : livePolyPrice;
          
          if (clobSpreads.has(tokenIdYes)) {
            spreadPct = clobSpreads.get(tokenIdYes)!;
          } else if (bestBid > 0 && bestAsk > 0) {
            spreadPct = bestAsk - bestBid;
          }
        }
        
        // Fallback to single market fetch if no batch data
        if (!tokenIdYes || !clobPrices.has(tokenIdYes)) {
          if (event.polymarket_condition_id) {
            try {
              const clobUrl = `${CLOB_API_BASE}/markets/${event.polymarket_condition_id}`;
              const clobResponse = await fetch(clobUrl);
              
              if (clobResponse.ok) {
                const marketData = await clobResponse.json();
                livePolyPrice = parseFloat(marketData.tokens?.[0]?.price || livePolyPrice);
                liveVolume = parseFloat(marketData.volume || liveVolume);
              }
            } catch {
              // Use cached price
            }
          }
        }

        // ============= TIERED MATCHING STRATEGY =============
        // (sport already defined above from cache?.extracted_league)
        
        // Get Polymarket event date for cross-game validation
        const polyEventDate = cache?.event_date ? new Date(cache.event_date) : 
                              event.commence_time ? new Date(event.commence_time) : null;
        
        // TIER 1: Direct string matching (fastest)
        let match = findBookmakerMatch(
          event.event_name,
          event.polymarket_question || '',
          marketType,
          bookmakerGames,
          polyEventDate  // Pass date for cross-game validation
        );
        let matchMethod = 'direct';

        // TIER 2: Local nickname expansion (fast, no API)
        if (!match && bookmakerGames.length > 0) {
          const expanded = expandTeamNamesLocally(event.event_name, sport);
          if (expanded) {
            match = findBookmakerMatch(
              `${expanded.homeTeam} vs ${expanded.awayTeam}`,
              event.polymarket_question || '',
              marketType,
              bookmakerGames,
              polyEventDate  // Pass date for cross-game validation
            );
            if (match) {
              console.log(`[POLY-MONITOR] NICKNAME MATCH: "${event.event_name}" → ${expanded.homeTeam} vs ${expanded.awayTeam}`);
              matchMethod = 'nickname';
            }
          }
        }

        // TIER 3: Direct Odds API fuzzy matching (fast, no AI overhead)
        if (!match && bookmakerGames.length > 0) {
          const fuzzyResult = findDirectOddsApiMatch(event.event_name, bookmakerGames, 0.5);
          if (fuzzyResult) {
            match = findBookmakerMatch(
              `${fuzzyResult.homeTeam} vs ${fuzzyResult.awayTeam}`,
              event.polymarket_question || '',
              marketType,
              bookmakerGames,
              polyEventDate  // Pass date for cross-game validation
            );
            if (match) {
              matchMethod = 'fuzzy';
            }
          }
        }

        // TIER 4: AI resolution (slower, but handles edge cases)
        if (!match && bookmakerGames.length > 0) {
          const resolved = await resolveTeamNamesWithAI(event.event_name, sport);
          
          if (resolved) {
            match = findBookmakerMatch(
              `${resolved.homeTeam} vs ${resolved.awayTeam}`,
              event.polymarket_question || '',
              marketType,
              bookmakerGames,
              polyEventDate  // Pass date for cross-game validation
            );
            
            if (match) {
              console.log(`[POLY-MONITOR] AI MATCH: "${event.event_name}" → ${resolved.homeTeam} vs ${resolved.awayTeam}`);
              matchMethod = 'ai';
            }
          }
        }
        // ============= END TIERED MATCHING =============

        // ========== NEW DIRECT H2H EDGE CALCULATION ==========
        // Calculate fair probabilities for BOTH YES and NO teams directly
        // This eliminates the fragile isMatchedTeamYesSide inversion logic
        let yesFairProb: number | null = null;
        let noFairProb: number | null = null;
        let yesTeamName: string | null = null;
        let noTeamName: string | null = null;
        
        if (match) {
          // Calculate fair prob for YES team (first in Polymarket title)
          yesFairProb = calculateConsensusFairProb(match.game, match.marketKey, match.yesTeamIndex, sport);
          // Calculate fair prob for NO team (second in Polymarket title)
          noFairProb = calculateConsensusFairProb(match.game, match.marketKey, match.noTeamIndex, sport);
          
          yesTeamName = match.yesTeamName;
          noTeamName = match.noTeamName;
          
          // SANITY CHECK: Fair probs should sum to ~100% for H2H markets
          if (yesFairProb !== null && noFairProb !== null) {
            const probSum = yesFairProb + noFairProb;
            if (Math.abs(probSum - 1.0) > 0.05) {
              console.log(`[POLY-MONITOR] PROBABILITY MISMATCH: ${(probSum * 100).toFixed(1)}% (YES=${(yesFairProb * 100).toFixed(1)}% + NO=${(noFairProb * 100).toFixed(1)}%) for "${event.event_name}" - skipping`);
              continue;
            }
          }
          
          console.log(`[POLY-MONITOR] DIRECT FAIR PROBS: YES=${yesTeamName}=${yesFairProb !== null ? (yesFairProb * 100).toFixed(1) : '?'}%, NO=${noTeamName}=${noFairProb !== null ? (noFairProb * 100).toFixed(1) : '?'}%`);
          
          // CRITICAL FIX: Team participant validation
          // Validate that BOTH matched teams are in the Polymarket event name
          const eventNorm = normalizeName(event.event_name);
          
          if (yesTeamName) {
            const yesLastWord = normalizeName(yesTeamName).split(' ').filter(w => w.length > 2).pop() || '';
            if (yesLastWord && !eventNorm.includes(yesLastWord)) {
              console.log(`[POLY-MONITOR] INVALID MATCH: YES team "${yesTeamName}" not found in event "${event.event_name}" - DROPPING`);
              continue;
            }
          }
          
          if (noTeamName) {
            const noLastWord = normalizeName(noTeamName).split(' ').filter(w => w.length > 2).pop() || '';
            if (noLastWord && !eventNorm.includes(noLastWord)) {
              console.log(`[POLY-MONITOR] INVALID MATCH: NO team "${noTeamName}" not found in event "${event.event_name}" - DROPPING`);
              continue;
            }
          }
          
          eventsMatched++;
        }

        // Update event state and cache with CLOB data
        await supabase
          .from('event_watch_state')
          .update({
            polymarket_yes_price: livePolyPrice,
            polymarket_volume: liveVolume,
            last_poly_refresh: now.toISOString(),
            polymarket_matched: yesFairProb !== null && noFairProb !== null,
            current_probability: yesFairProb, // Store YES team's fair prob
            updated_at: now.toISOString(),
          })
          .eq('id', event.id);
        
        // Update cache with CLOB bid/ask/spread data
        if (bestBid !== null || bestAsk !== null || spreadPct !== null) {
          await supabase
            .from('polymarket_h2h_cache')
            .update({
              best_bid: bestBid,
              best_ask: bestAsk,
              spread_pct: spreadPct,
              last_price_update: now.toISOString(),
            })
            .eq('condition_id', event.polymarket_condition_id);
        }

        // Check for edge - now uses BOTH fair probs directly
        if (yesFairProb !== null && noFairProb !== null && liveVolume >= 5000) {
          // SKIP if we can't determine the bet side
          if (!yesTeamName || !noTeamName) {
            console.log(`[POLY-MONITOR] SKIPPING signal for ${event.event_name} - team names could not be determined`);
            continue;
          }
          
          // Generate event key for movement detection (use YES team)
          const eventKey = generateEventKey(event.event_name, yesTeamName);
          
          // ========== MOVEMENT DETECTION GATE ==========
          const movement = await detectSharpMovement(supabase, eventKey, yesTeamName);
          
          // ========== DIRECT EDGE CALCULATION (NO INVERSION NEEDED) ==========
          // yesEdge = what YES is worth (fair prob) - what we pay (Poly YES price)
          // noEdge = what NO is worth (fair prob) - what we pay (Poly NO price = 1 - YES price)
          const yesEdge = yesFairProb - livePolyPrice;
          const noEdge = noFairProb - (1 - livePolyPrice);
          
          // Pick the side with the positive edge
          let betSide: 'YES' | 'NO';
          let rawEdge: number;
          let recommendedOutcome: string;
          let recommendedFairProb: number;
          
          if (yesEdge > 0 && yesEdge >= noEdge) {
            // Polymarket underpricing YES - BUY YES
            betSide = 'YES';
            rawEdge = yesEdge;
            recommendedOutcome = yesTeamName;
            recommendedFairProb = yesFairProb;
          } else if (noEdge > 0) {
            // Polymarket underpricing NO - BUY NO
            betSide = 'NO';
            rawEdge = noEdge;
            recommendedOutcome = noTeamName;
            recommendedFairProb = noFairProb;
          } else {
            // No positive edge on either side - skip
            console.log(`[POLY-MONITOR] No edge on either side for ${event.event_name}: YES=${yesTeamName}=${(yesEdge * 100).toFixed(1)}%, NO=${noTeamName}=${(noEdge * 100).toFixed(1)}%`);
            continue;
          }
          
          // Movement direction can OVERRIDE if strong directional signal
          if (movement.triggered) {
            if (movement.direction === 'shortening' && yesEdge > 0.01) {
              // Bookies shortened (prob UP) + there's a YES edge - prefer BUY YES
              betSide = 'YES';
              rawEdge = yesEdge;
              recommendedOutcome = yesTeamName;
              recommendedFairProb = yesFairProb;
            } else if (movement.direction === 'drifting' && noEdge > 0.01) {
              // Bookies drifted (prob DOWN) + there's a NO edge - prefer BUY NO
              betSide = 'NO';
              rawEdge = noEdge;
              recommendedOutcome = noTeamName;
              recommendedFairProb = noFairProb;
            }
          }
          
          console.log(`[POLY-MONITOR] EDGE CALC: ${event.event_name} | YES=${yesTeamName}=${(yesEdge * 100).toFixed(1)}%, NO=${noTeamName}=${(noEdge * 100).toFixed(1)}% -> ${betSide} ${recommendedOutcome} (${(rawEdge * 100).toFixed(1)}% edge)`);
          // ========== END DIRECT EDGE CALCULATION ==========
          
          if (rawEdge >= 0.02) {
            // CRITICAL FIX #3: Staleness & high-prob edge gating
            // Gate against artifact edges on high-probability outcomes
            const staleness = now.getTime() - new Date(event.last_poly_refresh || now.toISOString()).getTime();
            const stalenessMinutes = staleness / 60000;
            
            // High probability + stale = likely artifact
            if (recommendedFairProb >= 0.85 && stalenessMinutes > 3) {
              console.log(`[POLY-MONITOR] Skipping high-prob edge for ${event.event_name} - stale price (${stalenessMinutes.toFixed(0)}m old, ${(recommendedFairProb * 100).toFixed(0)}% fair prob)`);
              continue;
            }
            
            // Cap extreme edges on very high probability outcomes
            if (recommendedFairProb >= 0.90 && rawEdge > 0.40) {
              console.log(`[POLY-MONITOR] Capping artifact edge for ${event.event_name} - raw ${(rawEdge * 100).toFixed(1)}% on ${(recommendedFairProb * 100).toFixed(0)}% prob`);
              rawEdge = 0.40; // Cap at 40%
            }
            
            const { netEdge } = calculateNetEdge(rawEdge, liveVolume, stakeAmount, spreadPct);
            
            // ========== DUAL TRIGGER SYSTEM ==========
            // TRIGGER CONDITIONS (either/or):
            // 1. Edge Trigger: raw_edge >= 5% (high static edge)
            // 2. Movement Trigger: 2+ sharp books moved same direction
            const edgeTriggered = rawEdge >= 0.05;
            const movementTriggered = movement.triggered && movement.booksConfirming >= 2;
            
            let triggerReason: 'edge' | 'movement' | 'both' | null = null;
            if (edgeTriggered && movementTriggered) {
              triggerReason = 'both';
            } else if (edgeTriggered) {
              triggerReason = 'edge';
            } else if (movementTriggered) {
              triggerReason = 'movement';
            }
            
            // Calculate signal tier - ELITE/STRONG require movement confirmation
            const signalTier = calculateSignalTier(movementTriggered, netEdge);
            
            if (movementTriggered) {
              movementConfirmedCount++;
              console.log(`[POLY-MONITOR] Movement CONFIRMED for ${event.event_name}: ${movement.booksConfirming} books, ${movement.direction}, ${(movement.velocity * 100).toFixed(1)}% velocity -> ${betSide}`);
            }
            
            // SKIP if neither trigger fired
            if (!triggerReason) {
              console.log(`[POLY-MONITOR] No trigger for ${event.event_name} (${(rawEdge * 100).toFixed(1)}% edge, ${movement.booksConfirming || 0} books) - waiting`);
              continue;
            }
            
            console.log(`[POLY-MONITOR] TRIGGER: ${triggerReason.toUpperCase()} | ${signalTier.toUpperCase()} (${betSide}): ${event.event_name} - Raw: ${(rawEdge * 100).toFixed(1)}%, Books: ${movement.booksConfirming || 0}`);
            // ========== END DUAL TRIGGER SYSTEM ==========
            
            // CRITICAL GATE: Block signals for games that have already started
            if (eventStart <= now) {
              console.log(`[POLY-MONITOR] Skipping ${event.event_name} - game already started (${eventStart.toISOString()} <= ${now.toISOString()})`);
              continue;
            }
            
            edgesFound++;

            // Check for existing active/executed/dismissed signal for this event+outcome
            // Including 'dismissed' prevents recreating signals user explicitly dismissed
            const { data: existingSignals } = await supabase
              .from('signal_opportunities')
              .select('id, status')
              .eq('event_name', event.event_name)
              .eq('recommended_outcome', recommendedOutcome)
              .in('status', ['active', 'executed', 'dismissed']);

            const existingSignal = existingSignals?.[0];

            if (existingSignal?.status === 'executed') {
              console.log(`[POLY-MONITOR] Skipping ${event.event_name} - already executed`);
              continue;
            }
            
            if (existingSignal?.status === 'dismissed') {
              console.log(`[POLY-MONITOR] Skipping ${event.event_name} - user dismissed this signal`);
              continue;
            }

            let signal: any = null;
            let signalError: any = null;

            const signalData = {
              polymarket_price: livePolyPrice,
              bookmaker_probability: recommendedFairProb, // Use recommended team's fair prob
              bookmaker_prob_fair: recommendedFairProb,
              edge_percent: rawEdge * 100,
              confidence_score: Math.min(85, 50 + Math.floor(netEdge * 500)),
              urgency: eventStart.getTime() - now.getTime() < 3600000 ? 'critical' : 
                      eventStart.getTime() - now.getTime() < 14400000 ? 'high' : 'normal',
              polymarket_yes_price: livePolyPrice,
              polymarket_volume: liveVolume,
              polymarket_updated_at: now.toISOString(),
              signal_strength: netEdge * 100,
              expires_at: event.commence_time,
              // NEW: Movement detection fields
              movement_confirmed: movementTriggered,
              movement_velocity: movement.velocity,
              signal_tier: signalTier,
              signal_factors: {
                raw_edge: rawEdge * 100,
                net_edge: netEdge * 100,
                market_type: marketType,
                sport: sport,
                volume: liveVolume,
                team_name: recommendedOutcome, // Use recommended outcome (the team we're betting on)
                hours_until_event: Math.floor((eventStart.getTime() - now.getTime()) / 3600000),
                time_label: `${Math.floor((eventStart.getTime() - now.getTime()) / 3600000)}h`,
                // Dual trigger system data
                trigger_reason: triggerReason,
                edge_triggered: edgeTriggered,
                movement_triggered: movementTriggered,
                movement_confirmed: movementTriggered,
                movement_velocity: movement.velocity * 100,
                movement_direction: movement.direction,
                books_confirming_movement: movement.booksConfirming,
                signal_tier: signalTier,
                // Directional labeling
                bet_direction: betSide === 'YES' ? 'BUY_YES' : 'BUY_NO',
              },
            };
            
            // Update polymarket_h2h_cache monitoring_status to 'triggered'
            await supabase
              .from('polymarket_h2h_cache')
              .update({ monitoring_status: 'triggered' })
              .eq('condition_id', event.polymarket_condition_id);

            // CRITICAL FIX #2: One-signal-per-event exclusivity
            // Before creating/updating signal, expire any opposing signal for this event
            await supabase
              .from('signal_opportunities')
              .update({ status: 'expired' })
              .eq('event_name', event.event_name)
              .eq('status', 'active')
              .neq('recommended_outcome', recommendedOutcome);

            if (existingSignal) {
              // UPDATE existing active signal with fresh data
              // Include slug from cache so it gets populated on existing signals
              const polymarketSlug = cache?.polymarket_slug || null;
              
              const { data, error } = await supabase
                .from('signal_opportunities')
                .update({
                  ...signalData,
                  side: betSide, // Update side based on movement direction
                  polymarket_slug: polymarketSlug, // Copy slug for direct Polymarket URLs
                })
                .eq('id', existingSignal.id)
                .select()
                .single();

              signal = data;
              signalError = error;
              console.log(`[POLY-MONITOR] Updated ${signalTier} ${betSide} signal for ${event.event_name}`);
            } else {
              // INSERT new signal - include slug from cache for direct Polymarket URLs
              const polymarketSlug = cache?.polymarket_slug || null;
              
              const { data, error } = await supabase
                .from('signal_opportunities')
                .insert({
                  event_name: event.event_name,
                  recommended_outcome: recommendedOutcome,
                  side: betSide, // NEW: Use calculated bet side
                  is_true_arbitrage: true,
                  status: 'active',
                  polymarket_condition_id: event.polymarket_condition_id,
                  polymarket_slug: polymarketSlug, // NEW: Copy slug for direct URLs
                  ...signalData,
                })
                .select()
                .single();

              signal = data;
              signalError = error;
              console.log(`[POLY-MONITOR] Created new ${signalTier} ${betSide} signal for ${event.event_name}`);
            }

            // Send SMS for ALL new signals added to the feed (user request)
            if (!signalError && signal && !existingSignal) {
              console.log(`[POLY-MONITOR] New signal created - sending SMS: tier=${signalTier}, rawEdge=${(rawEdge * 100).toFixed(1)}%`);
              const alertSent = await sendSmsAlert(
                supabase, event, livePolyPrice, recommendedFairProb,
                rawEdge, netEdge, liveVolume, stakeAmount, marketType, recommendedOutcome,
                signalTier, movement.velocity, betSide, movement.direction
              );
              
              if (alertSent) {
                alertsSent++;
                await supabase
                  .from('event_watch_state')
                  .update({ watch_state: 'alerted', updated_at: now.toISOString() })
                  .eq('id', event.id);
              }
            }
          }
        }
      } catch (eventError) {
        console.error(`[POLY-MONITOR] Error processing ${event.event_key}:`, eventError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[POLY-MONITOR] Complete: ${eventsToProcess.length} polled, ${eventsMatched} matched, ${edgesFound} edges (${movementConfirmedCount} movement-confirmed), ${alertsSent} alerts in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        events_polled: eventsToProcess.length,
        events_matched: eventsMatched,
        events_expired: eventsExpired,
        edges_found: edgesFound,
        movement_confirmed: movementConfirmedCount,
        alerts_sent: alertsSent,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POLY-MONITOR] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
