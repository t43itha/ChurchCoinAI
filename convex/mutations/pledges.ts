import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole, requireAuth } from "../lib/auth";
import { Id } from "../_generated/dataModel";

// Create a new pledge
export const create = mutation({
  args: {
    donorId: v.optional(v.id("donors")),
    donorName: v.string(),
    amount: v.number(),
    fundId: v.id("funds"),
    frequency: v.union(
      v.literal("One-off"),
      v.literal("Monthly"),
      v.literal("Annual"),
      v.literal("Weekly")
    ),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("Active"), v.literal("Completed"), v.literal("Cancelled"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Verify fund belongs to organization
    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      throw new Error("Invalid fund");
    }

    // Verify donor if provided
    if (args.donorId) {
      const donor = await ctx.db.get(args.donorId);
      if (!donor || donor.organizationId !== user.organizationId) {
        throw new Error("Invalid donor");
      }
    }

    const pledgeId = await ctx.db.insert("pledges", {
      organizationId: user.organizationId,
      donorId: args.donorId,
      donorName: args.donorName,
      amount: args.amount,
      fundId: args.fundId,
      frequency: args.frequency,
      startDate: args.startDate,
      endDate: args.endDate,
      status: args.status ?? "Active",
      createdAt: Date.now(),
    });

    return pledgeId;
  },
});

// Update a pledge
export const update = mutation({
  args: {
    pledgeId: v.id("pledges"),
    donorId: v.optional(v.id("donors")),
    donorName: v.optional(v.string()),
    amount: v.optional(v.number()),
    fundId: v.optional(v.id("funds")),
    frequency: v.optional(
      v.union(
        v.literal("One-off"),
        v.literal("Monthly"),
        v.literal("Annual"),
        v.literal("Weekly")
      )
    ),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("Active"), v.literal("Completed"), v.literal("Cancelled"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      throw new Error("Pledge not found");
    }

    // Verify new fund if provided
    if (args.fundId) {
      const fund = await ctx.db.get(args.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error("Invalid fund");
      }
    }

    const updates: Record<string, any> = {};
    if (args.donorId !== undefined) updates.donorId = args.donorId;
    if (args.donorName !== undefined) updates.donorName = args.donorName;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.fundId !== undefined) updates.fundId = args.fundId;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.startDate !== undefined) updates.startDate = args.startDate;
    if (args.endDate !== undefined) updates.endDate = args.endDate;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(args.pledgeId, updates);

    return args.pledgeId;
  },
});

// Bulk create pledges (for CSV import)
export const bulkCreate = mutation({
  args: {
    pledges: v.array(
      v.object({
        donorId: v.optional(v.id("donors")),
        donorName: v.string(),
        amount: v.number(),
        fundId: v.id("funds"),
        frequency: v.union(
          v.literal("One-off"),
          v.literal("Monthly"),
          v.literal("Annual"),
          v.literal("Weekly")
        ),
        startDate: v.string(),
        endDate: v.optional(v.string()),
        status: v.optional(
          v.union(v.literal("Active"), v.literal("Completed"), v.literal("Cancelled"))
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const pledgeIds: string[] = [];

    for (const pledge of args.pledges) {
      // Verify fund belongs to organization
      const fund = await ctx.db.get(pledge.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${pledge.fundId}`);
      }

      const pledgeId = await ctx.db.insert("pledges", {
        organizationId: user.organizationId,
        donorId: pledge.donorId,
        donorName: pledge.donorName,
        amount: pledge.amount,
        fundId: pledge.fundId,
        frequency: pledge.frequency,
        startDate: pledge.startDate,
        endDate: pledge.endDate,
        status: pledge.status ?? "Active",
        createdAt: Date.now(),
      });

      pledgeIds.push(pledgeId);
    }

    return { count: pledgeIds.length, ids: pledgeIds };
  },
});

// Check and update pledge completion status
export const checkCompletion = mutation({
  args: {
    pledgeId: v.id("pledges"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      return { updated: false, reason: "Pledge not found" };
    }

    if (pledge.status !== "Active") {
      return { updated: false, reason: "Pledge is not active" };
    }

    // Get all income transactions linked to this pledge
    const linkedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_pledge", (q) => q.eq("pledgeId", args.pledgeId))
      .filter((q) => q.eq(q.field("type"), "Income"))
      .collect();

    const totalReceived = linkedTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );

    if (totalReceived >= pledge.amount) {
      await ctx.db.patch(args.pledgeId, { status: "Completed" });
      return {
        updated: true,
        status: "Completed",
        totalReceived,
        pledgeAmount: pledge.amount,
        donorName: pledge.donorName,
      };
    }

    return {
      updated: false,
      reason: "Not yet fulfilled",
      totalReceived,
      pledgeAmount: pledge.amount,
      remaining: pledge.amount - totalReceived,
    };
  },
});

// Reactivate a completed pledge (when transaction is unlinked)
export const reactivateIfNeeded = mutation({
  args: {
    pledgeId: v.id("pledges"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      return { reactivated: false };
    }

    if (pledge.status !== "Completed") {
      return { reactivated: false };
    }

    // Get all income transactions linked to this pledge
    const linkedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_pledge", (q) => q.eq("pledgeId", args.pledgeId))
      .filter((q) => q.eq(q.field("type"), "Income"))
      .collect();

    const totalReceived = linkedTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );

    if (totalReceived < pledge.amount) {
      await ctx.db.patch(args.pledgeId, { status: "Active" });
      return { reactivated: true, newStatus: "Active" };
    }

    return { reactivated: false };
  },
});

// Delete a pledge
export const remove = mutation({
  args: {
    pledgeId: v.id("pledges"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      throw new Error("Pledge not found");
    }

    // Unlink any transactions from this pledge
    const linkedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_pledge", (q) => q.eq("pledgeId", args.pledgeId))
      .collect();

    for (const t of linkedTransactions) {
      await ctx.db.patch(t._id, { pledgeId: undefined });
    }

    await ctx.db.delete(args.pledgeId);

    return args.pledgeId;
  },
});
