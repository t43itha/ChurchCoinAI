import { describe, expect, it, vi } from "vitest";
import type { QueryCtx } from "../convex/_generated/server";
import * as reports from "../convex/queries/reports";

type Row = Record<string, any>;

// Minimal indexed db: eq / gte / lte index ranges and the isVoided filter the
// report queries use. Handlers run unchanged.
function fixture(records: Record<string, Row[]>) {
  const get = async (id: string) => Object.values(records).flat().find((row) => row._id === id) ?? null;
  const filterApi = {
    field: (name: string) => name,
    neq: (field: string, value: unknown) => (row: Row) => row[field] !== value,
    and: (...predicates: Array<(row: Row) => boolean>) => (row: Row) => predicates.every((p) => p(row)),
  };
  const db = {
    get: vi.fn(get),
    query: vi.fn((table: string) => {
      let rows = [...(records[table] ?? [])];
      const index = {
        eq(field: string, value: unknown) { rows = rows.filter((row) => row[field] === value); return index; },
        gte(field: string, value: string) { rows = rows.filter((row) => row[field] >= value); return index; },
        lte(field: string, value: string) { rows = rows.filter((row) => row[field] <= value); return index; },
      };
      const chain = {
        withIndex: (_name: string, configure: (q: typeof index) => unknown) => { configure(index); return chain; },
        filter: (build: (q: typeof filterApi) => (row: Row) => boolean) => { rows = rows.filter(build(filterApi)); return chain; },
        collect: async () => rows,
        first: async () => rows[0] ?? null,
      };
      return chain;
    }),
  };
  const ctx = {
    db,
    auth: { getUserIdentity: async () => ({ subject: "clerk" }) },
  } as unknown as QueryCtx;
  return ctx;
}

const invoke = (fn: unknown, ctx: QueryCtx, args: Row): Promise<any> =>
  (fn as { _handler: (ctx: QueryCtx, args: Row) => Promise<any> })._handler(ctx, args);

const transaction = (id: string, extra: Row): Row => ({
  _id: id,
  organizationId: "org",
  fundId: "general",
  type: "Income",
  amount: 0,
  category: "Offerings",
  description: id,
  ...extra,
});

function reportRecords(transactions: Row[]): Record<string, Row[]> {
  return {
    users: [{ _id: "user", clerkId: "clerk", organizationId: "org", role: "Admin" }],
    organizations: [{ _id: "org", accessMode: "legacy", reportingPeriod: "tax_year" }],
    funds: [
      { _id: "general", organizationId: "org", name: "General", type: "Unrestricted" },
      { _id: "building", organizationId: "org", name: "Building", type: "Restricted" },
    ],
    categories: [],
    movements: [],
    transactions,
  };
}

describe("annual report for an in-progress tax year", () => {
  const ctx = fixture(
    reportRecords([
      transaction("prior-in-range", { date: "2025-05-01", amount: 100 }),
      transaction("prior-after-elapsed", { date: "2025-11-01", amount: 500 }),
      transaction("current-income", { date: "2026-05-03", amount: 200 }),
      transaction("current-building", { fundId: "building", date: "2026-06-10", amount: 300, category: "Donation" }),
      transaction("current-spend", { type: "Expenditure", date: "2026-07-01", amount: 40, category: "Utilities" }),
    ])
  );

  it("compares the elapsed months against the same months of the prior year", async () => {
    const report = await invoke(reports.annualReportData, ctx, { year: 2026, today: "2026-10-08" });

    expect(report.period).toMatchObject({ label: "2026/27", throughDate: "2026-10-08", isComplete: false });
    expect(report.totals).toEqual({ totalIncome: 500, totalExpenditure: 40, netMovement: 460 });
    expect(report.prior).toMatchObject({
      label: "2025/26 (same months)",
      range: { startDate: "2025-04-06", endDate: "2025-10-08" },
      totals: { income: 100, expenditure: 0, net: 100 },
    });
  });

  it("returns a null prior when the prior span has no reportable rows", async () => {
    const report = await invoke(reports.annualReportData, fixture(reportRecords([])), {
      year: 2026,
      today: "2026-10-08",
    });
    expect(report.prior).toBeNull();
  });
});

describe("fund statement", () => {
  it("closes each fund at its balance and totals to the sum of closings", async () => {
    const ctx = fixture(
      reportRecords([
        transaction("before-year", { date: "2025-11-01", amount: 500 }),
        transaction("current-income", { date: "2026-05-03", amount: 200 }),
        transaction("current-spend", { type: "Expenditure", date: "2026-07-01", amount: 40, category: "Utilities" }),
        transaction("building", { fundId: "building", date: "2026-06-10", amount: 300, category: "Donation" }),
      ])
    );

    const report = await invoke(reports.annualReportData, ctx, { year: 2026, today: "2026-10-08" });
    const byFund = Object.fromEntries(report.fundStatement.rows.map((row: any) => [row.fund, row]));

    expect(byFund.General).toMatchObject({ opening: 500, income: 200, expenditure: 40, closing: 660 });
    expect(byFund.Building).toMatchObject({ opening: 0, income: 300, closing: 300 });
    const sumOfClosings = report.fundStatement.rows.reduce((sum: number, row: any) => sum + row.closing, 0);
    expect(report.fundStatement.total.closing).toBe(sumOfClosings);
    expect(report.fundStatement.total.closing).toBe(960);
  });
});

describe("monthly comparison", () => {
  it("picks December as the previous month when reporting January", async () => {
    const ctx = fixture(
      reportRecords([
        transaction("december", { date: "2025-12-15", amount: 75 }),
        transaction("january-last-year", { date: "2025-01-10", amount: 30 }),
      ])
    );

    const report = await invoke(reports.monthlyReportData, ctx, { year: 2026, month: 0, today: "2026-01-20" });

    expect(report.monthName).toBe("January 2026");
    expect(report.comparison.previousMonth).toMatchObject({
      label: "December 2025",
      range: { startDate: "2025-12-01", endDate: "2025-12-31" },
      totals: { income: 75, expenditure: 0, net: 75 },
    });
    expect(report.comparison.sameMonthLastYear).toMatchObject({
      label: "January 2025",
      range: { startDate: "2025-01-01", endDate: "2025-01-31" },
      totals: { income: 30 },
    });
    expect(report.yearToDate.label).toBe("2025/26");
  });
});
