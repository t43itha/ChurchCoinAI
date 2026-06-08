# Dashboard KPI Redesign Design

## Purpose

Redesign the dashboard so senior church management can understand financial health, giving momentum, donor engagement, and month-end readiness at a glance.

The current dashboard is finance-first and mostly computes KPIs client-side from loaded transactions. The new dashboard should read as a leadership health overview, while keeping monthly finance controls visible enough for senior leaders to spot blockers early.

## Context

ChurchCoinAI supports UK church finance workflows with fund accounting, donor management, cash collections, Gift Aid, RCI monthly and annual reporting, and banking reconciliation.

The RCI record-keeping guide and templates emphasize:

- Accurate receipts and payments records.
- Tithes and First Fruits donor records for Gift Aid.
- Monthly review of payment evidence.
- Mission tithe calculation from eligible general giving.
- Annual activity, achievement, volunteer, and future-program reporting.
- Restricted access to confidential donor and finance information.

The dashboard should not duplicate the detailed Monthly or Annual Reports screens. Reports remain the place for RCI account detail and exports. Dashboard becomes the place to see status, risks, and where to act next.

## Recommended Direction

Use the Pastor / Executive Health Overview as the main dashboard model, with a compact Month-End Readiness strip directly below the primary KPI row.

The first screen should answer three questions:

1. Are we financially healthy?
2. Is giving and donor engagement moving in the right direction?
3. Is anything blocking the finance team from closing or reporting the month?

## Layout

### Header

- Title: `Leadership Dashboard`.
- Subtitle: selected reporting period.
- Period selector with at least current month and previous month.
- Previous month should be the default when the goal is completed monthly review.
- Show a small data freshness label such as `Last updated`.
- Keep finance-only quick actions, such as `Record Cash Collection`, visible only to roles that can edit.

### Primary Health Row

Show four senior-management KPI cards:

- Operating Position.
- Giving Trend.
- General Fund Coverage.
- Donor Attention.

Each card should contain:

- One primary status or number.
- One supporting value.
- One short trend or explanation.
- A visual status tone: `Healthy`, `Watch`, or `Action`. The displayed label may be more specific, such as `Deficit`.

### Month-End Readiness Strip

Place a slim horizontal readiness strip below the main KPI row. It should not be six large cards.

Readiness items:

- Reconciled.
- Categorized / RCI mapped.
- Cash banked.
- Gift Aid.
- Mission tithe.
- Evidence checks.

The strip should surface blockers and link to the relevant detailed workflow later, but it should not dominate the first screen.

### Main Content

Use two primary panels:

- Giving and Expenditure Trend: 6 to 12 month view.
- Leadership Alerts: ranked risks and recommended actions.

### Lower Content

Use secondary panels:

- Fund Health: general balance, restricted balances, low-balance funds, and campaign progress.
- Pastoral Follow-Up: summarized donor attention counts with drill-down to Donor Manager for authorized roles.

## KPI Definitions

### Operating Position

Primary value:

- `Healthy`, `Watch`, or `Deficit`.

Supporting metric:

- Current period net movement, for example `+GBP 2,800 this month`.

Rules:

- `Healthy`: income exceeds expenditure and unrestricted fund balance is positive.
- `Watch`: small deficit, low margin, or expense growth is ahead of income growth.
- `Deficit`: expenditure materially exceeds income, or the general/unrestricted fund balance is low.

### Giving Trend

Primary value:

- Rolling giving change percentage.

Formula:

- Current 3-month average giving compared with previous 3-month average giving.

Reason:

- This smooths out one-off service or event spikes better than a single month income number.

### General Fund Coverage

Primary value:

- Months of operating cover.

Formula:

- Unrestricted fund balance divided by average monthly unrestricted expenditure.

Rules:

- `Healthy`: 3 or more months.
- `Watch`: 1 to 3 months.
- `Action`: less than 1 month.

### Donor Attention

Primary value:

- Count of follow-up items.

Include:

- Lapsed regular donors.
- Active monthly pledges with missed expected gifts.
- New donors to thank.
- Gift Aid declaration opportunities.
- Major donor giving decline.

The dashboard should summarize donor attention by count and type. Do not expose donor names on the dashboard by default because the first screen is visible to senior leadership and may include read-only roles. Donor-level detail belongs in Donor Manager.

## Month-End Readiness Definitions

### Reconciled

Show the percentage of active period transactions that are reconciled.

Example:

- `Reconciled: 91%`.

### Categorized / RCI Mapped

Show the percentage of active period transactions with usable category data and, where available, RCI main-category mapping.

Example:

- `Categorized: 96%`.

### Cash Banked

Show pending cash collection banking work.

Example:

- `Cash banked: 2 pending weeks`.

This should use the existing cash collection and cash banking reconciliation state where possible.

### Gift Aid

Show claimable Gift Aid for the selected period.

Example:

- `Gift Aid: GBP 1,420 claimable`.

### Mission Tithe

Show mission tithe due for the selected period.

Example:

- `Mission tithe: GBP 740 due`.

Use the existing RCI mission tithe calculation rules from the monthly reporting query: 10% of eligible unrestricted/general giving categories.

### Evidence Checks

Show large payments that may need documentary evidence review.

Initial implementation can infer this from large expenditure transactions until a formal evidence attachment model exists.

Example:

- `Evidence checks: 3 large payments`.

If there is no reliable evidence data, label this as `Large payments` rather than implying attachment verification has been completed.

## Data Flow

Prefer a dedicated server-side dashboard query over client-side calculation from the full transaction list.

The current code has `components/Dashboard.tsx` calculating KPIs from transactions passed through the app shell, while `convex/queries/dashboard.ts` already contains unused summary and trend queries. The redesign should consolidate executive KPI calculation into Convex so the frontend receives one coherent summary payload.

Recommended payload shape:

```ts
{
  period: {
    label: string;
    startDate: string;
    endDate: string;
  };
  health: {
    operatingPosition: "Healthy" | "Watch" | "Deficit";
    netMovement: number;
    givingTrendPercent: number;
    generalFundCoverageMonths: number | null;
    donorAttentionCount: number;
  };
  readiness: {
    reconciledPercent: number;
    categorizedPercent: number;
    cashBankingPendingWeeks: number;
    giftAidClaimable: number;
    missionTitheDue: number;
    evidenceCheckCount: number;
  };
  trends: {
    monthlyIncomeExpenditure: Array<{
      month: string;
      income: number;
      expenditure: number;
    }>;
    rollingGiving: Array<{
      month: string;
      giving: number;
    }>;
  };
  funds: {
    generalFundBalance: number;
    restrictedFundBalances: Array<{
      fundId: string;
      name: string;
      balance: number;
      targetAmount?: number;
    }>;
    lowBalanceFunds: Array<{
      fundId: string;
      name: string;
      balance: number;
    }>;
    campaignProgress?: {
      fundId: string;
      name: string;
      progressPercent: number;
      balance: number;
      targetAmount: number;
    };
  };
  alerts: Array<{
    severity: "info" | "warning" | "critical";
    title: string;
    description: string;
    actionUrl?: string;
  }>;
}
```

## Frontend Structure

Refactor the dashboard into small presentational sections:

```text
components/Dashboard.tsx
components/dashboard/DashboardHealthCards.tsx
components/dashboard/DashboardReadinessStrip.tsx
components/dashboard/DashboardTrendPanel.tsx
components/dashboard/DashboardLeadershipAlerts.tsx
components/dashboard/DashboardFundHealth.tsx
```

Responsibilities:

- `Dashboard.tsx`: fetch summary data, handle period selector, arrange layout, handle authorized quick actions.
- `DashboardHealthCards.tsx`: render the four leadership KPI cards.
- `DashboardReadinessStrip.tsx`: render compact month-end readiness indicators.
- `DashboardTrendPanel.tsx`: render giving and expenditure trends.
- `DashboardLeadershipAlerts.tsx`: render ranked alerts and suggestions.
- `DashboardFundHealth.tsx`: render general, restricted, low-balance, and campaign fund health.

This keeps `Dashboard.tsx` from becoming a large all-in-one component.

## Available Data And Gaps

Supported by current data:

- Income and expenditure.
- Fund balances.
- Restricted fund and campaign progress.
- Gift Aid eligible and claimable totals.
- Mission tithe.
- Donor giving patterns.
- Reconciliation status.
- Categorization status.
- Cash collection and cash banking status.

Partially available or not modeled yet:

- Attendance.
- Volunteers.
- Activity and impact reporting.
- Formal evidence attachments.
- Formal budgets and budget variance.

Do not show fake placeholders for unavailable KPIs. Future work can add these as first-class data models.

## Role And Confidentiality Rules

- Admin and Finance Team can see finance actions and drill into operational workflows.
- Pastorate can view summary status and leadership-level insights but should not see edit actions.
- Guest remains read-only.
- Donor-sensitive detail should be summarized on the dashboard and handled in Donor Manager.
- Restricted funds must remain visually distinct from unrestricted funds.

## Empty States

For new churches or low-data periods:

- Avoid alarming statuses caused by missing history.
- Show `Not enough data yet` where trend comparisons require prior-period data.
- Show zero states that direct users to the right workflow, such as recording transactions, creating funds, or importing bank data.
- Keep the dashboard calm and useful even before six months of history exists.

## Acceptance Criteria

- Dashboard loads without requiring the full transaction list to compute executive KPIs client-side.
- Period selector updates all KPI values consistently.
- Top row gives a clear health read in under 30 seconds.
- Month-end readiness exposes blockers without dominating the page.
- Empty states are meaningful for new churches with limited data.
- Restricted funds remain clearly distinct from unrestricted/general funds.
- Pastorate and other read-only roles can view summary status but cannot perform finance-only actions.
- Donor-sensitive detail is summarized on the dashboard and handled in Donor Manager.
- Existing Reports monthly and annual flows remain unchanged.
- Type-check passes with `npx tsc`.

## Out Of Scope

- Creating a budget model.
- Adding attendance or volunteer data capture.
- Adding document attachment storage.
- Reworking Reports exports.
- Changing existing RCI monthly or annual report calculations except where shared helper extraction is needed to avoid duplication.
