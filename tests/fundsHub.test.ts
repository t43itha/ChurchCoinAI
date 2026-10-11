import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FundManager from "../components/FundManager";
import FundSheet, { type SpendBreakdown } from "../components/funds/FundSheet";
import {
  averageMonthlySpend,
  balanceSplit,
  monthMovementByFund,
  monthSpendByFund,
  monthsCovered,
} from "../components/funds/fundFacts";
import { formatLocalDateInputValue } from "../lib/dateUtils";
import { can, type UserRole } from "../lib/permissions";
import { FundType, TransactionType, type AppUser, type Fund, type Transaction } from "../types";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));

const today = formatLocalDateInputValue(new Date());
const thisMonth = today.slice(0, 7);
// The complete month before this one, dated mid-month so it is in it whatever the clock says.
const lastMonth = (() => {
  const date = new Date();
  date.setDate(10);
  date.setMonth(date.getMonth() - 1);
  return formatLocalDateInputValue(date);
})();

const funds: Fund[] = [
  { _id: "general", name: "General Fund", type: FundType.UNRESTRICTED, balance: 31020.15 },
  { _id: "youth", name: "Youth", type: FundType.UNRESTRICTED, balance: -214.6 },
  { _id: "roof", name: "Roof appeal", type: FundType.RESTRICTED, balance: 38200, targetAmount: 60000 },
  { _id: "missions", name: "Missions", type: FundType.DESIGNATED, balance: 12060 },
];

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  _id: "tx",
  date: today,
  description: "Offering",
  amount: 100,
  type: TransactionType.INCOME,
  category: "Offerings",
  fundId: "general",
  isReconciled: false,
  ...overrides,
});

const user = (role: UserRole): AppUser => ({ _id: "user", name: "Treasurer", email: "user@example.invalid", role });

const render = (role: UserRole, transactions: Transaction[] = []) =>
  renderToStaticMarkup(
    createElement(FundManager, {
      funds,
      transactions,
      categories: [],
      currentUser: user(role),
      onViewLedger: vi.fn(),
      onAddFund: vi.fn(),
      onUpdateFund: vi.fn(),
      onRemoveFund: vi.fn(),
    })
  );

const spend: SpendBreakdown = { label: "Top categories · All time", rows: [{ name: "Repairs", value: 340 }] };

const renderSheet = (role: UserRole, fund: Fund) =>
  renderToStaticMarkup(
    createElement(FundSheet, {
      fund,
      funds,
      transactions: [],
      spend,
      canEdit: can(role, "funds.write"),
      canDelete: can(role, "funds.delete"),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onViewLedger: vi.fn(),
      onClose: vi.fn(),
    })
  );

describe("funds hub", () => {
  it("splits the hero by restriction type in plain words, and only for types that exist", () => {
    const html = render("Finance Team");
    expect(html).toContain("Held across 4 funds");
    expect(html).toContain("£81,066");
    expect(html).toContain("Free to spend");
    expect(html).toContain("Set aside by trustees");
    expect(html).toContain("Restricted by givers");
    expect(html).not.toContain("Endowment");
  });

  it("gives an overdrawn fund an amber ring, a red balance and a link into the transfer walkthrough", () => {
    const html = render("Finance Team");
    expect(html).toContain("ring-amber");
    expect(html).toContain("−£214.60");
    expect(html).toContain("Move money to cover it");
    expect(render("Pastorate")).not.toContain("Move money to cover it");
  });

  it("offers Move money and New fund only to roles that can write funds", () => {
    for (const role of ["Admin", "Finance Team"] as const) {
      const html = render(role);
      expect(html).toContain("Move money");
      expect(html).toContain("+ New fund");
    }
    for (const role of ["Pastorate", "Guest"] as const) {
      const html = render(role);
      expect(html).not.toContain("Move money");
      expect(html).not.toContain("+ New fund");
    }
  });

  it("shows each card's balance, this month's movement and its one helpful fact", () => {
    const html = render("Finance Team", [
      transaction({ _id: "gift", amount: 500 }),
      transaction({ _id: "spend-now", amount: 200, type: TransactionType.EXPENDITURE, category: "Repairs" }),
      transaction({ _id: "spend-last", date: lastMonth, amount: 300, type: TransactionType.EXPENDITURE, category: "Repairs" }),
    ]);
    expect(html).toContain("£31,020.15");
    expect(html).toContain("+£300.00 this month");
    // Last month's 300 is the only complete month of spending, so the balance covers 103.4 of them.
    expect(html).toContain("covers 103.4 months");
    expect(html).toContain("64% of £60,000");
  });

  it("opens fund detail with edit and delete only where the role allows them", () => {
    const general = funds[0];
    const admin = renderSheet("Admin", general);
    expect(admin).toContain("Edit fund");
    expect(admin).toContain("Delete fund");

    const finance = renderSheet("Finance Team", general);
    expect(finance).toContain("Edit fund");
    expect(finance).not.toContain("Delete fund");

    const pastorate = renderSheet("Pastorate", general);
    expect(pastorate).not.toContain("Edit fund");
    expect(pastorate).not.toContain("Delete fund");
  });

  it("keeps General Fund spending and capital allocation in unrestricted fund sheets only", () => {
    const unrestricted = renderSheet("Admin", funds[0]);
    expect(unrestricted).toContain("General Fund expenditure");
    expect(unrestricted).toContain("Capital allocation");
    expect(unrestricted).toContain("Repairs");

    const restricted = renderSheet("Admin", funds[2]);
    expect(restricted).not.toContain("General Fund expenditure");
    expect(restricted).not.toContain("Capital allocation");
  });
});

describe("fund facts", () => {
  it("lists balances only for restriction types that have funds", () => {
    expect(balanceSplit(funds).map((segment) => segment.type)).toEqual([
      FundType.UNRESTRICTED,
      FundType.DESIGNATED,
      FundType.RESTRICTED,
    ]);
  });

  it("counts quiet months as zero when averaging spend", () => {
    const expenditure = [{ fundId: "general", date: "2026-06-03", type: TransactionType.EXPENDITURE, amount: 600 }];
    // June, July and August are complete. July and August had no spending, so the average is 600 / 3.
    expect(averageMonthlySpend(expenditure, "2026-09-09")).toBe(200);
    expect(averageMonthlySpend([], today)).toBeNull();
  });

  it("only reports months covered for a positive balance with spending to measure against", () => {
    expect(monthsCovered(-50, 100)).toBeNull();
    expect(monthsCovered(500, null)).toBeNull();
    expect(monthsCovered(500, 100)).toBe(5);
  });

  it("signs movement by income and expenditure within the month", () => {
    const rows = [
      { fundId: "general", date: `${thisMonth}-01`, type: TransactionType.INCOME, amount: 500 },
      { fundId: "general", date: `${thisMonth}-02`, type: TransactionType.EXPENDITURE, amount: 200 },
      { fundId: "youth", date: "2026-01-01", type: TransactionType.INCOME, amount: 10 },
    ];
    expect(monthMovementByFund(rows, thisMonth)).toEqual({ general: 300 });
    expect(monthSpendByFund(rows, thisMonth)).toEqual({ general: 200 });
  });
});
