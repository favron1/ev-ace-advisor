

# Improved Team Matching Logic

## Problem Being Solved

The current nickname-only matching (last word of team name) can fail for:
- Teams with similar suffixes (e.g., "Hawks" vs "Blackhawks")
- Multi-word team names where the last word isn't unique
- Soccer/football clubs with prefixes (FC, SC, AFC)

## Your Suggested Solution

### Step 1: Enhanced Normalization

Add a stricter normalization function that removes common club prefixes:

```typescript
const norm = (s: string) => normalizeName(s)
  .replace(/\b(fc|sc|afc|cf|bc|the)\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();
```

### Step 2: Exact Match First

Try exact full-name matching before falling back:

```typescript
const yesFull = norm(polyYesTeam);
const noFull = norm(polyNoTeam);

const exactIndex = (team: string) =>
  market.outcomes.findIndex((o: any) => norm(o.name) === team);

let yesOutcomeIndex = exactIndex(yesFull);
let noOutcomeIndex = exactIndex(noFull);
```

### Step 3: Token Overlap Fallback

If exact match fails, use token-based scoring with a minimum threshold:

```typescript
const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));
const overlapScore = (a: Set<string>, b: Set<string>) => {
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit;
};

const bestMatchIndex = (teamTok: Set<string>) => {
  let best = -1, bestScore = 0;
  market.outcomes.forEach((o: any, i: number) => {
    const s = overlapScore(teamTok, tokens(o.name));
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return { best, bestScore };
};

// Require at least 2 shared tokens for confidence
if (yesOutcomeIndex === -1) {
  const { best, bestScore } = bestMatchIndex(yesTok);
  if (bestScore >= 2) yesOutcomeIndex = best;
}
if (noOutcomeIndex === -1) {
  const { best, bestScore } = bestMatchIndex(noTok);
  if (bestScore >= 2) noOutcomeIndex = best;
}
```

---

## Technical Implementation

### File to Modify

**`supabase/functions/polymarket-monitor/index.ts`** (lines 848-878)

Replace the current nickname-only matching with the 3-tier approach:
1. Exact normalized name match
2. Token overlap with ≥2 shared words requirement
3. Reject if neither tier succeeds

### Why This is Better

| Current Approach | Proposed Approach |
|-----------------|-------------------|
| Nickname only (last word) | Exact match first |
| Single-word comparison | Multi-word token overlap |
| No minimum threshold | Requires ≥2 shared tokens |
| Vulnerable to suffix collisions | Strips common prefixes |

### Logging Enhancement

Add detailed logging to track which matching tier succeeded:

```typescript
console.log(`[POLY-MONITOR] MATCH: ${method} for "${eventName}" → YES=${yesTeamName}, NO=${noTeamName}`);
// method = "exact" | "token-overlap" | "failed"
```

---

## Risk Mitigation

- The ≥2 token requirement prevents false positives on single-word matches
- Exact match takes precedence, so correctly formatted names won't regress
- Logging shows which tier matched for debugging

