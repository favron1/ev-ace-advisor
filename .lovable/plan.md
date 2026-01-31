

# Fix Polymarket Direct Links (Layer 2 Only)

## Problem Summary

The "Trade on Poly" button currently goes to the Polymarket homepage because:

1. **`polymarket_slug` is NULL** in the signal database for all existing signals
2. Firecrawl-sourced markets (many of your signals) never receive slugs from the Gamma API
3. The sync function correctly saves slugs to the cache, but they're not backfilled to existing signals

## Current Data State

```
Signal: Michigan Wolverines vs Michigan State Spartans
├── polymarket_slug: NULL      ← This is why the link fails
├── polymarket_condition_id: NULL
└── polymarket_market_id: NULL
```

## Solution: Enhanced Fallback URL Generation (Layer 2)

Since we're keeping Layer 1 protected, this fix improves the frontend logic to generate better URLs when the slug is missing.

---

## Technical Changes

### File: `src/components/terminal/SignalCard.tsx`

**Current Logic (lines 168-181):**
```typescript
const getPolymarketDirectUrl = (): string | null => {
  const slug = (signal as any).polymarket_slug;
  if (slug) {
    return `https://polymarket.com/event/${slug}`;
  }
  const conditionId = (signal as any).polymarket_condition_id;
  if (conditionId && conditionId.startsWith('0x')) {
    return `https://polymarket.com/markets?conditionId=${conditionId}`;
  }
  return null; // Falls through to search
};
```

**Enhanced Logic:**
```typescript
const getPolymarketDirectUrl = (): string | null => {
  // Priority 1: Use slug from backend (most reliable)
  const slug = (signal as any).polymarket_slug;
  if (slug) {
    return `https://polymarket.com/event/${slug}`;
  }
  
  // Priority 2: Use condition_id for direct market access
  const conditionId = (signal as any).polymarket_condition_id;
  if (conditionId && conditionId.startsWith('0x')) {
    return `https://polymarket.com/markets?conditionId=${conditionId}`;
  }
  
  return null; // Falls through to smart search
};

// Enhanced search URL with better query construction
const getPolymarketSearchUrl = () => {
  // Extract just the team names for better search results
  const teams = extractTeamNames(signal.event_name);
  if (teams) {
    // Search for "Lakers vs Wizards" instead of "Los Angeles Lakers vs Washington Wizards"
    return `https://polymarket.com/search?query=${encodeURIComponent(teams.short)}`;
  }
  // Fallback to recommended_outcome (team name) for single-team search
  const searchTerm = signal.recommended_outcome || signal.event_name;
  return `https://polymarket.com/search?query=${encodeURIComponent(searchTerm)}`;
};

// Helper: Extract team names for smarter search
function extractTeamNames(eventName: string): { full: string; short: string } | null {
  // Match "Team A vs Team B" or "Team A vs. Team B"
  const vsMatch = eventName.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!vsMatch) return null;
  
  const team1 = vsMatch[1].trim();
  const team2 = vsMatch[2].trim();
  
  // Extract last word (nickname) from each team: "Michigan Wolverines" → "Wolverines"
  const team1Short = team1.split(' ').pop() || team1;
  const team2Short = team2.split(' ').pop() || team2;
  
  return {
    full: `${team1} vs ${team2}`,
    short: `${team1Short} vs ${team2Short}`
  };
}
```

### Improved Dropdown Menu UX

When no direct link is available, show a clearer message:

```typescript
{getPolymarketDirectUrl() ? (
  <>
    <DropdownMenuItem asChild>
      <a href={getPolymarketDirectUrl()!} target="_blank">
        <ExternalLink className="h-4 w-4" />
        Open Market Directly
      </a>
    </DropdownMenuItem>
    <DropdownMenuSeparator />
  </>
) : (
  <>
    <DropdownMenuItem disabled className="text-muted-foreground">
      <AlertCircle className="h-4 w-4" />
      Direct link unavailable
    </DropdownMenuItem>
    <DropdownMenuSeparator />
  </>
)}
```

---

## Expected Behavior After Fix

| Scenario | URL Generated | Result |
|----------|---------------|--------|
| Signal has slug | `https://polymarket.com/event/nhl-lak-phi-2026-01-31` | Goes directly to market |
| Signal has condition_id | `https://polymarket.com/markets?conditionId=0x...` | Goes to market page |
| Signal has neither | `https://polymarket.com/search?query=Wolverines+vs+Spartans` | Shows relevant search results |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/terminal/SignalCard.tsx` | Add `extractTeamNames()` helper, improve search URL generation, add disabled state for missing direct link |

---

## Immediate Workaround (No Code Change)

Until this fix is deployed, clicking "Search on Polymarket" in the dropdown will still work - it just requires one extra click.

---

## Future Layer 1 Enhancement (Optional)

If you want to fully fix this in the future, the backend would need to:
1. Backfill slugs from cache to existing signals during sync
2. Generate synthetic slugs for Firecrawl-sourced events

This would be a Layer 1 change requiring explicit approval.

