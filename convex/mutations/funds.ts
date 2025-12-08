import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Create a new fund
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("Unrestricted"),
      v.literal("Restricted"),
      v.literal("Designated"),
      v.literal("Endowment")
    ),
    description: v.optional(v.string()),
    targetAmount: v.optional(v.number()),
    deadline: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Check for duplicate fund name
    const existing = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();

    if (existing) {
      throw new Error(`A fund named "${args.name}" already exists`);
    }

    const fundId = await ctx.db.insert("funds", {
      organizationId: user.organizationId,
      name: args.name,
      type: args.type,
      description: args.description,
      targetAmount: args.targetAmount,
      deadline: args.deadline,
      logoUrl: args.logoUrl,
      createdAt: Date.now(),
    });

    return fundId;
  },
});

// Update a fund
export const update = mutation({
  args: {
    fundId: v.id("funds"),
    name: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("Unrestricted"),
        v.literal("Restricted"),
        v.literal("Designated"),
        v.literal("Endowment")
      )
    ),
    description: v.optional(v.string()),
    targetAmount: v.optional(v.number()),
    deadline: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      throw new Error("Fund not found");
    }

    // Check for duplicate name if changing name
    if (args.name && args.name !== fund.name) {
      const existing = await ctx.db
        .query("funds")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .filter((q) => q.eq(q.field("name"), args.name))
        .first();

      if (existing) {
        throw new Error(`A fund named "${args.name}" already exists`);
      }
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.type !== undefined) updates.type = args.type;
    if (args.description !== undefined) updates.description = args.description;
    if (args.targetAmount !== undefined) updates.targetAmount = args.targetAmount;
    if (args.deadline !== undefined) updates.deadline = args.deadline;
    if (args.logoUrl !== undefined) updates.logoUrl = args.logoUrl;

    await ctx.db.patch(args.fundId, updates);

    return args.fundId;
  },
});

// Delete a fund (only if no transactions)
export const remove = mutation({
  args: {
    fundId: v.id("funds"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      throw new Error("Fund not found");
    }

    // Check if fund has transactions
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_fund", (q) => q.eq("fundId", args.fundId))
      .first();

    if (transactions) {
      throw new Error(
        "Cannot delete a fund with existing transactions. Reassign transactions first."
      );
    }

    // Check if fund has pledges
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_fund", (q) => q.eq("fundId", args.fundId))
      .first();

    if (pledges) {
      throw new Error(
        "Cannot delete a fund with existing pledges. Reassign pledges first."
      );
    }

    await ctx.db.delete(args.fundId);

    return args.fundId;
  },
});
