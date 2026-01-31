

# Simplify Signal Display: "BET ON [TEAM] TO WIN"

## What You Want

Show which team sharp books favor and recommend betting on them - period. No mention of "YES shares", "NO shares", "BUY YES", or "BUY NO". The system still calculates edges for both sides, but the display is purely team-centric.

## Changes Required

### 1. SignalCard.tsx - Main Display

**Current (lines 453-468):**
```tsx
<Badge>BET: {teamToBetOn} TO WIN</Badge>
<Badge>{signal.side === 'YES' ? 'YES shares' : 'NO shares'}</Badge>
```

**After:**
```tsx
<Badge>BET ON {signal.recommended_outcome} TO WIN</Badge>
// Remove the YES/NO shares badge entirely
```

The `recommended_outcome` field already contains the correct team (we fixed that in the previous update). We just need to:
1. Use it directly instead of re-parsing the event name
2. Remove the "YES shares" / "NO shares" badge completely

### 2. SMS Alert Formatting (polymarket-monitor/index.ts)

**Current (lines 692-705):**
```
🎯 STRONG: Utah vs Carolina
BUY YES: Utah
Poly YES: 45¢ ($50K)
```

**After:**
```
🎯 STRONG: Utah vs Carolina
BET ON Utah TO WIN
Poly: 45¢ ($50K)
```

Remove `BUY YES`/`BUY NO` labeling and `Poly YES`/`Poly NO` - just show "BET ON [team]" and "Poly: [price]".

### 3. FiltersBar.tsx - Remove BUY YES Filter

Since all signals will now just show "BET ON [team]", the "BUY YES Only" filter becomes meaningless. We'll either:
- Remove it entirely, OR
- Rename it to "Shortening Only" (sharps moving price up = higher confidence edge)

I'll remove it for simplicity since the user hasn't expressed interest in filtering by technical side.

### 4. Terminal.tsx + useSignals.ts - Remove Filter Logic

Remove the `showBuyYesOnly` / `buyYesOnly` state and filter logic.

## Summary of Files to Update

| File | Change |
|------|--------|
| `src/components/terminal/SignalCard.tsx` | Remove "YES/NO shares" badge, simplify bet display to use `recommended_outcome` directly |
| `supabase/functions/polymarket-monitor/index.ts` | Change SMS from "BUY YES: [team]" to "BET ON [team] TO WIN" |
| `src/components/terminal/FiltersBar.tsx` | Remove the "BUY YES Only" filter toggle |
| `src/pages/Terminal.tsx` | Remove `showBuyYesOnly` state |
| `src/hooks/useSignals.ts` | Remove `buyYesOnly` filter logic |

## After This Change

Every signal will display:
- **Badge:** "BET ON Utah TO WIN" (always green, team-centric)
- **Explanation:** "Sharp books value Utah at 67% to win"
- **No technical jargon:** No YES/NO/shares anywhere visible

The system still knows internally which Polymarket token to buy, but that's an implementation detail hidden from you.

