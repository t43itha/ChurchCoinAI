import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import {
  RCI_INCOME_CATEGORIES,
  RCI_EXPENDITURE_CATEGORIES,
  INCOME_MAIN_CATEGORY_ORDER,
  EXPENDITURE_MAIN_CATEGORY_ORDER,
} from "../../constants/rciCategories";

// Create a new category
export const create = mutation({
  args: {
    name: v.string(),
    mainCategory: v.optional(v.string()),
    transactionType: v.optional(v.union(v.literal("Income"), v.literal("Expenditure"))),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Check for duplicate
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_organization_name", (q) =>
        q.eq("organizationId", user.organizationId).eq("name", args.name)
      )
      .first();

    if (existing) {
      throw new Error(`Category "${args.name}" already exists`);
    }

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
    const user = await requireRole(ctx, ["Admin"]);

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
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== user.organizationId) {
      throw new Error("Category not found");
    }

    // Check for duplicate
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_organization_name", (q) =>
        q.eq("organizationId", user.organizationId).eq("name", args.newName)
      )
      .first();

    if (existing && existing._id !== args.categoryId) {
      throw new Error(`Category "${args.newName}" already exists`);
    }

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
      await ctx.db.patch(t._id, { category: args.newName });
    }

    return { categoryId: args.categoryId, updatedTransactions: transactions.length };
  },
});

// Bulk create categories
export const bulkCreate = mutation({
  args: {
    names: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const created: string[] = [];
    const skipped: string[] = [];

    for (const name of args.names) {
      // Check for duplicate
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_organization_name", (q) =>
          q.eq("organizationId", user.organizationId).eq("name", name)
        )
        .first();

      if (existing) {
        skipped.push(name);
      } else {
        await ctx.db.insert("categories", {
          organizationId: user.organizationId,
          name,
          createdAt: Date.now(),
        });
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
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

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

// Seed RCI categories for a new organization
export const seedRCICategories = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin"]);

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
    const user = await requireRole(ctx, ["Admin"]);

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
