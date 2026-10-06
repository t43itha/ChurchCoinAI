import { describe, expect, it } from "vitest";
import { getRCICategorySeedData } from "../constants/rciCategories";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { ensureTypedCategories, requireCanonicalCategory } from "../convex/lib/categoryIntegrity";
import { categoryNamesForTransactionTypes } from "../lib/transactionCategories";
import type { TransactionType } from "../types";

type Category = { name: string; transactionType?: TransactionType };

const legacyCategories: Category[] = [
  { name: "Offerings" },
  { name: "Bank Charges" },
  { name: "Legacy custom category" },
];

describe("transaction category options", () => {
  it("excludes seeded categories from a mixed legacy selection but keeps custom categories", () => {
    expect(categoryNamesForTransactionTypes(legacyCategories, ["Income", "Expenditure"]))
      .toEqual(["Legacy custom category"]);
    expect(categoryNamesForTransactionTypes(legacyCategories.slice(0, 2), ["Income", "Expenditure"]))
      .toEqual([]);
  });

  it.each([
    ["Income", "Offerings"],
    ["Expenditure", "Bank Charges"],
  ] as const)("offers only compatible legacy categories for %s", (type, seededName) => {
    expect(categoryNamesForTransactionTypes(legacyCategories, [type, type]))
      .toEqual([seededName, "Legacy custom category"]);
  });

  it("handles case, surrounding whitespace, and legacy aliases before the first write", () => {
    const categories = [
      { name: "  oFfErInGs  " },
      { name: " BANK CHARGES " },
      { name: "Tithe" },
      { name: "Books" },
    ];
    expect(categoryNamesForTransactionTypes(categories, ["Income"]))
      .toEqual(["  oFfErInGs  ", "Tithe", "Books"]);
    expect(categoryNamesForTransactionTypes(categories, ["Expenditure"]))
      .toEqual([" BANK CHARGES "]);
    expect(categoryNamesForTransactionTypes(categories, ["Income", "Expenditure"]))
      .toEqual([]);
  });

  it("preserves an explicit category type when it differs from the seed default", () => {
    const categories: Category[] = [
      { name: "Offerings", transactionType: "Expenditure" },
      { name: "Custom income", transactionType: "Income" },
      { name: "Legacy custom category" },
    ];
    expect(categoryNamesForTransactionTypes(categories, ["Income"]))
      .toEqual(["Custom income", "Legacy custom category"]);
    expect(categoryNamesForTransactionTypes(categories, ["Expenditure"]))
      .toEqual(["Offerings", "Legacy custom category"]);
  });

  it("does not offer categories without a known transaction type selection", () => {
    expect(categoryNamesForTransactionTypes(legacyCategories, [])).toEqual([]);
    expect(categoryNamesForTransactionTypes(legacyCategories, [undefined])).toEqual([]);
    expect(categoryNamesForTransactionTypes(legacyCategories, ["Income", undefined])).toEqual([]);
  });

  it("does not mutate the categories supplied by a reactive query", () => {
    const categories = structuredClone(legacyCategories);
    categoryNamesForTransactionTypes(categories, ["Income"]);
    expect(categories).toEqual(legacyCategories);
  });

  it.each([
    ["Income"],
    ["Expenditure"],
    ["Income", "Expenditure"],
  ] satisfies TransactionType[][])("offers names accepted by the actual write backfill for %j", async (...types) => {
    const organizationId = "org" as Id<"organizations">;
    const categories: Category[] = [
      ...getRCICategorySeedData().map(({ name }) => ({ name })),
      { name: "Legacy custom category" },
      { name: "Tithe" },
      { name: "Books" },
    ];
    const rows = categories.map((category, index) => ({
      ...category,
      _id: `category-${index}` as Id<"categories">,
      organizationId,
    }));
    const ctx = {
      db: {
        query: () => ({ withIndex: () => ({ collect: async () => rows }) }),
        patch: async (id: Id<"categories">, patch: Partial<Category>) => {
          Object.assign(rows.find((row) => row._id === id)!, patch);
        },
      },
    } as unknown as MutationCtx;

    const options = categoryNamesForTransactionTypes(categories, types);
    const afterBackfill = await ensureTypedCategories(ctx, organizationId);

    expect(options.length).toBeGreaterThan(0);
    for (const name of options) {
      for (const type of types) {
        expect(() => requireCanonicalCategory(afterBackfill, name, type)).not.toThrow();
      }
    }
    // This is the P1 failure: Offerings looked untyped in the UI but the write
    // converts it to Income, so it cannot be applied to an expenditure row.
    expect(() => requireCanonicalCategory(afterBackfill, "Offerings", "Expenditure"))
      .toThrow("Choose a valid expenditure category");
  });
});
