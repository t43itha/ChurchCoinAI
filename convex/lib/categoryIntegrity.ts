import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getRCICategorySeedData } from "../../constants/rciCategories";
import { resolveCategoryForTransaction } from "../intelligence/categorization/categoryResolver";

type CategoryCtx = QueryCtx | MutationCtx;

export async function seedOrganizationCategories(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  now: number
) {
  for (const category of getRCICategorySeedData()) {
    await ctx.db.insert("categories", {
      organizationId,
      name: category.name,
      mainCategory: category.mainCategory,
      transactionType: category.transactionType,
      displayOrder: category.displayOrder,
      createdAt: now,
    });
  }
}

// Older organisations were seeded with names only. The categoriser ignores a
// category that has no transaction type, so the first write backfills the
// canonical catalogue without renaming ledger history.
export async function ensureTypedCategories(
  ctx: MutationCtx,
  organizationId: Id<"organizations">
) {
  const existing = await ctx.db
    .query("categories")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  const now = Date.now();
  let changed = false;
  for (const seed of getRCICategorySeedData()) {
    const match = existing.find(
      (category) => category.name.trim().toLowerCase() === seed.name.toLowerCase()
    );
    if (match) {
      if (match.transactionType) continue;
      changed = true;
      await ctx.db.patch(match._id, {
        mainCategory: seed.mainCategory,
        transactionType: seed.transactionType,
        displayOrder: seed.displayOrder,
      });
      continue;
    }
    changed = true;
    await ctx.db.insert("categories", {
      organizationId,
      name: seed.name,
      mainCategory: seed.mainCategory,
      transactionType: seed.transactionType,
      displayOrder: seed.displayOrder,
      createdAt: now,
    });
  }

  if (!changed) return existing;

  return await ctx.db
    .query("categories")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
}

export const requireCanonicalCategory = (
  categories: Array<{
    name: string;
    mainCategory?: string;
    transactionType?: "Income" | "Expenditure";
    displayOrder?: number;
  }>,
  categoryName: string,
  transactionType: "Income" | "Expenditure"
) => {
  const resolved = resolveCategoryForTransaction(
    categoryName,
    transactionType,
    categories
  );
  if (!resolved) {
    throw new Error(
      `Choose a valid ${transactionType.toLowerCase()} category`
    );
  }
  return resolved.name;
};

export async function loadOrganizationCategories(
  ctx: CategoryCtx,
  organizationId: Id<"organizations">
) {
  return await ctx.db
    .query("categories")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
}
