

## Plan: Fix Check Pending Button & Add Live Scores for In-Play Bets

### Problem Summary

1. **Check Pending Button Missing**: The button only appears when there are bets with `outcome = 'pending'` or `NULL`. Since all your recent bets were marked as `in_play` or `loss`, the button is hidden.

2. **No Live Scores**: The system shows the current Polymarket price for in-play bets, but not actual game scores (e.g., "2-1, 75'").

---

### Solution

#### Part 1: Fix "Check Pending" Button Visibility

**Change**: Modify the button to also appear when there are `in_play` bets, not just `pending` ones.

- Rename button to "Check Bets" or "Refresh Results"  
- Show when: `pending` OR `in_play` bets exist
- Display count of both categories

**File**: `src/pages/Stats.tsx`

---

#### Part 2: Add Live Scores Backend

**Create**: New edge function `fetch-live-scores` that queries The Odds API scores endpoint.

**API Endpoint**:
```
GET https://api.the-odds-api.com/v4/sports/{sport}/scores/?apiKey={key}&daysFrom=1
```

**Response includes**:
- `completed`: true/false  
- `scores`: Array of `{ name: "Team A", score: "2" }`
- `commence_time`: When the event started
- `last_update`: Last score update time

**Logic**:
1. Extract sport key from the bet's event name or store it in `signal_logs`
2. Query scores API for relevant sports (NHL, NBA, tennis, soccer)
3. Fuzzy-match event names to find the correct game
4. Return score, game time/period, and completion status

**File**: `supabase/functions/fetch-live-scores/index.ts`

---

#### Part 3: Display Live Scores in UI

**Update**: The Stats page to show live scores alongside the LIVE badge.

**Display format by sport**:
- **Hockey/Soccer**: "2-1 (P2)" or "1-0 (65')"  
- **Basketball**: "98-87 (Q3)"
- **Tennis**: "2-1 sets"

**Changes**:
1. Add `live_score` and `game_status` fields to `SignalLogEntry` interface
2. Fetch live scores when loading in-play bets
3. Update the Status column to show score data

**Files**: 
- `src/hooks/useSignalStats.ts`
- `src/pages/Stats.tsx`

---

### Technical Details

#### Database Changes (Optional Enhancement)
Add `sport_key` column to `signal_logs` to enable direct score lookups without fuzzy matching:

```sql
ALTER TABLE signal_logs ADD COLUMN sport_key text;
```

#### Edge Function Structure
```typescript
// fetch-live-scores/index.ts
interface ScoreRequest {
  event_names: string[];  // Events to look up
  sport_hint?: string;    // Optional sport filter
}

interface LiveScore {
  event_name: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  completed: boolean;
  game_status: string;   // "P2", "Q3", "65'", "Final"
  last_update: string;
}
```

#### Sport Key Mapping
| Event Pattern | API Sport Key |
|--------------|---------------|
| "vs." + NHL teams | `icehockey_nhl` |
| "vs." + NBA teams | `basketball_nba` |
| Tennis names | `tennis_*` |
| Soccer leagues | `soccer_epl`, etc. |

---

### Implementation Order

1. **Fix button visibility** - Quick fix, immediate impact
2. **Create fetch-live-scores function** - Backend infrastructure  
3. **Integrate scores into useSignalStats** - Data layer
4. **Update Stats UI** - Display scores with LIVE badge

---

### API Quota Consideration

The Odds API scores endpoint costs **1 request per sport**. To minimize usage:
- Only query sports with active in-play bets
- Cache results for 60 seconds
- Batch multiple events per sport query

