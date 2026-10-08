import { describe, expect, it } from "vitest";
import { buildMonthEndChecks } from "../lib/dashboardChecks";
import { buildExecutiveDashboardSummary } from "../lib/dashboardKpis";

const summary = buildExecutiveDashboardSummary({
  periodKey: "previousMonth",
  now: new Date("2026-06-08T12:00:00Z"),
  funds: [
    { _id: "general", name: "General Fund", type: "Unrestricted" },
    { _id: "youth", name: "Youth Fund", type: "Restricted" },
  ],
  transactions: [
    {
      _id: "gift",
      date: "2026-05-03",
      amount: 400,
      type: "Income",
      category: "Offerings",
      fundId: "general",
      isReconciled: true,
      isGiftAidEligible: true,
    },
    {
      _id: "trip",
      date: "2026-05-10",
      amount: 150,
      type: "Expenditure",
      category: "Travel",
      fundId: "youth",
      isReconciled: false,
    },
  ],
  donors: [],
  pledges: [],
  cashCollections: [],
  cashReconciliations: [],
  statementSessions: [],
  bankAccountFundIds: [],
});

describe("month-end checks", () => {
  it("omits Gift Aid when the church disables it", () => {
    const disabled = { ...summary, readiness: { ...summary.readiness, giftAidClaimable: null } };
    expect(buildMonthEndChecks(disabled, { role: "Admin", bankFeedIssues: 0 }).map(check => check.id))
      .not.toContain("gift-aid");
  });
  it("ranks problems before opportunities before clear controls", () => {
    const checks = buildMonthEndChecks(summary, { role: "Admin", bankFeedIssues: 1 });

    expect(checks.map((check) => [check.id, check.status])).toEqual([
      ["bank-feeds", "critical"],
      ["overdrawn-funds", "critical"],
      ["reconciled", "attention"],
      ["unreconciled-spend", "attention"],
      ["gift-aid", "info"],
      ["mission-tithe", "info"],
      ["categorised", "clear"],
      ["cash-banking", "clear"],
    ]);
    expect(checks.find((check) => check.id === "overdrawn-funds")?.detail).toBe("Youth Fund");
  });

  it("only links to pages the role can open", () => {
    const links = (role: "Admin" | "Guest") =>
      Object.fromEntries(
        buildMonthEndChecks(summary, { role, bankFeedIssues: 1 }).map((check) => [check.id, check.href])
      );

    expect(links("Admin")).toMatchObject({ "bank-feeds": "/settings?tab=bank", "gift-aid": "/reports" });
    expect(links("Guest")).toMatchObject({ "bank-feeds": undefined, "gift-aid": undefined, reconciled: "/transactions" });
  });
});

describe("unpaired transfers check", () => {
  const withUnlinked = (count: number) => ({
    ...summary,
    readiness: { ...summary.readiness, unlinkedMovementLegs: count },
  });

  it("asks for attention when transfers have one side recorded", () => {
    expect(buildMonthEndChecks(withUnlinked(2), { role: "Admin", bankFeedIssues: 0 }).find((check) => check.id === "unlinked-movements"))
      .toMatchObject({ value: "2", status: "attention", href: "/transactions?status=awaiting-link" });
  });

  it("stays hidden when every transfer is paired", () => {
    expect(buildMonthEndChecks(withUnlinked(0), { role: "Admin", bankFeedIssues: 0 }).map((check) => check.id))
      .not.toContain("unlinked-movements");
  });
});

describe("possible double count check", () => {
  const withDoubleCount = (months: string[]) => ({
    ...summary,
    readiness: { ...summary.readiness, possibleDoubleCountMonths: months },
  });

  it("asks for attention with the flagged months named", () => {
    expect(
      buildMonthEndChecks(withDoubleCount(["2025-12", "2026-02"]), { role: "Admin", bankFeedIssues: 0 }).find(
        (check) => check.id === "possible-double-count"
      )
    ).toMatchObject({
      value: "2",
      status: "attention",
      href: "/transactions?view=cash-banking",
      detail: expect.stringContaining("Dec 2025, Feb 2026"),
    });
  });

  it("stays hidden when no month is flagged", () => {
    expect(buildMonthEndChecks(withDoubleCount([]), { role: "Admin", bankFeedIssues: 0 }).map((check) => check.id))
      .not.toContain("possible-double-count");
  });
});
