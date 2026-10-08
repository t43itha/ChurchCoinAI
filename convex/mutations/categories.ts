import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireCapability } from "../lib/auth";
import {
  RCI_INCOME_CATEGORIES,
  RCI_EXPENDITURE_CATEGORIES,
  INCOME_MAIN_CATEGORY_ORDER,
  EXPENDITURE_MAIN_CATEGORY_ORDER,
  CATEGORY_ALIASES,
} from "../../constants/rciCategories";
import { patchTransaction } from "../lib/transactionWrites";
import {
  categoryNameConflict,
  findCategoryByName,
  loadOrganizationCategories,
  sameCategoryName,
} from "../lib/categoryIntegrity";
import { isMovementCategory } from "../../lib/movementCategories";
import type { Doc, Id } from "../_generated/dataModel";

// Funds name their default cash collection category by name, so it follows a
// rename and falls back to Offerings (by clearing) when the category goes.
async function replaceFundDefaultCategory(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  oldName: string,
  newName: string | undefined
) {
  const funds = await ctx.db
    .query("funds")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  for (const fund of funds) {
    if (fund.defaultIncomeCategory && sameCategoryName(fund.defaultIncomeCategory, oldName)) {
      await ctx.db.patch(fund._id, { defaultIncomeCategory: newName });
    }
  }
}

// Create a new category
export const create = mutation({
  args: {
    name: v.string(),
    mainCategory: v.optional(v.string()),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "categories.write");

    const conflict = categoryNameConflict(
      await loadOrganizationCategories(ctx, user.organizationId),
      args.name
    );
    if (conflict) throw new Error(conflict);

    const categoryId = await ctx.db.insert("categories", {
      organizationId: user.organizationId,
      name: args.name,
      mainCategory: args.mainCategory,
      transactionType: args.transactionType,
      displayOrder: args.displayOrder,
      createdAt: Date.now(),
    });

    return categoryId;
  },
});

// Delete a category
export const remove = mutation({
  args: {
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "categories.delete");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== user.organizationId) {
      throw new Error("Category not found");
    }

    // Check if category is in use
    const transactionsUsingCategory = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("category"), category.name))
      .first();

    if (transactionsUsingCategory) {
      throw new Error(
        "Cannot delete a category that is in use. Reassign transactions first."
      );
    }

    await ctx.db.delete(args.categoryId);
    await replaceFundDefaultCategory(ctx, user.organizationId, category.name, undefined);

    return args.categoryId;
  },
});

// Rename a category (updates all transactions using it)
export const rename = mutation({
  args: {
    categoryId: v.id("categories"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "categories.write");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== user.organizationId) {
      throw new Error("Category not found");
    }

    const conflict = categoryNameConflict(
      await loadOrganizationCategories(ctx, user.organizationId),
      args.newName,
      { categoryId: args.categoryId, isMovement: category.movementKind !== undefined }
    );
    if (conflict) throw new Error(conflict);

    const oldName = category.name;

    // Update the category
    await ctx.db.patch(args.categoryId, { name: args.newName });

    // Update all transactions using this category
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("category"), oldName))
      .collect();

    for (const t of transactions) {
      await patchTransaction(ctx, t._id, { category: args.newName }, { lockOverride: "category-rename-cascade" });
    }

    await replaceFundDefaultCategory(ctx, user.organizationId, oldName, args.newName);

    return { categoryId: args.categoryId, updatedTransactions: transactions.length };
  },
});

// Bulk create categories
export const bulkCreate = mutation({
  args: {
    names: v.array(v.string()),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "categories.write");

    const created: string[] = [];
    const skipped: string[] = [];
    const existing: Array<{ _id: string; name: string }> =
      await loadOrganizationCategories(ctx, user.organizationId);

    for (const name of args.names) {
      if (categoryNameConflict(existing, name)) {
        skipped.push(name);
      } else {
        const categoryId = await ctx.db.insert("categories", {
          organizationId: user.organizationId,
          name,
          transactionType: args.transactionType,
          createdAt: Date.now(),
        });
        existing.push({ _id: categoryId, name });
        created.push(name);
      }
    }

    return { created, skipped };
  },
});

// Update a category's mainCategory, transactionType, or displayOrder
export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    mainCategory: v.optional(v.string()),
    transactionType: v.optional(v.union(v.literal("Income"), v.literal("Expenditure"))),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "categories.write");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== user.organizationId) {
      throw new Error("Category not found");
    }

    const updates: Record<string, any> = {};
    if (args.mainCategory !== undefined) updates.mainCategory = args.mainCategory;
    if (args.transactionType !== undefined) updates.transactionType = args.transactionType;
    if (args.displayOrder !== undefined) updates.displayOrder = args.displayOrder;

    await ctx.db.patch(args.categoryId, updates);

    return args.categoryId;
  },
});

// Hide a category from pickers and the categoriser; rows already in it keep it
export const setRetired = mutation({
  args: {
    categoryId: v.id("categories"),
    retired: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "categories.write");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== user.organizationId) {
      throw new Error("Category not found");
    }
    if (category.movementKind) {
      throw new Error("Built-in transfer, returned payment and loan categories can't be retired.");
    }
    // Cash collection service rows fall back to Offerings when they name no category.
    if (args.retired && category.name.trim().toLowerCase() === "offerings") {
      throw new Error("Offerings can't be retired: cash collections record service giving there.");
    }

    await ctx.db.patch(args.categoryId, { isRetired: args.retired || undefined });
    if (args.retired) {
      await replaceFundDefaultCategory(ctx, user.organizationId, category.name, undefined);
    }

    return null;
  },
});

// Seed RCI categories for a new organization
export const seedRCICategories = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "categories.migrate");

    const created: string[] = [];
    const skipped: string[] = [];
    let displayOrder = 0;

    // Seed income categories
    for (const mainCategory of INCOME_MAIN_CATEGORY_ORDER) {
      const subcategories = RCI_INCOME_CATEGORIES[mainCategory];

      if (subcategories.length === 0) {
        // Main category with no subcategories (e.g., Building Fund)
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", user.organizationId).eq("name", mainCategory)
          )
          .first();

        if (existing) {
          // Update existing category with mainCategory metadata
          await ctx.db.patch(existing._id, {
            mainCategory,
            transactionType: "Income",
            displayOrder: displayOrder++,
          });
          skipped.push(mainCategory);
        } else {
          await ctx.db.insert("categories", {
            organizationId: user.organizationId,
            name: mainCategory,
            mainCategory,
            transactionType: "Income",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          created.push(mainCategory);
        }
      } else {
        for (const subcategory of subcategories) {
          const existing = await ctx.db
            .query("categories")
            .withIndex("by_organization_name", (q) =>
              q.eq("organizationId", user.organizationId).eq("name", subcategory)
            )
            .first();

          if (existing) {
            // Update existing category with mainCategory metadata
            await ctx.db.patch(existing._id, {
              mainCategory,
              transactionType: "Income",
              displayOrder: displayOrder++,
            });
            skipped.push(subcategory);
          } else {
            await ctx.db.insert("categories", {
              organizationId: user.organizationId,
              name: subcategory,
              mainCategory,
              transactionType: "Income",
              displayOrder: displayOrder++,
              createdAt: Date.now(),
            });
            created.push(subcategory);
          }
        }
      }
    }

    // Seed expenditure categories
    for (const mainCategory of EXPENDITURE_MAIN_CATEGORY_ORDER) {
      const subcategories = RCI_EXPENDITURE_CATEGORIES[mainCategory];

      if (subcategories.length === 0) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", user.organizationId).eq("name", mainCategory)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            mainCategory,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
          });
          skipped.push(mainCategory);
        } else {
          await ctx.db.insert("categories", {
            organizationId: user.organizationId,
            name: mainCategory,
            mainCategory,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          created.push(mainCategory);
        }
      } else {
        for (const subcategory of subcategories) {
          const existing = await ctx.db
            .query("categories")
            .withIndex("by_organization_name", (q) =>
              q.eq("organizationId", user.organizationId).eq("name", subcategory)
            )
            .first();

          if (existing) {
            await ctx.db.patch(existing._id, {
              mainCategory,
              transactionType: "Expenditure",
              displayOrder: displayOrder++,
            });
            skipped.push(subcategory);
          } else {
            await ctx.db.insert("categories", {
              organizationId: user.organizationId,
              name: subcategory,
              mainCategory,
              transactionType: "Expenditure",
              displayOrder: displayOrder++,
              createdAt: Date.now(),
            });
            created.push(subcategory);
          }
        }
      }
    }

    return { created, updated: skipped };
  },
});

// Migrate existing categories to assign mainCategory based on name matching
export const migrateToMainCategories = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "categories.migrate");

    // Get all categories for this organization
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    let updated = 0;
    let displayOrder = 0;

    // Build lookup maps for quick matching
    const incomeSubcategoryToMain = new Map<string, string>();
    for (const [mainCategory, subcategories] of Object.entries(RCI_INCOME_CATEGORIES)) {
      if (subcategories.length === 0) {
        incomeSubcategoryToMain.set(mainCategory.toLowerCase(), mainCategory);
      } else {
        for (const sub of subcategories) {
          incomeSubcategoryToMain.set(sub.toLowerCase(), mainCategory);
        }
      }
    }

    const expenditureSubcategoryToMain = new Map<string, string>();
    for (const [mainCategory, subcategories] of Object.entries(RCI_EXPENDITURE_CATEGORIES)) {
      if (subcategories.length === 0) {
        expenditureSubcategoryToMain.set(mainCategory.toLowerCase(), mainCategory);
      } else {
        for (const sub of subcategories) {
          expenditureSubcategoryToMain.set(sub.toLowerCase(), mainCategory);
        }
      }
    }

    for (const category of categories) {
      const nameLower = category.name.toLowerCase();

      // Try to match income first
      let mainCategory = incomeSubcategoryToMain.get(nameLower);
      let transactionType: "Income" | "Expenditure" | undefined;

      if (mainCategory) {
        transactionType = "Income";
      } else {
        // Try expenditure
        mainCategory = expenditureSubcategoryToMain.get(nameLower);
        if (mainCategory) {
          transactionType = "Expenditure";
        }
      }

      // If we found a match or if category has no mainCategory, update it
      if (mainCategory || !category.mainCategory) {
        await ctx.db.patch(category._id, {
          mainCategory: mainCategory || "Other",
          transactionType: transactionType || category.transactionType,
          displayOrder: displayOrder++,
        });
        updated++;
      }
    }

    return { updated, total: categories.length };
  },
});

// Backfill transactionType and mainCategory for existing categories using RCI mappings
export const backfillCategoryTransactionTypes = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "categories.migrate");

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const normalizeCategoryName = (name: string) => name.trim().toLowerCase();

    const incomeLookup = new Map<string, string>();
    for (const [mainCategory, subcategories] of Object.entries(RCI_INCOME_CATEGORIES)) {
      const names = [mainCategory, ...subcategories];
      for (const name of names) {
        incomeLookup.set(normalizeCategoryName(name), mainCategory);
      }
    }
    incomeLookup.set(normalizeCategoryName("Donation"), "Donations");

    const expenditureLookup = new Map<string, string>();
    for (const [mainCategory, subcategories] of Object.entries(RCI_EXPENDITURE_CATEGORIES)) {
      const names = [mainCategory, ...subcategories];
      for (const name of names) {
        expenditureLookup.set(normalizeCategoryName(name), mainCategory);
      }
    }

    const aliasLookup = new Map<string, string>();
    for (const [alias, canonicalName] of Object.entries(CATEGORY_ALIASES)) {
      aliasLookup.set(normalizeCategoryName(alias), canonicalName.trim());
    }

    let updated = 0;
    const skipped: string[] = [];

    for (const category of categories) {
      const normalizedName = normalizeCategoryName(category.name);
      const canonicalName = aliasLookup.get(normalizedName);
      const lookupNames = canonicalName
        ? [normalizedName, normalizeCategoryName(canonicalName)]
        : [normalizedName];

      let expectedMainCategory: string | undefined;
      let expectedTransactionType: "Income" | "Expenditure" | undefined;

      for (const lookupName of lookupNames) {
        expectedMainCategory = incomeLookup.get(lookupName);
        if (expectedMainCategory) {
          expectedTransactionType = "Income";
          break;
        }

        expectedMainCategory = expenditureLookup.get(lookupName);
        if (expectedMainCategory) {
          expectedTransactionType = "Expenditure";
          break;
        }
      }

      if (!expectedMainCategory || !expectedTransactionType) {
        skipped.push(category.name);
        continue;
      }

      if (
        category.transactionType === expectedTransactionType &&
        category.mainCategory === expectedMainCategory
      ) {
        continue;
      }

      await ctx.db.patch(category._id, {
        mainCategory: expectedMainCategory,
        transactionType: expectedTransactionType,
      });
      updated++;
    }

    return { updated, skipped };
  },
});

// Internal mutation to seed RCI categories for ALL organizations - can be run from CLI
export const seedAllOrganizations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    const results: { orgName: string; created: string[]; updated: string[] }[] = [];

    for (const org of organizations) {
      const result = await seedCategoriesForOrg(ctx, org._id);
      results.push({ orgName: org.name, ...result });
    }

    return results;
  },
});

// Helper function to seed categories for a single organization
async function seedCategoriesForOrg(
  ctx: any,
  organizationId: any
): Promise<{ created: string[]; updated: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  let displayOrder = 0;

  // Seed income categories
  for (const mainCategory of INCOME_MAIN_CATEGORY_ORDER) {
    const subcategories = RCI_INCOME_CATEGORIES[mainCategory];

    if (subcategories.length === 0) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_organization_name", (q: any) =>
          q.eq("organizationId", organizationId).eq("name", mainCategory)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          mainCategory,
          transactionType: "Income",
          displayOrder: displayOrder++,
        });
        skipped.push(mainCategory);
      } else {
        await ctx.db.insert("categories", {
          organizationId,
          name: mainCategory,
          mainCategory,
          transactionType: "Income",
          displayOrder: displayOrder++,
          createdAt: Date.now(),
        });
        created.push(mainCategory);
      }
    } else {
      for (const subcategory of subcategories) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q: any) =>
            q.eq("organizationId", organizationId).eq("name", subcategory)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            mainCategory,
            transactionType: "Income",
            displayOrder: displayOrder++,
          });
          skipped.push(subcategory);
        } else {
          await ctx.db.insert("categories", {
            organizationId,
            name: subcategory,
            mainCategory,
            transactionType: "Income",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          created.push(subcategory);
        }
      }
    }
  }

  // Seed expenditure categories
  for (const mainCategory of EXPENDITURE_MAIN_CATEGORY_ORDER) {
    const subcategories = RCI_EXPENDITURE_CATEGORIES[mainCategory];

    if (subcategories.length === 0) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_organization_name", (q: any) =>
          q.eq("organizationId", organizationId).eq("name", mainCategory)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          mainCategory,
          transactionType: "Expenditure",
          displayOrder: displayOrder++,
        });
        skipped.push(mainCategory);
      } else {
        await ctx.db.insert("categories", {
          organizationId,
          name: mainCategory,
          mainCategory,
          transactionType: "Expenditure",
          displayOrder: displayOrder++,
          createdAt: Date.now(),
        });
        created.push(mainCategory);
      }
    } else {
      for (const subcategory of subcategories) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q: any) =>
            q.eq("organizationId", organizationId).eq("name", subcategory)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            mainCategory,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
          });
          skipped.push(subcategory);
        } else {
          await ctx.db.insert("categories", {
            organizationId,
            name: subcategory,
            mainCategory,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          created.push(subcategory);
        }
      }
    }
  }

  return { created, updated: skipped };
}

// Internal mutation to seed RCI categories - can be run from dashboard
export const seedRCICategoriesInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const created: string[] = [];
    const skipped: string[] = [];
    let displayOrder = 0;

    // Seed income categories
    for (const mainCategory of INCOME_MAIN_CATEGORY_ORDER) {
      const subcategories = RCI_INCOME_CATEGORIES[mainCategory];

      if (subcategories.length === 0) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", args.organizationId).eq("name", mainCategory)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            mainCategory,
            transactionType: "Income",
            displayOrder: displayOrder++,
          });
          skipped.push(mainCategory);
        } else {
          await ctx.db.insert("categories", {
            organizationId: args.organizationId,
            name: mainCategory,
            mainCategory,
            transactionType: "Income",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          created.push(mainCategory);
        }
      } else {
        for (const subcategory of subcategories) {
          const existing = await ctx.db
            .query("categories")
            .withIndex("by_organization_name", (q) =>
              q.eq("organizationId", args.organizationId).eq("name", subcategory)
            )
            .first();

          if (existing) {
            await ctx.db.patch(existing._id, {
              mainCategory,
              transactionType: "Income",
              displayOrder: displayOrder++,
            });
            skipped.push(subcategory);
          } else {
            await ctx.db.insert("categories", {
              organizationId: args.organizationId,
              name: subcategory,
              mainCategory,
              transactionType: "Income",
              displayOrder: displayOrder++,
              createdAt: Date.now(),
            });
            created.push(subcategory);
          }
        }
      }
    }

    // Seed expenditure categories
    for (const mainCategory of EXPENDITURE_MAIN_CATEGORY_ORDER) {
      const subcategories = RCI_EXPENDITURE_CATEGORIES[mainCategory];

      if (subcategories.length === 0) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", args.organizationId).eq("name", mainCategory)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            mainCategory,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
          });
          skipped.push(mainCategory);
        } else {
          await ctx.db.insert("categories", {
            organizationId: args.organizationId,
            name: mainCategory,
            mainCategory,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          created.push(mainCategory);
        }
      } else {
        for (const subcategory of subcategories) {
          const existing = await ctx.db
            .query("categories")
            .withIndex("by_organization_name", (q) =>
              q.eq("organizationId", args.organizationId).eq("name", subcategory)
            )
            .first();

          if (existing) {
            await ctx.db.patch(existing._id, {
              mainCategory,
              transactionType: "Expenditure",
              displayOrder: displayOrder++,
            });
            skipped.push(subcategory);
          } else {
            await ctx.db.insert("categories", {
              organizationId: args.organizationId,
              name: subcategory,
              mainCategory,
              transactionType: "Expenditure",
              displayOrder: displayOrder++,
              createdAt: Date.now(),
            });
            created.push(subcategory);
          }
        }
      }
    }

    return { created, updated: skipped };
  },
});

// One-time migration: rename orphaned transaction categories to canonical RCI names
// and ensure all RCI categories exist with correct mainCategory mappings.
// Idempotent — safe to run multiple times.
// Names match case-insensitively. Movement categories are never renamed, merged
// into, or given a transaction type.
// NOTE: Temporarily set to internalMutation for dashboard execution. Revert to mutation + requireCapability after running.
export const migrateTransactionCategories = internalMutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const organizationId = args.organizationId;

    const ALIASES = CATEGORY_ALIASES;

    const summary = {
      transactionsRenamed: 0,
      categoriesRenamed: 0,
      categoriesCreated: [] as string[],
      details: {} as Record<string, { from: string; count: number }>,
    };

    type CategoryName = Pick<Doc<"categories">, "_id" | "name" | "mainCategory" | "movementKind">;
    let categories: CategoryName[] = await loadOrganizationCategories(ctx, organizationId);

    const insertCategory = async (category: Omit<Doc<"categories">, "_id" | "_creationTime">) => {
      if (categoryNameConflict(categories, category.name)) return;
      const _id = await ctx.db.insert("categories", category);
      categories.push({ _id, name: category.name, mainCategory: category.mainCategory });
      summary.categoriesCreated.push(category.name);
    };

    // Step 1: Rename category records that use old names
    for (const [oldName, newName] of Object.entries(ALIASES)) {
      const oldCategory = findCategoryByName(categories, oldName);
      const canonical = findCategoryByName(categories, newName);
      if (!oldCategory || isMovementCategory(oldCategory)) continue;
      if (canonical && isMovementCategory(canonical)) continue;

      if (canonical || categoryNameConflict(categories, newName, { categoryId: oldCategory._id })) {
        // The canonical name is taken, so the old category merges into it
        await ctx.db.delete(oldCategory._id);
        categories = categories.filter((category) => category._id !== oldCategory._id);
      } else {
        await ctx.db.patch(oldCategory._id, { name: newName });
        oldCategory.name = newName;
      }
      summary.categoriesRenamed++;
    }

    // Step 2: Update all transactions with old category names
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect();

    for (const t of transactions) {
      const canonical = ALIASES[t.category];
      if (canonical) {
        await patchTransaction(ctx, t._id, { category: canonical }, { lockOverride: "category-rename-cascade" });
        summary.transactionsRenamed++;
        if (!summary.details[t.category]) {
          summary.details[t.category] = { from: t.category, count: 0 };
        }
        summary.details[t.category].count++;
      }
    }

    // Step 3: Ensure "Donation" category exists under "Donations" main category
    const donationCategory = findCategoryByName(categories, "Donation");
    if (!donationCategory) {
      await insertCategory({
        organizationId,
        name: "Donation",
        mainCategory: "Donations",
        transactionType: "Income",
        displayOrder: 3,
        createdAt: Date.now(),
      });
    } else if (!isMovementCategory(donationCategory) && donationCategory.mainCategory !== "Donations") {
      await ctx.db.patch(donationCategory._id, {
        mainCategory: "Donations",
        transactionType: "Income",
      });
    }

    // Step 4: Re-run seedRCICategories logic to ensure all canonical categories exist
    let displayOrder = 0;
    const seedCategory = async (name: string, mainCategory: string, transactionType: "Income" | "Expenditure") => {
      const order = displayOrder++;
      const existing = findCategoryByName(categories, name);
      if (!existing) {
        await insertCategory({
          organizationId,
          name,
          mainCategory,
          transactionType,
          displayOrder: order,
          createdAt: Date.now(),
        });
      } else if (!isMovementCategory(existing)) {
        await ctx.db.patch(existing._id, { mainCategory, transactionType, displayOrder: order });
      }
    };

    for (const [mainCat, subcats] of Object.entries(RCI_INCOME_CATEGORIES)) {
      const names = subcats.length === 0 ? [mainCat] : subcats;
      for (const name of names) await seedCategory(name, mainCat, "Income");
    }

    for (const [mainCat, subcats] of Object.entries(RCI_EXPENDITURE_CATEGORIES)) {
      const names = subcats.length === 0 ? [mainCat] : subcats;
      for (const name of names) await seedCategory(name, mainCat, "Expenditure");
    }

    return summary;
  },
});
