
# AI Betting Advisor Integration

## Overview

Build an AI-powered advisor that continuously analyzes your bet history, identifies patterns from winning vs losing bets, and surfaces actionable recommendations to improve the betting system. This mirrors the analysis I just performed manually, but runs automatically and presents insights in the UI.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        AI ADVISOR SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐     ┌────────────────────┐                │
│  │   Bet History   │────▶│  AI Analysis Edge  │                │
│  │  (signal_logs)  │     │     Function       │                │
│  └─────────────────┘     └────────────────────┘                │
│           │                       │                             │
│           ▼                       ▼                             │
│  ┌─────────────────┐     ┌────────────────────┐                │
│  │ Signal Patterns │     │  Lovable AI API    │                │
│  │  (win/loss by   │     │ (Gemini 3 Flash)   │                │
│  │  market type,   │     └────────────────────┘                │
│  │  volume, edge)  │              │                             │
│  └─────────────────┘              ▼                             │
│                          ┌────────────────────┐                │
│                          │  ai_advisor_logs   │                │
│                          │  (recommendations) │                │
│                          └────────────────────┘                │
│                                   │                             │
│                                   ▼                             │
│                          ┌────────────────────┐                │
│                          │  Advisor Panel UI  │                │
│                          │  (Stats + Terminal)│                │
│                          └────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

1. **Pattern Recognition**: Analyzes all bets by market type (H2H vs Spread), liquidity tier, edge magnitude, and league
2. **Win/Loss Correlation**: Identifies which conditions led to wins vs losses
3. **Actionable Recommendations**: Generates specific threshold adjustments (e.g., "Increase min volume for spreads to $50K")
4. **Live Learning Loop**: Runs automatically every 6 hours or on-demand after significant bet activity
5. **Recommendation Tracking**: Stores insights with timestamps so you can see what changed and when

---

## Implementation Steps

### Step 1: Create Database Table for AI Insights

Store AI-generated recommendations with context so we can track improvements over time:

```sql
CREATE TABLE ai_advisor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type TEXT NOT NULL, -- 'pattern_analysis', 'threshold_recommendation', 'strategy_alert'
  insight_category TEXT, -- 'market_type', 'liquidity', 'edge_threshold', 'league_focus'
  recommendation TEXT NOT NULL, -- The actual advice
  supporting_data JSONB, -- Stats that led to this conclusion
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT DEFAULT 'active', -- 'active', 'applied', 'dismissed'
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick recent lookups
CREATE INDEX idx_advisor_logs_created ON ai_advisor_logs(created_at DESC);
CREATE INDEX idx_advisor_logs_status ON ai_advisor_logs(status);
```

### Step 2: Create Edge Function for AI Analysis

New edge function `supabase/functions/analyze-betting-patterns/index.ts`:

- Fetches all signal_logs with joined signal_opportunities and cache data
- Aggregates stats by: market_type, liquidity_tier, edge_range, league
- Compares win rates across each dimension
- Calls Lovable AI (Gemini 3 Flash) with structured prompt
- Uses tool calling to extract structured recommendations
- Stores insights in ai_advisor_logs table

**AI Prompt Structure:**
```text
You are an expert sports betting analyst. Analyze the following betting history 
and identify patterns that distinguish winning bets from losing bets.

BETTING HISTORY:
- Total Bets: {count}
- Win Rate: {win_rate}%
- ROI: {roi}%

BY MARKET TYPE:
- H2H: {h2h_count} bets, {h2h_win_rate}% win rate
- Spreads: {spread_count} bets, {spread_win_rate}% win rate
- Totals: {total_count} bets, {total_win_rate}% win rate

BY LIQUIDITY TIER:
- High ($100K+): {high_count} bets, {high_win_rate}% win rate
- Medium ($50K-$100K): {medium_count} bets, {medium_win_rate}% win rate
- Low (<$50K): {low_count} bets, {low_win_rate}% win rate

BY EDGE RANGE:
- 5-10%: {edge_5_10_count} bets, {edge_5_10_win_rate}% win rate
- 10-15%: {edge_10_15_count} bets, {edge_10_15_win_rate}% win rate
- 15%+: {edge_15_plus_count} bets, {edge_15_plus_win_rate}% win rate

RECENT LOSSES (last 5):
{loss_details}

RECENT WINS (last 5):
{win_details}

Provide 3-5 specific, actionable recommendations to improve win rate and ROI.
```

**Tool Call Schema:**
```json
{
  "name": "submit_recommendations",
  "parameters": {
    "recommendations": [
      {
        "category": "market_type|liquidity|edge_threshold|league_focus|timing",
        "priority": "low|medium|high|critical",
        "recommendation": "string (specific action)",
        "reasoning": "string (why this will help)",
        "expected_impact": "string (quantified if possible)"
      }
    ]
  }
}
```

### Step 3: Create Advisor Panel UI Component

New component `src/components/advisor/AdvisorPanel.tsx`:

- Collapsible panel showing latest AI recommendations
- Priority color coding (critical = red, high = orange, medium = yellow)
- "Apply" button to mark recommendations as applied
- "Dismiss" to hide irrelevant ones
- "Refresh Analysis" button to trigger new analysis
- Shows supporting stats that led to each recommendation

**Visual Design:**
```text
┌─────────────────────────────────────────────────────────────┐
│  🧠 AI Advisor                            [Refresh Analysis] │
├─────────────────────────────────────────────────────────────┤
│ 🔴 CRITICAL: Focus on H2H markets only                      │
│    Your 2 losses were both on low-volume spreads while all  │
│    4 H2H wins had $100K+ volume. Consider excluding spreads │
│    until more data is collected.                            │
│    [Apply] [Dismiss]                                        │
├─────────────────────────────────────────────────────────────┤
│ 🟠 HIGH: Increase min net edge to 4% for spreads            │
│    Your winning spread had 4.1% net edge, losing spread had │
│    1.1%. The 2% threshold is too thin for this market type. │
│    [Apply] [Dismiss]                                        │
├─────────────────────────────────────────────────────────────┤
│ 🟡 MEDIUM: NHL is your strongest league                     │
│    100% of your H2H wins came from NHL games. Consider      │
│    prioritizing NHL during peak season.                     │
│    [Apply] [Dismiss]                                        │
└─────────────────────────────────────────────────────────────┘
```

### Step 4: Create Hook for Advisor State

New hook `src/hooks/useAdvisor.ts`:

- Fetches active recommendations from ai_advisor_logs
- Provides methods: `runAnalysis()`, `applyRecommendation(id)`, `dismissRecommendation(id)`
- Tracks loading/analyzing state
- Auto-refreshes when new bets are settled

### Step 5: Integrate Into Stats Page

Add AdvisorPanel to Stats page (primary location for historical analysis):

- Shows below the summary cards
- Can be collapsed to save space
- Badge shows count of unread/active recommendations

### Step 6: Optional: Integrate Into Terminal

Add compact advisor indicator to Terminal header:

- Shows "3 insights" badge if there are active recommendations
- Click opens modal with full advisor panel
- Real-time alerts if critical insight detected

---

## Technical Details

### Edge Function Structure

```typescript
// supabase/functions/analyze-betting-patterns/index.ts

// 1. Fetch all signal_logs with joins
// 2. Aggregate stats by dimensions
// 3. Build analysis prompt
// 4. Call Lovable AI with tool calling
// 5. Parse structured recommendations
// 6. Upsert into ai_advisor_logs (dedupe similar recommendations)
// 7. Return summary
```

### Deduplication Logic

Before inserting a new recommendation, check for similar active ones:
- Same category + similar recommendation text (fuzzy match)
- If found, update timestamp rather than create duplicate

### Scheduled Analysis

Add cron job to run analysis:
- Every 6 hours during active betting periods
- After any bet settles (win/loss/void)
- Manual trigger from UI

---

## Files to Create

1. **supabase/functions/analyze-betting-patterns/index.ts** - Main AI analysis edge function
2. **src/components/advisor/AdvisorPanel.tsx** - UI component for displaying recommendations
3. **src/hooks/useAdvisor.ts** - State management for advisor data

## Files to Modify

1. **src/pages/Stats.tsx** - Add AdvisorPanel integration
2. **supabase/config.toml** - Register new edge function
3. **src/pages/Terminal.tsx** - Optional: Add advisor badge/indicator

---

## Expected Outcomes

After implementation:

1. **Automatic Pattern Detection**: System identifies that H2H + high volume = wins, spreads + low volume = losses
2. **Actionable Thresholds**: AI suggests specific parameter changes like "min_volume: 50000 for spreads"
3. **Continuous Learning**: As more bets settle, recommendations refine based on expanded dataset
4. **Decision Support**: Before placing bets, you can see if current parameters align with winning patterns
5. **Historical Tracking**: See what recommendations were made and when, track if applying them improved results
