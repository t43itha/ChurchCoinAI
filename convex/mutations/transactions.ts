import { makeFunctionReference } from "convex/server";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  assertValidTransactionAmount,
  assertValidTransactionDate,
} from "../lib/transactionValidation";
import { buildFeedbackEvent } from "../intelligence/categorization/feedback";
import { resolveCategoryForTransaction } from "../intelligence/categorization/categoryResolver";
import { sumReportableIncome } from "../../lib/reportableTransactions";
import { meetsMoneyTarget, roundMoney } from "../lib/money";

const upsertAcceptedCategorizationMemory = makeFunctionReference<
  "mutation",
  {
    organizationId: Id<"organizations">;
    signature: string;
    descriptionExample: string;
    transactionType: "Income" | "Expenditure";
    category: string;
    fundId: Id<"funds">;
    isGiftAidEligible?: boolean;
    donorName?: string;
    sourceTransactionId?: Id<"transactions">;
  }
>("intelligence/categorizationMemory:upsertAccepted");

// Helper to build searchable text for RAG indexing
function buildRAGSearchText(tx: {
  description: string;
  category: string;
  type: "Income" | "Expenditure";
  donorName?: string | null;
}): string {
  let text = `${tx.description} | Category: ${tx.category} | Type: ${tx.type}`;
  if (tx.donorName) {
    text += ` | Donor: ${tx.donorName}`;
  }
  return text;
}

export function shouldUpdateCategorizationRagIndex(args: {
  finalCategory: unknown | null;
  predictedCategory?: string;
  finalCategoryName: string;
  predictedFundId?: Id<"funds">;
  finalFundId?: Id<"funds">;
  predictedGiftAidEligible?: boolean;
  finalGiftAidEligible?: boolean;
  predictedDonorName?: string;
  finalDonorName?: string;
}): boolean {
  if (!args.finalCategory) {
    return false;
  }

  const categoryChanged = args.predictedCategory !== args.finalCategoryName;
  const fundChanged = args.predictedFundId !== args.finalFundId;
  const giftAidChanged =
    args.predictedGiftAidEligible !== args.finalGiftAidEligible;
  const donorNameChanged = args.predictedDonorName !== args.finalDonorName;

  return categoryChanged || fundChanged || giftAidChanged || donorNameChanged;
}

// Helper to check pledge completion after transaction changes
async function checkPledgeCompletion(
  ctx: any,
  pledgeId: Id<"pledges">,
  organizationId: Id<"organizations">
) {
  const pledge = await ctx.db.get(pledgeId);
  if (!pledge || pledge.organizationId !== organizationId || pledge.status !== "Active") {
    return null;
  }

  const linkedTransactions = await ctx.db
    .query("transactions")
    .withIndex("by_pledge", (q: any) => q.eq("pledgeId", pledgeId))
    .collect();

  const totalReceived = sumReportableIncome(linkedTransactions);

  if (meetsMoneyTarget(totalReceived, pledge.amount)) {
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

// Block changes to transactions locked by a completed reconciliation session
async function assertNotLockedByReconciliation(
  ctx: any,
  transaction: { reconciliationSessionId?: Id<"reconciliationSessions"> | null }
) {
  if (!transaction.reconciliationSessionId) return;
  const session = await ctx.db.get(transaction.reconciliationSessionId);
  if (session && session.status === "completed") {
    throw new Error(
      "This transaction is part of a completed reconciliation. " +
        "Reopen that reconciliation session before changing it."
    );
  }
}

async function refreshPledgeStatus(
  ctx: any,
  pledgeId: Id<"pledges">,
  organizationId: Id<"organizations">
) {
  const pledge = await ctx.db.get(pledgeId);
  if (!pledge || pledge.organizationId !== organizationId) {
    return null;
  }

  const linkedTransactions = await ctx.db
    .query("transactions")
    .withIndex("by_pledge", (q: any) => q.eq("pledgeId", pledgeId))
    .collect();

  const totalReceived = sumReportableIncome(linkedTransactions);
  const nextStatus = meetsMoneyTarget(totalReceived, pledge.amount)
    ? "Completed"
    : "Active";
  const statusChanged =
    (pledge.status === "Active" || pledge.status === "Completed") &&
    pledge.status !== nextStatus;

  if (statusChanged) {
    await ctx.db.patch(pledgeId, { status: nextStatus });
  }

  return statusChanged && nextStatus === "Completed"
    ? {
        completed: true,
        pledgeId,
        donorName: pledge.donorName,
        amount: pledge.amount,
      }
    : null;
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
    notes: v.optional(v.string()),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    donorId: v.optional(v.id("donors")),
    pledgeId: v.optional(v.union(v.id("pledges"), v.null())),
    paymentMethod: v.optional(v.union(
      v.literal("Cash"),
      v.literal("Cheque"),
      v.literal("Bank"),
      v.literal("Card"),
      v.literal("Online")
    )),
    cashCollectionId: v.optional(v.id("cashCollections")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    assertValidTransactionAmount(args.amount);
    assertValidTransactionDate(args.date);

    // Verify fund belongs to organization
    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      throw new Error("Invalid fund");
    }

    // Verify donor belongs to organization if provided
    if (args.donorId) {
      const donor = await ctx.db.get(args.donorId);
      if (!donor || donor.organizationId !== user.organizationId) {
        throw new Error("Invalid donor");
      }
    }

    // Verify pledge belongs to organization if provided
    if (args.pledgeId) {
      const pledge = await ctx.db.get(args.pledgeId as Id<"pledges">);
      if (!pledge || pledge.organizationId !== user.organizationId) {
        throw new Error("Invalid pledge");
      }
      if (args.type !== "Income") {
        throw new Error("Only income transactions can be linked to pledges");
      }
    }

    const transactionId = await ctx.db.insert("transactions", {
      organizationId: user.organizationId,
      date: args.date,
      description: args.description,
      amount: roundMoney(args.amount),
      type: args.type,
      category: args.category,
      fundId: args.fundId,
      isReconciled: false,
      notes: args.notes,
      isGiftAidEligible: args.isGiftAidEligible,
      donorName: args.donorName,
      donorId: args.donorId,
      pledgeId: args.pledgeId,
      paymentMethod: args.paymentMethod,
      cashCollectionId: args.cashCollectionId,
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
    notes: v.optional(v.string()),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    donorId: v.optional(v.id("donors")),
    pledgeId: v.optional(v.union(v.id("pledges"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }
    await assertNotLockedByReconciliation(ctx, transaction);

    if (args.amount !== undefined) {
      assertValidTransactionAmount(args.amount);
    }
    if (args.date !== undefined) {
      assertValidTransactionDate(args.date);
    }

    // Verify new fund if provided
    if (args.fundId) {
      const fund = await ctx.db.get(args.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error("Invalid fund");
      }
    }

    // Verify donor belongs to organization if provided
    if (args.donorId) {
      const donor = await ctx.db.get(args.donorId);
      if (!donor || donor.organizationId !== user.organizationId) {
        throw new Error("Invalid donor");
      }
    }

    // Verify pledge belongs to organization if provided
    if (args.pledgeId) {
      const pledge = await ctx.db.get(args.pledgeId as Id<"pledges">);
      if (!pledge || pledge.organizationId !== user.organizationId) {
        throw new Error("Invalid pledge");
      }
      const finalType = args.type ?? transaction.type;
      if (finalType !== "Income") {
        throw new Error("Only income transactions can be linked to pledges");
      }
    }

    const oldPledgeId = transaction.pledgeId;
    const updates: Record<string, any> = {};

    if (args.date !== undefined) updates.date = args.date;
    if (args.description !== undefined) updates.description = args.description;
    if (args.amount !== undefined) updates.amount = roundMoney(args.amount);
    if (args.type !== undefined) updates.type = args.type;
    if (args.category !== undefined) updates.category = args.category;
    if (args.fundId !== undefined) updates.fundId = args.fundId;
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
      pledgeCompleted = await refreshPledgeStatus(
        ctx,
        newPledgeId,
        user.organizationId
      );
    }

    // If pledge was unlinked (set to null), check if old pledge should be reactivated
    if (oldPledgeId && args.pledgeId === null) {
      const oldPledge = await ctx.db.get(oldPledgeId);
      if (
        oldPledge &&
        oldPledge.organizationId === user.organizationId &&
        oldPledge.status === "Completed"
      ) {
        const linkedTransactions = await ctx.db
          .query("transactions")
          .withIndex("by_pledge", (q) => q.eq("pledgeId", oldPledgeId))
          .collect();

        const totalReceived = sumReportableIncome(linkedTransactions);

        if (!meetsMoneyTarget(totalReceived, oldPledge.amount)) {
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
        donorId: v.optional(v.id("donors")),
        pledgeId: v.optional(v.union(v.id("pledges"), v.null())),
        paymentMethod: v.optional(v.union(
          v.literal("Cash"),
          v.literal("Cheque"),
          v.literal("Bank"),
          v.literal("Card"),
          v.literal("Online")
        )),
        cashCollectionId: v.optional(v.id("cashCollections")),
        bankConnectionId: v.optional(v.id("bankConnections")),
        providerTransactionId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    if (args.transactions.length > 500) {
      throw new Error("Cannot import more than 500 transactions at once");
    }

    // ids stays index-aligned with args.transactions; skipped duplicates are null
    const transactionIds: (Id<"transactions"> | null)[] = [];
    const pledgesToCheck = new Set<string>();
    const validatedConnections = new Set<string>();
    const seenProviderIds = new Set<string>();
    let skippedDuplicates = 0;

    for (const t of args.transactions) {
      assertValidTransactionAmount(t.amount);
      assertValidTransactionDate(t.date);
      // Verify fund belongs to organization
      const fund = await ctx.db.get(t.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${t.fundId}`);
      }

      if (t.donorId) {
        const donor = await ctx.db.get(t.donorId);
        if (!donor || donor.organizationId !== user.organizationId) {
          throw new Error(`Invalid donor: ${t.donorId}`);
        }
      }

      if (t.pledgeId) {
        const pledge = await ctx.db.get(t.pledgeId as Id<"pledges">);
        if (!pledge || pledge.organizationId !== user.organizationId) {
          throw new Error(`Invalid pledge: ${t.pledgeId}`);
        }
        if (t.type !== "Income") {
          throw new Error("Only income transactions can be linked to pledges");
        }
      }

      // Source-level dedup for bank-synced transactions: skip anything already
      // imported from the same connection with the same provider id.
      if (t.bankConnectionId && t.providerTransactionId) {
        if (!validatedConnections.has(t.bankConnectionId)) {
          const connection = await ctx.db.get(t.bankConnectionId);
          if (!connection || connection.organizationId !== user.organizationId) {
            throw new Error(`Invalid bank connection: ${t.bankConnectionId}`);
          }
          validatedConnections.add(t.bankConnectionId);
        }

        const dedupKey = `${t.bankConnectionId}|${t.providerTransactionId}`;
        const existing = seenProviderIds.has(dedupKey)
          ? true
          : await ctx.db
              .query("transactions")
              .withIndex("by_connection_providerTransaction", (q) =>
                q
                  .eq("bankConnectionId", t.bankConnectionId)
                  .eq("providerTransactionId", t.providerTransactionId)
              )
              .first();
        if (existing) {
          transactionIds.push(null);
          skippedDuplicates += 1;
          continue;
        }
        seenProviderIds.add(dedupKey);
      }

      const transactionId = await ctx.db.insert("transactions", {
        organizationId: user.organizationId,
        date: t.date,
        description: t.description,
        amount: roundMoney(t.amount),
        type: t.type,
        category: t.category,
        fundId: t.fundId,
        isReconciled: t.isReconciled ?? false,
        notes: t.notes,
        isGiftAidEligible: t.isGiftAidEligible,
        donorName: t.donorName,
        donorId: t.donorId,
        pledgeId: t.pledgeId,
        paymentMethod: t.paymentMethod,
        cashCollectionId: t.cashCollectionId,
        bankConnectionId: t.bankConnectionId,
        providerTransactionId: t.providerTransactionId,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);

      if (t.pledgeId && t.type === "Income") {
        pledgesToCheck.add(t.pledgeId as string);
      }
    }

    // Schedule RAG indexing for all new transactions (batch for efficiency)
    const ragIndexData = args.transactions.flatMap((t, idx) => {
      const transactionId = transactionIds[idx];
      if (!transactionId) return []; // skipped duplicate
      return [
        {
          transactionId,
          searchText: buildRAGSearchText({
            description: t.description,
            category: t.category,
            type: t.type,
            donorName: t.donorName,
          }),
          metadata: {
            category: t.category,
            fundId: t.fundId,
            type: t.type,
            isGiftAidEligible: t.isGiftAidEligible,
            donorName: t.donorName,
            amount: t.amount,
          },
        },
      ];
    });

    // Schedule batch indexing (runs asynchronously, doesn't block import)
    if (ragIndexData.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.intelligence.ragIndexer.batchIndexTransactions,
        {
          organizationId: user.organizationId,
          transactions: ragIndexData,
        }
      );
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
      count: transactionIds.filter(Boolean).length,
      ids: transactionIds,
      skippedDuplicates,
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
        await assertNotLockedByReconciliation(ctx, transaction);
        const updates: Record<string, any> = {};
        if (args.updates.category !== undefined)
          updates.category = args.updates.category;
        if (args.updates.fundId !== undefined)
          updates.fundId = args.updates.fundId;
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
          isGiftAidEligible: v.optional(v.boolean()),
          donorName: v.optional(v.string()),
          pledgeId: v.optional(v.union(v.id("pledges"), v.null())),
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
        await assertNotLockedByReconciliation(ctx, transaction);
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
        if (update.changes.isGiftAidEligible !== undefined)
          changes.isGiftAidEligible = update.changes.isGiftAidEligible;
        if (update.changes.donorName !== undefined)
          changes.donorName = update.changes.donorName;
        if (update.changes.pledgeId !== undefined) {
          if (update.changes.pledgeId) {
            const pledge = await ctx.db.get(update.changes.pledgeId as Id<"pledges">);
            if (!pledge || pledge.organizationId !== user.organizationId) {
              throw new Error(`Invalid pledge: ${update.changes.pledgeId}`);
            }
            if (transaction.type !== "Income") {
              throw new Error("Only income transactions can be linked to pledges");
            }
            pledgesToCheck.add(update.changes.pledgeId as string);
            changes.pledgeId = update.changes.pledgeId;
          } else {
            changes.pledgeId = null;
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

    await ctx.db.patch(args.transactionId, { pledgeId: null });

    // Check if pledge should be reactivated
    const oldPledge = await ctx.db.get(oldPledgeId);
    if (
      oldPledge &&
      oldPledge.organizationId === user.organizationId &&
      oldPledge.status === "Completed"
    ) {
      const linkedTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_pledge", (q) => q.eq("pledgeId", oldPledgeId))
        .collect();

      const totalReceived = sumReportableIncome(linkedTransactions);

      if (!meetsMoneyTarget(totalReceived, oldPledge.amount)) {
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
    await assertNotLockedByReconciliation(ctx, transaction);

    const pledgeId = transaction.pledgeId;

    await ctx.db.delete(args.transactionId);

    // Check if pledge should be reactivated
    if (pledgeId) {
      const pledge = await ctx.db.get(pledgeId);
      if (
        pledge &&
        pledge.organizationId === user.organizationId &&
        pledge.status === "Completed"
      ) {
        const linkedTransactions = await ctx.db
          .query("transactions")
          .withIndex("by_pledge", (q) => q.eq("pledgeId", pledgeId))
          .collect();

        const totalReceived = sumReportableIncome(linkedTransactions);

        if (!meetsMoneyTarget(totalReceived, pledge.amount)) {
          await ctx.db.patch(pledgeId, { status: "Active" });
        }
      }
    }

    return args.transactionId;
  },
});

export const voidTransaction = mutation({
  args: {
    transactionId: v.id("transactions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const reason = args.reason.trim();
    if (reason.length < 3) {
      throw new Error("Void reason must be at least 3 characters");
    }

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }
    await assertNotLockedByReconciliation(ctx, transaction);

    await ctx.db.patch(args.transactionId, {
      isVoided: true,
      voidReason: reason,
      voidedAt: Date.now(),
      voidedBy: user._id,
    });

    if (transaction.pledgeId && transaction.type === "Income") {
      await refreshPledgeStatus(ctx, transaction.pledgeId, user.organizationId);
    }

    return { transactionId: args.transactionId, isVoided: true };
  },
});

export const unvoidTransaction = mutation({
  args: {
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }
    await assertNotLockedByReconciliation(ctx, transaction);

    await ctx.db.patch(args.transactionId, {
      isVoided: false,
      unvoidedAt: Date.now(),
      unvoidedBy: user._id,
    });

    if (transaction.pledgeId && transaction.type === "Income") {
      await refreshPledgeStatus(ctx, transaction.pledgeId, user.organizationId);
    }

    return { transactionId: args.transactionId, isVoided: false };
  },
});

// Compatibility wrapper for existing generated clients.
export const toggleVoided = mutation({
  args: {
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }
    await assertNotLockedByReconciliation(ctx, transaction);

    const nextVoided = !transaction.isVoided;
    await ctx.db.patch(args.transactionId, {
      isVoided: nextVoided,
      ...(nextVoided
        ? {
            voidReason: transaction.voidReason ?? "Voided from legacy toggle",
            voidedAt: Date.now(),
            voidedBy: user._id,
          }
        : {
            unvoidedAt: Date.now(),
            unvoidedBy: user._id,
          }),
    });

    if (transaction.pledgeId && transaction.type === "Income") {
      await refreshPledgeStatus(ctx, transaction.pledgeId, user.organizationId);
    }

    return { transactionId: args.transactionId, isVoided: nextVoided };
  },
});

// Record categorization corrections for ML learning
export const recordCorrections = mutation({
  args: {
    corrections: v.array(
      v.object({
        transactionId: v.id("transactions"),
        description: v.string(),
        aiPredictedCategory: v.string(),
        aiConfidence: v.string(),
        predictionSource: v.union(
          v.literal("gemini"),
          v.literal("openrouter"),
          v.literal("openai"),
          v.literal("rag"),
          v.literal("memory"),
          v.literal("none")
        ),
        ragScore: v.optional(v.number()),
        finalCategory: v.string(),
        aiPredictedFundId: v.optional(v.id("funds")),
        aiPredictedGiftAidEligible: v.optional(v.boolean()),
        aiPredictedDonorName: v.optional(v.string()),
        aiConfidenceScore: v.optional(v.number()),
        finalFundId: v.optional(v.id("funds")),
        finalGiftAidEligible: v.optional(v.boolean()),
        finalDonorName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const recorded: string[] = [];
    for (const correction of args.corrections) {
      // Verify transaction belongs to organization
      const transaction = await ctx.db.get(correction.transactionId);
      if (!transaction || transaction.organizationId !== user.organizationId) {
        continue; // Skip invalid transactions
      }

      if (correction.aiPredictedFundId) {
        const predictedFund = await ctx.db.get(correction.aiPredictedFundId);
        if (!predictedFund || predictedFund.organizationId !== user.organizationId) {
          throw new Error("Invalid predicted fund");
        }
      }

      if (correction.finalFundId) {
        const finalFund = await ctx.db.get(correction.finalFundId);
        if (!finalFund || finalFund.organizationId !== user.organizationId) {
          throw new Error("Invalid final fund");
        }
      }

      const wasCorrect =
        correction.aiPredictedCategory === correction.finalCategory;
      const finalCategory = resolveCategoryForTransaction(
        correction.finalCategory,
        transaction.type,
        categories
      );
      const learned = Boolean(finalCategory);
      const finalCategoryName = finalCategory?.name ?? correction.finalCategory;
      const finalFundId = correction.finalFundId ?? transaction.fundId;
      const finalGiftAidEligible =
        correction.finalGiftAidEligible ?? transaction.isGiftAidEligible;
      const finalDonorName =
        correction.finalDonorName ?? transaction.donorName;
      const createdAt = Date.now();

      const correctionId = await ctx.db.insert("categorizationCorrections", {
        organizationId: user.organizationId,
        transactionId: correction.transactionId,
        description: correction.description,
        aiPredictedCategory: correction.aiPredictedCategory,
        aiConfidence: correction.aiConfidence,
        predictionSource: correction.predictionSource,
        ragScore: correction.ragScore,
        finalCategory: correction.finalCategory,
        wasCorrect,
        createdAt,
      });
      recorded.push(correctionId);

      const feedbackEvent = buildFeedbackEvent({
        organizationId: user.organizationId,
        transactionId: correction.transactionId,
        transaction: {
          description: correction.description,
          amount: transaction.amount,
          type: transaction.type,
        },
        source: correction.predictionSource,
        confidence: correction.aiConfidenceScore ?? correction.ragScore ?? 0,
        originalCategory: correction.aiPredictedCategory,
        finalCategory: finalCategoryName,
        originalFundId: correction.aiPredictedFundId,
        finalFundId,
        originalGiftAidEligible: correction.aiPredictedGiftAidEligible,
        finalGiftAidEligible,
        originalDonorName: correction.aiPredictedDonorName,
        finalDonorName,
        learned,
        createdAt,
      });
      await ctx.db.insert("categorizationFeedbackEvents", feedbackEvent);

      if (learned) {
        await ctx.scheduler.runAfter(
          0,
          upsertAcceptedCategorizationMemory,
          {
            organizationId: user.organizationId,
            signature: feedbackEvent.signature,
            descriptionExample: correction.description,
            transactionType: transaction.type,
            category: finalCategoryName,
            fundId: finalFundId,
            isGiftAidEligible: finalGiftAidEligible,
            donorName: finalDonorName,
            sourceTransactionId: correction.transactionId,
          }
        );
      }

      const shouldUpdateRagIndex = shouldUpdateCategorizationRagIndex({
        finalCategory,
        predictedCategory: correction.aiPredictedCategory,
        finalCategoryName,
        predictedFundId: correction.aiPredictedFundId,
        finalFundId,
        predictedGiftAidEligible: correction.aiPredictedGiftAidEligible,
        finalGiftAidEligible,
        predictedDonorName: correction.aiPredictedDonorName,
        finalDonorName,
      });

      // Update RAG whenever the accepted categorization metadata differs.
      if (shouldUpdateRagIndex) {
        const searchText = buildRAGSearchText({
          description: correction.description,
          category: finalCategoryName,
          type: transaction.type,
          donorName: finalDonorName,
        });

        await ctx.scheduler.runAfter(
          0,
          internal.intelligence.ragIndexer.updateInIndex,
          {
            organizationId: user.organizationId,
            transactionId: correction.transactionId,
            newSearchText: searchText,
            metadata: {
              category: finalCategoryName,
              fundId: finalFundId,
              type: transaction.type,
              isGiftAidEligible: finalGiftAidEligible,
              donorName: finalDonorName,
              acceptedCount: 1,
            },
          }
        );
      }
    }

    return {
      recorded: recorded.length,
      corrected: args.corrections.filter(
        (c) => c.aiPredictedCategory !== c.finalCategory
      ).length,
    };
  },
});

// Get categorization accuracy stats for an organization
export const getCategorizationStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const allCorrections = await ctx.db
      .query("categorizationCorrections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const total = allCorrections.length;
    const correct = allCorrections.filter((c) => c.wasCorrect).length;
    const bySource = {
      gemini: allCorrections.filter((c) => c.predictionSource === "gemini"),
      openrouter: allCorrections.filter(
        (c) => c.predictionSource === "openrouter"
      ),
      openai: allCorrections.filter((c) => c.predictionSource === "openai"),
      rag: allCorrections.filter((c) => c.predictionSource === "rag"),
      memory: allCorrections.filter((c) => c.predictionSource === "memory"),
    };

    return {
      total,
      correct,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
      geminiAccuracy:
        bySource.gemini.length > 0
          ? (bySource.gemini.filter((c) => c.wasCorrect).length /
              bySource.gemini.length) *
            100
          : 0,
      openrouterAccuracy:
        bySource.openrouter.length > 0
          ? (bySource.openrouter.filter((c) => c.wasCorrect).length /
              bySource.openrouter.length) *
            100
          : 0,
      openaiAccuracy:
        bySource.openai.length > 0
          ? (bySource.openai.filter((c) => c.wasCorrect).length /
              bySource.openai.length) *
            100
          : 0,
      ragAccuracy:
        bySource.rag.length > 0
          ? (bySource.rag.filter((c) => c.wasCorrect).length /
              bySource.rag.length) *
            100
          : 0,
      memoryAccuracy:
        bySource.memory.length > 0
          ? (bySource.memory.filter((c) => c.wasCorrect).length /
              bySource.memory.length) *
            100
          : 0,
      ragCount: bySource.rag.length,
      geminiCount: bySource.gemini.length,
      openrouterCount: bySource.openrouter.length,
      openaiCount: bySource.openai.length,
      memoryCount: bySource.memory.length,
    };
  },
});
