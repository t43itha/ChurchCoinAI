import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import TransactionManager from "../components/TransactionManager";
import { LinkMovementPanel } from "../components/transactions/LinkMovementModal";
import { formatLocalDateInputValue } from "../lib/dateUtils";
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
        onClose: vi.fn(),
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
