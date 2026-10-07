import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getRCICategorySeedData } from "../../constants/rciCategories";
import { missingMovementCategories, type MovementKind } from "../../lib/movementCategories";
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
  await insertMissingMovementCategories(ctx, organizationId, [], now);
}

// Movement categories carry no transaction type: the resolver accepts an
// untyped category for both income and expenditure.
async function insertMissingMovementCategories(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  existing: Array<{ name: string; movementKind?: MovementKind }>,
  now: number
) {
  const missing = missingMovementCategories(existing);
  for (const category of missing) {
    await ctx.db.insert("categories", {
      organizationId,
      name: category.name,
      mainCategory: category.mainCategory,
      movementKind: category.movementKind,
      displayOrder: category.displayOrder,
      createdAt: now,
    });
  }
  return missing.length > 0;
}

// Older organisations were seeded with names only. The categoriser ignores a
// category that has no transaction type, so each write backfills canonical
// rows. User-created categories that still have no type stay usable: the
// resolver accepts an exact untyped name instead of blocking the write.
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

  if (await insertMissingMovementCategories(ctx, organizationId, existing, now)) {
    changed = true;
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
    movementKind?: MovementKind;
  }>,
  categoryName: string,
  transactionType: "Income" | "Expenditure"
): { category: string; movementKind: MovementKind | undefined } => {
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
  // Callers write both fields, so leaving a movement category clears the kind.
  return { category: resolved.name, movementKind: resolved.movementKind };
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
