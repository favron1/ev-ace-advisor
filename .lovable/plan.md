

# Plan: AI-Powered Team Name Resolution Fallback

## The Problem

When Polymarket says **"Flyers vs. Bruins"** but bookmakers say **"Philadelphia Flyers vs. Boston Bruins"**, the current string-matching logic fails 70% of the time (42/60 markets unmatched).

## Your Solution

Use AI to interpret shortened/abbreviated team names and return the full matchup. This is far more robust than maintaining endless hardcoded mappings.

```text
Current Flow (Fails Often):
┌─────────────────────────────────────────────────────────────────────────┐
│ Polymarket: "Flyers vs. Bruins"                                         │
│ Bookmaker:  "Philadelphia Flyers vs. Boston Bruins"                     │
│                                                                         │
│ String Match: "flyers" ∈ "philadelphia flyers" → Sometimes works        │
│ BUT: "Kings" matches "Sacramento Kings" AND "Los Angeles Kings" → FAIL  │
└─────────────────────────────────────────────────────────────────────────┘

New Flow (AI Fallback):
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Try existing string matching first (fast, free)                      │
│ 2. If no match → Ask AI: "What matchup is Polymarket referring to       │
│    when they say 'Flyers vs. Bruins' in the NHL?"                       │
│ 3. AI returns: { home: "Philadelphia Flyers", away: "Boston Bruins" }   │
│ 4. Match against bookmaker data using full team names                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### File: `supabase/functions/polymarket-monitor/index.ts`

**Add new AI resolution helper function:**

```typescript
async function resolveTeamNamesWithAI(
  eventName: string,
  sport: string
): Promise<{ homeTeam: string; awayTeam: string } | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return null;

  const prompt = `What exact matchup is being referred to here: "${eventName}" in ${sport}?
Return the full official team names.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite", // Fast + cheap for simple lookups
      messages: [
        { role: "system", content: "You are a sports team name resolver. Return the full official team names for abbreviated matchups." },
        { role: "user", content: prompt }
      ],
      tools: [{
        type: "function",
        function: {
          name: "resolve_matchup",
          description: "Return the full official team names for a matchup",
          parameters: {
            type: "object",
            properties: {
              home_team: { type: "string", description: "Full name e.g. 'Philadelphia Flyers'" },
              away_team: { type: "string", description: "Full name e.g. 'Boston Bruins'" },
              confidence: { type: "string", enum: ["high", "medium", "low"] }
            },
            required: ["home_team", "away_team", "confidence"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "resolve_matchup" } }
    }),
  });

  if (!response.ok) return null;
  
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;

  const args = JSON.parse(toolCall.function.arguments);
  if (args.confidence === 'low') return null; // Don't trust low-confidence matches

  return { homeTeam: args.home_team, awayTeam: args.away_team };
}
```

**Update matching logic (around line 822):**

```typescript
// Find bookmaker match - try direct matching first
let match = findBookmakerMatch(
  event.event_name,
  event.polymarket_question || '',
  marketType,
  bookmakerGames
);

// AI FALLBACK: If no match, ask AI to resolve team names
if (!match && bookmakerGames.length > 0) {
  const sport = event.extracted_league || 'sports';
  const resolved = await resolveTeamNamesWithAI(event.event_name, sport);
  
  if (resolved) {
    console.log(`[POLY-MONITOR] AI resolved "${event.event_name}" → ${resolved.homeTeam} vs ${resolved.awayTeam}`);
    
    // Try matching again with AI-resolved names
    match = findBookmakerMatch(
      `${resolved.homeTeam} vs ${resolved.awayTeam}`,
      event.polymarket_question || '',
      marketType,
      bookmakerGames
    );
  }
}
```

---

## Caching Strategy

To avoid calling AI for the same matchup repeatedly, we can cache resolved names:

```typescript
// Add at module level
const aiResolvedNames = new Map<string, { home: string; away: string } | null>();

// Before AI call:
const cacheKey = `${event.event_name}|${sport}`;
if (aiResolvedNames.has(cacheKey)) {
  const cached = aiResolvedNames.get(cacheKey);
  // Use cached result...
} else {
  const resolved = await resolveTeamNamesWithAI(event.event_name, sport);
  aiResolvedNames.set(cacheKey, resolved);
}
```

This means:
- First scan for "Flyers vs Bruins" → AI call → cache result
- Subsequent scans → Use cached resolution (no AI call)

---

## Expected Results

| Scenario | Before | After |
|----------|--------|-------|
| "Flyers vs. Bruins" | No match (no "Philadelphia") | AI resolves → Match found |
| "Kings vs. Golden Knights" | Ambiguous (SAC Kings? LA Kings?) | AI uses context (NHL) → LA Kings |
| "MSU vs Duke" | No match | AI resolves → Michigan State Spartans |
| Already matched events | Works | Works (AI not called) |

---

## Cost & Performance

- **Model**: `google/gemini-2.5-flash-lite` (fastest, cheapest)
- **Per call**: ~50-100 tokens in, ~30 tokens out
- **Caching**: Each unique matchup resolved only once per scan cycle
- **Fallback only**: AI not called when direct matching succeeds

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-monitor/index.ts` | Add `resolveTeamNamesWithAI()` helper and integrate into matching flow |

