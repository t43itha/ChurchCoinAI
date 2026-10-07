import { describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import * as transactions from "../convex/mutations/transactions";
import * as categories from "../convex/mutations/categories";
import * as movementMutations from "../convex/mutations/movements";
import * as movementQueries from "../convex/queries/movements";
import { sumFundBalance, type LedgerRow } from "../lib/reportableTransactions";
import type { UserRole } from "../lib/permissions";

type Row = { _id: string } & Record<string, unknown>;
type FilterBuilder = typeof filterBuilder;

const filterBuilder = {
  field: (name: string) => name,
  eq: (field: string, value: unknown) => (row: Row) => row[field] === value,
};

const builtInCategories = (): Row[] => [
  { _id: "cat-transfer", organizationId: "org", name: "Transfer between funds", mainCategory: "Transfers and adjustments", movementKind: "transfer", createdAt: 1 },
  { _id: "cat-reversal", organizationId: "org", name: "Returned payment", mainCategory: "Transfers and adjustments", movementKind: "reversal", createdAt: 1 },
  { _id: "cat-loan", organizationId: "org", name: "Loan", mainCategory: "Transfers and adjustments", movementKind: "loan", createdAt: 1 },
  { _id: "cat-offerings", organizationId: "org", name: "Offerings", transactionType: "Income", createdAt: 1 },
  { _id: "cat-rent", organizationId: "org", name: "Rent", transactionType: "Expenditure", createdAt: 1 },
];

// Run real handlers against an indexed, mutable in-memory database.
function fixture(extra: Record<string, Row[]> = {}, role: UserRole = "Admin") {
  const records: Record<string, Row[]> = {
    users: [{ _id: "user", clerkId: "clerk-user", organizationId: "org", role }],
    organizations: [{ _id: "org", accessMode: "legacy" }],
    funds: [
      { _id: "general", organizationId: "org", name: "General Fund" },
      { _id: "building", organizationId: "org", name: "Building Fund" },
    ],
    categories: builtInCategories(),
    transactions: [],
    movements: [],
    reconciliationSessions: [],
    ...extra,
  };
  const get = (id: string) => Object.values(records).flat().find((row) => row._id === id) ?? null;
  const db = {
    get: vi.fn(async (id: string) => get(id)),
    query: vi.fn((table: string) => {
      let rows = records[table] ?? [];
      const index = {
        eq: (field: string, value: unknown) => {
          rows = rows.filter((row) => row[field] === value);
          return index;
        },
      };
      const chain = {
        withIndex: (_name: string, configure: (q: typeof index) => unknown) => {
          configure(index);
          return chain;
        },
        filter: (build: (q: FilterBuilder) => (row: Row) => boolean) => {
          rows = rows.filter(build(filterBuilder));
          return chain;
        },
        collect: async () => rows,
        first: async () => rows[0] ?? null,
      };
      return chain;
    }),
    patch: vi.fn(async (id: string, value: Record<string, unknown>) => {
      const row = get(id);
      if (!row) throw new Error(`Missing row: ${id}`);
      Object.assign(row, value);
    }),
    insert: vi.fn(async (table: string, value: Record<string, unknown>) => {
      const rows = (records[table] ??= []);
      const id = `new-${table}-${rows.length}`;
      rows.push({ ...value, _id: id });
      return id;
    }),
    delete: vi.fn(async (id: string) => {
      for (const rows of Object.values(records)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index !== -1) rows.splice(index, 1);
      }
    }),
  };
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "clerk-user" }) },
    db,
    scheduler: { runAfter: vi.fn() },
  } as unknown as MutationCtx;
  return { ctx, db, get, records };
}

const invoke = (fn: unknown, ctx: MutationCtx, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: MutationCtx, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

const leg = (id: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", fundId: "general", type: "Income", amount: 100, date: "2026-10-01",
  description: "Row", category: "Offerings", isReconciled: false, ...extra,
});

const transferLeg = (id: string, extra: Record<string, unknown> = {}): Row =>
  leg(id, { category: "Transfer between funds", movementKind: "transfer", movementId: "m1", ...extra });
const transferPair = (): Row[] => [
  transferLeg("out", { type: "Expenditure", amount: 250, fundId: "general" }),
  transferLeg("in", { type: "Income", amount: 250, fundId: "building", date: "2026-10-02" }),
];
const movement = (id: string, kind: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", kind, createdBy: "user", createdAt: 1, ...extra,
});
const loanLeg = (id: string, type: "Income" | "Expenditure", amount: number, extra: Record<string, unknown> = {}) =>
  leg(id, { type, amount, category: "Loan", movementKind: "loan", movementId: "loan", ...extra });

describe("linked transfer legs", () => {
  const linkedFixture = () => fixture({
    movements: [movement("m1", "transfer")],
    transactions: transferPair(),
  });

  it("allows a description-only edit", async () => {
    const { ctx, get } = linkedFixture();
    await invoke(transactions.update, ctx, { transactionId: "out", description: "Moved to building" });
    expect(get("out")).toMatchObject({ description: "Moved to building", movementId: "m1" });
  });

  it("allows a re-sent unchanged value alongside a description edit", async () => {
    const { ctx, get } = linkedFixture();
    await invoke(transactions.update, ctx, {
      transactionId: "out", description: "Moved", amount: 250, type: "Expenditure",
      fundId: "general", category: "Transfer between funds",
    });
    expect(get("out")).toMatchObject({ description: "Moved", movementId: "m1", movementKind: "transfer" });
  });

  it("refuses a new amount", async () => {
    const { ctx, get } = linkedFixture();
    await expect(invoke(transactions.update, ctx, { transactionId: "out", amount: 300 }))
      .rejects.toThrow(/Unlink this transaction/);
    expect(get("out")?.amount).toBe(250);
  });

  it("refuses a new fund", async () => {
    const { ctx, get } = linkedFixture();
    await expect(invoke(transactions.update, ctx, { transactionId: "out", fundId: "building" }))
      .rejects.toThrow(/Unlink this transaction/);
    expect(get("out")?.fundId).toBe("general");
  });

  it("refuses a new type", async () => {
    const { ctx, get } = linkedFixture();
    await expect(invoke(transactions.update, ctx, { transactionId: "out", type: "Income" }))
      .rejects.toThrow(/Unlink this transaction/);
    expect(get("out")?.type).toBe("Expenditure");
  });

  it("refuses a new category that is not the same movement kind", async () => {
    const { ctx, get } = linkedFixture();
    await expect(invoke(transactions.update, ctx, { transactionId: "out", category: "Rent" }))
      .rejects.toThrow(/Unlink this transaction/);
    expect(get("out")).toMatchObject({ category: "Transfer between funds", movementKind: "transfer" });
  });

  it("refuses a bulk fund change", async () => {
    const { ctx, get } = linkedFixture();
    await expect(invoke(transactions.bulkUpdate, ctx, {
      transactionIds: ["out", "in"], updates: { fundId: "building" },
    })).rejects.toThrow(/Unlink this transaction/);
    expect(get("out")?.fundId).toBe("general");
  });
});

describe("voiding or deleting a linked leg", () => {
  it("dissolves a transfer when one leg is voided", async () => {
    const { ctx, get } = fixture({ movements: [movement("m1", "transfer")], transactions: transferPair() });
    await invoke(transactions.voidTransaction, ctx, { transactionId: "out", reason: "Entered twice" });

    expect(get("m1")).toBeNull();
    expect(get("out")).toMatchObject({ isVoided: true });
    expect(get("out")?.movementId).toBeUndefined();
    expect(get("in")?.movementId).toBeUndefined();
  });

  it("keeps a loan when one repayment is voided", async () => {
    const { ctx, get } = fixture({
      movements: [movement("loan", "loan", { lender: "Alex Sackey" })],
      transactions: [
        loanLeg("received", "Income", 1000),
        loanLeg("repay-1", "Expenditure", 400),
        loanLeg("repay-2", "Expenditure", 300),
      ],
    });
    await invoke(transactions.voidTransaction, ctx, { transactionId: "repay-1", reason: "Wrong amount" });

    expect(get("loan")).not.toBeNull();
    expect(get("repay-1")).toMatchObject({ isVoided: true });
    expect(get("repay-1")?.movementId).toBeUndefined();
    expect(get("received")?.movementId).toBe("loan");
    expect(get("repay-2")?.movementId).toBe("loan");
  });

  it("dissolves a loan when the amount received is voided", async () => {
    const { ctx, get } = fixture({
      movements: [movement("loan", "loan", { lender: "Alex Sackey" })],
      transactions: [
        loanLeg("received", "Income", 1000),
        loanLeg("repay-1", "Expenditure", 400),
        loanLeg("repay-2", "Expenditure", 300),
      ],
    });
    await invoke(transactions.voidTransaction, ctx, { transactionId: "received", reason: "Not received" });

    expect(get("loan")).toBeNull();
    expect(["received", "repay-1", "repay-2"].map((id) => get(id)?.movementId)).toEqual([undefined, undefined, undefined]);
  });

  it("refuses to void a leg whose other side is in a completed reconciliation, and changes nothing", async () => {
    const { ctx, get } = fixture({
      movements: [movement("m1", "reversal")],
      reconciliationSessions: [{ _id: "s1", organizationId: "org", fundId: "general", status: "completed" }],
      transactions: [
        leg("ret-in", { type: "Income", category: "Returned payment", movementKind: "reversal", movementId: "m1" }),
        leg("ret-out", {
          type: "Expenditure", category: "Returned payment", movementKind: "reversal", movementId: "m1",
          reconciliationSessionId: "s1",
        }),
      ],
    });
    await expect(invoke(transactions.voidTransaction, ctx, { transactionId: "ret-in", reason: "Duplicate" }))
      .rejects.toThrow(/completed reconciliation/);

    expect(get("m1")).not.toBeNull();
    expect(get("ret-in")).toMatchObject({ movementId: "m1" });
    expect(get("ret-in")?.isVoided).toBeUndefined();
    expect(get("ret-out")).toMatchObject({ movementId: "m1" });
  });

  it("deletes both legs and the movement when a journal leg is deleted", async () => {
    const journal = () => [
      transferLeg("j-out", { type: "Expenditure", amount: 150, fundId: "general", movementId: "j1", isJournal: true }),
      transferLeg("j-in", { type: "Income", amount: 150, fundId: "building", movementId: "j1", isJournal: true }),
    ];
    const { ctx, get } = fixture({ movements: [movement("j1", "transfer")], transactions: journal() });
    await invoke(transactions.remove, ctx, { transactionId: "j-out" });

    expect(get("j-out")).toBeNull();
    expect(get("j-in")).toBeNull();
    expect(get("j1")).toBeNull();
  });

  it("refuses to void a journal leg", async () => {
    const { ctx, get } = fixture({
      movements: [movement("j1", "transfer")],
      transactions: [
        transferLeg("j-out", { type: "Expenditure", amount: 150, fundId: "general", movementId: "j1", isJournal: true }),
        transferLeg("j-in", { type: "Income", amount: 150, fundId: "building", movementId: "j1", isJournal: true }),
      ],
    });
    await expect(invoke(transactions.voidTransaction, ctx, { transactionId: "j-out", reason: "Mistake" }))
      .rejects.toThrow("Delete the transfer between funds instead.");
    expect(get("j1")).not.toBeNull();
    expect(get("j-out")?.isVoided).toBeUndefined();
  });
});

describe("renaming a movement category", () => {
  it("renames a returned payment that a linked leg uses, and the leg follows", async () => {
    const { ctx, get } = fixture({
      movements: [movement("m1", "reversal")],
      transactions: [
        leg("ret-in", { type: "Income", category: "Returned payment", movementKind: "reversal", movementId: "m1" }),
        leg("ret-out", { type: "Expenditure", category: "Returned payment", movementKind: "reversal", movementId: "m1" }),
      ],
    });
    await invoke(categories.rename, ctx, { categoryId: "cat-reversal", newName: "Bounced payment" });

    expect(get("cat-reversal")?.name).toBe("Bounced payment");
    expect(get("ret-in")).toMatchObject({ category: "Bounced payment", movementId: "m1", movementKind: "reversal" });
    expect(get("ret-out")).toMatchObject({ category: "Bounced payment", movementId: "m1", movementKind: "reversal" });
  });
});

const unlinkedTransfer = (id: string, extra: Record<string, unknown> = {}): Row =>
  leg(id, { category: "Transfer between funds", movementKind: "transfer", ...extra });
const unlinkedLoan = (id: string, type: "Income" | "Expenditure", amount: number, extra: Record<string, unknown> = {}): Row =>
  leg(id, { type, amount, category: "Loan", movementKind: "loan", ...extra });
const unlinkedPair = (): Row[] => [
  unlinkedTransfer("out", { type: "Expenditure", amount: 250, fundId: "general" }),
  unlinkedTransfer("in", { type: "Income", amount: 250, fundId: "building", date: "2026-10-02" }),
];

// A refused link must leave both the movements and the transactions untouched.
async function expectLinkRefused(extra: Record<string, Row[]>, args: Record<string, unknown>, message: RegExp) {
  const { ctx, records } = fixture(extra);
  const before = structuredClone({ movements: records.movements, transactions: records.transactions });
  await expect(invoke(movementMutations.link, ctx, args)).rejects.toThrow(message);
  expect({ movements: records.movements, transactions: records.transactions }).toEqual(before);
}

describe("linking movement legs", () => {
  it("links a transfer pair into one movement", async () => {
    const { ctx, get, records } = fixture({ transactions: unlinkedPair() });
    const movementId = await invoke(movementMutations.link, ctx, { transactionIds: ["out", "in"] });

    expect(records.movements).toEqual([
      expect.objectContaining({ _id: movementId, organizationId: "org", kind: "transfer", createdBy: "user" }),
    ]);
    expect(get("out")?.movementId).toBe(movementId);
    expect(get("in")?.movementId).toBe(movementId);
  });

  it("refuses a transfer between the same fund", async () => {
    await expectLinkRefused(
      {
        transactions: [
          unlinkedTransfer("out", { type: "Expenditure", amount: 250, fundId: "general" }),
          unlinkedTransfer("in", { type: "Income", amount: 250, fundId: "general" }),
        ],
      },
      { transactionIds: ["out", "in"] },
      /different funds/
    );
  });

  it("refuses unequal amounts and names both", async () => {
    await expectLinkRefused(
      {
        transactions: [
          unlinkedTransfer("out", { type: "Expenditure", amount: 250, fundId: "general" }),
          unlinkedTransfer("in", { type: "Income", amount: 249.99, fundId: "building" }),
        ],
      },
      { transactionIds: ["out", "in"] },
      /£249\.99.*£250\.00/
    );
  });

  it("refuses a leg that is already linked", async () => {
    await expectLinkRefused(
      {
        movements: [movement("m1", "transfer")],
        transactions: [
          transferLeg("out", { type: "Expenditure", amount: 250, fundId: "general" }),
          unlinkedTransfer("in", { type: "Income", amount: 250, fundId: "building" }),
        ],
      },
      { transactionIds: ["out", "in"] },
      /already linked/
    );
  });

  it("refuses a leg from another organisation", async () => {
    await expectLinkRefused(
      {
        transactions: [
          unlinkedTransfer("out", { type: "Expenditure", amount: 250, fundId: "general" }),
          unlinkedTransfer("in", { type: "Income", amount: 250, fundId: "building", organizationId: "other-org" }),
        ],
      },
      { transactionIds: ["out", "in"] },
      /Transaction not found/
    );
  });

  it("refuses a voided leg", async () => {
    await expectLinkRefused(
      {
        transactions: [
          unlinkedTransfer("out", { type: "Expenditure", amount: 250, fundId: "general" }),
          unlinkedTransfer("in", { type: "Income", amount: 250, fundId: "building", isVoided: true }),
        ],
      },
      { transactionIds: ["out", "in"] },
      /can't be linked/
    );
  });

  it("asks for the lender before recording a loan", async () => {
    await expectLinkRefused(
      { transactions: [unlinkedLoan("received", "Income", 1852)] },
      { transactionIds: ["received"] },
      /Enter who lent the money/
    );
  });

  it("records a loan with its lender, then links repayments up to the amount received", async () => {
    const { ctx, get, records } = fixture({
      transactions: [
        unlinkedLoan("received", "Income", 1852, { date: "2026-08-03" }),
        unlinkedLoan("repay-1", "Expenditure", 400),
        unlinkedLoan("repay-2", "Expenditure", 1500),
      ],
    });
    const loanId = await invoke(movementMutations.link, ctx, {
      transactionIds: ["received"], lender: "Alex Sackey", dueDate: "2026-12-31",
    });

    expect(records.movements).toEqual([
      expect.objectContaining({ _id: loanId, kind: "loan", lender: "Alex Sackey", dueDate: "2026-12-31" }),
    ]);
    expect(get("received")?.movementId).toBe(loanId);

    await invoke(movementMutations.link, ctx, { transactionIds: ["repay-1"], movementId: loanId });
    expect(get("repay-1")?.movementId).toBe(loanId);

    await expect(invoke(movementMutations.link, ctx, { transactionIds: ["repay-2"], movementId: loanId }))
      .rejects.toThrow(/can't be more than the amount received/);
    expect(get("repay-2")?.movementId).toBeUndefined();
  });
});

describe("unlinking a movement leg", () => {
  it("clears both sides of a transfer and deletes the movement", async () => {
    const { ctx, get } = fixture({ movements: [movement("m1", "transfer")], transactions: transferPair() });
    await invoke(movementMutations.unlink, ctx, { transactionId: "out" });

    expect(get("m1")).toBeNull();
    expect(get("out")?.movementId).toBeUndefined();
    expect(get("in")?.movementId).toBeUndefined();
  });
});

describe("journal transfers", () => {
  it("refuses the same fund on both sides", async () => {
    const { ctx, records } = fixture();
    await expect(invoke(movementMutations.createJournalTransfer, ctx, {
      fromFundId: "general", toFundId: "general", amount: 150, date: "2026-10-03",
    })).rejects.toThrow("Choose two different funds.");

    expect(records.movements).toHaveLength(0);
    expect(records.transactions).toHaveLength(0);
  });

  it("writes a linked pair of journal legs that move the fund balances", async () => {
    const { ctx, records } = fixture();
    const movementId = await invoke(movementMutations.createJournalTransfer, ctx, {
      fromFundId: "general", toFundId: "building", amount: 150, date: "2026-10-03", note: "Building project",
    });
    const legs = records.transactions;
    const inFund = (fundId: string) => legs.filter((leg) => leg.fundId === fundId) as unknown as LedgerRow[];

    expect(records.movements).toEqual([expect.objectContaining({ _id: movementId, kind: "transfer" })]);
    expect(legs).toHaveLength(2);
    expect(legs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Expenditure", fundId: "general", amount: 150, movementId, isJournal: true,
        movementKind: "transfer", category: "Transfer between funds", description: "Transfer to Building Fund",
      }),
      expect.objectContaining({
        type: "Income", fundId: "building", amount: 150, movementId, isJournal: true,
        movementKind: "transfer", description: "Transfer from General Fund",
      }),
    ]));
    expect(sumFundBalance(inFund("general"))).toBe(-150);
    expect(sumFundBalance(inFund("building"))).toBe(150);
  });

  it("lets only Admin delete a journal transfer", async () => {
    const journal = (role: UserRole) => fixture({
      movements: [movement("j1", "transfer")],
      transactions: [
        transferLeg("j-out", { type: "Expenditure", amount: 150, fundId: "general", movementId: "j1", isJournal: true }),
        transferLeg("j-in", { type: "Income", amount: 150, fundId: "building", movementId: "j1", isJournal: true }),
      ],
    }, role);

    const financeTeam = journal("Finance Team");
    await expect(invoke(movementMutations.deleteJournalTransfer, financeTeam.ctx, { transactionId: "j-out" }))
      .rejects.toThrow(/requires ledger\.delete/);
    expect(financeTeam.get("j1")).not.toBeNull();

    const admin = journal("Admin");
    await invoke(movementMutations.deleteJournalTransfer, admin.ctx, { transactionId: "j-out" });
    expect(admin.get("j1")).toBeNull();
    expect(admin.get("j-out")).toBeNull();
    expect(admin.get("j-in")).toBeNull();
  });
});

describe("loan register", () => {
  const loanFixture = (role: UserRole = "Admin", repayment = 400) => fixture({
    movements: [movement("loan", "loan", { lender: "Alex Sackey", dueDate: "2027-01-01", createdAt: 5 })],
    transactions: [
      loanLeg("received", "Income", 1852, { date: "2026-08-03", description: "ALEX SACKEY PAYE LOAN" }),
      loanLeg("repay-1", "Expenditure", repayment),
    ],
  }, role);

  it("summarises what is borrowed, repaid and outstanding", async () => {
    const { ctx } = loanFixture();
    const [loan] = (await invoke(movementQueries.listLoans, ctx, {})) as Array<Record<string, unknown>>;

    expect(loan).toMatchObject({
      _id: "loan", lender: "Alex Sackey", dueDate: "2027-01-01",
      borrowed: 1852, repaid: 400, outstanding: 1452, isRepaid: false,
    });
    expect(loan.legs).toHaveLength(2);
  });

  it("marks a loan repaid once repayments reach the amount received", async () => {
    const { ctx } = loanFixture("Admin", 1852);
    const [loan] = (await invoke(movementQueries.listLoans, ctx, {})) as Array<Record<string, unknown>>;

    expect(loan).toMatchObject({ outstanding: 0, isRepaid: true });
  });

  it("hides the lender from a Guest", async () => {
    const { ctx } = loanFixture("Guest");
    const [loan] = (await invoke(movementQueries.listLoans, ctx, {})) as Array<Record<string, unknown>>;

    expect(loan.lender).toBe("Lender hidden");
  });
});
