import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { transactionRAG } from "../lib/ragInstance";

/**
 * RAG Indexer - Handles ongoing indexing of new transactions.
 * Called via ctx.scheduler.runAfter from bulkCreate mutation.
 *
 * This enables the learning system to improve with every imported transaction.
 */

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
  handler: async (ctx, args) => {
    const namespace = `org_${args.organizationId}`;

    try {
      await transactionRAG.add(ctx, {
        namespace,
        text: args.searchText,
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
  handler: async (ctx, args) => {
    const namespace = `org_${args.organizationId}`;
    const results: Array<{ transactionId: string; success: boolean }> = [];

    for (const tx of args.transactions) {
      try {
        await transactionRAG.add(ctx, {
          namespace,
          text: tx.searchText,
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
  },
  handler: async (ctx, args) => {
    const namespace = `org_${args.organizationId}`;

    try {
      // Add the corrected version - RAG will find the most relevant match
      await transactionRAG.add(ctx, {
        namespace,
        text: args.newSearchText,
      });

      return { success: true, transactionId: args.transactionId };
    } catch (error) {
      console.error("Failed to update transaction in RAG:", error);
      return { success: false, error: String(error) };
    }
  },
});
