import { internalAction, internalQuery, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { addForExistingOrganization } from "../lib/ragInstance";
import { isVoidedTransaction } from "../../lib/reportableTransactions";

/**
 * RAG Indexer - Handles ongoing indexing of new transactions.
 * Called via ctx.scheduler.runAfter from bulkCreate mutation.
 *
 * This enables the learning system to improve with every imported transaction.
 *
 * Jobs carry transaction ids, not text: each entry is built from the
 * transaction as it is when the job runs, so a job deferred to tomorrow or
 * run late never writes details someone has since corrected, and rows that
 * were deleted, voided or moved out of the church are skipped for good.
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

export function buildRAGSearchText(tx: {
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

const searchEntry = (tx: Doc<"transactions">) => ({
  text: buildRAGSearchText(tx),
  metadata: {
    transactionId: String(tx._id),
    category: tx.category,
    fundId: String(tx.fundId),
    type: tx.type,
    isGiftAidEligible: tx.isGiftAidEligible ?? false,
    donorName: tx.donorName ?? "",
    acceptedCount: 1,
  },
});

type SearchEntry = ReturnType<typeof searchEntry>;

/** Each transaction's search entry as it stands now, or null when it should not be indexed. */
export const currentEntries = internalQuery({
  args: { organizationId: v.id("organizations"), transactionIds: v.array(v.id("transactions")) },
  handler: async (ctx, args) =>
    Promise.all(
      args.transactionIds.map(async (transactionId) => {
        const tx = await ctx.db.get(transactionId);
        const indexable = tx && tx.organizationId === args.organizationId && !isVoidedTransaction(tx);
        return { transactionId, entry: indexable ? searchEntry(tx) : null };
      })
    ),
});

type IndexSummary = { total: number; successful: number; skipped: number; failed: number; deferred: number };

const sameEntry = (a: SearchEntry | null, b: SearchEntry) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Indexes the transactions' current state, a chunk at a time. Entries for
 * rows that no longer exist are not charged. When the day's budget refuses a
 * chunk, `retry` reschedules it and everything after it before this returns.
 */
async function indexCurrent(
  ctx: ActionCtx,
  organizationId: Id<"organizations">,
  transactionIds: Id<"transactions">[],
  retry: (delayMs: number, remaining: Id<"transactions">[]) => Promise<unknown>
): Promise<IndexSummary> {
  const namespace = `org_${organizationId}`;
  const load = (ids: Id<"transactions">[]) =>
    ctx.runQuery(internal.intelligence.ragIndexer.currentEntries, { organizationId, transactionIds: ids });
  const summary: IndexSummary = { total: transactionIds.length, successful: 0, skipped: 0, failed: 0, deferred: 0 };

  for (let start = 0; start < transactionIds.length; start += INDEX_CHUNK) {
    const chunk = await load(transactionIds.slice(start, start + INDEX_CHUNK));
    const live = chunk.flatMap(({ transactionId, entry }) => (entry ? [{ transactionId, entry }] : []));
    if (live.length > 0) {
      const budget = await chargeIndexing(ctx, organizationId, live.length);
      if (budget.status === "organizationMissing") {
        summary.skipped += transactionIds.length - start;
        break;
      }
      if (budget.status === "deferred") {
        const remaining = transactionIds.slice(start);
        await retry(budget.retryAt - Date.now(), remaining);
        summary.deferred = remaining.length;
        break;
      }
    }
    summary.skipped += chunk.length - live.length;

    for (const { transactionId, entry } of live) {
      try {
        const add = (current: SearchEntry) =>
          addForExistingOrganization(ctx, organizationId, { namespace, key: `tx:${transactionId}`, ...current });
        if (!(await add(entry))) {
          summary.skipped += 1;
          continue;
        }
        // An edit can land between reading the row and the add finishing, and
        // another job may already have indexed it: re-add the newer state so
        // the entry never ends on the details this job read.
        const [after] = await load([transactionId]);
        if (after.entry && !sameEntry(after.entry, entry)) await add(after.entry);
        summary.successful += 1;
      } catch (error) {
        console.error(`Failed to index transaction ${transactionId}:`, error);
        summary.failed += 1;
      }
    }
  }
  return summary;
}

// Index a newly created transaction into RAG
export const indexTransaction = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args): Promise<IndexSummary> =>
    indexCurrent(ctx, args.organizationId, [args.transactionId], (delay) =>
      ctx.scheduler.runAfter(delay, internal.intelligence.ragIndexer.indexTransaction, args)
    ),
});

// Batch index multiple transactions (for efficiency)
export const batchIndexTransactions = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactionIds: v.array(v.id("transactions")),
  },
  handler: async (ctx, args): Promise<IndexSummary> =>
    indexCurrent(ctx, args.organizationId, args.transactionIds, (delay, remaining) =>
      ctx.scheduler.runAfter(delay, internal.intelligence.ragIndexer.batchIndexTransactions, {
        organizationId: args.organizationId,
        transactionIds: remaining,
      })
    ),
});

// Re-index a transaction after a category correction. Its entry replaces the
// old one under the same key.
export const updateInIndex = internalAction({
  args: {
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args): Promise<IndexSummary> =>
    indexCurrent(ctx, args.organizationId, [args.transactionId], (delay) =>
      ctx.scheduler.runAfter(delay, internal.intelligence.ragIndexer.updateInIndex, args)
    ),
});
