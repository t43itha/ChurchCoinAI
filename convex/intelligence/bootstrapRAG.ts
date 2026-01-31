import { internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { transactionRAG } from "../lib/ragInstance";

/**
 * Bootstrap existing transactions into the RAG index.
 * Run this once per organization to seed the learning system with historical data.
 *
 * Usage from Convex dashboard:
 * 1. Go to Functions tab
 * 2. Find internal.intelligence.bootstrapRAG.indexAllTransactions
 * 3. Run with { "organizationId": "<your-org-id>" }
 */

// Build searchable text combining description + categorization metadata
function buildSearchText(tx: {
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

// Index a single transaction into RAG
export const indexSingleTransaction = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
    searchText: v.string(),
    metadata: v.object({
      transactionId: v.id("transactions"),
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

    await transactionRAG.add(ctx, {
      namespace,
      text: args.searchText,
    });

    return { success: true, transactionId: args.transactionId };
  },
});

// Index all existing transactions for an organization (batch processing)
export const indexAllTransactions = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const namespace = `org_${args.organizationId}`;

    // Query transactions with pagination
    let query = ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      );

    const transactions = await query.take(batchSize);

    if (transactions.length === 0) {
      return {
        indexed: 0,
        complete: true,
        message: "No transactions to index",
      };
    }

    // Schedule indexing for each transaction
    let scheduled = 0;
    for (const tx of transactions) {
      const searchText = buildSearchText({
        description: tx.description,
        category: tx.category,
        type: tx.type,
        donorName: tx.donorName,
      });

      // Schedule the indexing action
      await ctx.scheduler.runAfter(
        0,
        internal.intelligence.bootstrapRAG.indexSingleTransaction,
        {
          organizationId: args.organizationId,
          transactionId: tx._id,
          searchText,
          metadata: {
            transactionId: tx._id,
            category: tx.category,
            fundId: tx.fundId,
            type: tx.type,
            isGiftAidEligible: tx.isGiftAidEligible,
            donorName: tx.donorName,
            amount: tx.amount,
          },
        }
      );
      scheduled++;
    }

    // If we got a full batch, there might be more
    const hasMore = transactions.length === batchSize;

    if (hasMore) {
      // Schedule the next batch with the last transaction's ID as cursor
      const lastId = transactions[transactions.length - 1]._id;
      await ctx.scheduler.runAfter(
        100, // Small delay to avoid overwhelming the scheduler
        internal.intelligence.bootstrapRAG.indexAllTransactions,
        {
          organizationId: args.organizationId,
          cursor: lastId,
          batchSize,
        }
      );
    }

    return {
      indexed: scheduled,
      complete: !hasMore,
      message: hasMore
        ? `Scheduled ${scheduled} transactions. More batches pending.`
        : `Completed indexing ${scheduled} transactions.`,
    };
  },
});

// Get indexing status for an organization
export const getIndexingStatus = internalMutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Count total transactions
    const allTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return {
      totalTransactions: allTransactions.length,
      namespace: `org_${args.organizationId}`,
    };
  },
});
