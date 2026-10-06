import { describe, expect, it } from "vitest";
import { applySmallIncomeDefaults } from "../lib/smallIncomeDefaults";
import { categorizeFromContext, mergeAIFallback } from "../convex/intelligence/categorization/pipeline";
import { bulkCreate } from "../convex/mutations/transactions";
import { getRCICategorySeedData } from "../constants/rciCategories";

const categories = getRCICategorySeedData();
const funds = [{ _id: "restricted", name: "Building Fund", organizationId: "org" }, { _id: "general", name: "General Fund", organizationId: "org" }];
const row = { date: "2026-09-21", description: "Unrecognised reference", amount: 30, type: "Income" as const, category: "", fundId: "" };

describe("small income defaults", () => {
  it.each([0.01, 29.99, 30])("defaults £%s without guessing Gift Aid", (amount) => {
    expect(applySmallIncomeDefaults({ ...row, amount }, categories, funds)).toMatchObject({ amount, category: "Offerings", fundId: "general" });
    expect(applySmallIncomeDefaults({ ...row, amount }, categories, funds)).not.toHaveProperty("isGiftAidEligible");
  });
  it.each([0, -1, 0.001, 30.01, NaN, Infinity])("does not default invalid or larger amount %s", (amount) => {
    expect(applySmallIncomeDefaults({ ...row, amount }, categories, funds).category).toBe("");
  });
  it("preserves valid fields independently and replaces invalid categories", () => {
    expect(applySmallIncomeDefaults({ ...row, category: "Building Fund" }, categories, funds)).toMatchObject({ category: "Building Fund", fundId: "general" });
    expect(applySmallIncomeDefaults({ ...row, category: "Utilities", fundId: "restricted" }, categories, funds)).toMatchObject({ category: "Offerings", fundId: "restricted" });
    expect(applySmallIncomeDefaults({ ...row, category: "Custom income" }, [...categories, { name: "Custom income" }], funds).category).toBe("Custom income");
  });
  it("never defaults expenditure or substitutes the first fund for General Fund", () => {
    expect(applySmallIncomeDefaults({ ...row, type: "Expenditure" }, categories, funds).category).toBe("");
    expect(applySmallIncomeDefaults(row, categories, funds.slice(0, 1)).fundId).toBe("");
  });
  it("handles legacy untyped categories with the same type rules as writes", () => {
    expect(applySmallIncomeDefaults({ ...row, category: "Utilities" }, categories.map(({name}) => ({name})), funds).category).toBe("Offerings");
  });
  it("resolves small income locally but keeps larger income for the model", () => {
    const result = categorizeFromContext([row, { ...row, amount: 30.01 }], categories, funds, []);
    expect(result[0]).toMatchObject({ category: "Offerings", fundId: "general", predictionSource: "rule", isGiftAidEligible: false });
    expect(result[1].predictionSource).toBe("none");
  });
  it("does not swap duplicate descriptions when model responses reorder", () => {
    const inputs = [{ ...row, amount: 80, rowId: "a" }, { ...row, amount: 90, rowId: "b" }];
    const current = categorizeFromContext(inputs, categories, funds, []);
    const raw = [{ rowId: "b", category: "Building Fund", fundName: "Building Fund" }, { rowId: "a", category: "Offerings", fundName: "General Fund" }];
    expect(mergeAIFallback(current, raw, inputs, categories, funds, "openrouter").map((s) => s.category)).toEqual(["Offerings", "Building Fund"]);
    expect(mergeAIFallback(current, [raw[0], raw[0]], inputs, categories, funds, "openrouter").every((s) => s.predictionSource === "none")).toBe(true);
    expect(mergeAIFallback(current, [{ ...raw[0], rowId: "foreign" }], inputs, categories, funds, "openrouter").every((s) => s.predictionSource === "none")).toBe(true);
  });
  it("does not mark invalid category text on larger income as a local result", () => {
    const result = categorizeFromContext([{ ...row, amount: 31, category: "not-a-category", fundId: "general" }], categories, funds, []);
    expect(result[0]).toMatchObject({ predictionSource: "none", category: "", fundId: "general" });
  });
});

function database() {
  const stored: any[] = [];
  const tables: Record<string, any[]> = { users: [{ _id: "user", organizationId: "org", role: "Admin", clerkId: "owner" }], organizations: [{ _id: "org", accessMode: "legacy" }], categories: categories.map((c, i) => ({ ...c, _id: `category${i}`, organizationId: "org" })), funds, transactions: stored };
  const ctx: any = { auth: { getUserIdentity: async () => ({ subject: "owner" }) }, db: {
    query: (table: string) => { const q: any = { withIndex: () => q, first: async () => tables[table]?.[0] ?? null, collect: async () => tables[table] ?? [], take: async (n: number) => (tables[table] ?? []).slice(0, n) }; return q; },
    get: async (id: string) => Object.values(tables).flat().find((r) => r._id === id) ?? null,
    insert: async (table: string, value: any) => { const id = `new-${stored.length}`; (tables[table] ??= []).push({ ...value, _id: id }); return id; },
  }, scheduler: { runAfter: async () => null } };
  return { ctx, stored };
}

describe("import mutation defaults", () => {
  it("imports a £30 row with missing fields and indexes its resolved fund", async () => {
    const { ctx, stored } = database();
    const result = await (bulkCreate as any)._handler(ctx, { transactions: [{ ...row, fundId: undefined }] });
    expect(result.count).toBe(1);
    expect(stored[0]).toMatchObject({ amount: 30, category: "Offerings", fundId: "general" });
  });
  it("keeps a valid restricted fund while defaulting the category", async () => {
    const { ctx, stored } = database();
    await (bulkCreate as any)._handler(ctx, { transactions: [{ ...row, fundId: "restricted" }] });
    expect(stored[0].fundId).toBe("restricted");
  });
  it("rejects larger rows and expenditure with missing categories", async () => {
    for (const input of [{ ...row, amount: 30.01 }, { ...row, type: "Expenditure" }]) {
      const { ctx } = database();
      await expect((bulkCreate as any)._handler(ctx, { transactions: [{ ...input, fundId: "general" }] })).rejects.toThrow("category");
    }
  });
  it("does not hide a foreign-tenant fund behind the default", async () => {
    const { ctx } = database();
    const get = ctx.db.get;
    ctx.db.get = async (id: string) => id === "foreign" ? { _id: id, organizationId: "other" } : get(id);
    await expect((bulkCreate as any)._handler(ctx, { transactions: [{ ...row, fundId: "foreign" }] })).rejects.toThrow("Invalid fund");
  });
});
