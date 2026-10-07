import { describe, expect, it } from "vitest";
import {
  buildExecutiveDashboardSummary,
  getDashboardPeriod,
  type DashboardCashCollection,
  type DashboardCashReconciliation,
  type DashboardDonor,
  type DashboardFund,
  type DashboardPledge,
  type BuildExecutiveDashboardSummaryInput,
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
    _id: "t-may-bank-deposit",
    date: "2026-05-15",
    amount: 1480,
    type: "Income",
    category: "Cash Banking Deposit",
    fundId: "general",
    isReconciled: true,
    isGiftAidEligible: true,
    cashBankingRole: "bank_deposit",
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
      throughDate: "2026-05-31",
    });
  });

  it("builds supported dashboard periods", () => {
    const now = new Date("2026-06-08T12:00:00Z");

    expect(getDashboardPeriod("currentMonth", now)).toEqual({
      key: "currentMonth",
      label: "June 2026",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      throughDate: "2026-06-08",
    });
    expect(getDashboardPeriod("quarter", now)).toEqual({
      key: "quarter",
      label: "Q2 2026",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      throughDate: "2026-06-08",
    });
    expect(getDashboardPeriod("ytd", now)).toEqual({
      key: "ytd",
      label: "2026 YTD",
      startDate: "2026-01-01",
      endDate: "2026-06-08",
      throughDate: "2026-06-08",
    });
  });

  it("calculates executive health, readiness, trends, funds, and donor follow-up", () => {
    const input: BuildExecutiveDashboardSummaryInput = {
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions,
      donors,
      pledges,
      cashCollections,
      cashReconciliations,
      statementSessions: [],
      bankAccountFundIds: [],
    };
    const summary = buildExecutiveDashboardSummary(input);

    expect(summary.period.label).toBe("May 2026");
    expect(summary.health.operatingPosition).toBe("Healthy");
    expect(summary.health.netMovement).toBe(130);
    expect(summary.health.givingTrendPercent).toBe(31);
    expect(summary.health.generalFundCoverageMonths).toBeCloseTo(19.7, 1);
    expect(summary.donorFollowUp).toEqual({
      missedGiftAidCount: 0,
      missedGiftAidValue: 0,
      pledgesBehindCount: 1,
    });

    expect(summary.readiness.reconciledPercent).toBe(50);
    expect(summary.readiness.categorizedPercent).toBe(100);
    expect(summary.readiness.cashBankingPendingWeeks).toBe(1);
    expect(summary.readiness.giftAidClaimable).toBe(350);
    expect(summary.readiness.missionTitheDue).toBe(148);
    expect(summary.readiness.unreconciledExpenditureCount).toBe(1);

    expect(summary.funds.generalFundBalance).toBe(4430);
    expect(summary.funds.restrictedBalance).toBe(500);
    expect(summary.funds.campaigns).toEqual([
      {
        fundId: "building",
        name: "Building Fund",
        progressPercent: 5,
        balance: 500,
        targetAmount: 10000,
      },
    ]);
    expect(summary.funds.lowBalanceFunds.map((fund) => fund.name)).toEqual(["Youth Fund"]);
    expect(summary.funds.overdrawnFunds).toEqual([]);

    expect(summary.trends.monthlyIncomeExpenditure).toHaveLength(6);
    expect(summary.trends.monthlyIncomeExpenditure.map((month) => month.month)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(summary.trends.monthlyIncomeExpenditure.at(-1)?.income).toBe(1480);
    expect(summary.trends.monthlyIncomeExpenditure.at(-1)?.net).toBe(summary.health.netMovement);
  });

  it.each(["draft", "reopened"] as const)(
    "ignores %s reconciliations when counting collections awaiting banking",
    (status) => {
      const input: BuildExecutiveDashboardSummaryInput = {
        periodKey: "previousMonth",
        now: new Date("2026-06-08T12:00:00Z"),
        funds,
        transactions,
        donors,
        pledges,
        cashCollections,
        cashReconciliations,
        statementSessions: [],
        bankAccountFundIds: [],
      };
      const completedOnly = buildExecutiveDashboardSummary(input);
      const withIncomplete = buildExecutiveDashboardSummary({
        ...input,
        cashReconciliations: [
          ...cashReconciliations,
          {
            _id: `rec-${status}`,
            status,
            cashCollectionSplits: [
              { cashCollectionId: "cash-2", cashAmount: 1000, chequeAmount: 1000 },
            ],
          },
        ],
      });

      expect(completedOnly.readiness.cashBankingPendingWeeks).toBe(1);
      expect(withIncomplete).toEqual(completedOnly);
    }
  );

  it("normalizes giving trend for multi-month periods", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "quarter",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions,
      donors,
      pledges,
      cashCollections,
      cashReconciliations,
      statementSessions: [],
      bankAccountFundIds: [],
    });

    // Apr, May, and 8 of June's 30 days: 2780 / 2.27 months against a 1000 baseline.
    expect(summary.health.givingTrendPercent).toBe(23);
    expect(summary.trends.monthlyIncomeExpenditure.map((month) => month.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("ends current-month trends on the current month", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "currentMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions,
      donors,
      pledges,
      cashCollections,
      cashReconciliations,
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.trends.monthlyIncomeExpenditure.map((month) => month.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("counts legacy giving category aliases toward mission tithe", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "alias-tithe",
          date: "2026-05-05",
          amount: 200,
          type: "Income",
          category: "Tithe",
          fundId: "general",
          isReconciled: true,
        },
        {
          _id: "alias-offering",
          date: "2026-05-12",
          amount: 100,
          type: "Income",
          category: "Offering",
          fundId: "general",
          isReconciled: true,
        },
      ],
      donors: [],
      pledges: [],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.readiness.missionTitheDue).toBe(30);
  });

  it("returns null general fund coverage when unrestricted expenditure average is zero", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "income-only",
          date: "2026-05-05",
          amount: 500,
          type: "Income",
          category: "Offerings",
          fundId: "general",
          isReconciled: true,
        },
      ],
      donors: [],
      pledges: [],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.health.generalFundCoverageMonths).toBeNull();
  });

  it("counts donorless missed pledges independently by pledge id", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [],
      donors: [],
      pledges: [
        {
          _id: "donorless-pledge-1",
          donorName: "Imported Donor One",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
        {
          _id: "donorless-pledge-2",
          donorName: "Imported Donor Two",
          fundId: "general",
          amount: 75,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
      ],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.donorFollowUp.pledgesBehindCount).toBe(2);
  });

  it("does not satisfy donorless pledges with unrelated anonymous income", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "anonymous-income",
          date: "2026-05-12",
          amount: 25,
          type: "Income",
          category: "Offerings",
          fundId: "general",
          isReconciled: true,
        },
      ],
      donors: [],
      pledges: [
        {
          _id: "donorless-pledge",
          donorName: "Imported Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
      ],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.donorFollowUp.pledgesBehindCount).toBe(1);
  });

  it("satisfies a donorless pledge with a matching pledge id transaction", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "pledged-income",
          pledgeId: "donorless-pledge",
          date: "2026-05-12",
          amount: 50,
          type: "Income",
          category: "Offerings",
          fundId: "general",
          isReconciled: true,
        },
      ],
      donors: [],
      pledges: [
        {
          _id: "donorless-pledge",
          donorName: "Imported Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
      ],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.donorFollowUp.pledgesBehindCount).toBe(0);
  });

  it("does not let one explicit pledge payment satisfy another pledge for the same donor", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "pledge-one-income",
          pledgeId: "pledge-one",
          donorId: "shared-donor",
          donorName: "Shared Donor",
          date: "2026-05-12",
          amount: 50,
          type: "Income",
          category: "Offerings",
          fundId: "general",
          isGiftAidEligible: true,
          isReconciled: true,
        },
      ],
      donors: [
        {
          _id: "shared-donor",
          name: "Shared Donor",
          type: "Individual",
          isGiftAidActive: true,
        },
      ],
      pledges: [
        {
          _id: "pledge-one",
          donorId: "shared-donor",
          donorName: "Shared Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
        {
          _id: "pledge-two",
          donorId: "shared-donor",
          donorName: "Shared Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
      ],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.donorFollowUp.pledgesBehindCount).toBe(1);
  });

  it("does not let one explicit donorless pledge payment satisfy another pledge with the same donor name", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "pledge-one-income",
          pledgeId: "pledge-one",
          donorName: "Imported Shared Donor",
          date: "2026-05-12",
          amount: 50,
          type: "Income",
          category: "Offerings",
          fundId: "general",
          isGiftAidEligible: true,
          isReconciled: true,
        },
      ],
      donors: [],
      pledges: [
        {
          _id: "pledge-one",
          donorName: "Imported Shared Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
        {
          _id: "pledge-two",
          donorName: "Imported Shared Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
      ],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.donorFollowUp.pledgesBehindCount).toBe(1);
  });

  it("uses donor details as a fallback for unlinked pledge payments", () => {
    const summary = buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-06-08T12:00:00Z"),
      funds,
      transactions: [
        {
          _id: "unlinked-pledge-income",
          donorName: "Imported Fallback Donor",
          date: "2026-05-12",
          amount: 50,
          type: "Income",
          category: "Offerings",
          fundId: "general",
          isGiftAidEligible: true,
          isReconciled: true,
        },
      ],
      donors: [],
      pledges: [
        {
          _id: "fallback-pledge",
          donorName: "Imported Fallback Donor",
          fundId: "general",
          amount: 50,
          frequency: "Monthly",
          startDate: "2026-01-01",
          status: "Active",
        },
      ],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

    expect(summary.donorFollowUp.pledgesBehindCount).toBe(0);
  });

  describe("review fixes", () => {
    const summarize = (overrides: Partial<BuildExecutiveDashboardSummaryInput>) =>
      buildExecutiveDashboardSummary({
        periodKey: "previousMonth",
        now: new Date("2026-06-08T12:00:00Z"),
        funds,
        transactions: [],
        donors: [],
        pledges: [],
        cashCollections: [],
        cashReconciliations: [],
        statementSessions: [],
        bankAccountFundIds: [],
        ...overrides,
      });
    const income = (
      id: string,
      date: string,
      amount: number,
      extra: Partial<DashboardTransaction> = {}
    ): DashboardTransaction => ({
      _id: id,
      date,
      amount,
      type: "Income",
      category: "Offerings",
      fundId: "general",
      isReconciled: true,
      ...extra,
    });
    const expense = (
      id: string,
      date: string,
      amount: number,
      extra: Partial<DashboardTransaction> = {}
    ): DashboardTransaction => ({
      ...income(id, date, amount),
      type: "Expenditure",
      category: "Rent-Premises For Worship",
      ...extra,
    });

    it("counts the Uncategorized placeholder as uncategorised", () => {
      const summary = summarize({
        transactions: [
          income("categorised", "2026-05-03", 10),
          income("placeholder", "2026-05-10", 10, { category: "Uncategorized" }),
        ],
      });

      expect(summary.readiness.categorizedPercent).toBe(50);
    });

    it("reports no completion percentages for a period without transactions", () => {
      const summary = summarize({ transactions: [income("april", "2026-04-03", 10)] });

      expect(summary.readiness.reconciledPercent).toBeNull();
      expect(summary.readiness.categorizedPercent).toBeNull();
    });

    it("compares a single month against the three months immediately before it", () => {
      const summary = summarize({
        transactions: [
          income("jan", "2026-01-04", 5000),
          income("feb", "2026-02-01", 1000),
          income("mar", "2026-03-01", 1000),
          income("apr", "2026-04-05", 1000),
          income("may", "2026-05-03", 1100),
        ],
      });

      expect(summary.health.givingTrendPercent).toBe(10);
    });

    it("prorates a partial month before comparing giving", () => {
      const summary = summarize({
        periodKey: "currentMonth",
        transactions: [
          income("mar", "2026-03-01", 1000),
          income("apr", "2026-04-05", 1000),
          income("may", "2026-05-03", 1000),
          income("jun", "2026-06-07", 300),
        ],
      });

      // 300 over 8 of June's 30 days is 1125 a month.
      expect(summary.health.givingTrendPercent).toBe(13);
    });

    it("reports no giving trend without a baseline", () => {
      const summary = summarize({ transactions: [income("may", "2026-05-03", 1100)] });

      expect(summary.health.givingTrendPercent).toBeNull();
    });

    it("judges the operating position on unrestricted funds only", () => {
      const summary = summarize({
        transactions: [
          income("general", "2026-05-03", 500),
          expense("rent", "2026-05-10", 900),
          income("building", "2026-05-17", 20000, { fundId: "building", category: "Donations" }),
        ],
      });

      expect(summary.health.netMovement).toBe(-400);
      expect(summary.health.operatingPosition).toBe("Deficit");
    });

    it("bases coverage on complete months when the period is partial", () => {
      const summary = summarize({
        periodKey: "currentMonth",
        transactions: [
          income("seed", "2026-01-01", 12000),
          ...["01", "02", "03", "04", "05"].map((month) =>
            expense(`rent-${month}`, `2026-${month}-15`, 1000)
          ),
        ],
      });

      expect(summary.health.generalFundCoverageMonths).toBe(7);
    });

    it("lists open campaigns by nearest deadline", () => {
      const summary = summarize({
        funds: [
          { _id: "general", name: "General Fund", type: "Unrestricted" },
          { _id: "roof", name: "Roof", type: "Restricted", targetAmount: 5000, deadline: "2026-12-31" },
          { _id: "van", name: "Minibus", type: "Restricted", targetAmount: 8000, deadline: "2026-07-31" },
          { _id: "organ", name: "Organ", type: "Restricted", targetAmount: 3000 },
          { _id: "past", name: "Past Appeal", type: "Restricted", targetAmount: 1000, deadline: "2026-04-30" },
          { _id: "met", name: "Met Appeal", type: "Restricted", targetAmount: 1000 },
        ],
        transactions: [
          income("roof-gift", "2026-05-03", 1000, { fundId: "roof" }),
          income("met-gift", "2026-05-03", 1000, { fundId: "met" }),
        ],
      });

      expect(summary.funds.campaigns.map((campaign) => campaign.name)).toEqual([
        "Minibus",
        "Roof",
        "Organ",
      ]);
      expect(summary.funds.campaigns[1]).toMatchObject({ progressPercent: 20, deadline: "2026-12-31" });
    });

    it("separates overdrawn funds from low balances and leaves campaigns out of low balances", () => {
      const summary = summarize({
        funds: [
          { _id: "general", name: "General Fund", type: "Unrestricted" },
          { _id: "youth", name: "Youth Fund", type: "Restricted" },
          { _id: "mission", name: "Mission Fund", type: "Restricted" },
          { _id: "building", name: "Building Fund", type: "Restricted", targetAmount: 10000 },
        ],
        transactions: [
          income("general", "2026-05-03", 5000),
          expense("youth-trip", "2026-05-10", 200, { fundId: "youth" }),
          income("mission", "2026-05-10", 300, { fundId: "mission" }),
          income("building", "2026-05-10", 500, { fundId: "building" }),
        ],
      });

      expect(summary.funds.overdrawnFunds).toEqual([
        { fundId: "youth", name: "Youth Fund", balance: -200 },
      ]);
      expect(summary.funds.lowBalanceFunds).toEqual([
        { fundId: "mission", name: "Mission Fund", balance: 300 },
      ]);
      expect(summary.funds.restrictedBalance).toBe(600);
    });

    it("counts unreconciled spending without the cash banking weeks", () => {
      const summary = summarize({
        transactions: [
          expense("unreconciled", "2026-05-10", 650, { isReconciled: false }),
          expense("reconciled", "2026-05-11", 100),
          income("cash", "2026-05-10", 200, {
            isReconciled: false,
            cashCollectionId: "cash-2",
            paymentMethod: "Cash",
          }),
        ],
        cashCollections,
      });

      expect(summary.readiness.cashBankingPendingWeeks).toBe(1);
      expect(summary.readiness.unreconciledExpenditureCount).toBe(1);
    });

    it("flags gifts from Gift Aid declared individuals that are not marked eligible", () => {
      const summary = summarize({
        donors: [
          { _id: "declared", name: "Declared", type: "Individual", isGiftAidActive: true },
          { _id: "undeclared", name: "Undeclared", type: "Individual", isGiftAidActive: false },
          { _id: "company", name: "Company", type: "Organization", isGiftAidActive: true },
        ],
        transactions: [
          income("missed", "2026-05-03", 100, { donorId: "declared", isGiftAidEligible: false }),
          income("claimed", "2026-05-10", 100, { donorId: "declared", isGiftAidEligible: true }),
          income("no-declaration", "2026-05-10", 100, { donorId: "undeclared" }),
          income("company-gift", "2026-05-10", 100, { donorId: "company" }),
        ],
      });

      expect(summary.donorFollowUp.missedGiftAidCount).toBe(1);
      expect(summary.donorFollowUp.missedGiftAidValue).toBe(25);
    });

    it("only flags pledges whose payment cadence has lapsed", () => {
      const pledge = (id: string, frequency: string, startDate: string): DashboardPledge => ({
        _id: id,
        donorName: id,
        fundId: "general",
        amount: 50,
        frequency,
        startDate,
        status: "Active",
      });
      const summary = summarize({
        pledges: [
          pledge("annual-paid", "Annual", "2025-01-01"),
          pledge("annual-lapsed", "Annual", "2024-01-01"),
          pledge("monthly-new", "Monthly", "2026-05-20"),
          pledge("one-off", "One-off", "2025-01-01"),
          { ...pledge("monthly-ended", "Monthly", "2025-01-01"), endDate: "2026-03-31" },
        ],
        transactions: [
          income("annual-paid-gift", "2025-10-01", 50, { pledgeId: "annual-paid" }),
          income("annual-lapsed-gift", "2025-04-01", 50, { pledgeId: "annual-lapsed" }),
        ],
      });

      expect(summary.donorFollowUp.pledgesBehindCount).toBe(1);
    });

    it("lists bank account funds whose statements are not reconciled through last month", () => {
      const summary = summarize({
        now: new Date("2026-10-06T12:00:00Z"),
        funds: [
          { _id: "general", name: "General Fund", type: "Unrestricted" },
          { _id: "building", name: "Building Fund", type: "Restricted" },
          { _id: "youth", name: "Youth Fund", type: "Restricted" },
          { _id: "mission", name: "Mission Fund", type: "Restricted" },
        ],
        bankAccountFundIds: ["general", "building"],
        statementSessions: [
          { fundId: "general", periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "completed" },
          { fundId: "youth", periodStart: "2026-08-01", periodEnd: "2026-08-31", status: "completed" },
          { fundId: "youth", periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "draft" },
        ],
      });

      expect(summary.readiness.statementsDueThrough).toBe("2026-09-30");
      expect(summary.readiness.statementsBehind).toEqual([
        { fundId: "building", name: "Building Fund", reconciledThrough: null },
        { fundId: "youth", name: "Youth Fund", reconciledThrough: "2026-08-31" },
      ]);
    });

    it("does not let a later statement hide an unfinished or missing earlier one", () => {
      const statement = (fundId: string, month: string, status = "completed") => ({
        fundId,
        periodStart: `2026-${month}-01`,
        periodEnd: `2026-${month}-${month === "09" ? "30" : "31"}`,
        status,
      });
      const summary = summarize({
        now: new Date("2026-10-06T12:00:00Z"),
        funds: [
          { _id: "general", name: "General Fund", type: "Unrestricted" },
          { _id: "building", name: "Building Fund", type: "Restricted" },
          { _id: "youth", name: "Youth Fund", type: "Restricted" },
        ],
        bankAccountFundIds: ["general", "building", "youth"],
        statementSessions: [
          statement("general", "07"),
          statement("general", "08", "reopened"),
          statement("general", "09"),
          statement("building", "07"),
          statement("building", "09"),
          statement("youth", "07"),
          statement("youth", "08"),
          statement("youth", "09"),
        ],
      });

      expect(summary.readiness.statementsBehind).toEqual([
        { fundId: "general", name: "General Fund", reconciledThrough: "2026-07-31" },
        { fundId: "building", name: "Building Fund", reconciledThrough: "2026-07-31" },
      ]);
    });

    it("does not count purchases from declared donors as missed Gift Aid", () => {
      const summary = summarize({
        donors: [{ _id: "declared", name: "Declared", type: "Individual", isGiftAidActive: true }],
        transactions: [
          income("book", "2026-05-03", 40, { donorId: "declared", category: "Merchandise" }),
          income("offering", "2026-05-10", 100, { donorId: "declared" }),
        ],
      });

      expect(summary.donorFollowUp).toMatchObject({ missedGiftAidCount: 1, missedGiftAidValue: 25 });
    });

    it("leaves future-dated entries out of figures for a period in progress", () => {
      const summary = summarize({
        periodKey: "currentMonth",
        transactions: [
          income("gift", "2026-06-07", 500),
          expense("rent-due", "2026-06-20", 900, { isReconciled: false }),
        ],
      });

      expect(summary.health.netMovement).toBe(500);
      expect(summary.readiness.unreconciledExpenditureCount).toBe(0);
      expect(summary.trends.monthlyIncomeExpenditure.at(-1)?.net).toBe(500);
    });

    it("counts a collection awaiting banking before its week-ending Sunday", () => {
      const summary = summarize({
        periodKey: "currentMonth",
        now: new Date("2026-06-10T12:00:00Z"),
        transactions: [
          income("midweek-cash", "2026-06-10", 120, {
            isReconciled: false,
            cashCollectionId: "this-week",
            paymentMethod: "Cash",
          }),
        ],
        cashCollections: [{ _id: "this-week", weekEndingDate: "2026-06-14", status: "submitted" }],
      });

      expect(summary.readiness.cashBankingPendingWeeks).toBe(1);
    });
  });
});

describe("dashboard with transfers, returned payments and loans", () => {
  const funds = [
    { _id: "general", name: "General Fund", type: "Unrestricted" as const },
    { _id: "building", name: "Building Fund", type: "Restricted" as const },
  ];
  const base = { category: "Offerings", isReconciled: true };
  const summarise = (transactions: Parameters<typeof buildExecutiveDashboardSummary>[0]["transactions"]) =>
    buildExecutiveDashboardSummary({
      periodKey: "currentMonth",
      now: new Date("2026-10-20T12:00:00Z"),
      funds,
      transactions,
      donors: [],
      pledges: [],
      cashCollections: [],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
    });

  it("moves fund balances without counting transfers as income or spending", () => {
    const summary = summarise([
      { ...base, _id: "gift", date: "2026-10-05", amount: 1000, type: "Income", fundId: "general" },
      { ...base, _id: "out", date: "2026-10-06", amount: 300, type: "Expenditure", fundId: "general", category: "Transfer between funds", movementKind: "transfer" },
      { ...base, _id: "in", date: "2026-10-06", amount: 300, type: "Income", fundId: "building", category: "Transfer between funds", movementKind: "transfer" },
    ]);

    expect(summary.health.netMovement).toBe(1000);
    expect(summary.funds.generalFundBalance).toBe(700);
    expect(summary.funds.restrictedBalance).toBe(300);
    expect(summary.trends.monthlyIncomeExpenditure.at(-1)).toMatchObject({ income: 1000, expenditure: 0 });
  });

  it("does not ask for journal legs to be reconciled", () => {
    const summary = summarise([
      { ...base, _id: "spend", date: "2026-10-05", amount: 50, type: "Expenditure", fundId: "general", category: "Utilities" },
      { ...base, _id: "journal", date: "2026-10-06", amount: 300, type: "Expenditure", fundId: "general", category: "Transfer between funds", movementKind: "transfer", movementId: "m1", isJournal: true, isReconciled: false },
    ]);

    expect(summary.readiness.unreconciledExpenditureCount).toBe(0);
    expect(summary.readiness.reconciledPercent).toBe(100);
  });

  it("counts transfer, returned payment and loan legs still waiting for their other side", () => {
    const summary = summarise([
      { ...base, _id: "transfer", date: "2026-09-30", amount: 300, type: "Expenditure", fundId: "general", movementKind: "transfer" },
      { ...base, _id: "bounced", date: "2026-10-02", amount: 40, type: "Income", fundId: "general", movementKind: "reversal" },
      { ...base, _id: "loan", date: "2026-10-03", amount: 5000, type: "Income", fundId: "general", movementKind: "loan" },
      { ...base, _id: "linked", date: "2026-10-04", amount: 20, type: "Income", fundId: "general", movementKind: "reversal", movementId: "m1" },
      { ...base, _id: "voided", date: "2026-10-04", amount: 20, type: "Income", fundId: "general", movementKind: "reversal", isVoided: true },
      { ...base, _id: "later", date: "2026-11-02", amount: 20, type: "Income", fundId: "general", movementKind: "transfer" },
    ]);

    expect(summary.readiness.unlinkedMovementLegs).toBe(3);
  });
});

describe("possible double counted cash", () => {
  const counterDeposit = (overrides: Partial<DashboardTransaction> = {}): DashboardTransaction => ({
    _id: "counter",
    date: "2025-12-15",
    amount: 400,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: true,
    description: "Counter deposit",
    ...overrides,
  });
  const decemberCollection: DashboardCashCollection = {
    _id: "dec-cash",
    weekEndingDate: "2025-12-14",
    status: "submitted",
  };
  const decemberCash: DashboardTransaction = {
    _id: "dec-cash-gift",
    date: "2025-12-07",
    amount: 300,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: false,
    cashCollectionId: "dec-cash",
    paymentMethod: "Cash",
  };
  const flaggedMonths = (
    transactions: DashboardTransaction[],
    overrides: Partial<BuildExecutiveDashboardSummaryInput> = {}
  ) =>
    buildExecutiveDashboardSummary({
      periodKey: "previousMonth",
      now: new Date("2026-01-20T12:00:00Z"),
      funds,
      transactions,
      donors: [],
      pledges: [],
      cashCollections: [decemberCollection],
      cashReconciliations: [],
      statementSessions: [],
      bankAccountFundIds: [],
      ...overrides,
    }).readiness.possibleDoubleCountMonths;

  it("flags a month with a counter deposit and an unbanked cash collection", () => {
    expect(flaggedMonths([counterDeposit(), decemberCash])).toEqual(["2025-12"]);
  });

  it("does not flag a collection covered by a completed cash banking reconciliation", () => {
    expect(
      flaggedMonths([counterDeposit(), decemberCash], {
        cashReconciliations: [
          {
            _id: "rec",
            status: "completed",
            cashCollectionSplits: [{ cashCollectionId: "dec-cash", cashAmount: 300, chequeAmount: 0 }],
          },
        ],
      })
    ).toEqual([]);
  });

  it.each([
    ["a cash banking deposit", counterDeposit({ cashBankingRole: "bank_deposit" })],
    ["a voided row", counterDeposit({ isVoided: true })],
    ["a row from a collection", counterDeposit({ cashCollectionId: "dec-cash" })],
    ["a row without a counter or cash deposit description", counterDeposit({ description: "Gift" })],
  ])("does not flag %s", (_label, row) => {
    expect(flaggedMonths([row, decemberCash])).toEqual([]);
  });

  it("does not flag a month after the period's through date", () => {
    expect(
      flaggedMonths(
        [
          counterDeposit({ _id: "jan", date: "2026-01-05" }),
          { ...decemberCash, _id: "jan-cash", date: "2026-01-04", cashCollectionId: "jan-cash" },
        ],
        {
          cashCollections: [{ _id: "jan-cash", weekEndingDate: "2026-01-11", status: "submitted" }],
        }
      )
    ).toEqual([]);
  });

  it("returns flagged months in ascending order across all history", () => {
    expect(
      flaggedMonths(
        [
          counterDeposit({ _id: "feb", date: "2026-02-12", description: "Cash deposit" }),
          counterDeposit(),
          { ...decemberCash, _id: "feb-cash", date: "2026-02-07", cashCollectionId: "feb-cash" },
          decemberCash,
        ],
        {
          now: new Date("2026-03-20T12:00:00Z"),
          periodKey: "previousMonth",
          cashCollections: [
            decemberCollection,
            { _id: "feb-cash", weekEndingDate: "2026-02-08", status: "banked" },
          ],
        }
      )
    ).toEqual(["2025-12", "2026-02"]);
  });
});
