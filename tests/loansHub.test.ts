import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import Loans from "../components/Loans";
import RecordLoanWizard from "../components/loans/RecordLoanWizard";
import type { UserRole } from "../lib/permissions";
import type { AppUser } from "../types";

// Query results are chosen by which function reference the component asks for.
const fixtures = vi.hoisted(() => ({
  loans: [] as unknown[],
  transactions: [] as unknown[],
}));

vi.mock("convex/react", async () => {
  const { api } = await import("../convex/_generated/api");
  return {
    useQuery: (ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
      if (name === getFunctionName(api.queries.movements.listLoans)) return fixtures.loans;
      if (name === getFunctionName(api.queries.transactions.list)) return fixtures.transactions;
      throw new Error(`Unexpected query: ${name}`);
    },
    useMutation: () => vi.fn(),
  };
});

const user = (role: UserRole): AppUser => ({ _id: "user", name: "Treasurer", email: "user@example.invalid", role });

const loan = (overrides: Record<string, unknown>) => ({
  _id: "loan-alex",
  lender: "Alex Sackey",
  dueDate: undefined,
  note: undefined,
  createdAt: 1,
  borrowed: 1852,
  repaid: 1000,
  outstanding: 852,
  isRepaid: false,
  legs: [],
  ...overrides,
});

const repaymentLeg = {
  _id: "out-1",
  date: "2026-03-05",
  description: "Repayment",
  amount: 1000,
  type: "Expenditure",
  isVoided: false,
};

const loans = [
  loan({ legs: [repaymentLeg] }),
  loan({
    _id: "loan-bank",
    lender: "Church Bank",
    dueDate: "2020-01-01",
    borrowed: 5000,
    repaid: 1000,
    outstanding: 4000,
  }),
  loan({ _id: "loan-diocese", lender: "Diocese Fund", borrowed: 500, repaid: 500, outstanding: 0, isRepaid: true }),
];

const renderLoans = (role: UserRole, data: unknown[] = loans) => {
  fixtures.loans = data;
  return renderToStaticMarkup(createElement(Loans, { currentUser: user(role) }));
};

describe("loans hub", () => {
  it("states what the church still owes in the hero and the header", () => {
    const html = renderLoans("Finance Team");
    expect(html).toContain("Owed by the church");
    expect(html).toContain("2 open · £4,852.00 still owed");
    expect(html).toContain("£4,852.00");
  });

  it("shows each loan's repayment progress and its last repayment", () => {
    const html = renderLoans("Finance Team");
    expect(html).toContain("£1,000.00 repaid of £1,852.00 · last repaid 05/03/2026");
    expect(html).toContain("£1,000.00 repaid of £5,000.00 · no repayments yet · due 01/01/2020");
    expect(html).toContain("width:53.99568034557235%");
  });

  it("offers Record a loan and Edit only to roles that can write the ledger", () => {
    const finance = renderLoans("Finance Team");
    expect(finance).toContain("+ Record a loan");
    expect(finance).toContain('aria-label="Edit loan"');

    const guest = renderLoans("Guest", loans.map((item) => ({ ...(item as object), lender: "Lender hidden" })));
    expect(guest).not.toContain("+ Record a loan");
    expect(guest).not.toContain('aria-label="Edit loan"');
    expect(guest).toContain("Lender hidden");
  });

  it("says so when there are no loans", () => {
    const html = renderLoans("Finance Team", []);
    expect(html).toContain("No loans recorded yet.");
    expect(html).toContain("0 open · £0.00 still owed");
  });
});

describe("record a loan walkthrough", () => {
  it("opens on who lent the money, with the lender field and a disabled next step", () => {
    fixtures.transactions = [];
    const html = renderToStaticMarkup(createElement(RecordLoanWizard, { onClose: vi.fn() }));
    expect(html).toContain("Who lent the money?");
    expect(html).toContain('for="loan-lender"');
    expect(html).toContain("Next: amount →");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Next: amount →/);
  });

  it("names the loan step on the rail", () => {
    const html = renderToStaticMarkup(createElement(RecordLoanWizard, { onClose: vi.fn() }));
    for (const label of ["Who lent it", "Amount received", "Repayments so far"]) expect(html).toContain(label);
  });
});

