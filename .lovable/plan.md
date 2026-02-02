

# Fix Pipeline Issues: Duplicate Events, Missing Book Data & Add Navigation

## Overview
This plan addresses three issues with the Pipeline page:

1. **Duplicate events causing the count drop** - Same games have multiple entries (some with book data, some without)
2. **Add "Add to Signal Feed" button** - Allow manually promoting a pipeline event to a signal
3. **Add Back button** - Easy navigation out of the Pipeline page

---

## Root Cause Analysis

### Why events dropped from "many" to 18:
The database has **duplicate entries** for the same games:
- "Senators vs. Penguins" - 5 entries
- "Islanders vs. Capitals" - 4 entries  
- "Blues vs. Predators" - 4 entries
- etc.

Only SOME of these duplicates have `current_probability` (book data). Currently 69 monitored events are missing book data while 13 have it.

The duplicates were created when different Polymarket markets (spreads, totals, H2H) for the same game each created separate `event_watch_state` entries.

---

## Implementation Plan

### Part 1: Clean Up Duplicate Events (Database)

Run a cleanup query to remove duplicate entries that lack book data when a better entry exists:

```sql
DELETE FROM event_watch_state 
WHERE id IN (
  SELECT ews.id 
  FROM event_watch_state ews
  WHERE ews.current_probability IS NULL
    AND ews.watch_state != 'expired'
    AND EXISTS (
      SELECT 1 FROM event_watch_state ews2 
      WHERE ews2.event_name = ews.event_name 
        AND ews2.current_probability IS NOT NULL
        AND ews2.id != ews.id
    )
);
```

This keeps the entries WITH book prices and removes the empty duplicates.

---

### Part 2: Add Back Button
**File: `src/pages/Pipeline.tsx`**

Add a back arrow button in the header section next to the title:

```typescript
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// In component:
const navigate = useNavigate();

// In header section (around line 273):
<div className="flex items-center gap-3">
  <Button 
    variant="ghost" 
    size="icon" 
    onClick={() => navigate('/')}
    title="Back to Terminal"
  >
    <ArrowLeft className="h-5 w-5" />
  </Button>
  <div>
    <h1 className="text-2xl font-bold">Pipeline Monitor</h1>
    <p className="text-muted-foreground text-sm">...</p>
  </div>
</div>
```

---

### Part 3: Add "Add to Signal Feed" Button
**File: `src/pages/Pipeline.tsx`**

Add a button on each event card that creates a signal from the pipeline event:

**New function:**
```typescript
const handleAddToSignalFeed = async (event: WatchEvent) => {
  if (!event.current_probability || !event.polymarket_yes_price) {
    toast({
      title: 'Cannot create signal',
      description: 'This event is missing book or Polymarket price data',
      variant: 'destructive',
    });
    return;
  }

  const edge = (event.current_probability - event.polymarket_yes_price) * 100;
  
  const { error } = await supabase.from('signal_opportunities').insert({
    event_name: event.event_name,
    side: 'YES',
    polymarket_price: event.polymarket_yes_price,
    polymarket_yes_price: event.polymarket_yes_price,
    polymarket_volume: event.polymarket_volume,
    polymarket_condition_id: event.polymarket_condition_id,
    polymarket_match_confidence: 1.0,
    bookmaker_probability: event.current_probability,
    bookmaker_prob_fair: event.current_probability,
    edge_percent: edge,
    is_true_arbitrage: true,
    movement_confirmed: event.movement_pct > 0,
    confidence_score: Math.min(90, 60 + Math.round(edge * 3)),
    urgency: edge > 8 ? 'high' : 'normal',
    status: 'active',
    signal_tier: 'MANUAL',
    core_logic_version: 'v1.3',
    signal_factors: {
      edge_type: 'manual_pipeline_promotion',
      movement_pct: event.movement_pct,
    },
  });

  if (error) {
    toast({
      title: 'Failed to create signal',
      description: error.message,
      variant: 'destructive',
    });
  } else {
    toast({ title: 'Signal created', description: event.event_name });
    await fetchData(); // Refresh to show updated state
  }
};
```

**Button in event card (All Events and Active Pipeline tabs):**
```typescript
<Button
  variant="outline"
  size="sm"
  className="h-7 text-xs"
  onClick={() => handleAddToSignalFeed(event)}
  disabled={!event.current_probability || !event.polymarket_yes_price}
>
  <TrendingUp className="h-3 w-3 mr-1" />
  Add to Signals
</Button>
```

---

## Summary of Changes

| Change | File | Description |
|--------|------|-------------|
| Database cleanup | SQL query | Remove duplicate entries without book data |
| Back button | Pipeline.tsx | ArrowLeft icon navigates to Terminal |
| Add to Signal button | Pipeline.tsx | Creates signal_opportunities entry from event |

---

## Result
- Pipeline will show cleaner data without duplicates
- All remaining events will have book percentages (where available for that sport)
- Easy navigation back to main Terminal
- Ability to manually promote any event to the Signal Feed for tracking

