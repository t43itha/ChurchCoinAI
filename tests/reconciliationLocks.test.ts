import { describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import * as pledges from "../convex/mutations/pledges";
import { deleteCollection, markAsBanked, replaceCollectionEntries } from "../convex/mutations/cashCollections";
import * as cashBanking from "../convex/mutations/cashBankingReconciliations";
import * as bankSessions from "../convex/mutations/reconciliationSessions";
import { deleteTransaction, getCompletedReconciliationLock, patchTransaction } from "../convex/lib/transactionWrites";

type Row = { _id: string } & Record<string, unknown>;

// Run real handlers and auth with an indexed, mutable in-memory database.
function fixture(extra: Record<string, Row[]> = {}) {
  const records: Record<string, Row[]> = {
    users: [{ _id: "user", clerkId: "clerk-user", organizationId: "org", role: "Admin" }],
    organizations: [{ _id: "org", accessMode: "legacy" }],
    funds: [{ _id: "fund", organizationId: "org" }],
    transactions: [],
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
      const rows = records[table] ??= [];
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
  } as unknown as MutationCtx;
  return { ctx, db, get, records };
}

const invoke = (fn: unknown, ctx: MutationCtx, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: MutationCtx, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

const transaction = (id: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", fundId: "fund", type: "Income", amount: 100,
  category: "Offerings", isReconciled: false, ...extra,
});
const pledge = (id: string, createdAt: number): Row => ({
  _id: id, organizationId: "org", donorId: "donor", fundId: "fund", amount: 100, createdAt,
});
const session = (status = "completed"): Row => ({
  _id: "session", organizationId: "org", fundId: "fund", status,
  statementOpeningBalance: 0, statementClosingBalance: 100,
});
const lockCases = [
  { name: "bank session", fields: { reconciliationSessionId: "session" } },
  { name: "cash banking", fields: { cashBankingReconciliationId: "cash" } },
];

describe.each(lockCases)("pledges and collections locked by $name", ({ fields }) => {
  function lockedFixture() {
    return fixture({
      reconciliationSessions: [session()],
      cashBankingReconciliations: [{ _id: "cash", organizationId: "org", status: "completed", cashCollectionSplits: [] }],
      pledges: [pledge("oldest", 1), pledge("locked", 2), pledge("unlocked", 3)],
      cashCollections: [{ _id: "collection", organizationId: "org", status: "submitted" }],
      transactions: [
        transaction("first", { pledgeId: "locked", cashCollectionId: "collection" }),
        transaction("locked-tx", { pledgeId: "locked", cashCollectionId: "collection", ...fields }),
        transaction("unlocked-tx", { pledgeId: "unlocked" }),
      ],
    });
  }

  it("rejects locked pledge removal before unlinking any transaction", async () => {
    const { ctx, db, get } = lockedFixture();
    await expect(invoke(pledges.remove, ctx, { pledgeId: "locked" })).rejects.toThrow(/Reopen that reconciliation/);
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(get("first")?.pledgeId).toBe("locked");
    expect(get("locked")).not.toBeNull();
  });

  it("skips the whole locked duplicate and reports it while deleting unlocked duplicates", async () => {
    const { ctx, get } = lockedFixture();
    await expect(invoke(pledges.cleanupDuplicates, ctx, { organizationId: "org" })).resolves.toEqual({
      duplicatesDeleted: 1, duplicatesSkipped: 1, deletedIds: ["unlocked"],
    });
    expect(get("oldest")).not.toBeNull();
    expect(get("locked")).not.toBeNull();
    expect(get("first")?.pledgeId).toBe("locked");
    expect(get("locked-tx")?.pledgeId).toBe("locked");
    expect(get("unlocked")).toBeNull();
    expect(get("unlocked-tx")?.pledgeId).toBeNull();
  });

  it("rejects markAsBanked before changing the collection or transactions", async () => {
    const { ctx, db, get } = lockedFixture();
    await expect(invoke(markAsBanked, ctx, {
      cashCollectionId: "collection", bankedDate: "2026-10-05",
    })).rejects.toThrow(/Reopen that reconciliation/);
    expect(db.patch).not.toHaveBeenCalled();
    expect(get("collection")?.status).toBe("submitted");
    expect(get("first")?.isReconciled).toBe(false);
  });

  it("allows pledge removal and banking after the reconciliation is reopened", async () => {
    const { ctx, get } = lockedFixture();
    get("session")!.status = "reopened";
    get("cash")!.status = "reopened";
    await invoke(pledges.remove, ctx, { pledgeId: "locked" });
    expect(get("locked")).toBeNull();
    expect(get("locked-tx")?.pledgeId).toBeNull();
    await invoke(markAsBanked, ctx, { cashCollectionId: "collection", bankedDate: "2026-10-05" });
    expect(get("collection")?.status).toBe("banked");
    expect(get("locked-tx")?.isReconciled).toBe(true);
  });
});

function cashReconciliation(id: string, amount: number, status = "draft"): Row {
  return {
    _id: id, organizationId: "org", status, updatedAt: 1,
    cashCollectionIds: ["collection"],
    cashCollectionSplits: [{ cashCollectionId: "collection", cashAmount: amount, chequeAmount: 0 }],
    bankTransactionIds: [`deposit-${id}`],
    bankTransactionSplits: [{ transactionId: `deposit-${id}`, medium: "cash", cashAmount: amount, chequeAmount: 0 }],
    expectedCashAmount: amount, expectedChequeAmount: 0, expectedTotal: amount,
    bankedCashAmount: amount, bankedChequeAmount: 0, bankedTotal: amount, varianceAmount: 0,
  };
}

function bankingFixture() {
  return fixture({
    reconciliationSessions: [session("draft")],
    cashCollections: [{ _id: "collection", organizationId: "org", status: "submitted" }],
    cashBankingReconciliations: [cashReconciliation("A", 60), cashReconciliation("B", 40)],
    transactions: [
      transaction("source", { cashCollectionId: "collection", paymentMethod: "Cash" }),
      transaction("deposit-A", { amount: 60 }),
      transaction("deposit-B", { amount: 40 }),
    ],
  });
}

describe("cash banking reconciliation ownership", () => {
  it.each([["A", "B"], ["B", "A"]])("keeps giving locked after reopening %s and unlocks after reopening %s", async (first, second) => {
    const { ctx, get, db } = bankingFixture();
    await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    await invoke(cashBanking.complete, ctx, { reconciliationId: "B" });
    await invoke(cashBanking.reopen, ctx, { reconciliationId: first, reason: "Correction" });
    expect(get(first)?.status).toBe("reopened");
    expect(get(second)).toMatchObject({ status: "completed", varianceAmount: 0 });
    expect(get("collection")).toMatchObject({ cashBankingStatus: "partially_banked", cashBankingLastReconciliationId: second });
    await expect(getCompletedReconciliationLock(ctx, {
      organizationId: "org" as Id<"organizations">,
      cashCollectionId: "collection" as Id<"cashCollections">,
    })).resolves.toBe("cash");

    db.patch.mockClear();
    db.delete.mockClear();
    await expect(patchTransaction(ctx, "source" as Id<"transactions">, { amount: 99 }))
      .rejects.toThrow("completed cash banking reconciliation");
    await expect(deleteTransaction(ctx, "source" as Id<"transactions">))
      .rejects.toThrow("completed cash banking reconciliation");
    await expect(invoke(markAsBanked, ctx, { cashCollectionId: "collection", bankedDate: "2026-10-05" }))
      .rejects.toThrow("completed cash banking reconciliation");
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(get("source")?.amount).toBe(100);

    await invoke(cashBanking.reopen, ctx, { reconciliationId: second, reason: "Correction" });
    expect(get("source")?.cashBankingReconciliationId).toBeUndefined();
    expect(get("source")?.cashBankingRole).toBeUndefined();
    expect(get("collection")).toMatchObject({ cashBankingStatus: "not_started", cashBankingLastReconciliationId: undefined });
    await expect(getCompletedReconciliationLock(ctx, {
      organizationId: "org" as Id<"organizations">,
      cashCollectionId: "collection" as Id<"cashCollections">,
    })).resolves.toBeNull();
    await patchTransaction(ctx, "source" as Id<"transactions">, { amount: 99 });
    expect(get("source")?.amount).toBe(99);
    await invoke(replaceCollectionEntries, ctx, {
      cashCollectionId: "collection", weekEndingDate: "2026-10-05", collectionDate: "2026-10-05", status: "submitted",
      serviceRows: [{ serviceDate: "2026-10-05", serviceNote: "Service", fundId: "fund", cash: 100, pdq: 0, cheque: 0 }],
    });
    expect(get("source")).toBeNull();
    await expect(invoke(deleteCollection, ctx, { cashCollectionId: "collection" }))
      .resolves.toEqual({ deletedTransactions: 1 });
    expect(get("collection")).toBeNull();
  });

  it.each(["replace", "delete", "markAsBanked"])("blocks collection %s despite cleared row ownership and stale banking flags", async (operation) => {
    const { ctx, get, db } = bankingFixture();
    await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    await invoke(cashBanking.complete, ctx, { reconciliationId: "B" });
    await invoke(cashBanking.reopen, ctx, { reconciliationId: "A", reason: "Correction" });
    expect(get("source")?.cashBankingReconciliationId).toBeUndefined();
    Object.assign(get("collection")!, { cashBankingStatus: "not_started", cashBankingLastReconciliationId: undefined });
    const before = structuredClone(get("collection"));
    db.patch.mockClear();
    db.delete.mockClear();
    const fn = operation === "replace" ? replaceCollectionEntries : operation === "delete" ? deleteCollection : markAsBanked;
    await expect(invoke(fn, ctx, {
      cashCollectionId: "collection", bankedDate: "2026-10-05",
      weekEndingDate: "2026-10-05", collectionDate: "2026-10-05", status: "submitted",
      serviceRows: [{ serviceDate: "2026-10-05", serviceNote: "Service", fundId: "fund", cash: 100, pdq: 0, cheque: 0 }],
    })).rejects.toThrow("completed cash banking reconciliation");
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(get("collection")).toEqual(before);
    expect(get("source")?.amount).toBe(100);
  });

  it("locks only collections used by completed reconciliations in their own organization", async () => {
    const { ctx, get, records } = bankingFixture();
    get("A")!.status = "reopened";
    Object.assign(get("B")!, { status: "completed", cashCollectionSplits: [{ cashCollectionId: "other", cashAmount: 40, chequeAmount: 0 }] });
    records.cashBankingReconciliations.push({ ...cashReconciliation("foreign", 100, "completed"), organizationId: "other-org" });
    const collection = { organizationId: "org" as Id<"organizations">, cashCollectionId: "collection" as Id<"cashCollections"> };
    await expect(getCompletedReconciliationLock(ctx, collection)).resolves.toBeNull();
    get("A")!.status = "completed";
    await expect(getCompletedReconciliationLock(ctx, collection)).resolves.toBe("cash");
  });

  it("completing B preserves A's source claim and reopening B leaves it locked", async () => {
    const { ctx, get } = bankingFixture();
    await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    expect(get("collection")?.cashBankingStatus).toBe("partially_banked");
    await invoke(cashBanking.complete, ctx, { reconciliationId: "B" });
    expect(get("B")?.status).toBe("completed");
    expect(get("source")?.cashBankingReconciliationId).toBe("A");
    expect(get("B")).toMatchObject({ expectedTotal: 40, bankedTotal: 40, varianceAmount: 0 });
    expect(get("collection")?.cashBankingStatus).toBe("banked");
    await invoke(cashBanking.reopen, ctx, { reconciliationId: "B", reason: "Correction" });
    expect(get("source")).toMatchObject({ cashBankingReconciliationId: "A", cashBankingRole: "source_giving" });
    expect(get("collection")).toMatchObject({ cashBankingStatus: "partially_banked", cashBankingLastReconciliationId: "A" });
    expect(get("deposit-B")).toMatchObject({ category: "Offerings", isReconciled: false });
    expect(get("deposit-B")?.cashBankingReconciliationId).toBeUndefined();
    await expect(patchTransaction(ctx, "source" as Id<"transactions">, { amount: 99 }))
      .rejects.toThrow("completed cash banking reconciliation");
  });

  it("still rejects B when its split exceeds the remaining balance claimed by A", async () => {
    const { ctx, get, db } = bankingFixture();
    await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    Object.assign(get("B")!, cashReconciliation("B", 41));
    get("deposit-B")!.amount = 41;
    db.patch.mockClear();
    await expect(invoke(cashBanking.complete, ctx, { reconciliationId: "B" }))
      .rejects.toThrow("exceeds remaining cash balance");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each(["draft", "reopened"])("does not re-claim source rows owned by a different %s reconciliation", async (status) => {
    const { ctx, get } = bankingFixture();
    get("A")!.status = status;
    Object.assign(get("source")!, { cashBankingReconciliationId: "A", cashBankingRole: "source_giving" });
    await invoke(cashBanking.complete, ctx, { reconciliationId: "B" });
    expect(get("source")?.cashBankingReconciliationId).toBe("A");
  });

  it("reopening only restores bank rows still owned by that reconciliation", async () => {
    const { ctx, get } = bankingFixture();
    await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    Object.assign(get("deposit-A")!, { cashBankingReconciliationId: "B", category: "Owned by B", isReconciled: true });
    await invoke(cashBanking.reopen, ctx, { reconciliationId: "A", reason: "Correction" });
    expect(get("deposit-A")).toMatchObject({ cashBankingReconciliationId: "B", category: "Owned by B", isReconciled: true });
  });
});

describe("locks across reconciliation systems", () => {
  it.each(["reopen", "setCleared", "remove"] as const)("bank session %s preserves collection usage locks after the source owner reopens", async (operation) => {
    const { ctx, get } = bankingFixture();
    await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    await invoke(cashBanking.complete, ctx, { reconciliationId: "B" });
    await invoke(cashBanking.reopen, ctx, { reconciliationId: "A", reason: "Correction" });
    expect(get("source")?.cashBankingReconciliationId).toBeUndefined();
    get("session")!.status = operation === "reopen" ? "completed" : "reopened";
    Object.assign(get("source")!, { reconciliationSessionId: "session", isReconciled: true });
    await invoke(bankSessions[operation], ctx, {
      sessionId: "session", transactionId: "source", cleared: false, reason: "Correction",
    });
    expect(get("source")?.isReconciled).toBe(true);
    await expect(patchTransaction(ctx, "source" as Id<"transactions">, { amount: 99 }))
      .rejects.toThrow("completed cash banking reconciliation");
  });

  it.each(["complete", "reopen", "updateDraft"] as const)("cash banking %s refuses a bank row in a completed bank session", async (operation) => {
    const { ctx, db, get } = bankingFixture();
    if (operation === "reopen") {
      await invoke(cashBanking.complete, ctx, { reconciliationId: "A" });
    }
    get("session")!.status = "completed";
    Object.assign(get("deposit-A")!, { reconciliationSessionId: "session", isReconciled: true });
    const before = structuredClone(get("deposit-A"));
    db.patch.mockClear();
    const args = operation === "updateDraft" ? {
      reconciliationId: "A",
      cashCollectionSplits: [{ cashCollectionId: "collection", cashAmount: 60, chequeAmount: 0 }],
      bankTransactionSplits: [{ transactionId: "deposit-A", transactionAmount: 60, medium: "cash" }],
    } : { reconciliationId: "A", reason: "Correction" };
    await expect(invoke(cashBanking[operation], ctx, args)).rejects.toThrow(/Reopen that reconciliation session/);
    expect(db.patch).not.toHaveBeenCalled();
    expect(get("deposit-A")).toEqual(before);
  });

  it.each([
    ["a transfer", { movementKind: "transfer" }],
    ["a journal leg", { movementKind: "transfer", movementId: "m1", isJournal: true }],
  ])("cash banking refuses %s as a bank deposit", async (_name, fields) => {
    const { ctx, db, get } = bankingFixture();
    Object.assign(get("deposit-A")!, fields);
    await expect(invoke(cashBanking.complete, ctx, { reconciliationId: "A" }))
      .rejects.toThrow("Transfers, returned payments and loans can't be used as cash banking deposits");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("cash banking completion cannot detach an omitted deposit locked by a bank session", async () => {
    const { ctx, get, records, db } = bankingFixture();
    get("session")!.status = "completed";
    records.transactions.push(transaction("omitted", {
      cashBankingReconciliationId: "A", cashBankingRole: "bank_deposit",
      reconciliationSessionId: "session", isReconciled: true,
    }));
    await expect(invoke(cashBanking.complete, ctx, { reconciliationId: "A" }))
      .rejects.toThrow(/Reopen that reconciliation session/);
    expect(db.patch).not.toHaveBeenCalled();
    expect(get("omitted")?.isReconciled).toBe(true);
  });

  it.each(["reopen", "setCleared", "remove"] as const)("bank session %s leaves cash-locked rows reconciled", async (operation) => {
    const { ctx, get } = fixture({
      reconciliationSessions: [session(operation === "reopen" ? "completed" : "reopened")],
      cashBankingReconciliations: [{ _id: "cash", organizationId: "org", status: "completed" }],
      transactions: [
        transaction("deposit", { reconciliationSessionId: "session", cashBankingReconciliationId: "cash", cashBankingRole: "bank_deposit", isReconciled: true }),
        transaction("ordinary", { reconciliationSessionId: "session", isReconciled: true }),
      ],
    });
    await invoke(bankSessions[operation], ctx, {
      sessionId: "session", transactionId: "deposit", cleared: false, reason: "Correction",
    });
    expect(get("deposit")).toMatchObject({ isReconciled: true, cashBankingReconciliationId: "cash" });
    expect(get("deposit")?.reconciliationSessionId).toBe(operation === "reopen" ? "session" : undefined);
    if (operation !== "setCleared") expect(get("ordinary")?.isReconciled).toBe(false);
    await expect(patchTransaction(ctx, "deposit" as Id<"transactions">, { category: "Changed" }))
      .rejects.toThrow("completed cash banking reconciliation");
  });

  it("bank matching and completion can include a completed cash deposit without changing its claim", async () => {
    const { ctx, get } = fixture({
      reconciliationSessions: [session("draft")],
      cashBankingReconciliations: [{ _id: "cash", organizationId: "org", status: "completed" }],
      transactions: [transaction("deposit", { cashBankingReconciliationId: "cash", cashBankingRole: "bank_deposit", isReconciled: true })],
    });
    await invoke(bankSessions.setCleared, ctx, { sessionId: "session", transactionId: "deposit", cleared: true });
    await expect(invoke(bankSessions.complete, ctx, { sessionId: "session" })).resolves.toEqual({ clearedCount: 1 });
    expect(get("deposit")).toMatchObject({ isReconciled: true, cashBankingReconciliationId: "cash", reconciliationSessionId: "session" });
    await invoke(bankSessions.reopen, ctx, { sessionId: "session", reason: "Correction" });
    expect(get("deposit")?.isReconciled).toBe(true);
  });
});

describe("re-saving a collection with a retired category", () => {
  const donation = (category: string) => ({
    donorId: "donor", donorName: "Ama Mensah", amount: 50, fundId: "fund",
    category, paymentMethod: "Cash", isGiftAidEligible: false,
  });
  const save = (ctx: MutationCtx, category: string) =>
    invoke(replaceCollectionEntries, ctx, {
      cashCollectionId: "collection", weekEndingDate: "2026-10-05", collectionDate: "2026-10-05", status: "submitted",
      serviceRows: [], namedDonations: [donation(category)],
    });
  const setup = () => fixture({
    donors: [{ _id: "donor", organizationId: "org", name: "Ama Mensah" }],
    cashCollections: [{ _id: "collection", organizationId: "org", status: "submitted" }],
    categories: [
      { _id: "harvest", organizationId: "org", name: "Harvest Appeal", transactionType: "Income", isRetired: true },
      { _id: "gift", organizationId: "org", name: "Building Gift", transactionType: "Income", isRetired: true },
    ],
    transactions: [transaction("named", { cashCollectionId: "collection", category: "Building Gift", donorId: "donor" })],
  });

  it("keeps a retired category the collection's rows already had", async () => {
    const { ctx, records } = setup();
    await save(ctx, "Building Gift");
    expect(records.transactions.map((row) => row.category)).toEqual(["Building Gift"]);
  });

  it("refuses a retired category the collection didn't have", async () => {
    const { ctx } = setup();
    await expect(save(ctx, "Harvest Appeal")).rejects.toThrow("Harvest Appeal is retired");
  });
});
