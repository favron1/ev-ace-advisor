

# Fix: Polymarket Direct Links Not Working

## Problem Identified

The "Trade on Poly" button links are redirecting to the Polymarket homepage instead of the correct market. This is happening because:

1. **Wrong URL format**: The current code constructs URLs like:
   ```
   https://polymarket.com/sports/nhl/games/week/17/nhl-det-col-2026-01-31
   ```
   This format doesn't exist on Polymarket.

2. **Correct format is**: `https://polymarket.com/event/[slug]`
   - The Gamma API provides a `slug` field (e.g., "nhl-red-wings-vs-avalanche-january-31")
   - This slug is NOT currently being stored in the database

3. **Missing data flow**: The `polymarket_h2h_cache` table doesn't have a `slug` column, so even if fetched, it's not persisted.

---

## Solution Overview

### Phase 1: Database - Add slug column
Add a `polymarket_slug` column to store the event/market slug from Gamma API.

### Phase 2: Backend - Capture and store slug
Update `polymarket-sync-24h` to extract and save the `slug` field from Gamma API responses.

### Phase 3: Frontend - Use correct URL format
Update `SignalCard.tsx` to use `polymarket.com/event/[slug]` when available, with fallbacks.

---

## Technical Details

### 1. Database Migration

```sql
ALTER TABLE polymarket_h2h_cache 
ADD COLUMN polymarket_slug TEXT;
```

Also add to `signal_opportunities` for easy access:
```sql
ALTER TABLE signal_opportunities 
ADD COLUMN polymarket_slug TEXT;
```

### 2. Backend Changes (`polymarket-sync-24h/index.ts`)

When processing Gamma API events, extract the slug:
```typescript
// Current: Only stores conditionId
const conditionId = market.conditionId || market.id || event.id;

// Add: Also extract slug
const eventSlug = event.slug || null; // Gamma API returns this
```

Then include in the upsert:
```typescript
.upsert({
  condition_id: conditionId,
  polymarket_slug: eventSlug, // NEW
  // ... rest of fields
})
```

Also update `polymarket-monitor/index.ts` to copy the slug when creating signals.

### 3. Frontend Changes (`SignalCard.tsx`)

Replace the current URL generation logic:

**Current (broken - lines 242-262):**
```typescript
const getPolymarketDirectUrl = (): string | null => {
  // Constructs wrong format like /sports/nhl/games/week/17/...
  return `https://polymarket.com/sports/${sport}/.../`;
};
```

**New (correct):**
```typescript
const getPolymarketDirectUrl = (): string | null => {
  // Use slug from backend (new field)
  const slug = (signal as any).polymarket_slug;
  if (slug) {
    return `https://polymarket.com/event/${slug}`;
  }
  
  // Fallback: Use condition_id for direct market access
  const conditionId = (signal as any).polymarket_condition_id;
  if (conditionId && conditionId.startsWith('0x')) {
    // Polymarket also accepts /markets?conditionId=0x...
    return `https://polymarket.com/markets?conditionId=${conditionId}`;
  }
  
  return null; // Fall through to search
};
```

**Remove**: All the TEAM_CODES mapping and week calculation logic (lines 31-117) - no longer needed.

---

## URL Fallback Strategy

After the fix, the dropdown will work as:

| Priority | URL Format | When Used |
|----------|------------|-----------|
| 1 | `polymarket.com/event/[slug]` | When slug is available from Gamma API |
| 2 | `polymarket.com/markets?conditionId=[id]` | When condition_id is a valid 0x hash |
| 3 | `polymarket.com/search?query=[team]` | Fallback for unmatched/scraped events |

---

## Files to Update

| File | Changes |
|------|---------|
| **Database** | Add `polymarket_slug` column to `polymarket_h2h_cache` and `signal_opportunities` |
| `supabase/functions/polymarket-sync-24h/index.ts` | Extract `event.slug` from Gamma API and store it |
| `supabase/functions/polymarket-monitor/index.ts` | Copy slug when creating signals |
| `src/components/terminal/SignalCard.tsx` | Use new slug-based URL generation, remove broken team-code logic |

---

## Expected Outcome

After implementation:
- "Open Market Directly" will link to `polymarket.com/event/nhl-red-wings-vs-avalanche-january-31`
- Links will work for all Gamma-API sourced markets
- Firecrawl-scraped markets will fallback to search (no slug available)
- Condition ID fallback provides secondary option for edge cases

