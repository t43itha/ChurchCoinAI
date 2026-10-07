import { vi } from "vitest";
import type { MutationCtx } from "../../convex/_generated/server";

export type Row = { _id: string } & Record<string, unknown>;
type FilterBuilder = typeof filterBuilder;

const filterBuilder = {
  field: (name: string) => name,
  eq: (field: string, value: unknown) => (row: Row) => row[field] === value,
};

// Run real handlers against an indexed, mutable in-memory database.
export function fixture(extra: Record<string, Row[]> = {}) {
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
    delete: vi.fn(async (id: string) => {
      for (const rows of Object.values(records)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) {
          rows.splice(index, 1);
          return;
        }
      }
      throw new Error(`Missing row: ${id}`);
    }),
  };
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "clerk-user" }) },
    db,
    scheduler: { runAfter: vi.fn() },
  } as unknown as MutationCtx;
  return { ctx, db, get, records };
}

export const invoke = (fn: unknown, ctx: MutationCtx, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: MutationCtx, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

export const row = (id: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", fundId: "fund", type: "Income", amount: 100, date: "2026-10-01",
  description: "Row", category: "Offerings", isReconciled: false, ...extra,
});
