import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import TransactionManager from "../components/TransactionManager";
import { longDate } from "../components/cashEntry/format";
import TransactionEditPanel from "../components/transactions/TransactionEditPanel";
import { formatLocalDateInputValue } from "../lib/dateUtils";
import type { UserRole } from "../lib/permissions";
import type { Fund, Pledge, Transaction } from "../types";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => queryMock(...args),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));

// The hub opens on the current month, so fixtures are dated today.
const today = formatLocalDateInputValue(new Date());
const funds: Fund[] = [
  { _id: "general", name: "General", type: "Unrestricted", balance: 0 },
  { _id: "building", name: "Building", type: "Restricted", balance: 0 },
];
const user = (role: UserRole) => ({ _id: "user", name: "Treasurer", email: "user@example.invalid", role });
const row = (overrides: Partial<Transaction>): Transaction => ({
  _id: "tx",
  date: today,
  description: "Sunday collection",
  amount: 100,
  type: "Income",
  category: "Offerings",
  fundId: "general",
  isReconciled: false,
  ...overrides,
});

function renderHub(role: UserRole, rows: Transaction[]) {
  queryMock.mockImplementation((reference, args) => {
    if (args === "skip") return undefined;
    if (getFunctionName(reference) === "queries/transactions:list") return rows;
    return [];
  });
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/transactions"] },
      createElement(TransactionManager, { currentUser: user(role), funds, pledges: [], categories: [] })
    )
  );
}

const renderPanel = (element: ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element));

const panelProps = (transaction: Transaction, canEdit = true) => ({
  transaction,
  funds,
  pledges: [] as Pledge[],
  categoryNamesFor: () => ["Offerings", "Repairs"],
  giftAidEnabled: false,
  canEdit,
  canDeleteTransfer: false,
  onSave: async () => undefined,
  onClose: () => undefined,
  onVoid: () => undefined,
  onRestore: () => undefined,
  onLinkOtherSide: () => undefined,
  onUnlink: () => undefined,
  onDeleteTransfer: () => undefined,
});

describe("transactions hub header and segments", () => {
  it("counts this year's live rows and shows the four views to bank users", () => {
    const html = renderHub("Finance Team", [
      row({ _id: "a" }),
      row({ _id: "b", amount: 40, type: "Expenditure", category: "Repairs" }),
      row({ _id: "v", isVoided: true }),
    ]);
    expect(html).toContain("2 this year");
    expect(html).toContain("Everything");
    expect(html).toContain("Giving");
    expect(html).toContain(">Banking<");
    // The unpledged income row needs a look, as "Unlinked income" does.
    expect(html).toMatch(/Needs you<span[^>]*>1<\/span>/);
    expect(html).toContain(">Add<");
    expect(html).toContain(">Reconcile<");
  });

  it("hides the banking view and the reconcile action from roles without reconciliation", () => {
    const html = renderHub("Pastorate", [row({})]);
    expect(html).not.toContain(">Banking<");
    expect(html).not.toContain(">Reconcile<");
    expect(html).not.toContain(">Add<");
  });
});

describe("day grouping", () => {
  it("heads each day with its date and net, leaving voided rows out", () => {
    const html = renderHub("Admin", [
      row({ _id: "in", amount: 100, type: "Income" }),
      row({ _id: "out", amount: 40, type: "Expenditure", category: "Repairs", description: "Boiler service" }),
      row({ _id: "void", amount: 999, isVoided: true, description: "Duplicate" }),
    ]);
    expect(html).toContain(longDate(today));
    expect(html).toContain("Net ");
    expect(html).toContain("+£60.00");
    expect(html).toContain("Boiler service");
    expect(html).toContain(">Voided<");
  });

  it("offers the compact table on desktop only, for editors", () => {
    const html = renderHub("Finance Team", [row({})]);
    expect(html).toContain("Compact view");
    expect(html).toContain("hidden !w-auto px-4 md:inline-flex");
  });
});

describe("needs you", () => {
  it("prompts for uncategorised lines and marks them to pick a category", () => {
    const html = renderHub("Finance Team", [
      row({ _id: "a", category: "" }),
      row({ _id: "b", category: "" }),
      row({ _id: "c", pledgeId: "p1" }),
    ]);
    expect(html).toContain("2 lines need a category");
    expect(html).toContain(">Start<");
    expect(html).toContain("Pick a category");
    expect(html).toMatch(/Needs you<span[^>]*>2<\/span>/);
  });

  it("does not offer categorising to read-only roles", () => {
    const html = renderHub("Guest", [row({ category: "" })]);
    expect(html).not.toContain("need a category");
    expect(html).toContain("Read only");
  });
});

describe("edit panel", () => {
  it("explains why a linked row cannot change its amount, direction, fund or category", () => {
    const html = renderPanel(
      createElement(TransactionEditPanel, panelProps(row({ movementId: "m1", movementKind: "transfer" })))
    );
    expect(html).toContain("Linked to its other side. Unlink to change the amount, direction, fund or category.");
    expect(html).toMatch(/aria-label="Amount"[^>]*disabled/);
  });

  it("says a reconciled row is locked by a completed reconciliation, and shows a refused save", () => {
    const transaction = row({ isReconciled: true });
    const html = renderPanel(createElement(TransactionEditPanel, panelProps(transaction)));
    expect(html).toContain("Ticked in a bank reconciliation");
    expect(html).toContain("Save changes");
  });

  it("is read-only for roles without ledger write access", () => {
    const html = renderPanel(createElement(TransactionEditPanel, panelProps(row({}), false)));
    expect(html).toContain("You can view this entry.");
    expect(html).not.toContain("Save changes");
  });
});

describe("Guest redaction", () => {
  it("shows the neutral description the server sends and no donor reference", () => {
    // The server blanks donorName and void reasons for readers without donors.read.
    const html = renderHub("Guest", [row({ description: "Donation", donorName: "", isVoided: true })]);
    expect(html).toContain("Donation");
    expect(html).not.toContain("Ref ");
    expect(html).not.toContain(">Add<");
  });
});
