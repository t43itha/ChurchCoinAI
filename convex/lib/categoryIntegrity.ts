import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { CATEGORY_ALIASES, getRCICategorySeedData } from "../../constants/rciCategories";
import { missingMovementCategories, type MovementKind } from "../../lib/movementCategories";
import { resolveCategoryForTransaction } from "../intelligence/categorization/categoryResolver";

type CategoryCtx = QueryCtx | MutationCtx;

const normalizeName = (name: string) => name.trim().toLowerCase();
const ALIAS_TARGETS = new Map(
  Object.entries(CATEGORY_ALIASES).map(([alias, target]) => [normalizeName(alias), target])
);
const SEED_NAMES = new Set(getRCICategorySeedData().map((seed) => normalizeName(seed.name)));

// Names resolve case-insensitively and through aliases, so a name that only
// differs by case, or is an alias of another category, would hide one of them.
// A movement category also can't take a seed name: the seed backfill would
// give it a transaction type, and cash collections write "Offerings" directly.
export function categoryNameConflict(
  existing: Array<{ _id: string; name: string }>,
  name: string,
  { categoryId, isMovement = false }: { categoryId?: string; isMovement?: boolean } = {}
): string | null {
  const trimmed = name.trim();
  const normalized = normalizeName(name);
  if (!normalized) return "Enter a category name";
  if (existing.some((category) => category._id !== categoryId && normalizeName(category.name) === normalized)) {
    return `Category "${trimmed}" already exists`;
  }
  const aliasTarget = ALIAS_TARGETS.get(normalized);
  if (aliasTarget && normalizeName(aliasTarget) !== normalized) {
    return `"${trimmed}" is another name for "${aliasTarget}"`;
  }
  if (isMovement && SEED_NAMES.has(normalized)) {
    return `"${trimmed}" is a built-in category name`;
  }
  return null;
}

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
