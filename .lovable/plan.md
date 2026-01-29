
## Fix Watch Mode Poll - Enable H2H Snapshot Capture & Movement Detection

### Root Cause Analysis

The investigation revealed **3 critical bugs** blocking movement detection:

| Bug | Impact | Evidence |
|-----|--------|----------|
| **Sport category mismatch** | 15 NHL markets ignored | Polymarket uses `NHL`, code only maps `icehockey_nhl` |
| **Wrong data source** | Fetching outrights for H2H matches | Code calls `fetchBookmakerOutrights` but needs H2H data |
| **Team name mismatch** | Can't match "Jets" to "Winnipeg Jets" | Bookmaker uses full city names, Polymarket uses nicknames |

**Data available but not matched:**
- Polymarket: `Jets vs. Lightning` (sport: `NHL`)
- Bookmaker: `Tampa Bay Lightning vs Winnipeg Jets` (51% implied for Lightning)
- Current match rate: **0%**

---

### Solution: Use Existing H2H Bookmaker Data

Instead of fetching outright odds (championship winners), the function should:

1. **Query `bookmaker_signals` table** for recent H2H match data
2. **Match by team names** with fuzzy logic for city prefixes and aliases
3. **Store snapshots** for every successful match
4. **Calculate edge** and escalate as before

---

### Implementation Details

**File: `supabase/functions/watch-mode-poll/index.ts`**

#### Change 1: Add NHL Sport Alias
```typescript
// Add NHL alias to sport normalization
function normalizeSportCategory(sport: string): string {
  const aliases: Record<string, string> = {
    'NHL': 'icehockey_nhl',
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
  };
  return aliases[sport] || sport;
}
```

#### Change 2: Replace Outright Fetch with H2H Query
Instead of calling the Odds API for outrights, query the existing `bookmaker_signals` table:

```typescript
// Fetch recent H2H signals from database
const { data: bookmakerSignals } = await supabase
  .from('bookmaker_signals')
  .select('*')
  .eq('market_type', 'h2h')
  .gte('captured_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour
```

#### Change 3: Improve Team Name Matching
Add NHL team city→nickname mappings:

```typescript
const NHL_TEAMS: Record<string, string[]> = {
  'winnipeg jets': ['jets', 'winnipeg'],
  'tampa bay lightning': ['lightning', 'tampa bay', 'tampa'],
  'edmonton oilers': ['oilers', 'edmonton'],
  'san jose sharks': ['sharks', 'san jose'],
  'carolina hurricanes': ['hurricanes', 'carolina'],
  // ... etc for all 32 NHL teams
};
```

#### Change 4: Match Polymarket to Bookmaker
For each Polymarket H2H market:
1. Parse team names from event (e.g., "Jets vs. Lightning" → ["jets", "lightning"])
2. Find bookmaker H2H match with same teams (handle reversed order)
3. Calculate vig-free fair probability
4. Store snapshot and calculate edge

---

### New Flow

```text
BEFORE (broken):
Polymarket H2H → Group by sport → Fetch OUTRIGHTS → No match → 0 snapshots

AFTER (fixed):
Polymarket H2H → Query bookmaker_signals H2H → Match by team names → Store snapshots → Detect movement
```

---

### Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Markets processed | 18 | 18 |
| Snapshots stored | 0 | ~30+ per poll |
| Edges detected | 0 | ~5-10 |
| Movement detection | Impossible | Enabled after 2-3 polls |

---

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/watch-mode-poll/index.ts` | Replace outright fetch with H2H query; Add NHL team aliases; Improve team name matching |

---

### Post-Implementation

After deploying the fix:
1. Run a manual Watch Mode poll to verify snapshots are stored
2. Wait 10-15 minutes for 2-3 more polls to build history
3. Movement velocity calculations will start working
4. Any coordinated bookmaker moves will trigger escalation to Active mode
