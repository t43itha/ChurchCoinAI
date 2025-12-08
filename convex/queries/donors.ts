import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "../lib/auth";

// List all donors
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return donors;
  },
});

// Get a specific donor by ID
export const getById = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const donor = await ctx.db.get(args.donorId);

    if (!donor || donor.organizationId !== user.organizationId) {
      return null;
    }

    return donor;
  },
});

// Search donors by name
export const searchByName = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const searchLower = args.searchTerm.toLowerCase();
    return donors.filter((d) => d.name.toLowerCase().includes(searchLower));
  },
});

// Get donor with their pledges and giving history
export const getWithHistory = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const donor = await ctx.db.get(args.donorId);

    if (!donor || donor.organizationId !== user.organizationId) {
      return null;
    }

    // Get pledges for this donor
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    // Get transactions for this donor
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    // Calculate total giving
    const totalGiving = transactions
      .filter((t) => t.type === "Income")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      ...donor,
      pledges,
      transactions,
      totalGiving,
    };
  },
});

// Get Gift Aid eligible donors
export const listGiftAidEligible = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("isGiftAidActive"), true))
      .collect();

    return donors;
  },
});
