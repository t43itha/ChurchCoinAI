import { describe, expect, it, vi } from "vitest";
import type { QueryCtx } from "../convex/_generated/server";
import { ROLES, type UserRole } from "../lib/permissions";
import * as transactions from "../convex/queries/transactions";
import * as pledges from "../convex/queries/pledges";
import * as users from "../convex/queries/users";
import * as reports from "../convex/queries/reports";
import * as cashBanking from "../convex/queries/cashBankingReconciliations";
import * as reconciliation from "../convex/queries/reconciliationSessions";
import { getAIContext } from "../convex/queries/aiContext";

type Row = Record<string, any>;
function fixture(role: UserRole | null) {
  const records: Record<string, Row[]> = {
    users: [{ _id: "user", clerkId: "clerk", organizationId: "org", name: "Recorder", email: "private@example.invalid", role }],
    organizations: [{ _id: "org", accessMode: "legacy" }],
    donors: [{ _id: "donor", organizationId: "org", name: "Alex Smith" }, { _id: "foreign-donor", organizationId: "other" }],
    funds: [{ _id: "fund", organizationId: "org", name: "General", type: "Unrestricted" }],
    pledges: [{ _id: "pledge", organizationId: "org", fundId: "fund", donorId: "donor", donorName: "Alex Smith", amount: 100, frequency: "One-off", status: "Active", startDate: "2026-01-01" }],
    transactions: [{ _id: "transaction", organizationId: "org", fundId: "fund", pledgeId: "pledge", donorId: "donor", donorName: "Alex Smith", description: "Tithe - Alex Smith", amount: 25, type: "Income", date: new Date().toISOString().slice(0, 10) }],
  };
  for (const table of ["pledges", "transactions"]) {
    records[table].push({ ...records[table][0], _id: `foreign-${table}`, organizationId: "other", fundId: "other-fund" });
  }
  const db = {
    query: vi.fn((table: string) => {
      let rows = [...(records[table] ?? [])];
      const index = {
        eq(field: string, value: unknown) { rows = rows.filter((row) => row[field] === value); return index; },
        gte(field: string, value: string) { rows = rows.filter((row) => row[field] >= value); return index; },
        lte(field: string, value: string) { rows = rows.filter((row) => row[field] <= value); return index; },
      };
      const chain = {
        withIndex: (_name: string, configure: (q: typeof index) => unknown) => { configure(index); return chain; },
        order: () => chain,
        first: async () => rows[0] ?? null,
        collect: async () => rows,
        take: async (n: number) => rows.slice(0, n),
        paginate: async () => ({ page: rows, isDone: true, continueCursor: "done" }),
      };
      return chain;
    }),
    get: vi.fn(async (id: string) => Object.values(records).flat().find((row) => row._id === id) ?? null),
  };
  const ctx = { db, auth: { getUserIdentity: async () => role === null ? null : { subject: "clerk" } } } as unknown as QueryCtx;
  return { ctx, db, records };
}

const invoke = (fn: unknown, ctx: QueryCtx, args: Row = {}): Promise<any> =>
  (fn as { _handler: (ctx: QueryCtx, args: Row) => Promise<any> })._handler(ctx, args);

const rowQueries = [
  { name: "transactions.list", fn: transactions.list, args: {} },
  { name: "transactions.listPaginated", fn: transactions.listPaginated, args: { paginationOpts: { numItems: 10, cursor: null } } },
  { name: "transactions.byFund", fn: transactions.byFund, args: { fundId: "fund" } },
  { name: "transactions.byPledge", fn: transactions.byPledge, args: { pledgeId: "pledge" } },
  { name: "transactions.byDateRange", fn: transactions.byDateRange, args: { startDate: "2020-01-01", endDate: "2099-01-01" } },
  { name: "transactions.recent", fn: transactions.recent, args: {} },
  { name: "pledges.list", fn: pledges.list, args: {} },
  { name: "pledges.listByStatus", fn: pledges.listByStatus, args: { status: "Active" } },
  { name: "pledges.byFund", fn: pledges.byFund, args: { fundId: "fund" } },
  { name: "pledges.getWithProgress", fn: pledges.getWithProgress, args: { pledgeId: "pledge" } },
];

describe.each(rowQueries)("$name privacy", ({ fn, args }) => {
  it.each(ROLES)("keeps financial rows usable for %s with appropriate donor visibility", async (role) => {
    const { ctx } = fixture(role);
    const result = await invoke(fn, ctx, args);
    const rows = Array.isArray(result) ? result : result.page ?? [result];
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('"organizationId":"other"');
    if (role === "Guest") {
      expect(JSON.stringify(result)).not.toContain("Alex Smith");
      expect(JSON.stringify(result)).not.toContain('"donorId"');
      expect(rows[0].donorName).toBe("");
    } else expect(rows[0].donorName).toBe("Alex Smith");
    if (fn === pledges.getWithProgress) {
      expect(result.totalReceived).toBe(25);
      expect(result.progress).toBe(25);
      expect(result.linkedTransactions).toHaveLength(1);
    }
    if (fn === transactions.listPaginated) expect(result).toMatchObject({ isDone: true, continueCursor: "done" });
  });
});

describe.each([transactions.byDonor, pledges.byDonor])("donor-linked reads", (fn) => {
  it.each<UserRole>(["Admin", "Finance Team", "Pastorate"])("allows %s within their organization", async (role) => {
    const { ctx } = fixture(role);
    const result = await invoke(fn, ctx, { donorId: "donor" });
    expect(result).toHaveLength(1);
    expect(result[0].donorName).toBe("Alex Smith");
  });
  it("rejects Guest", async () => {
    await expect(invoke(fn, fixture("Guest").ctx, { donorId: "donor" })).rejects.toThrow("donors.read");
  });
  it("does not return another church's donor history to Pastorate", async () => {
    const promise = invoke(fn, fixture("Pastorate").ctx, { donorId: "foreign-donor" });
    if (fn === transactions.byDonor) await expect(promise).rejects.toThrow("Donor not found");
    else await expect(promise).resolves.toEqual([]);
  });
});

it("keeps member names available without exposing emails or roles to restricted readers", async () => {
  for (const role of ROLES) {
    const { ctx } = fixture(role);
    if (role === "Admin" || role === "Finance Team") {
      const result = await invoke(users.listByOrganization, ctx);
      expect(result[0].email).toBe("private@example.invalid");
      expect(result[0]).not.toHaveProperty("clerkId");
    } else {
      await expect(invoke(users.listByOrganization, ctx)).rejects.toThrow("users.list");
      await expect(invoke(users.getById, ctx, { userId: "user" })).resolves.toEqual({ _id: "user", name: "Recorder" });
    }
    await expect(invoke(users.getById, ctx, { userId: "missing" })).resolves.toBeNull();
  }
});

describe.each([cashBanking.list, cashBanking.getById, cashBanking.getAwaitingBanking, cashBanking.getCandidateBankCredits, reconciliation.list, reconciliation.workspace])("reconciliation boundary", (fn) => {
  it.each<UserRole>(["Pastorate", "Guest"])("rejects %s before reading financial data", async (role) => {
    const { ctx, db } = fixture(role);
    await expect(invoke(fn, ctx)).rejects.toThrow("reconciliation.manage");
    expect(db.query.mock.calls.map(([table]) => table)).toEqual(["users"]);
  });
});

it("allows Pastorate to get the report week and denies all report queries to Guest", async () => {
  await expect(invoke(reports.getCurrentWeekEnding, fixture("Pastorate").ctx, { today: "2026-10-05" })).resolves.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  for (const fn of Object.values(reports)) {
    if (typeof fn === "function" && "_handler" in fn) {
      await expect(invoke(fn, fixture("Guest").ctx)).rejects.toThrow("reports.read");
    }
  }
});

it("does not leak donor identity through AI context aggregates or descriptions", async () => {
  const guest = await invoke(getAIContext, fixture("Guest").ctx);
  expect(guest.topDonors).toEqual([]);
  expect(guest.totalIncome).toBe(25);
  expect(JSON.stringify(guest)).not.toContain("Alex Smith");
  const pastor = await invoke(getAIContext, fixture("Pastorate").ctx);
  expect(pastor.topDonors).toEqual([{ id: "donor", name: "Alex Smith", total: 25 }]);
});

it("still enforces authentication and organization access before returning redacted rows", async () => {
  await expect(invoke(transactions.list, fixture(null).ctx)).rejects.toThrow("Unauthorized");
  const { ctx, records } = fixture("Guest");
  records.organizations = [];
  await expect(invoke(transactions.list, ctx)).rejects.toThrow("Access required");
});
