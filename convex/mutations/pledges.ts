import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";
import { roundMoney } from "../lib/money";
import { refreshPledgeStatus } from "../lib/pledgeStatus";
import { pledgeFulfillmentTarget } from "../../lib/pledgeProgress";

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
      amount: roundMoney(args.amount),
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

    if (args.donorId) {
      const donor = await ctx.db.get(args.donorId);
      if (!donor || donor.organizationId !== user.organizationId) {
        throw new Error("Invalid donor");
      }
    }

    const updates: Record<string, any> = {};
    if (args.donorId !== undefined) updates.donorId = args.donorId;
    if (args.donorName !== undefined) updates.donorName = args.donorName;
    if (args.amount !== undefined) updates.amount = roundMoney(args.amount);
    if (args.fundId !== undefined) updates.fundId = args.fundId;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.startDate !== undefined) updates.startDate = args.startDate;
    if (args.endDate !== undefined) updates.endDate = args.endDate;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(args.pledgeId, updates);

    if (
      args.amount !== undefined ||
      args.frequency !== undefined ||
      args.startDate !== undefined ||
      args.endDate !== undefined ||
      args.status === "Active"
    ) {
      await refreshPledgeStatus(ctx, args.pledgeId, user.organizationId);
    }

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
      const amount = roundMoney(pledge.amount);
      // Verify fund belongs to organization
      const fund = await ctx.db.get(pledge.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${pledge.fundId}`);
      }

      // Check for duplicate pledge (donorId + fundId + amount)
      if (pledge.donorId) {
        const donor = await ctx.db.get(pledge.donorId);
        if (!donor || donor.organizationId !== user.organizationId) {
          throw new Error(`Invalid donor: ${pledge.donorId}`);
        }

        const existingPledge = await ctx.db
          .query("pledges")
          .withIndex("by_donor_fund_amount", (q) =>
            q.eq("donorId", pledge.donorId!)
              .eq("fundId", pledge.fundId)
              .eq("amount", amount)
          )
          .first();

        if (existingPledge) {
          continue; // Skip duplicate
        }
      }

      const pledgeId = await ctx.db.insert("pledges", {
        organizationId: user.organizationId,
        donorId: pledge.donorId,
        donorName: pledge.donorName,
        amount,
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
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const result = await refreshPledgeStatus(
      ctx,
      args.pledgeId,
      user.organizationId
    );
    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      return { updated: false, reason: "Pledge not found" };
    }
    const target = pledgeFulfillmentTarget(pledge);
    if (!result?.completed) {
      return {
        updated: false,
        reason: target === null ? "Open-ended pledge stays active" : "Not yet fulfilled",
        pledgeAmount: target ?? pledge.amount,
      };
    }
    return {
      updated: true,
      status: "Completed" as const,
      pledgeAmount: target ?? pledge.amount,
      donorName: pledge.donorName,
    };
  },
});

// Reactivate a completed pledge (when transaction is unlinked)
export const reactivateIfNeeded = mutation({
  args: {
    pledgeId: v.id("pledges"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const before = await ctx.db.get(args.pledgeId);
    if (!before || before.organizationId !== user.organizationId) {
      return { reactivated: false };
    }
    const wasCompleted = before.status === "Completed";
    const result = await refreshPledgeStatus(
      ctx,
      args.pledgeId,
      user.organizationId
    );
    return {
      reactivated: wasCompleted && result === null,
      newStatus: wasCompleted && result === null ? ("Active" as const) : undefined,
    };
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
      await ctx.db.patch(t._id, { pledgeId: null });
    }

    await ctx.db.delete(args.pledgeId);

    return args.pledgeId;
  },
});

// Cleanup duplicate pledges (keeps oldest, deletes newer duplicates)
// Duplicates are identified by: donorId + fundId + amount
// Internal version for CLI use - pass organizationId directly
export const cleanupDuplicates = internalMutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    // If no org specified, get all orgs and process each
    let orgIds: Id<"organizations">[];

    if (args.organizationId) {
      orgIds = [args.organizationId];
    } else {
      const orgs = await ctx.db.query("organizations").collect();
      orgIds = orgs.map(o => o._id);
    }

    let totalDeleted = 0;
    const allDeletedIds: string[] = [];

    for (const orgId of orgIds) {
      // Get all pledges for this organization
      const allPledges = await ctx.db
        .query("pledges")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect();

      // Group by donorId + fundId + amount
      const groups = new Map<string, typeof allPledges>();

      for (const pledge of allPledges) {
        // Use donorId if available, otherwise use donorName
        const donorKey = pledge.donorId ?? pledge.donorName.toLowerCase();
        const key = `${donorKey}|${pledge.fundId}|${pledge.amount}`;

        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(pledge);
      }

      // Find and delete duplicates (keep the oldest by createdAt)
      for (const [, pledges] of groups) {
        if (pledges.length > 1) {
          // Sort by createdAt ascending (oldest first)
          pledges.sort((a, b) => a.createdAt - b.createdAt);

          // Keep the first (oldest), delete the rest
          const toDelete = pledges.slice(1);

          for (const pledge of toDelete) {
            // Unlink any transactions from this pledge before deleting
            const linkedTransactions = await ctx.db
              .query("transactions")
              .withIndex("by_pledge", (q) => q.eq("pledgeId", pledge._id))
              .collect();

            for (const t of linkedTransactions) {
              await ctx.db.patch(t._id, { pledgeId: null });
            }

            await ctx.db.delete(pledge._id);
            allDeletedIds.push(pledge._id);
            totalDeleted++;
          }
        }
      }
    }

    return {
      duplicatesDeleted: totalDeleted,
      deletedIds: allDeletedIds,
    };
  },
});
