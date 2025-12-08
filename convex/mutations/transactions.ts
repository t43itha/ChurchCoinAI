import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";

// Helper to check pledge completion after transaction changes
async function checkPledgeCompletion(
  ctx: any,
  pledgeId: Id<"pledges">,
  organizationId: Id<"organizations">
) {
  const pledge = await ctx.db.get(pledgeId);
  if (!pledge || pledge.status !== "Active") return null;

  const linkedTransactions = await ctx.db
    .query("transactions")
    .withIndex("by_pledge", (q: any) => q.eq("pledgeId", pledgeId))
    .filter((q: any) => q.eq(q.field("type"), "Income"))
    .collect();

  const totalReceived = linkedTransactions.reduce(
    (sum: number, t: any) => sum + t.amount,
    0
  );

  if (totalReceived >= pledge.amount) {
    await ctx.db.patch(pledgeId, { status: "Completed" });
    return {
      completed: true,
      pledgeId,
      donorName: pledge.donorName,
      amount: pledge.amount,
    };
  }

  return null;
}

// Create a new transaction
export const create = mutation({
  args: {
    date: v.string(),
    description: v.string(),
    amount: v.number(),
    type: v.union(v.literal("Income"), v.literal("Expenditure")),
    category: v.string(),
    fundId: v.id("funds"),
    isReconciled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    donorId: v.optional(v.id("donors")),
    pledgeId: v.optional(v.id("pledges")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Verify fund belongs to organization
    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      throw new Error("Invalid fund");
    }

    const transactionId = await ctx.db.insert("transactions", {
      organizationId: user.organizationId,
      date: args.date,
      description: args.description,
      amount: args.amount,
      type: args.type,
      category: args.category,
      fundId: args.fundId,
      isReconciled: args.isReconciled ?? false,
      notes: args.notes,
      isGiftAidEligible: args.isGiftAidEligible,
      donorName: args.donorName,
      donorId: args.donorId,
      pledgeId: args.pledgeId,
      createdAt: Date.now(),
    });

    // Check pledge completion if linked
    let pledgeCompleted = null;
    if (args.pledgeId && args.type === "Income") {
      pledgeCompleted = await checkPledgeCompletion(
        ctx,
        args.pledgeId,
        user.organizationId
      );
    }

    return { transactionId, pledgeCompleted };
  },
});

// Update a transaction
export const update = mutation({
  args: {
    transactionId: v.id("transactions"),
    date: v.optional(v.string()),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    type: v.optional(v.union(v.literal("Income"), v.literal("Expenditure"))),
    category: v.optional(v.string()),
    fundId: v.optional(v.id("funds")),
    isReconciled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    donorId: v.optional(v.id("donors")),
    pledgeId: v.optional(v.id("pledges")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }

    // Verify new fund if provided
    if (args.fundId) {
      const fund = await ctx.db.get(args.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error("Invalid fund");
      }
    }

    const oldPledgeId = transaction.pledgeId;
    const updates: Record<string, any> = {};

    if (args.date !== undefined) updates.date = args.date;
    if (args.description !== undefined) updates.description = args.description;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.type !== undefined) updates.type = args.type;
    if (args.category !== undefined) updates.category = args.category;
    if (args.fundId !== undefined) updates.fundId = args.fundId;
    if (args.isReconciled !== undefined) updates.isReconciled = args.isReconciled;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.isGiftAidEligible !== undefined)
      updates.isGiftAidEligible = args.isGiftAidEligible;
    if (args.donorName !== undefined) updates.donorName = args.donorName;
    if (args.donorId !== undefined) updates.donorId = args.donorId;
    if (args.pledgeId !== undefined) updates.pledgeId = args.pledgeId;

    await ctx.db.patch(args.transactionId, updates);

    // Check pledge completion for new pledge
    let pledgeCompleted = null;
    const newPledgeId = args.pledgeId ?? transaction.pledgeId;
    const transactionType = args.type ?? transaction.type;

    if (newPledgeId && transactionType === "Income") {
      pledgeCompleted = await checkPledgeCompletion(
        ctx,
        newPledgeId,
        user.organizationId
      );
    }

    // If pledge was unlinked, check if old pledge should be reactivated
    if (oldPledgeId && args.pledgeId === null) {
      const oldPledge = await ctx.db.get(oldPledgeId);
      if (oldPledge && oldPledge.status === "Completed") {
        const linkedTransactions = await ctx.db
          .query("transactions")
          .withIndex("by_pledge", (q) => q.eq("pledgeId", oldPledgeId))
          .filter((q) => q.eq(q.field("type"), "Income"))
          .collect();

        const totalReceived = linkedTransactions.reduce(
          (sum, t) => sum + t.amount,
          0
        );

        if (totalReceived < oldPledge.amount) {
          await ctx.db.patch(oldPledgeId, { status: "Active" });
        }
      }
    }

    return { transactionId: args.transactionId, pledgeCompleted };
  },
});

// Bulk create transactions (for CSV import)
export const bulkCreate = mutation({
  args: {
    transactions: v.array(
      v.object({
        date: v.string(),
        description: v.string(),
        amount: v.number(),
        type: v.union(v.literal("Income"), v.literal("Expenditure")),
        category: v.string(),
        fundId: v.id("funds"),
        isReconciled: v.optional(v.boolean()),
        notes: v.optional(v.string()),
        isGiftAidEligible: v.optional(v.boolean()),
        donorName: v.optional(v.string()),
        pledgeId: v.optional(v.id("pledges")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transactionIds: string[] = [];
    const pledgesToCheck = new Set<string>();

    for (const t of args.transactions) {
      // Verify fund belongs to organization
      const fund = await ctx.db.get(t.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${t.fundId}`);
      }

      const transactionId = await ctx.db.insert("transactions", {
        organizationId: user.organizationId,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        category: t.category,
        fundId: t.fundId,
        isReconciled: t.isReconciled ?? false,
        notes: t.notes,
        isGiftAidEligible: t.isGiftAidEligible,
        donorName: t.donorName,
        pledgeId: t.pledgeId,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);

      if (t.pledgeId && t.type === "Income") {
        pledgesToCheck.add(t.pledgeId);
      }
    }

    // Check all affected pledges
    const completedPledges: any[] = [];
    for (const pledgeId of pledgesToCheck) {
      const result = await checkPledgeCompletion(
        ctx,
        pledgeId as Id<"pledges">,
        user.organizationId
      );
      if (result?.completed) {
        completedPledges.push(result);
      }
    }

    return {
      count: transactionIds.length,
      ids: transactionIds,
      completedPledges,
    };
  },
});

// Bulk update transactions
export const bulkUpdate = mutation({
  args: {
    transactionIds: v.array(v.id("transactions")),
    updates: v.object({
      category: v.optional(v.string()),
      fundId: v.optional(v.id("funds")),
      isReconciled: v.optional(v.boolean()),
      isGiftAidEligible: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Verify new fund if provided
    if (args.updates.fundId) {
      const fund = await ctx.db.get(args.updates.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error("Invalid fund");
      }
    }

    let updatedCount = 0;

    for (const transactionId of args.transactionIds) {
      const transaction = await ctx.db.get(transactionId);
      if (transaction && transaction.organizationId === user.organizationId) {
        const updates: Record<string, any> = {};
        if (args.updates.category !== undefined)
          updates.category = args.updates.category;
        if (args.updates.fundId !== undefined)
          updates.fundId = args.updates.fundId;
        if (args.updates.isReconciled !== undefined)
          updates.isReconciled = args.updates.isReconciled;
        if (args.updates.isGiftAidEligible !== undefined)
          updates.isGiftAidEligible = args.updates.isGiftAidEligible;

        await ctx.db.patch(transactionId, updates);
        updatedCount++;
      }
    }

    return { updatedCount };
  },
});

// Batch update (different updates per transaction)
export const batchUpdate = mutation({
  args: {
    updates: v.array(
      v.object({
        transactionId: v.id("transactions"),
        changes: v.object({
          category: v.optional(v.string()),
          fundId: v.optional(v.id("funds")),
          isReconciled: v.optional(v.boolean()),
          isGiftAidEligible: v.optional(v.boolean()),
          donorName: v.optional(v.string()),
          pledgeId: v.optional(v.id("pledges")),
        }),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    let updatedCount = 0;
    const pledgesToCheck = new Set<string>();

    for (const update of args.updates) {
      const transaction = await ctx.db.get(update.transactionId);
      if (transaction && transaction.organizationId === user.organizationId) {
        const changes: Record<string, any> = {};

        if (update.changes.category !== undefined)
          changes.category = update.changes.category;
        if (update.changes.fundId !== undefined) {
          // Verify fund
          const fund = await ctx.db.get(update.changes.fundId);
          if (fund && fund.organizationId === user.organizationId) {
            changes.fundId = update.changes.fundId;
          }
        }
        if (update.changes.isReconciled !== undefined)
          changes.isReconciled = update.changes.isReconciled;
        if (update.changes.isGiftAidEligible !== undefined)
          changes.isGiftAidEligible = update.changes.isGiftAidEligible;
        if (update.changes.donorName !== undefined)
          changes.donorName = update.changes.donorName;
        if (update.changes.pledgeId !== undefined) {
          changes.pledgeId = update.changes.pledgeId;
          if (update.changes.pledgeId && transaction.type === "Income") {
            pledgesToCheck.add(update.changes.pledgeId);
          }
        }

        await ctx.db.patch(update.transactionId, changes);
        updatedCount++;
      }
    }

    // Check pledge completions
    const completedPledges: any[] = [];
    for (const pledgeId of pledgesToCheck) {
      const result = await checkPledgeCompletion(
        ctx,
        pledgeId as Id<"pledges">,
        user.organizationId
      );
      if (result?.completed) {
        completedPledges.push(result);
      }
    }

    return { updatedCount, completedPledges };
  },
});

// Link transaction to pledge
export const linkToPledge = mutation({
  args: {
    transactionId: v.id("transactions"),
    pledgeId: v.id("pledges"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }

    if (transaction.type !== "Income") {
      throw new Error("Only income transactions can be linked to pledges");
    }

    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      throw new Error("Pledge not found");
    }

    await ctx.db.patch(args.transactionId, { pledgeId: args.pledgeId });

    // Check pledge completion
    const pledgeCompleted = await checkPledgeCompletion(
      ctx,
      args.pledgeId,
      user.organizationId
    );

    return { transactionId: args.transactionId, pledgeCompleted };
  },
});

// Unlink transaction from pledge
export const unlinkFromPledge = mutation({
  args: {
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }

    const oldPledgeId = transaction.pledgeId;
    if (!oldPledgeId) {
      return { transactionId: args.transactionId, reactivated: false };
    }

    await ctx.db.patch(args.transactionId, { pledgeId: undefined });

    // Check if pledge should be reactivated
    const oldPledge = await ctx.db.get(oldPledgeId);
    if (oldPledge && oldPledge.status === "Completed") {
      const linkedTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_pledge", (q) => q.eq("pledgeId", oldPledgeId))
        .filter((q) => q.eq(q.field("type"), "Income"))
        .collect();

      const totalReceived = linkedTransactions.reduce(
        (sum, t) => sum + t.amount,
        0
      );

      if (totalReceived < oldPledge.amount) {
        await ctx.db.patch(oldPledgeId, { status: "Active" });
        return { transactionId: args.transactionId, reactivated: true };
      }
    }

    return { transactionId: args.transactionId, reactivated: false };
  },
});

// Delete a transaction
export const remove = mutation({
  args: {
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }

    const pledgeId = transaction.pledgeId;

    await ctx.db.delete(args.transactionId);

    // Check if pledge should be reactivated
    if (pledgeId) {
      const pledge = await ctx.db.get(pledgeId);
      if (pledge && pledge.status === "Completed") {
        const linkedTransactions = await ctx.db
          .query("transactions")
          .withIndex("by_pledge", (q) => q.eq("pledgeId", pledgeId))
          .filter((q) => q.eq(q.field("type"), "Income"))
          .collect();

        const totalReceived = linkedTransactions.reduce(
          (sum, t) => sum + t.amount,
          0
        );

        if (totalReceived < pledge.amount) {
          await ctx.db.patch(pledgeId, { status: "Active" });
        }
      }
    }

    return args.transactionId;
  },
});
