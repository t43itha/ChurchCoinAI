import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { transactionRAG } from "../lib/ragInstance";
import {
  TRANSACTION_EMBEDDING_DIMENSION,
  TRANSACTION_EMBEDDING_INDEX_VERSION,
  TRANSACTION_EMBEDDING_MODEL,
} from "../lib/transactionEmbeddingModel";
import {
  getRagIndexingCompletionState,
  isRagIndexingSweepCursorCurrent,
} from "./ragIndexingProgress";

/**
 * Bootstrap existing transactions into the RAG index with durable progress.
 * Start migrations through reindexAllOrganizations so both the tenant-wide
 * sweep and every asynchronous transaction outcome are tracked.
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

export const recordIndexingOutcome = internalMutation({
  args: {
    itemId: v.id("ragIndexingItems"),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "pending") {
      return { recorded: false };
    }

    const run = await ctx.db.get(item.runId);
    if (!run) {
      return { recorded: false };
    }

    const processedTransactions = run.processedTransactions + 1;
    const successfulTransactions =
      run.successfulTransactions + (args.success ? 1 : 0);
    const failedTransactions =
      run.failedTransactions + (args.success ? 0 : 1);
    const completion = getRagIndexingCompletionState({
      schedulingComplete: run.schedulingComplete,
      totalTransactions: run.totalTransactions,
      processedTransactions,
      failedTransactions,
    });

    await ctx.db.patch(item._id, {
      status: args.success ? "success" : "failed",
      error: args.success ? undefined : args.error?.slice(0, 1000),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(run._id, {
      processedTransactions,
      successfulTransactions,
      failedTransactions,
      status: completion.status,
      completedAt: completion.isFinished ? Date.now() : undefined,
    });

    return { recorded: true, isFinished: completion.isFinished };
  },
});

// Index a single transaction into RAG and durably record its outcome.
export const indexSingleTransaction = internalAction({
  args: {
    itemId: v.id("ragIndexingItems"),
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

    try {
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
      await ctx.runMutation(
        internal.intelligence.bootstrapRAG.recordIndexingOutcome,
        { itemId: args.itemId, success: true }
      );

      return { success: true, transactionId: args.transactionId };
    } catch (error) {
      await ctx.runMutation(
        internal.intelligence.bootstrapRAG.recordIndexingOutcome,
        {
          itemId: args.itemId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return {
        success: false,
        transactionId: args.transactionId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Index all existing transactions for an organization (batch processing)
export const indexAllTransactions = internalMutation({
  args: {
    runId: v.id("ragIndexingRuns"),
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
      const run = await ctx.db.get(args.runId);
      if (run) {
        const completion = getRagIndexingCompletionState({
          schedulingComplete: true,
          totalTransactions: run.totalTransactions,
          processedTransactions: run.processedTransactions,
          failedTransactions: run.failedTransactions,
        });
        await ctx.db.patch(run._id, {
          schedulingComplete: true,
          status: completion.status,
          completedAt: completion.isFinished ? Date.now() : undefined,
        });
      }
      return {
        scheduled: 0,
        transactionSchedulingComplete: true,
        message: "No transactions remain to schedule",
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

      const itemId = await ctx.db.insert("ragIndexingItems", {
        runId: args.runId,
        organizationId: args.organizationId,
        transactionId: tx._id,
        status: "pending",
        attempts: 1,
        updatedAt: Date.now(),
      });

      await ctx.scheduler.runAfter(
        0,
        internal.intelligence.bootstrapRAG.indexSingleTransaction,
        {
          itemId,
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
    const run = await ctx.db.get(args.runId);
    if (run) {
      const totalTransactions = run.totalTransactions + scheduled;
      const schedulingComplete = !hasMore;
      const completion = getRagIndexingCompletionState({
        schedulingComplete,
        totalTransactions,
        processedTransactions: run.processedTransactions,
        failedTransactions: run.failedTransactions,
      });
      await ctx.db.patch(args.runId, {
        scheduledTransactions: run.scheduledTransactions + scheduled,
        totalTransactions,
        schedulingComplete,
        status: completion.status,
        completedAt: completion.isFinished ? Date.now() : undefined,
      });
    }

    if (hasMore) {
      // Continue from the pagination cursor to avoid re-indexing the same page.
      await ctx.scheduler.runAfter(
        100, // Small delay to avoid overwhelming the scheduler
        internal.intelligence.bootstrapRAG.indexAllTransactions,
        {
          runId: args.runId,
          organizationId: args.organizationId,
          cursor: page.continueCursor,
          batchSize,
        }
      );
    }

    return {
      scheduled,
      transactionSchedulingComplete: !hasMore,
      message: hasMore
        ? `Scheduled ${scheduled} transactions. More batches pending.`
        : `Scheduled the final ${scheduled} transactions. Indexing continues asynchronously.`,
    };
  },
});

/** Retry only the failed items from a completed migration run. */
export const retryFailedTransactions = internalMutation({
  args: {
    runId: v.id("ragIndexingRuns"),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("RAG indexing run not found");

    const batchSize = args.batchSize ?? 100;
    const failedItems = await ctx.db
      .query("ragIndexingItems")
      .withIndex("by_run_status", (q) =>
        q.eq("runId", args.runId).eq("status", "failed")
      )
      .take(batchSize);

    let retrying = 0;
    let removed = 0;
    for (const item of failedItems) {
      const tx = await ctx.db.get(item.transactionId);
      if (!tx) {
        await ctx.db.delete(item._id);
        removed++;
        continue;
      }

      const searchText = buildSearchText({
        description: tx.description,
        category: tx.category,
        type: tx.type,
        donorName: tx.donorName,
      });
      await ctx.db.patch(item._id, {
        status: "pending",
        attempts: item.attempts + 1,
        error: undefined,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.intelligence.bootstrapRAG.indexSingleTransaction,
        {
          itemId: item._id,
          organizationId: run.organizationId,
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
      retrying++;
    }

    if (retrying > 0 || removed > 0) {
      const failedTransactions = Math.max(
        0,
        run.failedTransactions - retrying - removed
      );
      const totalTransactions = Math.max(0, run.totalTransactions - removed);
      const processedTransactions = Math.max(
        0,
        run.processedTransactions - retrying - removed
      );
      await ctx.db.patch(run._id, {
        totalTransactions,
        scheduledTransactions: Math.max(
          0,
          run.scheduledTransactions - removed
        ),
        processedTransactions,
        failedTransactions,
        status:
          retrying > 0
            ? "running"
            : failedTransactions > 0
              ? "completed_with_errors"
              : "completed",
        completedAt:
          retrying > 0 || failedTransactions > 0 ? undefined : Date.now(),
      });
    }

    if (failedItems.length === batchSize) {
      await ctx.scheduler.runAfter(
        100,
        internal.intelligence.bootstrapRAG.retryFailedTransactions,
        { runId: args.runId, batchSize }
      );
    }

    return {
      retrying,
      removedTransactions: removed,
      moreFailedItemsPending: failedItems.length === batchSize,
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
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.min(
      100,
      Math.max(1, Math.floor(args.batchSize ?? 20))
    );
    const now = Date.now();
    const sweepId = await ctx.db.insert("ragIndexingSweeps", {
      model: TRANSACTION_EMBEDDING_MODEL,
      indexVersion: TRANSACTION_EMBEDDING_INDEX_VERSION,
      dimension: TRANSACTION_EMBEDDING_DIMENSION,
      status: "scheduled",
      batchSize,
      organizationsScheduled: 0,
      startedAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.intelligence.bootstrapRAG.continueReindexSweep,
      { sweepId }
    );

    return {
      sweepId,
      status: "scheduled" as const,
      model: TRANSACTION_EMBEDDING_MODEL,
      indexVersion: TRANSACTION_EMBEDDING_INDEX_VERSION,
      dimension: TRANSACTION_EMBEDDING_DIMENSION,
    };
  },
});

/**
 * Atomically schedules one page of organizations and advances the saved
 * cursor. Matching the expected cursor makes duplicate/resumed continuations
 * idempotent: only the first invocation can advance a given page.
 */
export const processReindexSweepPage = internalMutation({
  args: {
    sweepId: v.id("ragIndexingSweeps"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sweep = await ctx.db.get(args.sweepId);
    if (!sweep) throw new Error("RAG indexing sweep not found");

    if (
      sweep.status === "completed" ||
      !isRagIndexingSweepCursorCurrent(sweep.cursor, args.cursor)
    ) {
      return { advanced: false, status: sweep.status };
    }

    const page = await ctx.db.query("organizations").paginate({
      cursor: sweep.cursor ?? null,
      numItems: sweep.batchSize,
    });

    for (const organization of page.page) {
      const now = Date.now();
      const runId = await ctx.db.insert("ragIndexingRuns", {
        sweepId: args.sweepId,
        organizationId: organization._id,
        model: TRANSACTION_EMBEDDING_MODEL,
        indexVersion: TRANSACTION_EMBEDDING_INDEX_VERSION,
        dimension: TRANSACTION_EMBEDDING_DIMENSION,
        status: "scheduled",
        schedulingComplete: false,
        totalTransactions: 0,
        scheduledTransactions: 0,
        processedTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        startedAt: now,
      });

      await ctx.scheduler.runAfter(
        0,
        internal.intelligence.bootstrapRAG.indexAllTransactions,
        { runId, organizationId: organization._id }
      );
    }

    const now = Date.now();
    const organizationsScheduled =
      sweep.organizationsScheduled + page.page.length;
    await ctx.db.patch(args.sweepId, {
      status: page.isDone ? "completed" : "running",
      cursor: page.isDone ? undefined : page.continueCursor,
      organizationsScheduled,
      updatedAt: now,
      completedAt: page.isDone ? now : undefined,
      lastError: undefined,
    });

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        100,
        internal.intelligence.bootstrapRAG.continueReindexSweep,
        {
          sweepId: args.sweepId,
          cursor: page.continueCursor,
        }
      );
    }

    return {
      advanced: true,
      organizationsScheduled,
      organizationSchedulingComplete: page.isDone,
    };
  },
});

/** Mark only the still-current page as failed so stale workers cannot regress it. */
export const markReindexSweepFailed = internalMutation({
  args: {
    sweepId: v.id("ragIndexingSweeps"),
    cursor: v.optional(v.string()),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const sweep = await ctx.db.get(args.sweepId);
    if (
      !sweep ||
      sweep.status === "completed" ||
      !isRagIndexingSweepCursorCurrent(sweep.cursor, args.cursor)
    ) {
      return { recorded: false };
    }

    await ctx.db.patch(args.sweepId, {
      status: "failed",
      lastError: args.error.slice(0, 1000),
      updatedAt: Date.now(),
    });
    return { recorded: true };
  },
});

/** Wrap each page so failures are visible and the saved cursor can be resumed. */
export const continueReindexSweep = internalAction({
  args: {
    sweepId: v.id("ragIndexingSweeps"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    try {
      return await ctx.runMutation(
        internal.intelligence.bootstrapRAG.processReindexSweepPage,
        args
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(
        internal.intelligence.bootstrapRAG.markReindexSweepFailed,
        { ...args, error: message }
      );
      return { advanced: false, status: "failed" as const, error: message };
    }
  },
});

/** Resume a failed or stalled sweep from its last durably saved cursor. */
export const resumeReindexSweep = internalMutation({
  args: { sweepId: v.id("ragIndexingSweeps") },
  handler: async (ctx, args) => {
    const sweep = await ctx.db.get(args.sweepId);
    if (!sweep) throw new Error("RAG indexing sweep not found");
    if (sweep.status === "completed") {
      return { resumed: false, status: sweep.status };
    }

    await ctx.db.patch(args.sweepId, {
      status: "scheduled",
      lastError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.intelligence.bootstrapRAG.continueReindexSweep,
      { sweepId: args.sweepId, cursor: sweep.cursor }
    );
    return { resumed: true, status: "scheduled" as const };
  },
});

/** Inspect a specific sweep, or the latest sweep for the current index version. */
export const getReindexSweepStatus = internalQuery({
  args: { sweepId: v.optional(v.id("ragIndexingSweeps")) },
  handler: async (ctx, args) => {
    if (args.sweepId) return await ctx.db.get(args.sweepId);
    return await ctx.db
      .query("ragIndexingSweeps")
      .withIndex("by_version", (q) =>
        q.eq("indexVersion", TRANSACTION_EMBEDDING_INDEX_VERSION)
      )
      .order("desc")
      .first();
  },
});

// Get indexing status for an organization
export const getIndexingStatus = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Count current transactions and return the latest durable migration run.
    const allTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const latestRun = await ctx.db
      .query("ragIndexingRuns")
      .withIndex("by_organization_version", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("indexVersion", TRANSACTION_EMBEDDING_INDEX_VERSION)
      )
      .order("desc")
      .first();
    const failedItems = latestRun
      ? await ctx.db
          .query("ragIndexingItems")
          .withIndex("by_run_status", (q) =>
            q.eq("runId", latestRun._id).eq("status", "failed")
          )
          .take(20)
      : [];

    return {
      totalTransactions: allTransactions.length,
      namespace: `org_${args.organizationId}`,
      model: TRANSACTION_EMBEDDING_MODEL,
      indexVersion: TRANSACTION_EMBEDDING_INDEX_VERSION,
      dimension: TRANSACTION_EMBEDDING_DIMENSION,
      latestRun,
      failedTransactionIds: failedItems.map((item) => item.transactionId),
    };
  },
});
