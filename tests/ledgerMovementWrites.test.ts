import { describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import * as transactions from "../convex/mutations/transactions";
import { ensureTypedCategories } from "../convex/lib/categoryIntegrity";

type Row = { _id: string } & Record<string, unknown>;

// Run real handlers against an indexed, mutable in-memory database.
function fixture(extra: Record<string, Row[]> = {}) {
  const records: Record<string, Row[]> = {
    users: [{ _id: "user", clerkId: "clerk-user", organizationId: "org", role: "Admin" }],
    organizations: [{ _id: "org", accessMode: "legacy" }],
    funds: [{ _id: "fund", organizationId: "org" }],
    categories: [],
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
      const rows = (records[table] ??= []);
      const id = `new-${table}-${rows.length}`;
      rows.push({ ...value, _id: id });
      return id;
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

const row = (id: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", fundId: "fund", type: "Income", amount: 100, date: "2026-10-01",
  description: "Row", category: "Offerings", isReconciled: false, ...extra,
});

const lastPatch = (db: ReturnType<typeof fixture>["db"], id: string) =>
  db.patch.mock.calls.filter(([patchedId]) => patchedId === id).at(-1)?.[1] as Record<string, unknown>;

describe("built-in movement categories", () => {
  it("adds the three categories once, with no transaction type", async () => {
    const { ctx, records } = fixture();
    await ensureTypedCategories(ctx, "org" as Id<"organizations">);
    await ensureTypedCategories(ctx, "org" as Id<"organizations">);

    const movement = records.categories.filter((category) => category.movementKind);
    expect(movement.map((category) => [category.name, category.movementKind, category.transactionType])).toEqual([
      ["Transfer between funds", "transfer", undefined],
      ["Returned payment", "reversal", undefined],
      ["Loan", "loan", undefined],
    ]);
  });

  it("leaves a user category with the same name alone", async () => {
    const userLoan = { _id: "user-loan", organizationId: "org", name: "Loan", transactionType: "Income", createdAt: 1 };
    const { ctx, records } = fixture({ categories: [{ ...userLoan }] });
    await ensureTypedCategories(ctx, "org" as Id<"organizations">);

    expect(records.categories.filter((category) => category.name === "Loan")).toEqual([userLoan]);
  });
});

describe("movementKind follows the category on every write", () => {
  it("copies the kind when a transaction is created", async () => {
    const { ctx, records } = fixture();
    const base = { date: "2026-10-01", description: "Move", amount: 300, fundId: "fund" };
    await invoke(transactions.create, ctx, { ...base, type: "Income", category: "Loan" });
    await invoke(transactions.create, ctx, { ...base, type: "Expenditure", category: "Transfer between funds" });

    expect(records.transactions.map((t) => [t.type, t.category, t.movementKind])).toEqual([
      ["Income", "Loan", "loan"],
      ["Expenditure", "Transfer between funds", "transfer"],
    ]);
  });

  it("clears the kind when a row moves back to an ordinary category", async () => {
    const { ctx, db, get } = fixture({ transactions: [row("tx", { category: "Loan", movementKind: "loan" })] });
    await invoke(transactions.update, ctx, { transactionId: "tx", category: "Offerings" });

    const patch = lastPatch(db, "tx");
    expect(patch).toHaveProperty("movementKind", undefined);
    expect(get("tx")).toMatchObject({ category: "Offerings", movementKind: undefined });
  });

  it("sets the kind on income and expenditure rows in one bulk edit", async () => {
    const { ctx, get } = fixture({
      transactions: [row("in"), row("out", { type: "Expenditure", category: "Utilities" })],
    });
    await invoke(transactions.bulkUpdate, ctx, {
      transactionIds: ["in", "out"],
      updates: { category: "Returned payment" },
    });

    expect([get("in")?.movementKind, get("out")?.movementKind]).toEqual(["reversal", "reversal"]);
  });

  it("sets the kind through batch edits", async () => {
    const { ctx, get } = fixture({ transactions: [row("tx")] });
    await invoke(transactions.batchUpdate, ctx, {
      updates: [{ transactionId: "tx", changes: { category: "Transfer between funds" } }],
    });

    expect(get("tx")?.movementKind).toBe("transfer");
  });
});
