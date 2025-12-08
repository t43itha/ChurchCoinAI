import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Create a new category
export const create = mutation({
  args: {
    name: v.string(),
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
