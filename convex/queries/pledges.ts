import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "../lib/auth";

// List all pledges
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return pledges;
  },
});

// Get pledges by status
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("Active"),
      v.literal("Completed"),
      v.literal("Cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", args.status)
      )
      .collect();

    return pledges;
  },
});

// Get pledges for a specific fund
export const byFund = query({
  args: { fundId: v.id("funds") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Verify fund belongs to organization
    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      return [];
    }

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_fund", (q) => q.eq("fundId", args.fundId))
      .collect();

    return pledges;
  },
});

// Get pledges for a specific donor
export const byDonor = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Verify donor belongs to organization
    const donor = await ctx.db.get(args.donorId);
    if (!donor || donor.organizationId !== user.organizationId) {
      return [];
    }

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    return pledges;
  },
});

// Get a specific pledge with linked transactions and progress
export const getWithProgress = query({
  args: { pledgeId: v.id("pledges") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const pledge = await ctx.db.get(args.pledgeId);

    if (!pledge || pledge.organizationId !== user.organizationId) {
      return null;
    }

    // Get transactions linked to this pledge
    const linkedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_pledge", (q) => q.eq("pledgeId", args.pledgeId))
      .filter((q) => q.eq(q.field("type"), "Income"))
      .collect();

    const totalReceived = linkedTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );

    const progress =
      pledge.amount > 0
        ? Math.min((totalReceived / pledge.amount) * 100, 100)
        : 0;

    // Get fund name for display
    const fund = await ctx.db.get(pledge.fundId);

    return {
      ...pledge,
      fundName: fund?.name ?? "Unknown Fund",
      linkedTransactions,
      totalReceived,
      progress,
      remaining: Math.max(pledge.amount - totalReceived, 0),
    };
  },
});

// Get unlinked income transactions (for Smart Link feature)
export const getUnlinkedIncomeForMatching = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const unlinkedIncome = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "Income"),
          q.eq(q.field("pledgeId"), undefined)
        )
      )
      .collect();

    return unlinkedIncome;
  },
});
