import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import TransactionManager from "../components/TransactionManager";
import { longDate } from "../components/cashEntry/format";
import TransactionCompactTable from "../components/transactions/TransactionCompactTable";
import TransactionEditPanel, { editActionsFor } from "../components/transactions/TransactionEditPanel";
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
      row({ _id: "u", category: "" }),
    ]);
    expect(html).toContain("3 this year");
    expect(html).toContain("Everything");
    expect(html).toContain("Giving");
    expect(html).toContain(">Banking<");
    // Only the uncategorised row needs a look; income without a pledge does not.
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

describe("row detail", () => {
  const listProps = (pledges: Pledge[] = []) => ({
    funds,
    pledges,
    selectedIds: new Set<string>(),
    canEdit: true,
    canDeleteTransfer: false,
    onOpen: () => undefined,
    onToggleSelect: () => undefined,
    onLinkOtherSide: () => undefined,
    onUnlink: () => undefined,
    onDeleteTransfer: () => undefined,
  });

  it("shows a reconciled tag, and a category line on phones", () => {
    const html = renderHub("Finance Team", [row({ _id: "r", isReconciled: true, description: "Tithe" })]);
    expect(html).toContain(">Reconciled<");
    expect(html).toContain("mt-1.5 flex sm:hidden");
  });

  it("keeps donor and linked-pledge detail in the compact table", () => {
    const pledge = { _id: "p1", fundId: "building", donorName: "J Okafor", amount: 50, frequency: "Monthly", status: "Active" } as unknown as Pledge;
    const html = renderPanel(
      createElement(TransactionCompactTable, {
        rows: [row({ _id: "c", donorName: "J Okafor", pledgeId: "p1", description: "Standing order" })],
        list: listProps([pledge]),
      })
    );
    expect(html).toContain("Ref J Okafor");
    expect(html).toContain("Linked to Building");
    expect(html).toContain("overflow-x-auto");
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

  it("locks a row in a completed reconciliation: inputs disabled, no save or void, and the reason", () => {
    const html = renderPanel(createElement(TransactionEditPanel, panelProps(row({ isReconciled: true }))));
    expect(html).toContain("This line is in a completed reconciliation. Reopen that reconciliation to change it.");
    expect(html).toMatch(/aria-label="Amount"[^>]*disabled/);
    expect(html).toMatch(/type="text"[^>]*disabled/);
    expect(html).not.toContain("Save changes");
    expect(html).not.toContain("Void transaction");
  });

  it("offers Save and close beside Save · next, each submitting the form", () => {
    const html = renderPanel(
      createElement(TransactionEditPanel, { ...panelProps(row({})), nextTransaction: row({ _id: "next" }) })
    );
    expect(html).toContain("Save · next");
    expect(html).toMatch(/type="submit" value="close"[^>]*>Save and close/);
    expect(html).not.toMatch(/type="button"[^>]*>Save and close/);
  });

  it("is read-only for roles without ledger write access", () => {
    const html = renderPanel(createElement(TransactionEditPanel, panelProps(row({}), false)));
    expect(html).toContain("You can view this entry.");
    expect(html).not.toContain("Save changes");
  });

  it("shows Restore transaction for a voided row to an editor", () => {
    const html = renderPanel(createElement(TransactionEditPanel, panelProps(row({ isVoided: true }))));
    expect(html).toContain("Restore transaction");
    expect(html).not.toContain("Void transaction");
  });
});

describe("edit actions", () => {
  const calls: string[] = [];
  const handlers = {
    onLinkOtherSide: (t: Transaction) => calls.push(`link:${t._id}`),
    onUnlink: (t: Transaction) => calls.push(`unlink:${t._id}`),
    onDeleteTransfer: (t: Transaction) => calls.push(`delete:${t._id}`),
    onVoid: (t: Transaction) => calls.push(`void:${t._id}`),
    onRestore: (t: Transaction) => calls.push(`restore:${t._id}`),
  };
  const editor = { canEdit: true, canDeleteTransfer: false };

  it("restores a voided row through onRestore, with the row it was given", () => {
    const voided = row({ _id: "v", isVoided: true });
    const restore = editActionsFor(voided, editor, handlers).find((action) => action.key === "restore");
    expect(restore?.label).toBe("Restore transaction");
    restore?.run();
    expect(calls).toEqual(["restore:v"]);
  });

  it("offers void, not restore, on a live row", () => {
    const keys = editActionsFor(row({}), editor, handlers).map((action) => action.key);
    expect(keys).toEqual(["void"]);
  });

  it("offers nothing to read-only roles or to rows in a completed reconciliation", () => {
    expect(editActionsFor(row({ isVoided: true }), { canEdit: false, canDeleteTransfer: false }, handlers)).toEqual([]);
    expect(editActionsFor(row({ isReconciled: true, movementId: "m1", movementKind: "transfer" }), editor, handlers)).toEqual([]);
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
