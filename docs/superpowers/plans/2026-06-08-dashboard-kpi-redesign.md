# Dashboard KPI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a senior-management leadership dashboard with executive health KPIs and a compact month-end readiness strip.

**Architecture:** Move dashboard KPI calculation into a testable pure helper and a Convex executive summary query. Refactor the frontend dashboard into focused presentational components that consume one server-side summary payload instead of recalculating from the full client transaction list.

**Tech Stack:** React 19, TypeScript, Convex queries, Vitest, Recharts, Tailwind utility classes, lucide-react icons.

---

## File Structure

Create:

- `lib/dashboardKpis.ts`: Pure calculation helpers for periods, health KPIs, readiness KPIs, fund summaries, trends, and alerts.
- `tests/dashboardKpis.test.ts`: Vitest coverage for the KPI helper.
- `components/dashboard/types.ts`: Frontend type aliases for the Convex executive summary payload.
- `components/dashboard/DashboardHealthCards.tsx`: Four leadership KPI cards.
- `components/dashboard/DashboardReadinessStrip.tsx`: Compact month-end readiness strip.
- `components/dashboard/DashboardTrendPanel.tsx`: Giving and expenditure trend chart.
- `components/dashboard/DashboardLeadershipAlerts.tsx`: Ranked leadership alerts.
- `components/dashboard/DashboardFundHealth.tsx`: General, restricted, low-balance, and campaign fund health.

Modify:

- `convex/queries/dashboard.ts`: Add `executiveSummary` query that fetches organization-scoped data and delegates calculations to `lib/dashboardKpis.ts`.
- `components/Dashboard.tsx`: Replace client-side KPI calculations with the new query and presentational components.
- `components/app/AppContentRoutes.tsx`: Make dashboard route independent of `transactions`.
- `App.tsx`: Stop blocking `/dashboard` on full transactions and pledges being loaded.

Do not modify:

- `convex/_generated/*`.
- Existing monthly or annual report export code.
- Existing RCI report calculations except by importing shared constants from the helper if needed.

---

### Task 1: Pure Dashboard KPI Helper

**Files:**

- Create: `lib/dashboardKpis.ts`
- Test: `tests/dashboardKpis.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/dashboardKpis.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import {
  buildExecutiveDashboardSummary,
  getDashboardPeriod,
  type DashboardCashCollection,
  type DashboardCashReconciliation,
  type DashboardDonor,
  type DashboardFund,
  type DashboardPledge,
  type DashboardTransaction,
} from "../lib/dashboardKpis";

const funds: DashboardFund[] = [
  { _id: "general", name: "General Fund", type: "Unrestricted" },
  { _id: "building", name: "Building Fund", type: "Restricted", targetAmount: 10000 },
  { _id: "youth", name: "Youth Fund", type: "Restricted" },
];

const donors: DashboardDonor[] = [
  { _id: "d1", name: "Ada Mensah", type: "Individual", isGiftAidActive: false },
  { _id: "d2", name: "Kojo Smith", type: "Individual", isGiftAidActive: true },
  { _id: "d3", name: "RCI Partner", type: "Organization", isGiftAidActive: false },
];

const pledges: DashboardPledge[] = [
  {
    _id: "p1",
    donorId: "d2",
    donorName: "Kojo Smith",
    fundId: "general",
    amount: 100,
    frequency: "Monthly",
    startDate: "2026-01-01",
    status: "Active",
  },
];

const cashCollections: DashboardCashCollection[] = [
  { _id: "cash-1", weekEndingDate: "2026-05-03", status: "submitted" },
  { _id: "cash-2", weekEndingDate: "2026-05-10", status: "submitted" },
];

const cashReconciliations: DashboardCashReconciliation[] = [
  {
    _id: "rec-1",
    status: "completed",
    cashCollectionSplits: [{ cashCollectionId: "cash-1", cashAmount: 120, chequeAmount: 0 }],
  },
];

const transactions: DashboardTransaction[] = [
  {
    _id: "t-jan-income",
    date: "2026-01-12",
    amount: 900,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: true,
    donorId: "d1",
    donorName: "Ada Mensah",
    isGiftAidEligible: true,
  },
  {
    _id: "t-feb-income",
    date: "2026-02-12",
    amount: 1000,
    type: "Income",
    category: "Tithes & First Fruits",
    fundId: "general",
    isReconciled: true,
    donorId: "d1",
    donorName: "Ada Mensah",
    isGiftAidEligible: true,
  },
  {
    _id: "t-mar-income",
    date: "2026-03-12",
    amount: 1100,
    type: "Income",
    category: "Thanksgiving",
    fundId: "general",
    isReconciled: true,
    donorId: "d2",
    donorName: "Kojo Smith",
    isGiftAidEligible: true,
  },
  {
    _id: "t-apr-income",
    date: "2026-04-12",
    amount: 1300,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: true,
    donorId: "d1",
    donorName: "Ada Mensah",
    isGiftAidEligible: true,
  },
  {
    _id: "t-may-income",
    date: "2026-05-12",
    amount: 1400,
    type: "Income",
    category: "Tithes & First Fruits",
    fundId: "general",
    isReconciled: false,
    donorId: "d1",
    donorName: "Ada Mensah",
    isGiftAidEligible: true,
    cashCollectionId: "cash-2",
    paymentMethod: "Cash",
  },
  {
    _id: "t-may-cheque",
    date: "2026-05-13",
    amount: 80,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: false,
    donorId: "d3",
    donorName: "RCI Partner",
    isGiftAidEligible: false,
    cashCollectionId: "cash-2",
    paymentMethod: "Cheque",
  },
  {
    _id: "t-may-restricted",
    date: "2026-05-14",
    amount: 500,
    type: "Income",
    category: "Donations",
    fundId: "building",
    isReconciled: true,
  },
  {
    _id: "t-may-general-expense",
    date: "2026-05-20",
    amount: 700,
    type: "Expenditure",
    category: "Rent-Premises For Worship",
    fundId: "general",
    isReconciled: true,
  },
  {
    _id: "t-may-large-expense",
    date: "2026-05-21",
    amount: 650,
    type: "Expenditure",
    category: "Equipment Purchase & Maintance",
    fundId: "general",
    isReconciled: false,
  },
  {
    _id: "t-voided",
    date: "2026-05-22",
    amount: 5000,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: true,
    isVoided: true,
  },
];

describe("dashboard KPI helpers", () => {
  it("builds the previous month period by default", () => {
    expect(getDashboardPeriod("previousMonth", new Date("2026-06-08T12:00:00Z"))).toEqual({
      key: "previousMonth",
      label: "May 2026",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
  });

  it("calculates executive health, readiness, trends, funds, and alerts", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions,
      donors,
      pledges,
      cashCollections,
      cashReconciliations,
    });

    expect(summary.period.label).toBe("May 2026");
    expect(summary.health.operatingPosition).toBe("Healthy");
    expect(summary.health.netMovement).toBe(630);
    expect(summary.health.givingTrendPercent).toBeCloseTo(48, 0);
    expect(summary.health.generalFundCoverageMonths).toBeCloseTo(3.8, 1);
    expect(summary.health.donorAttentionCount).toBe(3);

    expect(summary.readiness.reconciledPercent).toBe(40);
    expect(summary.readiness.categorizedPercent).toBe(100);
    expect(summary.readiness.cashBankingPendingWeeks).toBe(1);
    expect(summary.readiness.giftAidClaimable).toBe(350);
    expect(summary.readiness.missionTitheDue).toBe(140);
    expect(summary.readiness.evidenceCheckCount).toBe(2);

    expect(summary.funds.generalFundBalance).toBe(3750);
    expect(summary.funds.campaignProgress).toEqual({
      fundId: "building",
      name: "Building Fund",
      progressPercent: 5,
      balance: 500,
      targetAmount: 10000,
    });
    expect(summary.funds.lowBalanceFunds.map((fund) => fund.name)).toContain("Building Fund");

    expect(summary.trends.monthlyIncomeExpenditure).toHaveLength(6);
    expect(summary.alerts.map((alert) => alert.title)).toContain("Month-end review needs attention");
  });
});
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
npm test -- tests/dashboardKpis.test.ts
```

Expected result:

```text
FAIL tests/dashboardKpis.test.ts
Error: Failed to resolve import "../lib/dashboardKpis"
```

- [ ] **Step 3: Create the helper implementation**

Create `lib/dashboardKpis.ts` with these exported types and functions:

```ts
import { filterActiveTransactions, sumActiveSigned } from "./voidedTransactions";

export type DashboardPeriodKey = "currentMonth" | "previousMonth" | "quarter" | "ytd";
export type DashboardTone = "Healthy" | "Watch" | "Action";
export type OperatingPosition = "Healthy" | "Watch" | "Deficit";

export type DashboardFund = {
  _id: string;
  name: string;
  type: "Unrestricted" | "Restricted" | "Designated" | "Endowment";
  targetAmount?: number;
};

export type DashboardTransaction = {
  _id: string;
  date: string;
  amount: number;
  type: "Income" | "Expenditure";
  category: string;
  fundId: string;
  isReconciled: boolean;
  isGiftAidEligible?: boolean;
  donorId?: string;
  donorName?: string;
  pledgeId?: string | null;
  paymentMethod?: "Cash" | "Cheque" | "Bank" | "Card" | "Online" | "PDQ";
  cashCollectionId?: string;
  isVoided?: boolean;
};

export type DashboardDonor = {
  _id: string;
  name: string;
  type: "Individual" | "Organization";
  isGiftAidActive?: boolean;
};

export type DashboardPledge = {
  _id: string;
  donorId?: string;
  donorName: string;
  amount: number;
  fundId: string;
  frequency: "One-off" | "Monthly" | "Annual" | "Weekly";
  startDate: string;
  endDate?: string;
  status: "Active" | "Completed" | "Cancelled";
};

export type DashboardCashCollection = {
  _id: string;
  weekEndingDate: string;
  status: "draft" | "submitted" | "banked";
};

export type DashboardCashReconciliation = {
  _id: string;
  status: "draft" | "completed" | "reopened";
  cashCollectionSplits: Array<{
    cashCollectionId: string;
    cashAmount: number;
    chequeAmount: number;
  }>;
};

export type DashboardSummary = {
  period: {
    key: DashboardPeriodKey;
    label: string;
    startDate: string;
    endDate: string;
  };
  health: {
    operatingPosition: OperatingPosition;
    operatingTone: DashboardTone;
    netMovement: number;
    givingTrendPercent: number | null;
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
      name: string;
      income: number;
      expenditure: number;
    }>;
    rollingGiving: Array<{
      month: string;
      name: string;
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
};

const MISSION_TITHE_CATEGORIES = new Set([
  "offerings",
  "tithes & first fruits",
  "thanksgiving",
]);

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;
const roundPercent = (amount: number) => Math.round(amount);

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateString(date: Date) {
  return date.toISOString().split("T")[0];
}

function endOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0);
}

function inRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function sumIncome(transactions: DashboardTransaction[]) {
  return transactions
    .filter((transaction) => transaction.type === "Income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function sumExpenditure(transactions: DashboardTransaction[]) {
  return transactions
    .filter((transaction) => transaction.type === "Expenditure")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function getDashboardPeriod(
  periodKey: DashboardPeriodKey = "previousMonth",
  now = new Date()
): DashboardSummary["period"] {
  if (periodKey === "currentMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endOfMonth(now.getFullYear(), now.getMonth());
    return {
      key: periodKey,
      label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      startDate: toDateString(start),
      endDate: toDateString(end),
    };
  }

  if (periodKey === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), quarterStartMonth, 1);
    const end = endOfMonth(now.getFullYear(), quarterStartMonth + 2);
    return {
      key: periodKey,
      label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      startDate: toDateString(start),
      endDate: toDateString(end),
    };
  }

  if (periodKey === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    return {
      key: periodKey,
      label: `${now.getFullYear()} YTD`,
      startDate: toDateString(start),
      endDate: toDateString(now),
    };
  }

  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = endOfMonth(previous.getFullYear(), previous.getMonth());
  return {
    key: "previousMonth",
    label: previous.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    startDate: toDateString(previous),
    endDate: toDateString(end),
  };
}

function buildMonthlyTrend(transactions: DashboardTransaction[], now: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    const monthTransactions = transactions.filter((transaction) =>
      transaction.date.startsWith(key)
    );

    return {
      month: key,
      name: date.toLocaleDateString("en-GB", { month: "short" }),
      income: roundMoney(sumIncome(monthTransactions)),
      expenditure: roundMoney(sumExpenditure(monthTransactions)),
    };
  });
}

function calculateGivingTrend(transactions: DashboardTransaction[], now: Date) {
  const monthTotals = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    const giving = sumIncome(
      transactions.filter((transaction) => transaction.date.startsWith(key))
    );

    return {
      month: key,
      name: date.toLocaleDateString("en-GB", { month: "short" }),
      giving: roundMoney(giving),
    };
  });

  const previous = monthTotals.slice(0, 3);
  const current = monthTotals.slice(3);
  const previousAverage =
    previous.reduce((sum, month) => sum + month.giving, 0) / previous.length;
  const currentAverage =
    current.reduce((sum, month) => sum + month.giving, 0) / current.length;

  return {
    rollingGiving: monthTotals,
    givingTrendPercent:
      previousAverage > 0
        ? roundPercent(((currentAverage - previousAverage) / previousAverage) * 100)
        : null,
  };
}

function calculateFundBalance(
  fundId: string,
  transactions: DashboardTransaction[]
) {
  return roundMoney(sumActiveSigned(transactions.filter((transaction) => transaction.fundId === fundId)));
}

function calculateCashBankingPendingWeeks({
  periodTransactions,
  cashCollections,
  cashReconciliations,
}: {
  periodTransactions: DashboardTransaction[];
  cashCollections: DashboardCashCollection[];
  cashReconciliations: DashboardCashReconciliation[];
}) {
  const completedSplits = cashReconciliations
    .filter((reconciliation) => reconciliation.status === "completed")
    .flatMap((reconciliation) => reconciliation.cashCollectionSplits);

  return cashCollections.filter((collection) => {
    if (collection.status === "draft") return false;

    const expected = periodTransactions
      .filter(
        (transaction) =>
          transaction.cashCollectionId === collection._id &&
          transaction.type === "Income" &&
          (transaction.paymentMethod === "Cash" || transaction.paymentMethod === "Cheque")
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    if (expected <= 0) return false;

    const banked = completedSplits
      .filter((split) => split.cashCollectionId === collection._id)
      .reduce((sum, split) => sum + split.cashAmount + split.chequeAmount, 0);

    return roundMoney(banked) < roundMoney(expected);
  }).length;
}

function calculateDonorAttention({
  period,
  transactions,
  donors,
  pledges,
}: {
  period: DashboardSummary["period"];
  transactions: DashboardTransaction[];
  donors: DashboardDonor[];
  pledges: DashboardPledge[];
}) {
  const ytdStart = `${period.startDate.slice(0, 4)}-01-01`;
  const ytdTransactions = transactions.filter((transaction) => transaction.date >= ytdStart);
  const attentionKeys = new Set<string>();

  for (const donor of donors) {
    const donorTransactions = transactions.filter(
      (transaction) => transaction.donorId === donor._id || transaction.donorName === donor.name
    );
    const ytdGiving = sumIncome(
      ytdTransactions.filter(
        (transaction) => transaction.donorId === donor._id || transaction.donorName === donor.name
      )
    );

    if (donor.type === "Individual" && donor.isGiftAidActive !== true && ytdGiving >= 100) {
      attentionKeys.add(`gift-aid:${donor._id}`);
    }

    const latestGiftDate = donorTransactions
      .filter((transaction) => transaction.type === "Income")
      .map((transaction) => transaction.date)
      .sort()
      .at(-1);

    if (latestGiftDate && latestGiftDate < period.startDate) {
      attentionKeys.add(`lapsed:${donor._id}`);
    }
  }

  for (const pledge of pledges) {
    if (pledge.status !== "Active" || pledge.frequency !== "Monthly") continue;
    const hasPeriodGift = transactions.some(
      (transaction) =>
        transaction.type === "Income" &&
        inRange(transaction.date, period.startDate, period.endDate) &&
        (transaction.pledgeId === pledge._id ||
          transaction.donorId === pledge.donorId ||
          transaction.donorName === pledge.donorName)
    );
    if (!hasPeriodGift) {
      attentionKeys.add(`pledge:${pledge._id}`);
    }
  }

  return attentionKeys.size;
}

export function buildExecutiveDashboardSummary({
  periodKey = "previousMonth",
  now = new Date(),
  funds,
  transactions,
  donors,
  pledges,
  cashCollections,
  cashReconciliations,
}: {
  periodKey?: DashboardPeriodKey;
  now?: Date;
  funds: DashboardFund[];
  transactions: DashboardTransaction[];
  donors: DashboardDonor[];
  pledges: DashboardPledge[];
  cashCollections: DashboardCashCollection[];
  cashReconciliations: DashboardCashReconciliation[];
}): DashboardSummary {
  const period = getDashboardPeriod(periodKey, now);
  const activeTransactions = filterActiveTransactions(transactions);
  const periodTransactions = activeTransactions.filter((transaction) =>
    inRange(transaction.date, period.startDate, period.endDate)
  );
  const periodIncome = sumIncome(periodTransactions);
  const periodExpenditure = sumExpenditure(periodTransactions);
  const netMovement = roundMoney(periodIncome - periodExpenditure);

  const unrestrictedFunds = funds.filter((fund) => fund.type === "Unrestricted");
  const generalFund = unrestrictedFunds[0];
  const generalFundBalance = generalFund
    ? calculateFundBalance(generalFund._id, activeTransactions)
    : 0;
  const unrestrictedExpenditureTrend = buildMonthlyTrend(
    activeTransactions.filter((transaction) =>
      unrestrictedFunds.some((fund) => fund._id === transaction.fundId)
    ),
    now
  );
  const averageMonthlyUnrestrictedExpenditure =
    unrestrictedExpenditureTrend.reduce((sum, month) => sum + month.expenditure, 0) /
    unrestrictedExpenditureTrend.length;
  const generalFundCoverageMonths =
    averageMonthlyUnrestrictedExpenditure > 0
      ? roundMoney(generalFundBalance / averageMonthlyUnrestrictedExpenditure)
      : null;

  let operatingPosition: OperatingPosition = "Healthy";
  let operatingTone: DashboardTone = "Healthy";
  if (netMovement < 0 || (generalFundCoverageMonths !== null && generalFundCoverageMonths < 1)) {
    operatingPosition = "Deficit";
    operatingTone = "Action";
  } else if (
    netMovement < periodIncome * 0.05 ||
    (generalFundCoverageMonths !== null && generalFundCoverageMonths < 3)
  ) {
    operatingPosition = "Watch";
    operatingTone = "Watch";
  }

  const { rollingGiving, givingTrendPercent } = calculateGivingTrend(activeTransactions, now);

  const giftAidEligible = periodTransactions
    .filter((transaction) => transaction.type === "Income" && transaction.isGiftAidEligible)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const missionTitheEligible = periodTransactions
    .filter((transaction) => {
      const fund = funds.find((item) => item._id === transaction.fundId);
      return (
        transaction.type === "Income" &&
        fund?.type === "Unrestricted" &&
        MISSION_TITHE_CATEGORIES.has(transaction.category.trim().toLowerCase())
      );
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const reconciledPercent =
    periodTransactions.length > 0
      ? roundPercent(
          (periodTransactions.filter((transaction) => transaction.isReconciled).length /
            periodTransactions.length) *
            100
        )
      : 100;
  const categorizedPercent =
    periodTransactions.length > 0
      ? roundPercent(
          (periodTransactions.filter(
            (transaction) =>
              transaction.category.trim().length > 0 &&
              transaction.category.trim().toLowerCase() !== "uncategorized"
          ).length /
            periodTransactions.length) *
            100
        )
      : 100;

  const restrictedFundBalances = funds
    .filter((fund) => fund.type === "Restricted")
    .map((fund) => ({
      fundId: fund._id,
      name: fund.name,
      balance: calculateFundBalance(fund._id, activeTransactions),
      targetAmount: fund.targetAmount,
    }));
  const lowBalanceFunds = funds
    .map((fund) => ({
      fundId: fund._id,
      name: fund.name,
      balance: calculateFundBalance(fund._id, activeTransactions),
    }))
    .filter((fund) => fund.balance < 1000)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 5);
  const campaignFund = restrictedFundBalances.find((fund) => fund.targetAmount && fund.targetAmount > 0);

  const summary: DashboardSummary = {
    period,
    health: {
      operatingPosition,
      operatingTone,
      netMovement,
      givingTrendPercent,
      generalFundCoverageMonths,
      donorAttentionCount: calculateDonorAttention({
        period,
        transactions: activeTransactions,
        donors,
        pledges,
      }),
    },
    readiness: {
      reconciledPercent,
      categorizedPercent,
      cashBankingPendingWeeks: calculateCashBankingPendingWeeks({
        periodTransactions,
        cashCollections: cashCollections.filter((collection) =>
          inRange(collection.weekEndingDate, period.startDate, period.endDate)
        ),
        cashReconciliations,
      }),
      giftAidClaimable: roundMoney(giftAidEligible * 0.25),
      missionTitheDue: roundMoney(missionTitheEligible * 0.1),
      evidenceCheckCount: periodTransactions.filter(
        (transaction) => transaction.type === "Expenditure" && transaction.amount >= 500
      ).length,
    },
    trends: {
      monthlyIncomeExpenditure: buildMonthlyTrend(activeTransactions, now),
      rollingGiving,
    },
    funds: {
      generalFundBalance,
      restrictedFundBalances,
      lowBalanceFunds,
      campaignProgress:
        campaignFund && campaignFund.targetAmount
          ? {
              fundId: campaignFund.fundId,
              name: campaignFund.name,
              progressPercent: roundPercent(
                Math.min((campaignFund.balance / campaignFund.targetAmount) * 100, 100)
              ),
              balance: campaignFund.balance,
              targetAmount: campaignFund.targetAmount,
            }
          : undefined,
    },
    alerts: [],
  };

  const alerts: DashboardSummary["alerts"] = [];
  if (summary.readiness.reconciledPercent < 95 || summary.readiness.categorizedPercent < 95) {
    alerts.push({
      severity: "warning",
      title: "Month-end review needs attention",
      description: "Some transactions still need reconciliation or category review before reports are ready.",
      actionUrl: "/transactions",
    });
  }
  if (summary.readiness.cashBankingPendingWeeks > 0) {
    alerts.push({
      severity: "warning",
      title: "Cash banking is still open",
      description: `${summary.readiness.cashBankingPendingWeeks} collection week${summary.readiness.cashBankingPendingWeeks === 1 ? "" : "s"} still need banking completion.`,
      actionUrl: "/transactions",
    });
  }
  if (summary.health.donorAttentionCount > 0) {
    alerts.push({
      severity: "info",
      title: "Donor follow-up available",
      description: `${summary.health.donorAttentionCount} donor stewardship item${summary.health.donorAttentionCount === 1 ? "" : "s"} may need attention.`,
      actionUrl: "/donors",
    });
  }

  return {
    ...summary,
    alerts,
  };
}
```

- [ ] **Step 4: Run helper tests and adjust only if the assertions expose a real mismatch**

Run:

```bash
npm test -- tests/dashboardKpis.test.ts
```

Expected result:

```text
PASS tests/dashboardKpis.test.ts
```

- [ ] **Step 5: Commit the helper**

Run:

```bash
git add lib/dashboardKpis.ts tests/dashboardKpis.test.ts
git commit -m "feat: add dashboard KPI calculations"
```

---

### Task 2: Convex Executive Summary Query

**Files:**

- Modify: `convex/queries/dashboard.ts`

- [ ] **Step 1: Add imports**

At the top of `convex/queries/dashboard.ts`, add `v` and the dashboard helper imports:

```ts
import { v } from "convex/values";
import {
  buildExecutiveDashboardSummary,
  type DashboardPeriodKey,
} from "../../lib/dashboardKpis";
```

Keep the existing imports for `query`, `requireAuth`, and voided transaction helpers.

- [ ] **Step 2: Add the executive summary query**

Append this query to `convex/queries/dashboard.ts`:

```ts
export const executiveSummary = query({
  args: {
    periodKey: v.optional(
      v.union(
        v.literal("currentMonth"),
        v.literal("previousMonth"),
        v.literal("quarter"),
        v.literal("ytd")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const [
      funds,
      transactions,
      donors,
      pledges,
      cashCollections,
      cashReconciliations,
    ] = await Promise.all([
      ctx.db
        .query("funds")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("donors")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("pledges")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("cashCollections")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("cashBankingReconciliations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
    ]);

    return buildExecutiveDashboardSummary({
      periodKey: (args.periodKey ?? "previousMonth") as DashboardPeriodKey,
      funds: funds.map((fund) => ({
        _id: String(fund._id),
        name: fund.name,
        type: fund.type,
        targetAmount: fund.targetAmount,
      })),
      transactions: transactions.map((transaction) => ({
        _id: String(transaction._id),
        date: transaction.date,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        fundId: String(transaction.fundId),
        isReconciled: transaction.isReconciled,
        isGiftAidEligible: transaction.isGiftAidEligible,
        donorId: transaction.donorId ? String(transaction.donorId) : undefined,
        donorName: transaction.donorName,
        pledgeId: transaction.pledgeId ? String(transaction.pledgeId) : transaction.pledgeId,
        paymentMethod: transaction.paymentMethod,
        cashCollectionId: transaction.cashCollectionId
          ? String(transaction.cashCollectionId)
          : undefined,
        isVoided: transaction.isVoided,
      })),
      donors: donors.map((donor) => ({
        _id: String(donor._id),
        name: donor.name,
        type: donor.type,
        isGiftAidActive: donor.isGiftAidActive,
      })),
      pledges: pledges.map((pledge) => ({
        _id: String(pledge._id),
        donorId: pledge.donorId ? String(pledge.donorId) : undefined,
        donorName: pledge.donorName,
        amount: pledge.amount,
        fundId: String(pledge.fundId),
        frequency: pledge.frequency,
        startDate: pledge.startDate,
        endDate: pledge.endDate,
        status: pledge.status,
      })),
      cashCollections: cashCollections.map((collection) => ({
        _id: String(collection._id),
        weekEndingDate: collection.weekEndingDate,
        status: collection.status,
      })),
      cashReconciliations: cashReconciliations.map((reconciliation) => ({
        _id: String(reconciliation._id),
        status: reconciliation.status,
        cashCollectionSplits: reconciliation.cashCollectionSplits.map((split) => ({
          cashCollectionId: String(split.cashCollectionId),
          cashAmount: split.cashAmount,
          chequeAmount: split.chequeAmount,
        })),
      })),
    });
  },
});
```

- [ ] **Step 3: Run type-check**

Run:

```bash
npm run typecheck
```

Expected result:

```text
No TypeScript errors from convex/queries/dashboard.ts
```

- [ ] **Step 4: Commit the query**

Run:

```bash
git add convex/queries/dashboard.ts
git commit -m "feat: add executive dashboard summary query"
```

---

### Task 3: Dashboard Presentational Components

**Files:**

- Create: `components/dashboard/types.ts`
- Create: `components/dashboard/DashboardHealthCards.tsx`
- Create: `components/dashboard/DashboardReadinessStrip.tsx`
- Create: `components/dashboard/DashboardTrendPanel.tsx`
- Create: `components/dashboard/DashboardLeadershipAlerts.tsx`
- Create: `components/dashboard/DashboardFundHealth.tsx`

- [ ] **Step 1: Add shared frontend types**

Create `components/dashboard/types.ts`:

```ts
import { api } from "../../convex/_generated/api";

export type ExecutiveDashboardSummary = typeof api.queries.dashboard.executiveSummary._returnType;
export type DashboardPeriodKey = "currentMonth" | "previousMonth" | "quarter" | "ytd";
```

If `_returnType` is not exposed by Convex generated APIs during type-check, replace the file content with:

```ts
import type { DashboardSummary, DashboardPeriodKey } from "../../lib/dashboardKpis";

export type ExecutiveDashboardSummary = DashboardSummary;
export type { DashboardPeriodKey };
```

- [ ] **Step 2: Add health cards component**

Create `components/dashboard/DashboardHealthCards.tsx`:

```tsx
import React from "react";
import { AlertCircle, HeartPulse, PiggyBank, TrendingUp, Users } from "lucide-react";
import type { ExecutiveDashboardSummary } from "./types";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);

const toneClass = (tone: "Healthy" | "Watch" | "Action") => {
  if (tone === "Healthy") return "bg-sage-light text-sage-dark border-sage";
  if (tone === "Watch") return "bg-amber-light text-amber-dark border-amber";
  return "bg-error-light text-error border-error";
};

interface DashboardHealthCardsProps {
  summary: ExecutiveDashboardSummary;
}

const DashboardHealthCards: React.FC<DashboardHealthCardsProps> = ({ summary }) => {
  const coverage = summary.health.generalFundCoverageMonths;
  const coverageTone = coverage === null ? "Watch" : coverage >= 3 ? "Healthy" : coverage >= 1 ? "Watch" : "Action";
  const givingTone =
    summary.health.givingTrendPercent === null
      ? "Watch"
      : summary.health.givingTrendPercent >= 0
        ? "Healthy"
        : "Action";
  const donorTone = summary.health.donorAttentionCount === 0 ? "Healthy" : "Watch";

  const cards = [
    {
      label: "Operating Position",
      value: summary.health.operatingPosition,
      note: `${formatCurrency(summary.health.netMovement)} net movement`,
      icon: HeartPulse,
      tone: summary.health.operatingTone,
    },
    {
      label: "Giving Trend",
      value:
        summary.health.givingTrendPercent === null
          ? "New"
          : `${summary.health.givingTrendPercent >= 0 ? "+" : ""}${summary.health.givingTrendPercent}%`,
      note: "Rolling 3 months vs prior 3 months",
      icon: TrendingUp,
      tone: givingTone,
    },
    {
      label: "General Fund Coverage",
      value: coverage === null ? "No spend" : `${coverage.toFixed(1)} mo`,
      note: "Unrestricted balance / avg monthly spend",
      icon: PiggyBank,
      tone: coverageTone,
    },
    {
      label: "Donor Attention",
      value: String(summary.health.donorAttentionCount),
      note: "Follow-up items summarized for leadership",
      icon: Users,
      tone: donorTone,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="swiss-card p-5 bg-white min-h-36 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className={`p-2 rounded-lg border ${toneClass(card.tone)}`}>
                <Icon size={18} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${toneClass(card.tone)}`}>
                {card.tone === "Action" ? <AlertCircle size={10} className="inline mr-1" /> : null}
                {card.tone}
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">{card.label}</p>
              <h3 className="text-2xl font-bold text-ink tracking-tighter mt-1">{card.value}</h3>
              <p className="text-xs text-grey-mid font-medium mt-1 leading-snug">{card.note}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DashboardHealthCards;
```

- [ ] **Step 3: Add readiness strip component**

Create `components/dashboard/DashboardReadinessStrip.tsx`:

```tsx
import React from "react";
import { Banknote, CheckCircle2, FileCheck2, Gift, ListChecks, Percent, ShieldCheck } from "lucide-react";
import type { ExecutiveDashboardSummary } from "./types";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);

interface DashboardReadinessStripProps {
  summary: ExecutiveDashboardSummary;
}

const DashboardReadinessStrip: React.FC<DashboardReadinessStripProps> = ({ summary }) => {
  const items = [
    {
      label: "Reconciled",
      value: `${summary.readiness.reconciledPercent}%`,
      icon: ShieldCheck,
      attention: summary.readiness.reconciledPercent < 95,
    },
    {
      label: "Categorized",
      value: `${summary.readiness.categorizedPercent}%`,
      icon: ListChecks,
      attention: summary.readiness.categorizedPercent < 95,
    },
    {
      label: "Cash Banked",
      value:
        summary.readiness.cashBankingPendingWeeks === 0
          ? "Clear"
          : `${summary.readiness.cashBankingPendingWeeks} pending`,
      icon: Banknote,
      attention: summary.readiness.cashBankingPendingWeeks > 0,
    },
    {
      label: "Gift Aid",
      value: formatCurrency(summary.readiness.giftAidClaimable),
      icon: Gift,
      attention: false,
    },
    {
      label: "Mission Tithe",
      value: formatCurrency(summary.readiness.missionTitheDue),
      icon: Percent,
      attention: summary.readiness.missionTitheDue > 0,
    },
    {
      label: "Large Payments",
      value: String(summary.readiness.evidenceCheckCount),
      icon: FileCheck2,
      attention: summary.readiness.evidenceCheckCount > 0,
    },
  ];

  return (
    <div className="swiss-card bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-ledger bg-paper flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-sage" />
          <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Month-End Readiness</h3>
        </div>
        <span className="text-[10px] text-grey-mid font-bold uppercase tracking-wide">{summary.period.label}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-x divide-y md:divide-y-0 divide-ledger">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="p-4 min-h-24">
              <div className="flex items-center gap-2 text-grey-mid mb-2">
                <Icon size={14} className={item.attention ? "text-amber" : "text-sage"} />
                <span className="text-[10px] font-bold uppercase tracking-wide">{item.label}</span>
              </div>
              <p className={`text-lg font-bold font-mono ${item.attention ? "text-amber-dark" : "text-ink"}`}>{item.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardReadinessStrip;
```

- [ ] **Step 4: Add trend panel component**

Create `components/dashboard/DashboardTrendPanel.tsx`:

```tsx
import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExecutiveDashboardSummary } from "./types";

interface DashboardTrendPanelProps {
  summary: ExecutiveDashboardSummary;
}

const DashboardTrendPanel: React.FC<DashboardTrendPanelProps> = ({ summary }) => {
  const data = summary.trends.monthlyIncomeExpenditure.map((month) => ({
    name: month.name,
    Income: month.income,
    Expenditure: month.expenditure,
  }));

  return (
    <div className="swiss-card p-6 bg-white">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="font-bold text-ink text-lg">Giving & Expenditure Trend</h3>
          <p className="text-xs text-grey-mid font-medium">6 month income vs expenditure</p>
        </div>
        <div className="flex gap-4 text-xs font-bold uppercase tracking-wide">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-ink" /> Income</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber" /> Expenditure</div>
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#666666" }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#666666" }} />
            <Tooltip
              cursor={{ fill: "#fafaf9" }}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #000000",
                boxShadow: "4px 4px 0px rgba(0,0,0,1)",
                fontFamily: "JetBrains Mono",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="Income" barSize={32} fill="#000000" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Expenditure" stroke="#d4a574" strokeWidth={3} dot={{ r: 4, fill: "#d4a574", strokeWidth: 2, stroke: "#fff" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DashboardTrendPanel;
```

- [ ] **Step 5: Add leadership alerts component**

Create `components/dashboard/DashboardLeadershipAlerts.tsx`:

```tsx
import React from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import type { ExecutiveDashboardSummary } from "./types";

interface DashboardLeadershipAlertsProps {
  summary: ExecutiveDashboardSummary;
}

const DashboardLeadershipAlerts: React.FC<DashboardLeadershipAlertsProps> = ({ summary }) => {
  const getIcon = (severity: string) => {
    if (severity === "critical") return <AlertCircle size={16} className="text-error" />;
    if (severity === "warning") return <AlertCircle size={16} className="text-amber" />;
    return <Info size={16} className="text-sage" />;
  };

  return (
    <div className="swiss-card bg-white overflow-hidden">
      <div className="p-5 border-b border-ledger bg-paper">
        <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Leadership Alerts</h3>
      </div>
      <div className="divide-y divide-ledger">
        {summary.alerts.length === 0 ? (
          <div className="p-8 text-center text-grey-mid">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-sage" />
            <p className="text-sm font-medium">No leadership alerts for this period.</p>
          </div>
        ) : (
          summary.alerts.slice(0, 5).map((alert) => (
            <div key={`${alert.severity}-${alert.title}`} className="p-5">
              <div className="flex items-start gap-3">
                {getIcon(alert.severity)}
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-ink">{alert.title}</h4>
                  <p className="text-xs text-grey-mid leading-relaxed mt-1">{alert.description}</p>
                  {alert.actionUrl ? (
                    <div className="flex items-center gap-1 text-xs text-sage font-bold mt-2">
                      <ArrowRight size={12} />
                      Review
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DashboardLeadershipAlerts;
```

- [ ] **Step 6: Add fund health component**

Create `components/dashboard/DashboardFundHealth.tsx`:

```tsx
import React from "react";
import { Target, Wallet } from "lucide-react";
import type { ExecutiveDashboardSummary } from "./types";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);

interface DashboardFundHealthProps {
  summary: ExecutiveDashboardSummary;
}

const DashboardFundHealth: React.FC<DashboardFundHealthProps> = ({ summary }) => {
  return (
    <div className="swiss-card bg-white overflow-hidden">
      <div className="p-5 border-b border-ledger bg-paper flex items-center gap-2">
        <Wallet size={16} className="text-sage" />
        <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Fund Health</h3>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-ledger">
          <div>
            <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">General Fund</p>
            <p className="text-xs text-grey-mid mt-1">Unrestricted operating balance</p>
          </div>
          <p className="font-mono font-bold text-xl text-ink">{formatCurrency(summary.funds.generalFundBalance)}</p>
        </div>

        {summary.funds.campaignProgress ? (
          <div className="pb-4 border-b border-ledger">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-amber" />
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">{summary.funds.campaignProgress.name}</p>
              </div>
              <span className="font-mono text-xs font-bold text-ink">{summary.funds.campaignProgress.progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-grey-light rounded-full overflow-hidden">
              <div className="h-full bg-amber" style={{ width: `${summary.funds.campaignProgress.progressPercent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-grey-mid mt-2">
              <span>{formatCurrency(summary.funds.campaignProgress.balance)}</span>
              <span>Goal {formatCurrency(summary.funds.campaignProgress.targetAmount)}</span>
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-bold text-grey-mid uppercase tracking-wide mb-3">Funds Needing Review</p>
          {summary.funds.lowBalanceFunds.length === 0 ? (
            <p className="text-sm text-grey-mid">No low-balance funds.</p>
          ) : (
            <div className="space-y-2">
              {summary.funds.lowBalanceFunds.map((fund) => (
                <div key={fund.fundId} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-grey-dark">{fund.name}</span>
                  <span className="font-mono font-bold text-ink">{formatCurrency(fund.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardFundHealth;
```

- [ ] **Step 7: Run type-check**

Run:

```bash
npm run typecheck
```

Expected result:

```text
No TypeScript errors in components/dashboard/*
```

- [ ] **Step 8: Commit presentational components**

Run:

```bash
git add components/dashboard
git commit -m "feat: add executive dashboard components"
```

---

### Task 4: Refactor Dashboard Page

**Files:**

- Modify: `components/Dashboard.tsx`

- [ ] **Step 1: Replace dashboard implementation**

Replace `components/Dashboard.tsx` with a query-driven page that:

- uses `api.queries.dashboard.executiveSummary`;
- defaults to `previousMonth`;
- renders the new components;
- keeps `CashTakingsEntry` for Admin and Finance Team only;
- keeps the mobile floating record-cash button;
- does not receive or calculate from `transactions`.

The target component shape is:

```tsx
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { Banknote } from "lucide-react";
import { api } from "../convex/_generated/api";
import { AppUser } from "../types";
import CashTakingsEntry from "./CashTakingsEntry";
import LoadingSpinner from "./LoadingSpinner";
import DashboardFundHealth from "./dashboard/DashboardFundHealth";
import DashboardHealthCards from "./dashboard/DashboardHealthCards";
import DashboardLeadershipAlerts from "./dashboard/DashboardLeadershipAlerts";
import DashboardReadinessStrip from "./dashboard/DashboardReadinessStrip";
import DashboardTrendPanel from "./dashboard/DashboardTrendPanel";
import type { DashboardPeriodKey } from "./dashboard/types";

interface Category {
  _id: string;
  name: string;
}

interface FundOption {
  _id: string;
  name: string;
  type: "Unrestricted" | "Restricted" | "Designated" | "Endowment";
  balance: number;
  description?: string;
  targetAmount?: number;
  deadline?: string;
  logoUrl?: string;
}

interface DashboardProps {
  funds: FundOption[];
  categories: Category[];
  currentUser: AppUser;
}

const periodOptions: Array<{ value: DashboardPeriodKey; label: string }> = [
  { value: "previousMonth", label: "Previous month" },
  { value: "currentMonth", label: "Current month" },
  { value: "quarter", label: "Quarter" },
  { value: "ytd", label: "YTD" },
];

const Dashboard: React.FC<DashboardProps> = ({ funds, categories, currentUser }) => {
  const [periodKey, setPeriodKey] = useState<DashboardPeriodKey>("previousMonth");
  const [showCashTakingsModal, setShowCashTakingsModal] = useState(false);
  const canEdit = ["Admin", "Finance Team"].includes(currentUser.role);
  const summary = useQuery(api.queries.dashboard.executiveSummary, { periodKey });

  if (summary === undefined) {
    return <LoadingSpinner message="Loading leadership dashboard..." />;
  }

  return (
    <div className="space-y-6 animate-enter max-w-7xl mx-auto pb-12">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-ledger pb-6">
        <div>
          <h2 className="text-3xl font-bold text-ink tracking-tight">Leadership Dashboard</h2>
          <p className="text-grey-mid mt-1 text-sm font-medium">
            Senior management view for {summary.period.label}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={periodKey}
            onChange={(event) => setPeriodKey(event.target.value as DashboardPeriodKey)}
            className="bg-white border border-ledger rounded-md px-3 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-sage"
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowCashTakingsModal(true)}
              className="hidden md:inline-flex items-center gap-2 btn-primary"
            >
              <Banknote size={16} />
              Record Cash Collection
            </button>
          ) : null}
        </div>
      </header>

      <DashboardHealthCards summary={summary} />
      <DashboardReadinessStrip summary={summary} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <DashboardTrendPanel summary={summary} />
        </div>
        <DashboardLeadershipAlerts summary={summary} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <DashboardFundHealth summary={summary} />
        <div className="xl:col-span-2 swiss-card p-6 bg-white">
          <h3 className="font-bold text-ink text-sm uppercase tracking-wide mb-2">Pastoral Follow-Up</h3>
          <p className="text-sm text-grey-dark leading-relaxed">
            {summary.health.donorAttentionCount === 0
              ? "No donor follow-up items are currently flagged for this period."
              : `${summary.health.donorAttentionCount} donor stewardship item${summary.health.donorAttentionCount === 1 ? "" : "s"} may need review in Donor Manager.`}
          </p>
        </div>
      </div>

      {showCashTakingsModal && canEdit ? (
        <CashTakingsEntry
          funds={funds}
          categories={categories}
          onClose={() => setShowCashTakingsModal(false)}
          onSuccess={() => setShowCashTakingsModal(false)}
        />
      ) : null}

      {canEdit
        ? createPortal(
            <button
              onClick={() => setShowCashTakingsModal(true)}
              className="fixed bottom-6 right-6 w-14 h-14 bg-sage text-white rounded-full shadow-lg flex items-center justify-center z-30 md:hidden hover:bg-sage-dark transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"
              aria-label="Record Cash Collection"
            >
              <Banknote size={24} />
            </button>,
            document.body
          )
        : null}
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 2: Run type-check**

Run:

```bash
npm run typecheck
```

Expected result:

```text
Type errors show AppContentRoutes still passes transactions to Dashboard or DashboardProps mismatch.
```

- [ ] **Step 3: Commit only after App route wiring is fixed in Task 5**

Do not commit this partial state until Task 5 passes type-check.

---

### Task 5: Route And App-Shell Loading Changes

**Files:**

- Modify: `components/app/AppContentRoutes.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Update dashboard route props**

In `components/app/AppContentRoutes.tsx`, change the Dashboard route element from:

```tsx
<Dashboard
  funds={props.funds}
  transactions={props.transactions}
  categories={props.categories}
  currentUser={props.currentUser}
/>
```

to:

```tsx
<Dashboard
  funds={props.funds}
  categories={props.categories}
  currentUser={props.currentUser}
/>
```

- [ ] **Step 2: Allow transaction-dependent routes to load after dashboard**

In `App.tsx`, replace:

```ts
if (
  funds === undefined ||
  transactions === undefined ||
  pledges === undefined
) {
  return <LoadingSpinner message="Loading financial data..." />;
}
```

with:

```ts
if (funds === undefined || categories === undefined) {
  return <LoadingSpinner message="Loading financial setup..." />;
}
```

This keeps `/dashboard` from waiting on the full transaction and pledge lists. Other routes already receive `transactions ?? []`, `pledges ?? []`, and `donors ?? []`; after this change they can render while their route data continues to resolve.

- [ ] **Step 3: Run type-check**

Run:

```bash
npm run typecheck
```

Expected result:

```text
No TypeScript errors from Dashboard, AppContentRoutes, or App.
```

- [ ] **Step 4: Commit dashboard refactor and route wiring**

Run:

```bash
git add components/Dashboard.tsx components/app/AppContentRoutes.tsx App.tsx
git commit -m "feat: use executive dashboard summary"
```

---

### Task 6: Visual Verification And Polish

**Files:**

- Modify only files from Tasks 3 to 5 if verification exposes layout defects.

- [ ] **Step 1: Start the local development servers**

Run Vite:

```bash
npm run dev
```

Run Convex in a second shell:

```bash
npx convex dev
```

Expected:

```text
Vite available at http://localhost:3000
Convex dev server running without schema or function errors
```

- [ ] **Step 2: Open the dashboard**

Open:

```text
http://localhost:3000/dashboard
```

Verify:

- Header reads `Leadership Dashboard`.
- Period selector defaults to `Previous month`.
- Four KPI cards are visible.
- Month-End Readiness strip is directly below the KPI cards.
- Trend, Leadership Alerts, Fund Health, and Pastoral Follow-Up panels are visible.
- Finance-only cash collection action is visible for Admin and Finance Team and not visible for read-only roles.

- [ ] **Step 3: Check responsive behavior**

Verify desktop and mobile widths:

- At desktop width, KPI cards use four columns.
- At tablet width, KPI cards use two columns.
- At mobile width, KPI cards stack and the readiness strip remains readable.
- No button text overflows.
- No dashboard panels nest cards inside cards.

- [ ] **Step 4: Repair concrete layout defects**

If text clips or overlaps, adjust only the relevant Tailwind classes. Examples of acceptable targeted repairs:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
```

```tsx
<p className="text-xs text-grey-mid font-medium mt-1 leading-snug">
```

```tsx
<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-x divide-y md:divide-y-0 divide-ledger">
```

- [ ] **Step 5: Run final verification**

Run:

```bash
npm test -- tests/dashboardKpis.test.ts
npm run typecheck
npm run build
```

Expected:

```text
PASS tests/dashboardKpis.test.ts
TypeScript completes without errors
Vite production build completes
```

- [ ] **Step 6: Commit verification polish**

If Task 6 required code changes, run:

```bash
git add components/Dashboard.tsx components/dashboard
git commit -m "fix: polish executive dashboard layout"
```

If Task 6 required no code changes, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Senior-management health overview is implemented by `DashboardHealthCards`.
  - Month-end readiness strip is implemented by `DashboardReadinessStrip`.
  - Server-side calculation is implemented by `executiveSummary`.
  - Dashboard no longer calculates KPIs from `transactions` props.
  - Donor names are not exposed in the dashboard.
  - Restricted and unrestricted fund health are separated in `DashboardFundHealth`.
  - Current Reports monthly and annual screens are untouched.

- Type consistency:
  - `DashboardPeriodKey` values are exactly `currentMonth`, `previousMonth`, `quarter`, and `ytd`.
  - `operatingPosition` values are exactly `Healthy`, `Watch`, and `Deficit`.
  - `operatingTone` values are exactly `Healthy`, `Watch`, and `Action`.
  - Frontend components consume `ExecutiveDashboardSummary`.

- Verification:
  - `npm test -- tests/dashboardKpis.test.ts`.
  - `npm run typecheck`.
  - `npm run build`.
  - Browser verification at `http://localhost:3000/dashboard`.
