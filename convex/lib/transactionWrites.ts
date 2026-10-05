import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";

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
  // Existing bypasses that still need an owner decision; see CLAUDE.md
  // "Enforced rules". Don't add new uses.
  | "needs-owner-decision";

export type TransactionWriteOptions = { lockOverride?: LockOverride };

// Block changes to transactions locked by a completed reconciliation.
export async function assertNotLockedByReconciliation(
  ctx: Pick<MutationCtx, "db">,
  transaction: {
    reconciliationSessionId?: Id<"reconciliationSessions"> | null;
    cashBankingReconciliationId?: Id<"cashBankingReconciliations"> | null;
  }
) {
  if (transaction.reconciliationSessionId) {
    const session = await ctx.db.get(transaction.reconciliationSessionId);
    if (session && session.status === "completed") {
      throw new Error(
        "This transaction is part of a completed reconciliation. " +
          "Reopen that reconciliation session before changing it."
      );
    }
  }

  if (transaction.cashBankingReconciliationId) {
    const reconciliation = await ctx.db.get(transaction.cashBankingReconciliationId);
    if (reconciliation && reconciliation.status === "completed") {
      throw new Error(
        "This transaction is part of a completed cash banking reconciliation. " +
          "Reopen that reconciliation before changing it."
      );
    }
  }
}

async function guard(
  ctx: Pick<MutationCtx, "db">,
  target: TransactionTarget,
  options: TransactionWriteOptions | undefined
): Promise<Id<"transactions">> {
  if (typeof target !== "string") {
    if (!options?.lockOverride) await assertNotLockedByReconciliation(ctx, target);
    return target._id;
  }
  if (!options?.lockOverride) {
    const transaction = await ctx.db.get(target);
    if (transaction) await assertNotLockedByReconciliation(ctx, transaction);
  }
  return target;
}

export async function patchTransaction(
  ctx: Pick<MutationCtx, "db">,
  target: TransactionTarget,
  value: TransactionPatch,
  options?: TransactionWriteOptions
) {
  const id = await guard(ctx, target, options);
  await ctx.db.patch(id, value);
}

export async function deleteTransaction(
  ctx: Pick<MutationCtx, "db">,
  target: TransactionTarget,
  options?: TransactionWriteOptions
) {
  const id = await guard(ctx, target, options);
  await ctx.db.delete(id);
}
