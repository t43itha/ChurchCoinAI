import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { transactionRAG } from "../lib/ragInstance";
import {
  TRANSACTION_EMBEDDING_DIMENSION,
  TRANSACTION_EMBEDDING_INDEX_VERSION,
  TRANSACTION_EMBEDDING_MODEL,
} from "../lib/transactionEmbeddingModel";

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
    const query = ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      );

    const page = await query.paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });
    const transactions = page.page;

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

    const hasMore = !page.isDone;

    if (hasMore) {
      // Continue from the pagination cursor to avoid re-indexing the same page.
      await ctx.scheduler.runAfter(
        100, // Small delay to avoid overwhelming the scheduler
        internal.intelligence.bootstrapRAG.indexAllTransactions,
        {
          organizationId: args.organizationId,
          cursor: page.continueCursor,
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

/**
 * Rebuild the transaction index for every organization after an embedding
 * model migration. Convex RAG isolates the new model version from the old
 * vectors, so this can run safely while the application remains online.
 *
 * Run once from the Convex dashboard after deploying this change:
 * internal.intelligence.bootstrapRAG.reindexAllOrganizations({})
 */
export const reindexAllOrganizations = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 20;
    const page = await ctx.db.query("organizations").paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });

    for (const organization of page.page) {
      await ctx.scheduler.runAfter(
        0,
        internal.intelligence.bootstrapRAG.indexAllTransactions,
        { organizationId: organization._id }
      );
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        100,
        internal.intelligence.bootstrapRAG.reindexAllOrganizations,
        {
          cursor: page.continueCursor,
          batchSize,
        }
      );
    }

    return {
      organizationsScheduled: page.page.length,
      complete: page.isDone,
      model: TRANSACTION_EMBEDDING_MODEL,
      indexVersion: TRANSACTION_EMBEDDING_INDEX_VERSION,
      dimension: TRANSACTION_EMBEDDING_DIMENSION,
    };
  },
});

// Get indexing status for an organization
export const getIndexingStatus = internalQuery({
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
      model: TRANSACTION_EMBEDDING_MODEL,
      indexVersion: TRANSACTION_EMBEDDING_INDEX_VERSION,
      dimension: TRANSACTION_EMBEDDING_DIMENSION,
    };
  },
});
