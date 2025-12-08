# ChurchCoin Intelligence Plan

> Transform ChurchCoin from "AI-powered" to "genuinely intelligent" - making treasurers say "this app thinks for me."

**Created**: December 2024
**Status**: Proposed
**Approach**: Pragmatic Intelligence (incremental delivery)

---

## Executive Summary

| Wave | Focus | Timeframe | Key Deliverable |
|------|-------|-----------|-----------------|
| **Wave 1** | Enhanced Insights Engine | Week 1-2 | 20+ smart suggestions with learning |
| **Wave 2** | Month-End Intelligence | Week 3-4 | Workflow assistant with pre-filled tasks |
| **Wave 3** | Donor Intelligence | Week 5-6 | At-risk alerts + re-engagement suggestions |

### Design Principles

- **Suggest Only**: System suggests actions, treasurer approves
- **Existing APIs**: Use DeepSeek/Claude - no new ML infrastructure
- **Learning Feedback**: Track accept/dismiss to improve over time
- **Proactive**: Act before user asks, not just respond to queries

---

## Current State Analysis

### Existing AI Capabilities

ChurchCoin already has sophisticated AI:

1. **Transaction Categorization** (DeepSeek)
   - 3-tier system: Feedback → Cache → AI Model
   - 99% cheaper than OpenAI
   - Learning from user corrections

2. **Report Narratives** (Claude Haiku)
   - Trustee-friendly summaries
   - 30-day cache for cost optimization

3. **Basic Insights** (Rules-based)
   - 5 simple rules in `aiInsights.ts`
   - Low balance, missing Gift Aid, etc.

### Gap: Not "Genuinely Intelligent"

| Dimension | Current | Goal |
|-----------|---------|------|
| Proactivity | Responds to queries | Acts before being asked |
| Prediction | Analyzes past data | Forecasts future states |
| Context | Same input → same output | Adapts to situation |
| Learning | Static rules | Improves from feedback |
| Explanation | "Here's the answer" | "Here's why + what to do" |

---

## Wave 1: Enhanced Insights Engine (Week 1-2)

### Goal

Expand from 5 basic rules to 20+ intelligent insights with **feedback tracking** so the system learns what's useful.

### Schema Changes

```typescript
// Add to convex/schema.ts

intelligenceSuggestions: defineTable({
  churchId: v.id("churches"),
  insightType: v.union(
    v.literal("donor"),      // Donor-related insights
    v.literal("operations"), // Workflow/task insights
    v.literal("financial"),  // Financial health insights
    v.literal("compliance")  // Gift Aid, regulatory
  ),
  title: v.string(),
  description: v.string(),
  severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
  confidence: v.number(), // 0-1
  suggestedAction: v.optional(v.string()),
  actionUrl: v.optional(v.string()),
  actionData: v.optional(v.any()), // Pre-filled form data
  // Tracking
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),    // User acted on it
    v.literal("dismissed"),   // User said "not useful"
    v.literal("deferred")     // User said "later"
  ),
  acceptedAt: v.optional(v.number()),
  dismissedAt: v.optional(v.number()),
  dismissReason: v.optional(v.string()),
  // Learning
  wasHelpful: v.optional(v.boolean()), // Post-action feedback
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),
})
  .index("by_church_status", ["churchId", "status", "createdAt"])
  .index("by_church_type", ["churchId", "insightType", "createdAt"]),
```

### Donor Intelligence Rules (10)

| Rule ID | Title | Condition | Severity |
|---------|-------|-----------|----------|
| `lapsed_regular_donor` | Regular donor hasn't given in 60+ days | avgFrequency < 45 days AND daysSinceLastGift > 60 | Warning |
| `declining_gift_amount` | Donor's giving has declined 30%+ | Recent 3mo avg < Previous 3mo avg by 30% | Warning |
| `high_potential_new_donor` | New donor gave 3+ times in first 3 months | First gift < 3mo ago AND gifts >= 3 | Info |
| `gift_aid_eligible_not_signed` | Active UK donor without Gift Aid declaration | No declaration AND giving > £100/year | Warning |
| `major_donor_no_contact` | Top 10% donor not contacted in 6+ months | Total giving > 90th percentile | Info |
| `gift_aid_expiring` | Gift Aid declaration expires within 60 days | expiryDate < today + 60 | Warning |
| `stopped_standing_order` | Monthly donor missed expected payment | Was monthly, now 45+ days gap | Warning |
| `upgrade_candidate` | Donor increased giving 50%+ this year | YoY increase > 50% | Info |
| `multi_fund_supporter` | Donor gives to 3+ funds | Unique funds >= 3 | Info |
| `first_gift_anniversary` | Donor's first gift anniversary this month | First gift month == current month | Info |

### Operations Intelligence Rules (10)

| Rule ID | Title | Condition | Severity |
|---------|-------|-----------|----------|
| `period_overdue_bank_upload` | Bank statement not uploaded for current period | Days since period end > 5 AND no bank upload | Warning |
| `high_uncategorized_queue` | 20+ transactions need categorization | Uncategorized count >= 20 | Info |
| `reconciliation_variance` | Reconciliation has £10+ variance | abs(variance) > 10 | Warning |
| `month_end_almost_complete` | Period 90%+ complete - ready to close? | reviewed/total >= 0.9 | Info |
| `stale_pending_transactions` | Pending transactions > 30 days old | Pending AND days > 30 | Warning |
| `duplicate_import_detected` | Potential duplicate CSV import | Same filename + similar row count | Warning |
| `uncategorized_large_expense` | Large expense (£500+) uncategorized | amount > 500 AND no category | Warning |
| `missing_receipt` | Expense > £100 without receipt | amount > 100 AND no receipt | Info |
| `period_auto_close_ready` | Period can be auto-closed | All transactions reviewed + reconciled | Info |
| `ai_accuracy_declining` | AI categorization accuracy below 80% | Correction rate > 20% this month | Warning |

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `convex/intelligence/index.ts` | Create | Intelligence module exports |
| `convex/intelligence/donorInsights.ts` | Create | 10 donor insight rules |
| `convex/intelligence/operationsInsights.ts` | Create | 10 operations rules |
| `convex/intelligence/generateInsights.ts` | Create | Main insight generation logic |
| `convex/intelligence/suggestionFeedback.ts` | Create | Accept/dismiss tracking |
| `convex/schema.ts` | Modify | Add `intelligenceSuggestions` table |
| `src/components/intelligence/SmartSuggestionsPanel.tsx` | Create | New suggestions UI |
| `src/components/intelligence/SuggestionCard.tsx` | Create | Individual suggestion card |
| `src/app/(dashboard)/dashboard/page.tsx` | Modify | Add suggestions panel |

### Implementation Tasks

- [ ] Add `intelligenceSuggestions` table to schema
- [ ] Create `convex/intelligence/` module structure
- [ ] Implement 10 donor insight rules with conditions
- [ ] Implement 10 operations insight rules with conditions
- [ ] Build `SmartSuggestionsPanel` component
- [ ] Build `SuggestionCard` with accept/dismiss actions
- [ ] Add suggestion feedback mutations
- [ ] Create scheduled job to generate insights daily
- [ ] Integrate panel into dashboard
- [ ] Add notification badges for new suggestions

---

## Wave 2: Month-End Intelligence (Week 3-4)

### Goal

Build a **workflow assistant** that understands where the treasurer is in the month-end process and suggests next steps with **pre-filled data**.

### Month-End State Machine

```typescript
type MonthEndState =
  | "not_started"
  | "bank_upload_needed"
  | "cash_entry_needed"
  | "categorization_needed"
  | "review_needed"
  | "reconciliation_needed"
  | "ready_to_close"
  | "completed";
```

### State Transitions & Suggestions

| State | Condition | Suggested Action | Pre-filled Data |
|-------|-----------|------------------|-----------------|
| `not_started` | Period exists, no activity | "Start processing {periodName}" | - |
| `bank_upload_needed` | No bank upload timestamp | "Upload bank statement" | Expected file format |
| `cash_entry_needed` | Bank done, no cash records | "Enter cash transactions" | Week ending dates |
| `categorization_needed` | >50% uncategorized | "Categorize {count} transactions" | AI suggestions |
| `review_needed` | Some need review | "Review {count} flagged items" | Confidence scores |
| `reconciliation_needed` | All reviewed, not reconciled | "Reconcile period" | Expected balance |
| `ready_to_close` | All done | "Close period and generate summary" | Full summary data |

### Components

```
src/components/intelligence/
├── MonthEndAssistant.tsx      # Main assistant panel
├── MonthEndProgress.tsx       # Progress bar with steps
├── MonthEndTaskCard.tsx       # Individual task suggestion
└── PeriodSummaryPreview.tsx   # Pre-generated summary preview
```

### Claude-Powered Period Summary

When closing a period, generate an AI narrative:

```typescript
const summaryPrompt = `
Generate a trustee-friendly month-end summary for {periodName}:

Financial Data:
- Total Income: £{totalIncome}
- Total Expenses: £{totalExpenses}
- Net Surplus/Deficit: £{netAmount}
- Top Income: {topIncomeCategories}
- Top Expenses: {topExpenseCategories}

Highlight:
1. Notable trends vs previous month
2. Any concerns or celebrations
3. Gift Aid position
4. Recommended actions for next month

Keep it concise (2-3 paragraphs) and in plain English.
`;
```

### Implementation Tasks

- [ ] Create month-end state machine logic
- [ ] Build `MonthEndAssistant` component
- [ ] Implement state detection from period data
- [ ] Add pre-filled action data generation
- [ ] Create `generatePeriodSummary` mutation with Claude
- [ ] Build progress visualization
- [ ] Add "Skip" and "Remind me later" options
- [ ] Track workflow completion times for metrics

---

## Wave 3: Donor Intelligence (Week 5-6)

### Goal

Build a **Donor Health Dashboard** that proactively identifies at-risk donors and suggests re-engagement actions.

### Donor Health Scoring (RFM Analysis)

```typescript
type DonorHealthScore = {
  donorId: Id<"donors">;
  overallScore: number; // 0-100
  riskLevel: "healthy" | "at_risk" | "lapsed";
  signals: {
    recencyScore: number;      // Days since last gift (0-100)
    frequencyScore: number;    // Gifts per year (0-100)
    monetaryScore: number;     // Average gift amount (0-100)
    trendScore: number;        // Giving direction (0-100)
    engagementScore: number;   // Gift Aid, multi-fund (0-100)
  };
  suggestedAction: string;
  lastUpdated: number;
};
```

### Scoring Weights

| Signal | Weight | Scoring Logic |
|--------|--------|---------------|
| Recency | 30% | <30 days = 100, <90 days = 70, <180 days = 40, else 10 |
| Frequency | 25% | >12/year = 100, >4/year = 70, >1/year = 40, else 10 |
| Monetary | 20% | Normalized to church average |
| Trend | 15% | >10% growth = 100, stable = 70, <-10% = 40, <-30% = 10 |
| Engagement | 10% | Gift Aid + Multi-fund + Notes |

### Risk Levels

| Level | Score Range | Action |
|-------|-------------|--------|
| Healthy | 70-100 | Standard stewardship |
| At Risk | 40-69 | Proactive outreach suggested |
| Lapsed | 0-39 | Re-engagement campaign |

### Re-engagement Templates

```typescript
const TEMPLATES = {
  at_risk_regular: {
    subject: "We've missed you at {churchName}",
    tone: "warm, personal",
    includes: ["gratitude for past giving", "gentle check-in", "no ask"]
  },
  lapsed_major: {
    subject: "A personal note from {churchName}",
    tone: "personal, from leadership",
    includes: ["specific impact of their giving", "invitation to connect"]
  },
  gift_aid_reminder: {
    subject: "Quick Gift Aid update for {churchName}",
    tone: "practical, helpful",
    includes: ["potential value", "easy next step"]
  }
};
```

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Donor Health                                                │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐                  │
│ │ Healthy   │ │ At Risk   │ │ Lapsed    │                  │
│ │    42     │ │    8      │ │    12     │                  │
│ │  (68%)    │ │  (13%)    │ │  (19%)    │                  │
│ └───────────┘ └───────────┘ └───────────┘                  │
├─────────────────────────────────────────────────────────────┤
│ Priority Outreach (At-Risk Donors)                         │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Name        │ Health │ Last Gift │ Trend │ Action      ││
│ │ John Smith  │ 45/100 │ 67 days   │ ↓ 25% │ [Reach Out] ││
│ │ Mary Jones  │ 52/100 │ 45 days   │ ↓ 15% │ [Reach Out] ││
│ │ ...         │        │           │       │             ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Implementation Tasks

- [ ] Implement donor health scoring algorithm
- [ ] Create health score calculation scheduled job
- [ ] Build `DonorHealthPage` with overview cards
- [ ] Create at-risk donor table with actions
- [ ] Implement re-engagement template system
- [ ] Add "Generate Message" action with Claude
- [ ] Build individual donor health detail view
- [ ] Add health trend charts (optional)
- [ ] Track outreach outcomes for learning

---

## Technical Implementation Notes

### Scheduled Jobs

```typescript
// convex/crons.ts

const crons = cronJobs();

// Run insight generation daily at 6am
crons.daily(
  "generate-daily-insights",
  { hourUTC: 6, minuteUTC: 0 },
  internal.intelligence.generateAllInsights
);

// Calculate donor health scores weekly
crons.weekly(
  "calculate-donor-health",
  { dayOfWeek: "monday", hourUTC: 5, minuteUTC: 0 },
  internal.intelligence.calculateAllDonorHealth
);

export default crons;
```

### API Cost Management

All AI calls go through existing `ai.ts` infrastructure:
- Caching via `aiCache` table (7-day TTL)
- Usage tracking via `aiUsage` table
- Per-church API key support
- Feedback learning via `aiFeedback` table

### Frontend Integration Points

| Location | Integration |
|----------|-------------|
| Dashboard | `SmartSuggestionsPanel` + `MonthEndAssistant` |
| Donors page | Link to Donor Health |
| Period detail | Month-end progress |
| Settings | Intelligence preferences |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Suggestion Acceptance Rate | >40% | Accepted / Total suggestions |
| Month-End Time Reduction | -30% | Days from period end to close |
| Lapsed Donor Recovery | >15% | At-risk donors who resume giving |
| AI Categorization Accuracy | >85% | Auto-categorized without correction |
| Treasurer Satisfaction | "Thinks for me" | Qualitative feedback |

### Tracking Queries

```typescript
// Suggestion acceptance rate
const acceptanceRate = await ctx.db
  .query("intelligenceSuggestions")
  .filter(q => q.neq(q.field("status"), "pending"))
  .collect();

const rate = acceptanceRate.filter(s => s.status === "accepted").length
           / acceptanceRate.length;

// Month-end completion time
const periods = await ctx.db.query("financialPeriods")
  .filter(q => q.eq(q.field("status"), "completed"))
  .collect();

const avgDays = periods.map(p =>
  daysBetween(p.periodEnd, p.completedAt)
).reduce((a, b) => a + b, 0) / periods.length;
```

---

## Future Enhancements (Post-Wave 3)

### Cash Flow Forecasting
- Predict balance 30-90 days ahead
- Alert on projected shortfalls
- Suggest fund transfers

### Anomaly Detection
- Flag unusual transactions (Isolation Forest)
- Detect potential duplicates
- Identify category misclassification

### Natural Language Queries
- "How much did we spend on missions last quarter?"
- "Who are our top 10 donors?"
- Uses Claude with function calling

### Multi-Church Benchmarking
- Anonymous aggregate analysis
- Compare to similar-sized churches
- Best practice recommendations

---

## Appendix: Gemini Research Summary

### Key Techniques Identified

1. **User Behavior Embeddings**
   - Item2Vec for co-occurrence patterns
   - Two-tower neural networks for user/item matching
   - *Application*: Suggest categories based on similar transactions

2. **Contextual Bandits (LinUCB, Thompson Sampling)**
   - Balance exploration vs exploitation
   - *Application*: Learn which suggestions get accepted

3. **Active Learning**
   - Uncertainty sampling: `1 - max(predicted_probabilities)`
   - *Application*: Flag low-confidence categorizations for review

4. **Few-Shot Learning (Prototypical Networks)**
   - Learn new categories from 3-5 examples
   - *Application*: Adapt to new transaction types quickly

5. **Anomaly Detection (Isolation Forest)**
   - Fast outlier detection in high-dimensional data
   - *Application*: Flag unusual transactions

### Intelligence Framework

| Dimension | Simple AI | Genuine Intelligence |
|-----------|-----------|---------------------|
| Proactivity | Responds to queries | Acts before being asked |
| Prediction | Analyzes past | Forecasts future |
| Context | Same in → same out | Adapts to situation |
| Learning | Static model | Improves from feedback |
| Ambiguity | Fails on edge cases | Handles uncertainty |
| Explanation | "Here's the answer" | "Here's why + what next" |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Dec 2024 | Chose Pragmatic Approach | Balances value delivery with complexity |
| Dec 2024 | Suggest Only mode | Conservative autonomy per user preference |
| Dec 2024 | Use existing APIs | No appetite for ML infrastructure investment |
| Dec 2024 | Prioritize Month-End | Most exciting feature per user feedback |
| Dec 2024 | Add feedback tracking | Enables learning without complex ML |

---

*Generated with assistance from Gemini and Claude*
