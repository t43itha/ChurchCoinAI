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
