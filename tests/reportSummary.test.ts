import { describe, expect, it } from "vitest";
import {
  buildFundStatement,
  buildReadiness,
  buildTrend,
  groupGivingByDonor,
  percentChange,
  periodTotals,
  rankCategoryGroups,
  reserveCover,
  type ReportTransaction,
} from "../lib/reportSummary";
import { monthBuckets, type MonthBucket } from "../lib/reportPeriods";
import { sumMoney } from "../convex/lib/money";

const april = { startDate: "2026-04-01", endDate: "2026-04-30" };

const row = (overrides: Partial<ReportTransaction> & Pick<ReportTransaction, "amount" | "type">): ReportTransaction => ({
  date: "2026-04-10",
  category: "Giving",
  fundId: "general",
  ...overrides,
});

describe("periodTotals", () => {
  it("counts only reportable income and spending inside the range", () => {
    const rows = [
      row({ amount: 100, type: "Income" }),
      row({ amount: 40, type: "Expenditure", category: "Utilities" }),
      row({ amount: 500, type: "Income", isVoided: true }),
      row({ amount: 300, type: "Income", cashBankingRole: "bank_deposit" }),
      row({ amount: 70, type: "Income", movementKind: "transfer", movementId: "m1" }),
      row({ amount: 80, type: "Income", movementKind: "loan" }),
      row({ amount: 60, type: "Income", date: "2026-05-01" }),
    ];
    expect(periodTotals(rows, april)).toEqual({ income: 100, expenditure: 40, net: 60 });
  });

  it("sums pennies without float drift", () => {
    const rows = [row({ amount: 0.1, type: "Income" }), row({ amount: 0.2, type: "Income" })];
    expect(periodTotals(rows, april).income).toBe(0.3);
  });
});

describe("rankCategoryGroups", () => {
  const groups = [
    { mainCategory: "Utilities", total: 100, subcategories: [{ name: "Water", total: 100 }] },
    {
      mainCategory: "Giving",
      total: 600,
      subcategories: [
        { name: "Tithes", total: 100 },
        { name: "Gifts", total: 500 },
      ],
    },
    { mainCategory: "Rent", total: 100, subcategories: [{ name: "Hall", total: 100 }] },
  ];

  it("ranks by total, ties by name, subcategories largest first, with shares", () => {
    const ranked = rankCategoryGroups(groups);
    expect(ranked.map((group) => group.mainCategory)).toEqual(["Giving", "Rent", "Utilities"]);
    expect(ranked[0].subcategories.map((sub) => sub.name)).toEqual(["Gifts", "Tithes"]);
    expect(ranked[0].share).toBeCloseTo(0.75);
    expect(ranked[1].share).toBeCloseTo(0.125);
    expect(ranked[0]).not.toHaveProperty("previous");
  });

  it("matches the comparison by mainCategory, 0 when absent there", () => {
    const ranked = rankCategoryGroups(groups, [
      { mainCategory: "Giving", total: 400, subcategories: [] },
    ]);
    expect(ranked.find((group) => group.mainCategory === "Giving")?.previous).toBe(400);
    expect(ranked.find((group) => group.mainCategory === "Rent")?.previous).toBe(0);
  });

  it("adds a zero-total row for each category only in the comparison period", () => {
    const current = [{ mainCategory: "Offerings", total: 900, subcategories: [{ name: "Sunday", total: 900 }] }];
    const prior = [
      { mainCategory: "Offerings", total: 1000, subcategories: [{ name: "Sunday", total: 1000 }] },
      { mainCategory: "Grants", total: 10000, subcategories: [{ name: "Trust", total: 10000 }] },
    ];
    const ranked = rankCategoryGroups(current, prior);

    expect(ranked.map((group) => group.mainCategory)).toEqual(["Offerings", "Grants"]);
    expect(ranked[1]).toEqual({ mainCategory: "Grants", total: 0, subcategories: [], share: 0, previous: 10000 });
    expect(sumMoney(ranked, (group) => group.previous ?? 0)).toBe(11000);
    expect(sumMoney(ranked, (group) => group.total)).toBe(900);
  });

  it("gives a zero share when the side total is zero", () => {
    const ranked = rankCategoryGroups([{ mainCategory: "Empty", total: 0, subcategories: [] }]);
    expect(ranked[0].share).toBe(0);
  });
});

describe("percentChange", () => {
  it("returns one decimal place", () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(90, 100)).toBe(-10);
    expect(percentChange(1, 3)).toBe(-66.7);
  });

  it("is null when the previous value is 0", () => {
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("buildFundStatement", () => {
  const funds = [
    { _id: "building", name: "Building", type: "Restricted" },
    { _id: "general", name: "General", type: "Unrestricted" },
    { _id: "hall", name: "Hall", type: "Designated" },
    { _id: "youth", name: "Youth", type: "Restricted" },
  ];

  const rows = [
    row({ date: "2026-03-15", amount: 100, type: "Income" }),
    row({ date: "2026-04-10", amount: 200, type: "Income" }),
    row({ date: "2026-04-12", amount: 50, type: "Expenditure", category: "Utilities" }),
    row({ date: "2026-04-20", amount: 30, type: "Expenditure", movementKind: "transfer", movementId: "t1" }),
    row({ date: "2026-04-20", amount: 30, type: "Income", fundId: "building", movementKind: "transfer", movementId: "t1" }),
    row({ date: "2026-04-05", amount: 500, type: "Income", fundId: "building", movementKind: "loan" }),
    row({ date: "2026-04-11", amount: 999, type: "Income", isVoided: true }),
    row({ date: "2026-04-11", amount: 40, type: "Income", cashBankingRole: "bank_deposit" }),
  ];

  const statement = buildFundStatement(funds, rows, april);

  it("gives every fund a row, ordered by type then name", () => {
    expect(statement.rows.map((fund) => fund.fund)).toEqual(["General", "Hall", "Building", "Youth"]);
  });

  it("splits activity into income, expenditure, transfers and other", () => {
    const general = statement.rows[0];
    expect(general).toEqual({
      fundId: "general",
      fund: "General",
      type: "Unrestricted",
      opening: 100,
      income: 200,
      expenditure: 50,
      transfers: -30,
      other: 0,
      closing: 220,
    });
    const building = statement.rows[2];
    expect(building.transfers).toBe(30);
    expect(building.income).toBe(0);
    expect(building.other).toBe(500);
  });

  it("keeps opening + income - expenditure + transfers + other = closing for every row and total", () => {
    const check = (fund: { opening: number; income: number; expenditure: number; transfers: number; other: number; closing: number }) =>
      Math.round((fund.opening + fund.income - fund.expenditure + fund.transfers + fund.other) * 100) / 100;
    for (const fund of [...statement.rows, statement.unrestricted, statement.restricted, statement.total]) {
      expect(check(fund)).toBe(fund.closing);
    }
  });

  it("totals unrestricted (Unrestricted + Designated) and restricted separately", () => {
    expect(statement.unrestricted).toMatchObject({ opening: 100, income: 200, closing: 220 });
    expect(statement.restricted).toMatchObject({ transfers: 30, other: 500, closing: 530 });
    expect(statement.total.closing).toBe(750);
  });
});

describe("buildTrend", () => {
  const buckets: MonthBucket[] = [
    { startDate: "2026-04-01", endDate: "2026-04-30", label: "Apr" },
    { startDate: "2026-05-01", endDate: "2026-05-31", label: "May" },
    { startDate: "2026-06-01", endDate: "2026-06-30", label: "Jun" },
  ];

  it("marks future and partial buckets against throughDate", () => {
    const trend = buildTrend(
      [row({ date: "2026-04-10", amount: 100, type: "Income" }), row({ date: "2026-05-02", amount: 30, type: "Expenditure" })],
      buckets,
      "2026-05-15"
    );
    expect(trend.map((point) => [point.label, point.isFuture, point.isPartial])).toEqual([
      ["Apr", false, false],
      ["May", false, true],
      ["Jun", true, false],
    ]);
    expect(trend[0]).toMatchObject({ income: 100, expenditure: 0, net: 100 });
    expect(trend[1]).toMatchObject({ income: 0, expenditure: 30, net: -30 });
    expect(trend[0]).not.toHaveProperty("priorIncome");
  });

  it("fills priorIncome from the same bucket a year earlier", () => {
    const trend = buildTrend(
      [row({ date: "2026-04-10", amount: 100, type: "Income" })],
      buckets,
      "2026-06-30",
      [row({ date: "2025-04-08", amount: 80, type: "Income" }), row({ date: "2025-05-08", amount: 999, type: "Income", isVoided: true })]
    );
    expect(trend.map((point) => point.priorIncome)).toEqual([80, 0, 0]);
  });

  it("totals only elapsed days in the bucket that holds throughDate", () => {
    const trend = buildTrend(
      [
        row({ date: "2026-10-01", amount: 100, type: "Income" }),
        row({ date: "2026-10-20", amount: 900, type: "Income" }),
        row({ date: "2026-11-02", amount: 50, type: "Income" }),
      ],
      monthBuckets({ startDate: "2026-04-06", endDate: "2027-04-05" }),
      "2026-10-09"
    );
    const byLabel = (label: string) => trend.find((point) => point.label === label);
    expect(byLabel("Oct")).toMatchObject({ isPartial: true, income: 100 });
    expect(byLabel("Nov")).toMatchObject({ isFuture: true, income: 0 });
  });

  it("keeps the full prior-year month for priorIncome even when the current bucket is partial", () => {
    const [october] = buildTrend(
      [row({ date: "2026-10-01", amount: 100, type: "Income" })],
      [{ startDate: "2026-10-01", endDate: "2026-10-31", label: "Oct" }],
      "2026-10-09",
      [row({ date: "2025-10-25", amount: 70, type: "Income" })]
    );
    expect(october).toMatchObject({ income: 100, priorIncome: 70 });
  });

  it("gives February 2025 the whole of February 2024 as its prior year, leap day included", () => {
    const priorRows = [row({ date: "2024-02-29", amount: 100, type: "Income" })];
    const taxYear = buildTrend([], monthBuckets({ startDate: "2024-04-06", endDate: "2025-04-05" }), "2025-04-05", priorRows);
    const calendar = buildTrend([], monthBuckets({ startDate: "2025-01-01", endDate: "2025-12-31" }), "2025-12-31", priorRows);
    expect(taxYear.find((point) => point.label === "Feb")?.priorIncome).toBe(100);
    expect(calendar.find((point) => point.label === "Feb")?.priorIncome).toBe(100);
  });

  it("shifts 29 February back to 28 February for the prior year", () => {
    const [leapBucket] = buildTrend(
      [],
      [{ startDate: "2028-02-01", endDate: "2028-02-29", label: "Feb" }],
      "2028-03-31",
      [row({ date: "2027-02-28", amount: 15, type: "Income" })]
    );
    expect(leapBucket.priorIncome).toBe(15);
  });
});

describe("buildReadiness", () => {
  it("measures rows that reach the bank inside the range", () => {
    const rows = [
      row({ amount: 10, type: "Income", category: "Giving", isReconciled: true }),
      row({ amount: 10, type: "Income", category: "Uncategorized", isReconciled: false }),
      row({ amount: 10, type: "Income", category: "", isReconciled: true }),
      row({ amount: 10, type: "Income", category: "Giving", isJournal: true }),
      row({ amount: 10, type: "Income", category: "Giving", date: "2026-05-01", isReconciled: true }),
    ];
    expect(buildReadiness(rows, april)).toEqual({
      transactionCount: 3,
      categorisedPercent: 33,
      reconciledPercent: 67,
    });
  });

  it("returns null percentages when there are no bank rows", () => {
    expect(buildReadiness([], april)).toEqual({
      transactionCount: 0,
      categorisedPercent: null,
      reconciledPercent: null,
    });
  });
});

describe("groupGivingByDonor", () => {
  it("groups by donor, counts a renamed donor once, and puts anonymous giving last", () => {
    const result = groupGivingByDonor([
      { donorId: "d1", donorName: "Ada", amount: 10, isGiftAidEligible: true },
      { donorId: "d1", donorName: "Ada Mensah", amount: 25, isGiftAidEligible: false },
      { donorName: "Kojo", amount: 5 },
      { amount: 7 },
      { amount: 3, isGiftAidEligible: true },
    ]);
    expect(result.givers).toEqual([
      { donorId: "d1", donor: "Ada Mensah", gifts: 2, total: 35, giftAidEligible: true },
      { donor: "Kojo", gifts: 1, total: 5, giftAidEligible: false },
      { donor: "Anonymous", gifts: 2, total: 10, giftAidEligible: false },
    ]);
    expect(result.donorCount).toBe(2);
    expect(result.giftCount).toBe(5);
  });

  it("omits the anonymous row when every gift has a donor", () => {
    const result = groupGivingByDonor([{ donorId: "d1", donorName: "Ada", amount: 10 }]);
    expect(result.givers.map((giver) => giver.donor)).toEqual(["Ada"]);
    expect(result.donorCount).toBe(1);
  });
});

describe("reserveCover", () => {
  it("divides the balance by the average monthly spend", () => {
    expect(reserveCover(1000, [300, 400])).toEqual({
      months: 2.9,
      unrestrictedBalance: 1000,
      averageMonthlyExpenditure: 350,
      targetMonths: 3,
    });
  });

  it("is null when there is no spending to cover", () => {
    expect(reserveCover(1000, [])).toMatchObject({ months: null, averageMonthlyExpenditure: 0 });
    expect(reserveCover(1000, [0, 0])).toMatchObject({ months: null });
  });
});
