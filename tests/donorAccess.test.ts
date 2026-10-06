import { describe, expect, it, vi } from "vitest";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";
import type { UserRole } from "../convex/lib/auth";
import * as queries from "../convex/queries/donors";
import * as mutations from "../convex/mutations/donors";

type Row = Record<string, unknown>;

// Exercise the real query/mutation handlers and auth helpers; only storage and
// the Clerk identity are simulated, with index predicates applied to fixtures.
function fixture(role: UserRole | null) {
  const ownDonor = { _id: "donor-own", organizationId: "org-own", name: "Alex Smith", isGiftAidActive: true };
  const otherDonor = { _id: "donor-other", organizationId: "org-other", name: "Alex Smith", isGiftAidActive: true };
  const records: Record<string, Row[]> = {
    users: [{ _id: "user", clerkId: "clerk-user", organizationId: "org-own", role }],
    organizations: [{ _id: "org-own", accessMode: "legacy" }],
    donors: [ownDonor, otherDonor],
    pledges: [
      { _id: "pledge-own", organizationId: "org-own", donorId: "donor-own" },
      { _id: "pledge-foreign", organizationId: "org-other", donorId: "donor-own" },
    ],
    transactions: [
      { _id: "transaction-own", organizationId: "org-own", donorId: "donor-own", type: "Income", amount: 25 },
      { _id: "transaction-foreign", organizationId: "org-other", donorId: "donor-own", type: "Income", amount: 999 },
    ],
  };
  const db = {
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
        filter: (predicate: (q: { field: (field: string) => unknown; eq: (a: unknown, b: unknown) => boolean }) => boolean) => {
          rows = rows.filter((row) => predicate({ field: (field) => row[field], eq: (a, b) => a === b }));
          return chain;
        },
        first: async () => rows[0] ?? null,
        collect: async () => rows,
      };
      return chain;
    }),
    get: vi.fn(async (id: string) => Object.values(records).flat().find((row) => row._id === id) ?? null),
    insert: vi.fn(async (table: string, data: Row) => {
      const id = `${table}-created`;
      (records[table] ??= []).push({ ...data, _id: id });
      return id;
    }),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  const ctx = {
    auth: { getUserIdentity: async () => role === null ? null : { subject: "clerk-user" } },
    db,
  } as unknown as MutationCtx;
  return { ctx, db, records, ownDonor };
}

const invoke = (fn: unknown, ctx: QueryCtx | MutationCtx, args: Row = {}): Promise<unknown> =>
  (fn as { _handler: (ctx: QueryCtx | MutationCtx, args: Row) => Promise<unknown> })._handler(ctx, args);

const reads = [
  { name: "list", fn: queries.list, args: {} },
  { name: "getById", fn: queries.getById, args: { donorId: "donor-own" } },
  { name: "searchByName", fn: queries.searchByName, args: { searchTerm: "Alex" } },
  { name: "getWithHistory", fn: queries.getWithHistory, args: { donorId: "donor-own" } },
  { name: "listGiftAidEligible", fn: queries.listGiftAidEligible, args: {} },
  { name: "findByNameFuzzy", fn: queries.findByNameFuzzy, args: { name: "Alex Smith" } },
];

describe.each(reads)("donor $name access", ({ fn, args }) => {
  it.each<UserRole>(["Admin", "Finance Team", "Pastorate"])("allows %s to read only their church's donor data", async (role) => {
    const { ctx, ownDonor } = fixture(role);
    const result = await invoke(fn, ctx, args);
    if (Array.isArray(result)) {
      expect(result).toEqual([ownDonor]);
    } else {
      expect(result).toMatchObject(ownDonor);
    }
    expect(JSON.stringify(result)).not.toContain("org-other");
  });

  it("rejects Guest before reading donor data", async () => {
    const { ctx, db } = fixture("Guest");
    await expect(invoke(fn, ctx, args)).rejects.toThrow("Forbidden");
    expect(db.query.mock.calls.every(([table]) => table === "users")).toBe(true);
    expect(db.get.mock.calls).toEqual([["org-own"]]);
  });

  it("rejects anonymous access", async () => {
    const { ctx, db } = fixture(null);
    await expect(invoke(fn, ctx, args)).rejects.toThrow("Unauthorized");
    expect(db.query).not.toHaveBeenCalled();
    expect(db.get).not.toHaveBeenCalled();
  });

  it("still enforces the organization's access grant for Pastorate", async () => {
    const { ctx, records } = fixture("Pastorate");
    records.organizations = [];
    await expect(invoke(fn, ctx, args)).rejects.toThrow("Access required");
  });
});

describe("Pastorate donor tenant isolation", () => {
  it.each([queries.getById, queries.getWithHistory])("does not expose a donor from another church by ID", async (fn) => {
    const { ctx } = fixture("Pastorate");
    await expect(invoke(fn, ctx, { donorId: "donor-other" })).resolves.toBeNull();
  });

  it("excludes foreign records linked to a donor when returning giving history", async () => {
    const { ctx } = fixture("Pastorate");
    await expect(invoke(queries.getWithHistory, ctx, { donorId: "donor-own" })).resolves.toMatchObject({
      pledges: [{ _id: "pledge-own" }],
      transactions: [{ _id: "transaction-own" }],
      totalGiving: 25,
    });
  });
});

const writes = ["create", "update", "bulkUpsert", "linkOrphanedRecords", "findOrCreate", "bulkFindOrCreate", "merge", "remove"] as const;

describe.each(writes)("donor %s remains restricted", (name) => {
  it.each<UserRole>(["Pastorate", "Guest"])("rejects direct %s writes", async (role) => {
    const { ctx, db } = fixture(role);
    await expect(invoke(mutations[name], ctx)).rejects.toThrow("Forbidden");
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
});

it.each<UserRole>(["Admin", "Finance Team"])("preserves donor creation for %s", async (role) => {
  const { ctx, db } = fixture(role);
  await expect(invoke(mutations.create, ctx, { name: "New Donor", type: "Individual" })).resolves.toBe("donors-created");
  expect(db.insert).toHaveBeenCalledWith("donors", expect.objectContaining({ organizationId: "org-own", name: "New Donor" }));
});
