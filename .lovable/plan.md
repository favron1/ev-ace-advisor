

## Automatic Bet Settlement + Editable Bet History

### Overview
This plan adds two key features to the Stats page:
1. **Automatic Result Checking** - The polling system automatically updates bet outcomes when markets resolve
2. **Editable Fields** - Manual override capability for all bet history fields

---

### How It Works

```text
                         AUTOMATIC SETTLEMENT FLOW
+----------------+     +------------------+     +----------------+
| Polling System |---->| Check Polymarket |---->| Update         |
| (every 5 min)  |     | for resolved     |     | signal_logs    |
|                |     | markets          |     | with outcome   |
+----------------+     +------------------+     +----------------+
        |                      |
        v                      v
+----------------+     +------------------+
| pending bets   |     | Gamma API:       |
| with           |     | closed=true or   |
| condition_id   |     | event passed     |
+----------------+     +------------------+


                         MANUAL EDITING FLOW
+----------------+     +------------------+     +----------------+
| Click row in   |---->| Edit dialog      |---->| Save to        |
| Bet History    |     | with all fields  |     | signal_logs    |
+----------------+     +------------------+     +----------------+
```

---

### Feature 1: Automatic Settlement

**When Markets Resolve:**
- The `watch-mode-poll` function (runs every 5 minutes) will check for pending bets
- For each pending bet with a `polymarket_condition_id`, query Polymarket to check resolution
- If the market is closed, determine win/loss based on the final price (YES > 0.9 = Yes won)
- Calculate P/L: win = `stake * (1 - entry_price) / entry_price`, loss = `-stake`

**Resolution Detection Methods:**
1. **Gamma API Check**: Query `gamma-api.polymarket.com/markets?condition_id=X` - look for `closed: true`
2. **CLOB Price Check**: Final price of 0.99+ or 0.01- indicates resolution
3. **Time-Based**: If event date has passed by 24+ hours, mark for manual review

---

### Feature 2: Editable Bet History

**Editable Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Event Name | Text | Full event description |
| Side | YES/NO | The position taken |
| Entry Price | Number | Price paid (in cents) |
| Stake Amount | Currency | Amount wagered |
| Edge % | Number | Edge at signal time |
| Status | Dropdown | pending/win/loss/void |
| P/L | Currency | Auto-calculated on win/loss, or manual |

**Edit Workflow:**
1. Click any row in the Bet History table
2. Opens a dialog/sheet with form fields
3. Changing Status to "win" or "loss" auto-calculates P/L (user can override)
4. Save updates the database and recalculates all stats

---

### Technical Implementation

#### 1. New Edge Function: `settle-bets`
Creates a dedicated function to check and settle pending bets:
- Query `signal_logs` for `outcome = 'pending'` with a `polymarket_condition_id`
- For each, call Polymarket API to check resolution status
- Update outcome and calculate P/L
- Set `settled_at` timestamp

#### 2. Integration with Polling
Add settlement check to existing `watch-mode-poll`:
- After main scan logic, call settlement check for efficiency
- Limits API calls by only checking bets older than 2 hours

#### 3. Stats Page Enhancements
- **Edit Button/Row Click**: Opens `EditBetDialog` component
- **Bulk Actions**: "Check All Pending" button to trigger manual settlement
- **Inline Status**: Show last checked timestamp, "Checking..." state

#### 4. Database Updates
None required - existing schema supports all needed fields

---

### UI Components

**EditBetDialog Component:**
- Form with all editable fields
- Auto P/L calculation when status changes
- Validation (stake must be positive, price between 0-1)
- Delete button for removing incorrect entries

**Settlement Status Indicator:**
- Small icon next to pending bets showing "Auto-checking enabled"
- Toast notification when bets are auto-settled

---

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/settle-bets/index.ts` | Create | Settlement logic |
| `supabase/functions/watch-mode-poll/index.ts` | Modify | Add settlement call |
| `src/components/stats/EditBetDialog.tsx` | Create | Edit form dialog |
| `src/pages/Stats.tsx` | Modify | Add edit functionality, check button |
| `src/hooks/useSignalStats.ts` | Modify | Add update/delete mutations |

---

### P/L Calculation Logic

```text
If outcome = 'win':
  P/L = stake_amount * (1 - entry_price) / entry_price
  Example: $100 stake at 60c = $100 * 0.40 / 0.60 = $66.67 profit

If outcome = 'loss':
  P/L = -stake_amount
  Example: $100 stake = -$100 loss

If outcome = 'void':
  P/L = 0 (stake returned)
```

---

### Summary

This implementation provides:
- Automatic bet settlement during regular polling cycles
- Full manual override capability for all bet fields
- P/L auto-calculation with the option to manually adjust
- Seamless integration with existing stats and charts

