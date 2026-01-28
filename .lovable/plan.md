
# Fix Polymarket NBA Market Detection

## Root Cause Analysis

From the logs and your screenshot, I identified **two critical issues** preventing the system from finding NBA H2H markets like Timberwolves vs Mavericks:

### Issue 1: Rate Limit Exhaustion
The function hits `MAX_LIVE_API_LOOKUPS = 5` before it even tries to look up the Mavericks game. Looking at the logs:
```
[POLY-LIVE] Skipping Dallas Mavericks vs Minnesota Timberwolves - max live lookups (5) reached
```

The function is processing Euroleague basketball games (Partizan, Olimpia Milano, Valencia Basket, Maccabi) before NBA games, exhausting the API quota on less relevant markets.

### Issue 2: Search Term Mismatch
Your Polymarket screenshot shows the market as:
- **"Timberwolves vs. Mavericks"** (nicknames only)

But our bookmaker signals have:
- **"Dallas Mavericks vs Minnesota Timberwolves"** (full city + team name)

When we search the Polymarket API with "Dallas Mavericks", we may not match "Timberwolves vs. Mavericks" because the search API is title-based.

---

## Solution Overview

| Change | File | Description |
|--------|------|-------------|
| 1. Prioritize NBA/major sports | `detect-signals/index.ts` | Sort signals to process NBA games FIRST before Euroleague |
| 2. Increase API budget | `detect-signals/index.ts` | Raise `MAX_LIVE_API_LOOKUPS` from 5 to 10 |
| 3. Smarter search terms | `detect-signals/index.ts` | Use team nicknames from TEAM_ALIASES for search queries |
| 4. Skip low-priority leagues | `detect-signals/index.ts` | Deprioritize Euroleague/minor leagues in H2H mode |

---

## Technical Implementation

### Change 1: Prioritize NBA Games
Add priority scoring to process NBA/NFL/UFC games before Euroleague/minor leagues:

```typescript
function getLeaguePriority(eventName: string): number {
  const lower = eventName.toLowerCase();
  // NBA gets highest priority
  if (['lakers', 'celtics', 'warriors', 'heat', 'bulls', 'mavericks', 'nuggets', 'cavaliers', 'knicks', 'nets', 'clippers', 'rockets', 'suns', 'bucks', 'sixers', 'pacers', 'hawks', 'magic', 'pelicans', 'grizzlies', 'kings', 'thunder', 'timberwolves', 'spurs', 'blazers', 'jazz', 'wizards', 'raptors', 'hornets', 'pistons'].some(t => lower.includes(t))) {
    return 1; // NBA = top priority
  }
  // Tennis grand slams
  if (['australian open', 'wimbledon', 'us open', 'french open'].some(t => lower.includes(t))) {
    return 2;
  }
  // UFC
  if (lower.includes('ufc') || ['makhachev', 'jones', 'pereira'].some(t => lower.includes(t))) {
    return 3;
  }
  // Euroleague - lower priority
  if (['euroleague', 'olimpia', 'partizan', 'fenerbahce', 'maccabi', 'barcelona basket', 'real madrid basket'].some(t => lower.includes(t))) {
    return 10; // Low priority
  }
  return 5; // Default
}
```

Sort signals by priority before processing:
```typescript
h2hSignals.sort((a, b) => getLeaguePriority(a.event_name) - getLeaguePriority(b.event_name));
```

### Change 2: Increase API Budget
```typescript
// Raise from 5 to 10 to handle more events
const MAX_LIVE_API_LOOKUPS = 10;
```

### Change 3: Smarter Search Terms with Nicknames
Update `extractLiveSearchTerms` to use the alias table:

```typescript
function extractLiveSearchTerms(eventName: string): string[] {
  const terms: string[] = [];
  
  // Extract team names
  const vsMatch = eventName.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) {
    const team1 = vsMatch[1].trim();
    const team2 = vsMatch[2].trim();
    
    // Get nickname from aliases (first alias is usually the short name)
    const team1Nickname = getTeamNickname(team1);
    const team2Nickname = getTeamNickname(team2);
    
    // Try nicknames first (more likely to match Polymarket titles)
    if (team1Nickname) terms.push(team1Nickname);
    if (team2Nickname) terms.push(team2Nickname);
    
    // Then try full names as fallback
    terms.push(team1);
    terms.push(team2);
  } else {
    terms.push(eventName);
  }
  
  return [...new Set(terms)].slice(0, 4);
}

function getTeamNickname(teamName: string): string | null {
  const normalized = normalizeName(teamName);
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (normalized.includes(canonical) || aliases.some(a => normalized.includes(a))) {
      // Return the shortest alias (typically the nickname)
      return aliases.sort((a, b) => a.length - b.length)[0];
    }
  }
  return null;
}
```

This means for "Dallas Mavericks vs Minnesota Timberwolves":
- Search 1: "mavs" (nickname)
- Search 2: "wolves" (nickname)
- Search 3: "Dallas Mavericks" (full)
- Search 4: "Minnesota Timberwolves" (full)

### Change 4: Skip Euroleague During Live Lookup
If budget is limited, skip Euroleague events entirely:

```typescript
// In the signal processing loop
if (liveApiCallsUsed >= MAX_LIVE_API_LOOKUPS / 2) {
  // Budget running low - only process NBA/UFC/Tennis
  const priority = getLeaguePriority(signal.event_name);
  if (priority > 3) {
    console.log(`[POLY-LIVE] Budget low, skipping lower-priority: ${signal.event_name}`);
    continue;
  }
}
```

---

## Expected Result

After these changes:
1. NBA games (Mavericks vs Timberwolves, Celtics vs Hawks, etc.) will be processed FIRST
2. Searches will use nicknames ("wolves", "mavs") which match Polymarket titles better
3. The system will find your Timberwolves vs Mavericks market with $750K volume
4. If there's a price discrepancy vs bookmaker odds, it will show as a true arbitrage opportunity with a "BET" or "STRONG_BET" decision

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/detect-signals/index.ts` | Add priority sorting, nickname search, increase API budget |
