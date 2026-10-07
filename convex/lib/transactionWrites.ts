import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import { movementProblem } from "../../lib/movementMatching";

// The only module allowed to patch, replace, or delete `transactions` rows
// (tests/transactionWriteOwnership.test.ts enforces this). Every write runs the
// completed-reconciliation lock unless the caller names why it may bypass it.

type TransactionTarget = Doc<"transactions"> | Id<"transactions">;
type TransactionPatch = Partial<WithoutSystemFields<Doc<"transactions">>>;

export type LockOverride =
  // reconciliationSessions / cashBankingReconciliations / cashCollections own
  // their lock fields and check their own status before writing.
  | "reconciliation-owner"
  // Renaming a category or donor relabels history, including locked rows.
  | "category-rename-cascade"
  | "donor-cascade"
  // Backfilling import dedup keys changes no amount, date, fund or category.
  | "import-key-backfill";

export type TransactionWriteOptions = { lockOverride?: LockOverride };

export async function getCompletedReconciliationLock(
  ctx: Pick<MutationCtx, "db">,
  transaction: {
    organizationId?: Id<"organizations">;
    cashCollectionId?: Id<"cashCollections">;
    reconciliationSessionId?: Id<"reconciliationSessions"> | null;
    cashBankingReconciliationId?: Id<"cashBankingReconciliations"> | null;
  }
) {
  if (transaction.reconciliationSessionId) {
    const session = await ctx.db.get(transaction.reconciliationSessionId);
    if (session && session.status === "completed") {
      return "bank" as const;
    }
  }

  if (transaction.cashBankingReconciliationId) {
    const reconciliation = await ctx.db.get(transaction.cashBankingReconciliationId);
    if (reconciliation && reconciliation.status === "completed") {
      return "cash" as const;
    }
  }

  // A collection may be banked across several reconciliations. Its source rows
  // stay locked even when reopening their recorded owner clears that claim.
  const { organizationId, cashCollectionId } = transaction;
  if (organizationId && cashCollectionId) {
    const reconciliations = await ctx.db
      .query("cashBankingReconciliations")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "completed")
      )
      .collect();
    if (reconciliations.some((reconciliation) =>
      reconciliation.cashCollectionSplits.some(
        (split) => split.cashCollectionId === cashCollectionId
      )
    )) {
      return "cash" as const;
    }
  }
  return null;
}

// Block changes to transactions locked by a completed reconciliation.
export async function assertNotLockedByReconciliation(
  ctx: Pick<MutationCtx, "db">,
  transaction: Parameters<typeof getCompletedReconciliationLock>[1]
) {
  const lock = await getCompletedReconciliationLock(ctx, transaction);
  if (lock === "bank") {
    throw new Error(
      "This transaction is part of a completed reconciliation. " +
        "Reopen that reconciliation session before changing it."
    );
  }
  if (lock === "cash") {
    throw new Error(
      "This transaction is part of a completed cash banking reconciliation. " +
        "Reopen that reconciliation before changing it."
    );
  }
}

async function guard(
  ctx: Pick<MutationCtx, "db">,
  target: TransactionTarget,
  options: TransactionWriteOptions | undefined
): Promise<Doc<"transactions">> {
  const doc = typeof target === "string" ? await ctx.db.get(target) : target;
  if (!doc) throw new Error("Transaction not found");
  if (!options?.lockOverride) await assertNotLockedByReconciliation(ctx, doc);
  return doc;
}

const MOVEMENT_LOCKED_FIELDS = ["amount", "type", "fundId", "movementKind", "isJournal"] as const;
const UNLINK_MESSAGE =
  "Unlink this transaction from its other side before changing its amount, direction, fund or category.";
const JOURNAL_MESSAGE = "Delete the transfer between funds instead.";

const pence = (amount: number) => Math.round(amount * 100);

// A linked leg's amount, direction, fund and kind belong to the pair. Unlink
// first, then change them, so the other side can't drift out of balance.
function assertMovementLockAllows(doc: Doc<"transactions">, patch: TransactionPatch) {
  if (!doc.movementId) return;
  const changes = MOVEMENT_LOCKED_FIELDS.some((field) => {
    if (!(field in patch)) return false;
    if (field === "amount") return pence(patch.amount ?? 0) !== pence(doc.amount);
    return patch[field] !== doc[field];
  });
  if (changes) throw new Error(UNLINK_MESSAGE);
}

// Removes a leg from its movement and clears its movementId. A movement that
// is no longer complete is dissolved and every remaining leg is unlinked. All
// reconciliation checks run before the first write, since Convex only rolls
// back the whole mutation when a throw escapes it.
export async function detachFromMovement(
  ctx: Pick<MutationCtx, "db">,
  doc: Doc<"transactions">,
  options?: TransactionWriteOptions
) {
  if (doc.isJournal) throw new Error(JOURNAL_MESSAGE);
  if (!doc.movementId) return;

  const movementId = doc.movementId;
  const movement = await ctx.db.get(movementId);
  const legs = await ctx.db
    .query("transactions")
    .withIndex("by_movement", (q) => q.eq("movementId", movementId))
    .collect();
  const remaining = legs.filter((leg) => leg._id !== doc._id);
  const stillComplete =
    movement !== null && movementProblem(movement.kind, remaining) === null;

  if (!options?.lockOverride) {
    await assertNotLockedByReconciliation(ctx, doc);
    if (!stillComplete) {
      for (const leg of remaining) await assertNotLockedByReconciliation(ctx, leg);
    }
  }

  if (!stillComplete) {
    if (movement) await ctx.db.delete(movement._id);
    for (const leg of remaining) await ctx.db.patch(leg._id, { movementId: undefined });
  }
  await ctx.db.patch(doc._id, { movementId: undefined });
}

export async function patchTransaction(
  ctx: Pick<MutationCtx, "db">,
  target: TransactionTarget,
  value: TransactionPatch,
  options?: TransactionWriteOptions
) {
  const doc = await guard(ctx, target, options);
  assertMovementLockAllows(doc, value);
  if (value.isVoided === true && !doc.isVoided && doc.movementId) {
    await detachFromMovement(ctx, doc, options);
  }
  await ctx.db.patch(doc._id, value);
}

export async function deleteTransaction(
  ctx: Pick<MutationCtx, "db">,
  target: TransactionTarget,
  options?: TransactionWriteOptions
) {
  const doc = await guard(ctx, target, options);

  if (doc.movementId && doc.isJournal) {
    const movementId = doc.movementId;
    const legs = await ctx.db
      .query("transactions")
      .withIndex("by_movement", (q) => q.eq("movementId", movementId))
      .collect();
    if (!options?.lockOverride) {
      for (const leg of legs) await assertNotLockedByReconciliation(ctx, leg);
    }
    for (const leg of legs) await ctx.db.delete(leg._id);
    const movement = await ctx.db.get(movementId);
    if (movement) await ctx.db.delete(movement._id);
    return;
  }

  if (doc.movementId) await detachFromMovement(ctx, doc, options);
  await ctx.db.delete(doc._id);
}
