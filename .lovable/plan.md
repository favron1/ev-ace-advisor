
# Plan: Fix Confidence Score Variability

## Problem Summary
All signals display **70% confidence** because the scoring inputs lack variance:
- Every signal has `is_sharp_book: true` (no differentiation)
- Every signal has `confirming_books: 47` (counting all books, not agreement)
- The formula caps out at 70 regardless of edge quality

## Solution Overview
Refactor the confidence calculation to incorporate meaningful, variable factors that produce a realistic distribution of scores (typically 40-95%).

---

## Implementation Steps

### 1. Update Odds Ingestion (`ingest-odds`)
Properly classify bookmakers:

| Category | Bookmakers | Weight |
|----------|------------|--------|
| Sharp | Pinnacle, Betfair, Matchbook | 1.5x |
| Soft | DraftKings, FanDuel, BetMGM, etc. | 1.0x |

Track per-outcome confirming books (books pricing the same side as favorable) rather than total book count.

### 2. Refactor Confidence Calculation (`detect-signals`)
New formula incorporating:

```text
Base Score:        30 points

Edge Magnitude:    
  - Edge 2-5%:     +5
  - Edge 5-10%:    +15
  - Edge 10-20%:   +25
  - Edge 20%+:     +35

Sharp Book Signal:
  - Has Pinnacle:  +15
  - Has Betfair:   +10
  - Soft only:     +0

Confirming Books:
  - 1-2 books:     +0
  - 3-5 books:     +5
  - 6-10 books:    +10
  - 10+ books:     +15

Time Factor:
  - Under 6h:      +5
  - Under 12h:     +3
  - Over 12h:      +0

Liquidity Bonus:   (future - requires market data)
  - High volume:   +5
```

This produces a range from **30** (weak signal) to **85** (strong multi-factor signal).

### 3. Store Individual Book Data
Add a `contributing_bookmakers` JSONB field to track which specific books are pricing favorably, enabling:
- Sharp/soft classification
- True consensus counting
- Future odds movement tracking

---

## Technical Changes

### Files to Modify

1. **`supabase/functions/ingest-odds/index.ts`**
   - Define `SHARP_BOOKS` constant array
   - Set `is_sharp_book` based on actual bookmaker name matching
   - Calculate `confirming_books` as count of books pricing the same outcome favorably

2. **`supabase/functions/detect-signals/index.ts`**
   - Replace flat confidence formula with tiered scoring
   - Add edge magnitude tiers
   - Weight sharp book presence properly
   - Add time-decay factor

### Database Migration (Optional Enhancement)
Add column to `bookmaker_signals`:
```sql
ALTER TABLE bookmaker_signals 
ADD COLUMN contributing_bookmakers jsonb DEFAULT '[]';
```

---

## Expected Outcome
After implementation, confidence scores will show realistic variance:
- **40-50%**: Weak signals (soft books only, low edge)
- **55-70%**: Moderate signals (some sharp agreement, decent edge)
- **75-85%**: Strong signals (sharp book confirmation, high edge, near-term)
- **90%+**: Exceptional signals (multiple sharp books, large edge, imminent event)

---

## Summary
| Task | Complexity |
|------|------------|
| Update sharp book detection in ingestion | Low |
| Refactor confidence scoring tiers | Medium |
| Add contributing bookmakers tracking | Low |
| Deploy and test | Low |

