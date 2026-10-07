import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import * as categories from "../convex/mutations/categories";
import { fixture, invoke } from "./helpers/convexFixture";

const migrate = (ctx: MutationCtx) =>
  invoke(categories.migrateTransactionCategories, ctx, { organizationId: "org" }) as Promise<{
    categoriesCreated: string[];
  }>;

describe("migrateTransactionCategories name checks", () => {
  it("merges an alias into a canonical category that differs only by case", async () => {
    const { ctx, records } = fixture({
      categories: [
        { _id: "alias", organizationId: "org", name: "Offering", transactionType: "Income", createdAt: 1 },
        { _id: "canonical", organizationId: "org", name: "offerings", transactionType: "Income", createdAt: 1 },
      ],
    });
    await migrate(ctx);

    const names = records.categories.map((category) => String(category.name).toLowerCase());
    expect(names.filter((name) => name === "offering" || name === "offerings")).toEqual(["offerings"]);
  });

  it("keeps a movement category without a transaction type", async () => {
    const { ctx, records } = fixture({
      categories: [{ _id: "reversal", organizationId: "org", name: "Rent", movementKind: "reversal", createdAt: 1 }],
    });
    await migrate(ctx);

    const movement = records.categories.find((category) => category._id === "reversal");
    expect(movement).toMatchObject({ name: "Rent", movementKind: "reversal" });
    expect(movement?.transactionType).toBeUndefined();
  });

  it("inserts nothing on a second run", async () => {
    const { ctx, records } = fixture({
      categories: [{ _id: "alias", organizationId: "org", name: "Tithe", transactionType: "Income", createdAt: 1 }],
    });
    const first = await migrate(ctx);
    const countAfterFirst = records.categories.length;
    const second = await migrate(ctx);

    expect(first.categoriesCreated.length).toBeGreaterThan(0);
    expect(second.categoriesCreated).toEqual([]);
    expect(records.categories).toHaveLength(countAfterFirst);
    const names = records.categories.map((category) => String(category.name).toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
