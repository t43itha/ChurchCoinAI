import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { addForExistingOrganization } from "../lib/ragInstance";

/**
 * RAG Indexer - Handles ongoing indexing of new transactions.
 * Called via ctx.scheduler.runAfter from bulkCreate mutation.
 *
 * This enables the learning system to improve with every imported transaction.
 *
 * Every entry is one embedding call, charged as one unit against the church's
 * and the deployment's daily AI budget before it is added. Work a spent budget
 * refuses is rescheduled for the next UTC day, never marked failed.
 */

// Entries charged per budget check, so a nearly spent day still indexes what fits.
const INDEX_CHUNK = 20;

type BudgetAnswer =
  | { status: "charged" }
  | { status: "deferred"; retryAt: number }
  | { status: "organizationMissing" };

const chargeIndexing = (ctx: ActionCtx, organizationId: Id<"organizations">, units: number): Promise<BudgetAnswer> =>
  ctx.runMutation(internal.mutations.aiRateLimit.consumeBackgroundUnits, { organizationId, units });

// Index a newly created transaction into RAG
export const indexTransaction = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
    searchText: v.string(),
    metadata: v.object({
      category: v.string(),
      fundId: v.id("funds"),
      type: v.union(v.literal("Income"), v.literal("Expenditure")),
      isGiftAidEligible: v.optional(v.boolean()),
      donorName: v.optional(v.string()),
      amount: v.number(),
    }),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const namespace = `org_${args.organizationId}`;

    try {
      const budget = await chargeIndexing(ctx, args.organizationId, 1);
      if (budget.status === "organizationMissing") return { success: false, transactionId: args.transactionId };
      if (budget.status === "deferred") {
        await ctx.scheduler.runAfter(budget.retryAt - Date.now(), internal.intelligence.ragIndexer.indexTransaction, args);
        return { success: false, deferred: true, transactionId: args.transactionId };
      }
      await addForExistingOrganization(ctx, args.organizationId, {
        namespace,
        key: `tx:${args.transactionId}`,
        text: args.searchText,
        metadata: {
          transactionId: String(args.transactionId),
          category: args.metadata.category,
          fundId: String(args.metadata.fundId),
          type: args.metadata.type,
          isGiftAidEligible: args.metadata.isGiftAidEligible ?? false,
          donorName: args.metadata.donorName ?? "",
          acceptedCount: 1,
        },
      });

      return {
        success: true,
        transactionId: args.transactionId,
        namespace,
      };
    } catch (error) {
      console.error("Failed to index transaction in RAG:", error);
      // Don't throw - indexing failure shouldn't block transaction creation
      return {
        success: false,
        transactionId: args.transactionId,
        error: String(error),
      };
    }
  },
});

// Batch index multiple transactions (for efficiency)
export const batchIndexTransactions = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactions: v.array(
      v.object({
        transactionId: v.id("transactions"),
        searchText: v.string(),
        metadata: v.object({
          category: v.string(),
          fundId: v.id("funds"),
          type: v.union(v.literal("Income"), v.literal("Expenditure")),
          isGiftAidEligible: v.optional(v.boolean()),
          donorName: v.optional(v.string()),
          amount: v.number(),
        }),
      })
    ),
  },
  handler: async (ctx, args): Promise<{
    total: number;
    successful: number;
    failed: number;
    deferred: number;
    results: Array<{ transactionId: string; success: boolean }>;
  }> => {
    const namespace = `org_${args.organizationId}`;
    const results: Array<{ transactionId: string; success: boolean }> = [];
    let deferred = 0;

    for (const [index, tx] of args.transactions.entries()) {
      if (index % INDEX_CHUNK === 0) {
        const chunk = args.transactions.slice(index, index + INDEX_CHUNK);
        const budget = await chargeIndexing(ctx, args.organizationId, chunk.length);
        if (budget.status === "organizationMissing") break;
        if (budget.status === "deferred") {
          const remaining = args.transactions.slice(index);
          await ctx.scheduler.runAfter(
            budget.retryAt - Date.now(),
            internal.intelligence.ragIndexer.batchIndexTransactions,
            { ...args, transactions: remaining }
          );
          deferred = remaining.length;
          break;
        }
      }
      try {
        await addForExistingOrganization(ctx, args.organizationId, {
          namespace,
          key: `tx:${tx.transactionId}`,
          text: tx.searchText,
          metadata: {
            transactionId: String(tx.transactionId),
            category: tx.metadata.category,
            fundId: String(tx.metadata.fundId),
            type: tx.metadata.type,
            isGiftAidEligible: tx.metadata.isGiftAidEligible ?? false,
            donorName: tx.metadata.donorName ?? "",
            acceptedCount: 1,
          },
        });
        results.push({ transactionId: tx.transactionId, success: true });
      } catch (error) {
        console.error(`Failed to index transaction ${tx.transactionId}:`, error);
        results.push({ transactionId: tx.transactionId, success: false });
      }
    }

    return {
      total: args.transactions.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      deferred,
      results,
    };
  },
});

// Update a transaction in RAG index (for category corrections)
// Since RAG uses semantic search, adding the corrected version will naturally
// make it more likely to be found in future searches
export const updateInIndex = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
    newSearchText: v.string(),
    metadata: v.object({
      category: v.string(),
      fundId: v.id("funds"),
      type: v.union(v.literal("Income"), v.literal("Expenditure")),
      isGiftAidEligible: v.optional(v.boolean()),
      donorName: v.optional(v.string()),
      acceptedCount: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const namespace = `org_${args.organizationId}`;

    try {
      const budget = await chargeIndexing(ctx, args.organizationId, 1);
      if (budget.status === "organizationMissing") return { success: false, transactionId: args.transactionId };
      if (budget.status === "deferred") {
        await ctx.scheduler.runAfter(budget.retryAt - Date.now(), internal.intelligence.ragIndexer.updateInIndex, args);
        return { success: false, deferred: true, transactionId: args.transactionId };
      }
      // Add the corrected version - RAG will find the most relevant match
      await addForExistingOrganization(ctx, args.organizationId, {
        namespace,
        key: `tx:${args.transactionId}`,
        text: args.newSearchText,
        metadata: {
          transactionId: String(args.transactionId),
          category: args.metadata.category,
          fundId: String(args.metadata.fundId),
          type: args.metadata.type,
          isGiftAidEligible: args.metadata.isGiftAidEligible ?? false,
          donorName: args.metadata.donorName ?? "",
          acceptedCount: args.metadata.acceptedCount ?? 1,
        },
      });

      return { success: true, transactionId: args.transactionId };
    } catch (error) {
      console.error("Failed to update transaction in RAG:", error);
      return { success: false, error: String(error) };
    }
  },
});
