
# Add Sorting Controls to Pipeline Monitor

## Overview
Add up/down arrow sorting controls to the Pipeline Monitor page so you can quickly sort events by the most important metrics like edge, confidence, movement, volume, or recency.

---

## What You'll Get

### Sort Controls Bar
A row of clickable sort buttons above each list with up/down arrows:
- **Edge** - Sort by calculated edge (Book - Poly)
- **Movement** - Sort by movement percentage
- **Volume** - Sort by Polymarket volume
- **Confidence** - Sort by confidence score (Signals tab)
- **Updated** - Sort by most recently updated
- **Samples** - Sort by sample count

Each button shows:
- ↑ Arrow when sorted ascending (smallest first)
- ↓ Arrow when sorted descending (largest first)
- Click to toggle between ascending/descending

---

## Visual Design

```text
┌─────────────────────────────────────────────────────────┐
│  All Watched Events                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Sort: [Edge ↓] [Movement] [Volume] [Updated]     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Event Card (highest edge first) ─────────────────┐  │
│  │ Maple Leafs vs Flames   Edge: 3.2%  Movement: 5%  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌─ Event Card ──────────────────────────────────────┐  │
│  │ Jets vs Senators        Edge: 2.1%  Movement: 3%  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Add Sort State
```typescript
type SortField = 'edge' | 'movement' | 'volume' | 'updated' | 'samples' | 'confidence';
type SortDirection = 'asc' | 'desc';

const [sortField, setSortField] = useState<SortField>('edge');
const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
```

### 2. Sort Function
```typescript
const sortEvents = (events: WatchEvent[]) => {
  return [...events].sort((a, b) => {
    let aVal, bVal;
    switch (sortField) {
      case 'edge':
        aVal = (a.current_probability || 0) - (a.polymarket_yes_price || 0);
        bVal = (b.current_probability || 0) - (b.polymarket_yes_price || 0);
        break;
      case 'movement':
        aVal = a.movement_pct || 0;
        bVal = b.movement_pct || 0;
        break;
      case 'volume':
        aVal = a.polymarket_volume || 0;
        bVal = b.polymarket_volume || 0;
        break;
      // ... etc
    }
    return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
  });
};
```

### 3. Sort Button Component
```typescript
const SortButton = ({ field, label }) => (
  <Button 
    variant={sortField === field ? "default" : "outline"}
    size="sm"
    onClick={() => {
      if (sortField === field) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
    }}
  >
    {label}
    {sortField === field && (
      sortDirection === 'desc' ? <ArrowDown /> : <ArrowUp />
    )}
  </Button>
);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Pipeline.tsx` | Add sort state, sort function, sort buttons UI, and apply sorting to each tab's event list |

---

## Sort Options by Tab

| Tab | Available Sorts |
|-----|-----------------|
| **All Events** | Edge, Movement, Volume, Updated, Samples |
| **Active Pipeline** | Edge, Movement, Volume, Samples |
| **Signals** | Edge, Confidence, Updated |
| **Snapshots** | Probability, Time |

---

## Default Behavior
- **Default sort**: Edge (descending) - highest edge at top
- **Click same button**: Toggle asc/desc
- **Click different button**: Switch to that field, start with descending
