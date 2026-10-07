import { describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import * as transactions from "../convex/mutations/transactions";
import * as categories from "../convex/mutations/categories";
import { ensureTypedCategories } from "../convex/lib/categoryIntegrity";

type Row = { _id: string } & Record<string, unknown>;
type FilterBuilder = typeof filterBuilder;

const filterBuilder = {
  field: (name: string) => name,
  eq: (field: string, value: unknown) => (row: Row) => row[field] === value,
};

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
        // Only the equality filter the rename cascade uses.
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

describe("category names that would hide a movement category", () => {
  const builtIns = (): Row[] => [
    { _id: "loan", organizationId: "org", name: "Loan", movementKind: "loan", createdAt: 1 },
    { _id: "offerings", organizationId: "org", name: "Offerings", transactionType: "Income", createdAt: 1 },
  ];

  it("rejects a new category whose name differs only by case", async () => {
    const { ctx } = fixture({ categories: builtIns() });
    await expect(invoke(categories.create, ctx, { name: "loan ", transactionType: "Expenditure" }))
      .rejects.toThrow('Category "loan" already exists');
  });

  it("skips case-insensitive duplicates in bulk creation", async () => {
    const { ctx } = fixture({ categories: builtIns() });
    await expect(invoke(categories.bulkCreate, ctx, { names: ["LOAN", "Choir robes"], transactionType: "Expenditure" }))
      .resolves.toEqual({ created: ["Choir robes"], skipped: ["LOAN"] });
  });

  it("rejects renaming to an alias of another category", async () => {
    const { ctx, get } = fixture({ categories: builtIns() });
    await expect(invoke(categories.rename, ctx, { categoryId: "loan", newName: "Tithe" }))
      .rejects.toThrow('"Tithe" is another name for "Tithes & First Fruits"');
    expect(get("loan")?.name).toBe("Loan");
  });

  it("rejects renaming a movement category to a built-in category name", async () => {
    const { ctx } = fixture({ categories: [builtIns()[0]] });
    await expect(invoke(categories.rename, ctx, { categoryId: "loan", newName: "Offerings" }))
      .rejects.toThrow('"Offerings" is a built-in category name');
  });

  it("still allows a plain rename", async () => {
    const { ctx, get } = fixture({ categories: builtIns() });
    await invoke(categories.rename, ctx, { categoryId: "loan", newName: "Member loan" });
    expect(get("loan")).toMatchObject({ name: "Member loan", movementKind: "loan" });
  });
});

describe("cash collection rows stay giving", () => {
  const message = "Rows from a cash collection can't be marked as a transfer, returned payment or loan";

  it("refuses to mark a collection row as a movement", async () => {
    const { ctx, get } = fixture({ transactions: [row("service", { cashCollectionId: "c1", notes: "service:Sunday" })] });
    await expect(invoke(transactions.update, ctx, { transactionId: "service", category: "Loan" })).rejects.toThrow(message);
    await expect(invoke(transactions.bulkUpdate, ctx, { transactionIds: ["service"], updates: { category: "Loan" } })).rejects.toThrow(message);
    await expect(invoke(transactions.batchUpdate, ctx, { updates: [{ transactionId: "service", changes: { category: "Loan" } }] })).rejects.toThrow(message);
    expect(get("service")?.category).toBe("Offerings");
  });

  it("refuses a new collection row in a movement category", async () => {
    const { ctx } = fixture({ cashCollections: [{ _id: "c1", organizationId: "org" }] });
    await expect(invoke(transactions.create, ctx, {
      date: "2026-10-01", description: "Loan", amount: 100, type: "Income", category: "Loan", fundId: "fund", cashCollectionId: "c1",
    })).rejects.toThrow(message);
  });
});
