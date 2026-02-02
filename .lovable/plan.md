
# Remove Expired Events from All Events Tab

## Overview
Filter out events with `watch_state = 'expired'` from the "All Events" tab so you only see active, relevant events in the pipeline.

---

## What Will Change

Currently the "All Events" tab shows everything including expired events. After this change:
- Expired events will be hidden from the list
- The tab count will only show non-expired events
- The summary cards at the top will still show the expired count for reference

---

## Implementation

### File to Modify
`src/pages/Pipeline.tsx`

### Changes

**1. Filter watchEvents before displaying in All Events tab**

Update line 337 from:
```typescript
sortEvents(watchEvents).map((event) => (
```

To:
```typescript
sortEvents(watchEvents.filter(e => e.watch_state !== 'expired')).map((event) => (
```

**2. Update the tab count to exclude expired**

Update line 307 from:
```typescript
<TabsTrigger value="all">All Events ({watchEvents.length})</TabsTrigger>
```

To:
```typescript
<TabsTrigger value="all">All Events ({watchEvents.filter(e => e.watch_state !== 'expired').length})</TabsTrigger>
```

**3. Update the empty state check**

Update line 334 from:
```typescript
) : watchEvents.length === 0 ? (
```

To:
```typescript
) : watchEvents.filter(e => e.watch_state !== 'expired').length === 0 ? (
```

---

## Result
- The "All Events" tab will only show watching, monitored, active, confirmed, signal, and dropped events
- Expired events will be excluded from the list and count
- The summary cards at the top still show expired count so you can see historical data if needed
