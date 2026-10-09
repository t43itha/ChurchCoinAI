import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import Loans, { EditLoanPanel } from "../components/Loans";
import TransactionManager from "../components/TransactionManager";
import { LinkMovementPanel } from "../components/transactions/LinkMovementModal";
import { formatLocalDateInputValue } from "../lib/dateUtils";
import type { Id } from "../convex/_generated/dataModel";
import type { UserRole } from "../lib/permissions";
import type { Fund, Transaction } from "../types";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => queryMock(...args),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));

// The page filters to the current month by default, so fixtures are dated today.
const today = formatLocalDateInputValue(new Date());
const funds: Fund[] = [
  { _id: "general", name: "General", type: "Unrestricted", balance: 0 },
  { _id: "building", name: "Building", type: "Restricted", balance: 0 },
];
const user = (role: UserRole) => ({ _id: "user", name: "Treasurer", email: "user@example.invalid", role });
const transaction = (overrides: Partial<Transaction>): Transaction => ({
  _id: "tx",
  date: today,
  description: "Transfer to Building",
  amount: 300,
  type: "Expenditure",
  category: "Transfer between funds",
  fundId: "general",
  isReconciled: false,
  movementKind: "transfer",
  ...overrides,
});

const render = (element: ReactElement, route = "/transactions") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] }, element));

function renderManager(role: UserRole, rows: Transaction[], route?: string) {
  queryMock.mockImplementation((reference, args) => {
    if (args === "skip") return undefined;
    if (getFunctionName(reference) === "queries/transactions:list") return rows;
    return [];
  });
  return render(
    createElement(TransactionManager, { currentUser: user(role), funds, pledges: [], categories: [] }),
    route
  );
}

describe("transaction movement actions", () => {
  it("offers Link other side on an unlinked transfer leg to editors only", () => {
    const rows = [transaction({})];
    expect(renderManager("Finance Team", rows)).toContain('aria-label="Link other side"');
    expect(renderManager("Pastorate", rows)).not.toContain('aria-label="Link other side"');
  });

  it("shows Linked and Unlink on a linked transfer leg", () => {
    const rows = [transaction({ movementId: "m1" })];
    const finance = renderManager("Finance Team", rows);
    expect(finance).toContain(">Linked<");
    expect(finance).toContain('aria-label="Unlink"');
    expect(finance).not.toContain('aria-label="Link other side"');
    expect(renderManager("Pastorate", rows)).not.toContain('aria-label="Unlink"');
  });

  it("marks journal legs, hides their void button and offers deleting the transfer to Admin only", () => {
    const rows = [transaction({ movementId: "m2", isJournal: true })];
    const admin = renderManager("Admin", rows);
    expect(admin).toContain(">Journal<");
    expect(admin).toContain('aria-label="Delete transfer"');
    const finance = renderManager("Finance Team", rows);
    expect(finance).toContain(">Journal<");
    expect(finance).not.toContain('aria-label="Delete transfer"');
    expect(finance).not.toContain("Void transaction and exclude");
  });

  it("shows New transfer in the header to editors only", () => {
    expect(renderManager("Finance Team", [])).toContain("New transfer");
    expect(renderManager("Pastorate", [])).not.toContain("New transfer");
  });

  it("shows waiting legs from any month when opened from the dashboard", () => {
    const rows = [transaction({ _id: "old", date: "2024-03-01" })];
    expect(renderManager("Finance Team", rows)).not.toContain('aria-label="Link other side"');
    expect(renderManager("Finance Team", rows, "/transactions?status=awaiting-link")).toContain('aria-label="Link other side"');
  });

  it("starts the status filter from a known ?status= value", () => {
    const rows = [transaction({ _id: "unlinked" }), transaction({ _id: "linked", movementId: "m1" })];
    const html = renderManager("Finance Team", rows, "/transactions?status=awaiting-link");
    expect(html).toContain('aria-label="Link other side"');
    expect(html).not.toContain(">Linked<");
  });
});

describe("LinkMovementPanel", () => {
  const leg = transaction({ _id: "leg" });
  const panel = (transactions: Transaction[]) =>
    render(
      createElement(LinkMovementPanel, {
        transaction: leg,
        transactions,
        funds,
        loans: undefined,
        isSaving: false,
        onLink: vi.fn(),
      })
    );

  it("lists the other fund's matching leg and not a same-fund leg", () => {
    const otherFund = transaction({ _id: "other", type: "Income", fundId: "building", description: "Transfer from General" });
    const sameFund = transaction({ _id: "same", type: "Income", fundId: "general", description: "Same fund income" });
    const html = panel([leg, otherFund, sameFund]);
    expect(html).toContain("Transfer from General");
    expect(html).not.toContain("Same fund income");
  });

  it("explains when no candidate exists", () => {
    const html = panel([leg]);
    expect(html).toContain("No unlinked transfer between funds of £300.00 going the other way within 14 days.");
    expect(html).toContain("Mark the other side with the same category first.");
  });
});

type Loan = ComponentProps<typeof EditLoanPanel>["loan"];
const movementId = (id: string) => id as Id<"movements">;
const transactionId = (id: string) => id as Id<"transactions">;
const loan = (overrides: Partial<Loan>): Loan => ({
  _id: movementId("loan"),
  lender: "Lender",
  note: undefined,
  dueDate: undefined,
  createdAt: 1,
  borrowed: 0,
  repaid: 0,
  outstanding: 0,
  isRepaid: false,
  legs: [],
  ...overrides,
});
const loans: Loan[] = [
  loan({
    _id: movementId("alex"),
    lender: "Alex Sackey",
    borrowed: 1852,
    repaid: 1000,
    outstanding: 852,
    legs: [
      { _id: transactionId("leg-in"), date: "2026-08-03", description: "ALEX SACKEY PAYE LOAN", amount: 1852, type: "Income", isVoided: false },
      { _id: transactionId("leg-out"), date: "2026-09-01", description: "Repayment", amount: 1000, type: "Expenditure", isVoided: true },
    ],
  }),
  loan({ _id: movementId("bank"), lender: "Church Bank", dueDate: "2020-01-01", borrowed: 5000, repaid: 1000, outstanding: 4000 }),
  loan({ _id: movementId("diocese"), lender: "Diocese Fund", borrowed: 500, repaid: 500, outstanding: 0, isRepaid: true }),
];

function renderLoans(role: UserRole, data: Loan[]) {
  queryMock.mockImplementation(() => data);
  return render(createElement(Loans, { currentUser: user(role) }), "/loans");
}

describe("Loans page", () => {
  it("shows each loan with its amounts, status and the totals", () => {
    const html = renderLoans("Finance Team", loans);
    for (const text of [
      "Alex Sackey", "£1,852.00", "£1,000.00", "£852.00",
      "Church Bank", "£5,000.00", "£4,000.00",
      "Diocese Fund", "£500.00",
    ]) expect(html).toContain(text);
    expect(html).toContain(">Open</span>");
    expect(html).toContain(">Overdue</span>");
    expect(html).toContain(">Repaid</span>");
    expect(html).toContain("<tfoot>");
    for (const total of ["£7,352.00", "£2,500.00", "£4,852.00"]) expect(html).toContain(total);
  });

  it("explains how to record a loan when there are none", () => {
    const html = renderLoans("Finance Team", []);
    expect(html).toContain("No loans recorded yet.");
    expect(html).toContain("Mark the money received as Loan in Transactions, then choose Link other side.");
  });

  it("shows the server-redacted lender to a Guest without an edit control", () => {
    const redacted = loans.map((item) => ({ ...item, lender: "Lender hidden" }));
    const html = renderLoans("Guest", redacted);
    expect(html).toContain("Lender hidden");
    expect(html).not.toContain("Alex Sackey");
    expect(html).not.toContain('aria-label="Edit loan"');
    expect(renderLoans("Finance Team", loans)).toContain('aria-label="Edit loan"');
  });

  it("pre-fills the edit form with the loan's details", () => {
    const html = render(createElement(EditLoanPanel, { loan: loans[1], isSaving: false, onSave: vi.fn(), onClose: vi.fn() }));
    expect(html).toContain('value="Church Bank"');
    expect(html).toContain('value="2020-01-01"');
    expect(html).toContain(">Save<");
  });
});
