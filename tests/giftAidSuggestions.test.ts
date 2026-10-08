import { describe, expect, it } from "vitest";
import type { QueryCtx } from "../convex/_generated/server";
import { getPendingSuggestions, getSuggestionsByType, getSuggestionCounts, listAll } from "../convex/queries/intelligence";

function fixture(giftAidEnabled?: boolean) {
  const organization = { _id: "org", accessMode: "legacy", giftAidEnabled };
  const suggestions = [
    ...Array.from({ length: 12 }, (_, i) => ({
      _id: `gift-${i}`, organizationId: "org", ruleId: "gift_aid_eligible_not_signed",
      insightType: "donor", severity: "warning", status: "pending", createdAt: 30 - i,
    })),
    { _id: "operations", organizationId: "org", ruleId: "uncategorized", insightType: "operations", severity: "critical", status: "pending", createdAt: 2 },
    { _id: "donor", organizationId: "org", ruleId: "lapsed_regular_donor", insightType: "donor", severity: "warning", status: "pending", createdAt: 1 },
    { _id: "foreign", organizationId: "other", ruleId: "uncategorized", insightType: "operations", severity: "critical", status: "pending", createdAt: 50 },
  ];
  const records: Record<string, Record<string, unknown>[]> = {
    users: [{ _id: "user", clerkId: "clerk", organizationId: "org", role: "Admin" }],
    intelligenceSuggestions: suggestions,
  };
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "clerk" }) },
    db: {
      get: async () => organization,
      query: (table: string) => {
        let rows = [...(records[table] ?? [])];
        const index = {
          eq(field: string, value: unknown) { rows = rows.filter(row => row[field] === value); return index; },
        };
        const chain = {
          withIndex: (_name: string, configure: (q: typeof index) => unknown) => { configure(index); return chain; },
          order: () => chain,
          first: async () => rows[0] ?? null,
          collect: async () => rows,
          take: async (n: number) => rows.slice(0, n),
          async *[Symbol.asyncIterator]() { yield* rows; },
        };
        return chain;
      },
    },
  } as unknown as QueryCtx;
  return { ctx, organization, suggestions };
}

const invoke = (fn: unknown, ctx: QueryCtx, args: Record<string, unknown> = {}): Promise<any> =>
  (fn as { _handler: (ctx: QueryCtx, args: Record<string, unknown>) => Promise<any> })._handler(ctx, args);

describe("church-wide Gift Aid suggestion visibility", () => {
  it("hides existing reminders from every list and badge, without deleting them", async () => {
    const { ctx, suggestions } = fixture(false);
    const original = structuredClone(suggestions);
    expect((await invoke(getPendingSuggestions, ctx, { limit: 2 })).map((s: { _id: string }) => s._id)).toEqual(["operations", "donor"]);
    expect((await invoke(listAll, ctx, { limit: 2 })).map((s: { _id: string }) => s._id)).toEqual(["operations", "donor"]);
    expect((await invoke(listAll, ctx, { status: "pending", limit: 2 })).map((s: { _id: string }) => s._id)).toEqual(["operations", "donor"]);
    expect((await invoke(getSuggestionsByType, ctx, { insightType: "donor", status: "pending" })).map((s: { _id: string }) => s._id)).toEqual(["donor"]);
    expect(await invoke(getSuggestionCounts, ctx)).toEqual({ total: 2, critical: 1, warning: 1, info: 0, donor: 1, operations: 1 });
    expect(suggestions).toEqual(original);
  });

  it.each([true, undefined])("keeps reminders visible when enabled or unset (%s)", async enabled => {
    const { ctx } = fixture(enabled);
    expect(await invoke(getSuggestionCounts, ctx)).toMatchObject({ total: 14, donor: 13 });
    expect(await invoke(getSuggestionsByType, ctx, { insightType: "donor" })).toHaveLength(13);
  });

  it("restores the same stored reminders when the church re-enables Gift Aid", async () => {
    const { ctx, organization } = fixture(false);
    expect(await invoke(getSuggestionsByType, ctx, { insightType: "donor" })).toHaveLength(1);
    organization.giftAidEnabled = true;
    expect(await invoke(getSuggestionsByType, ctx, { insightType: "donor" })).toHaveLength(13);
  });
});
