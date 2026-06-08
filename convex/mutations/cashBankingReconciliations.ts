import { mutation, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import {
  calculateCollectionBankingTotals,
  calculateReconciliationSummary,
  normalizeBankTransactionSplits,
} from "../../lib/cashChequeBanking";
import { isActiveTransaction } from "../../lib/voidedTransactions";

type BankingMedium = "cash" | "cheque" | "mixed";
type VarianceType =
  | "partial_banking"
  | "petty_cash_retained_or_spent"
  | "bank_counting_difference"
  | "cheque_timing"
  | "other";

type CollectionSplit = {
  cashCollectionId: Id<"cashCollections">;
  cashAmount: number;
  chequeAmount: number;
};

type BankTransactionSplitInput = {
  transactionId: Id<"transactions">;
  transactionAmount: number;
  medium: BankingMedium;
  cashAmount?: number;
  chequeAmount?: number;
};

type BankTransactionSplit = {
  transactionId: Id<"transactions">;
  medium: BankingMedium;
  cashAmount: number;
  chequeAmount: number;
};

type CashBankingReconciliation = Doc<"cashBankingReconciliations">;

export const varianceTypeValidator = v.union(
  v.literal("partial_banking"),
  v.literal("petty_cash_retained_or_spent"),
  v.literal("bank_counting_difference"),
  v.literal("cheque_timing"),
  v.literal("other")
);

export const collectionSplitValidator = v.object({
  cashCollectionId: v.id("cashCollections"),
  cashAmount: v.number(),
  chequeAmount: v.number(),
});

export const bankTransactionSplitInputValidator = v.object({
  transactionId: v.id("transactions"),
  transactionAmount: v.number(),
  medium: v.union(v.literal("cash"), v.literal("cheque"), v.literal("mixed")),
  cashAmount: v.optional(v.number()),
  chequeAmount: v.optional(v.number()),
});

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

function assertNonNegativeAmount(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

function assertUniqueCollectionSplits(collectionSplits: CollectionSplit[]) {
  const seen = new Set<string>();
  for (const split of collectionSplits) {
    if (seen.has(split.cashCollectionId)) {
      throw new Error("A cash collection can only appear once in a reconciliation");
    }
    seen.add(split.cashCollectionId);
  }
}

function assertUniqueBankTransactionSplits(
  bankTransactionSplits: BankTransactionSplitInput[] | BankTransactionSplit[]
) {
  const seen = new Set<string>();
  for (const split of bankTransactionSplits) {
    if (seen.has(split.transactionId)) {
      throw new Error("A bank transaction can only appear once in a reconciliation");
    }
    seen.add(split.transactionId);
  }
}

async function assertCollectionsBelongToOrganization(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  collectionSplits: CollectionSplit[]
) {
  const collections: Doc<"cashCollections">[] = [];

  for (const split of collectionSplits) {
    assertNonNegativeAmount(split.cashAmount, "Collection cash amount");
    assertNonNegativeAmount(split.chequeAmount, "Collection cheque amount");

    const collection = await ctx.db.get(split.cashCollectionId);
    if (!collection || collection.organizationId !== organizationId) {
      throw new Error("Cash collection not found");
    }

    if (collection.status === "draft") {
      throw new Error("Draft cash collections cannot be reconciled");
    }

    collections.push(collection);
  }

  return collections;
}

async function getAndValidateBankTransactions(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  bankTransactionSplits: BankTransactionSplitInput[],
  currentReconciliationId?: Id<"cashBankingReconciliations">
) {
  const transactions: Doc<"transactions">[] = [];

  for (const split of bankTransactionSplits) {
    const transaction = await ctx.db.get(split.transactionId);
    if (!transaction || transaction.organizationId !== organizationId) {
      throw new Error("Bank transaction not found");
    }

    if (!isActiveTransaction(transaction)) {
      throw new Error("Voided transactions cannot be used as bank deposits");
    }

    if (transaction.type !== "Income") {
      throw new Error("Only income transactions can be used as bank deposits");
    }

    const isLinkedToCurrentReconciliation =
      currentReconciliationId !== undefined &&
      transaction.cashBankingReconciliationId === currentReconciliationId;
    if (
      (transaction.cashBankingRole === "bank_deposit" ||
        transaction.cashBankingReconciliationId) &&
      !isLinkedToCurrentReconciliation
    ) {
      throw new Error("Bank transaction is already linked to a cash banking deposit");
    }

    if (transaction.cashCollectionId) {
      throw new Error(
        "Source in-person giving transactions cannot be used as bank deposits"
      );
    }

    transactions.push(transaction);
  }

  return transactions;
}

async function getCompletedReconciliations(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  excludedReconciliationId?: Id<"cashBankingReconciliations">
) {
  const reconciliations = await ctx.db
    .query("cashBankingReconciliations")
    .withIndex("by_organization_status", (q) =>
      q.eq("organizationId", organizationId).eq("status", "completed")
    )
    .collect();

  return reconciliations.filter(
    (reconciliation) => reconciliation._id !== excludedReconciliationId
  );
}

function sumCollectionSplits(
  reconciliations: CashBankingReconciliation[],
  cashCollectionId: Id<"cashCollections">
) {
  return reconciliations
    .flatMap((reconciliation) => reconciliation.cashCollectionSplits)
    .filter((split) => split.cashCollectionId === cashCollectionId)
    .reduce(
      (acc, split) => {
        acc.cashAmount += split.cashAmount;
        acc.chequeAmount += split.chequeAmount;
        return acc;
      },
      { cashAmount: 0, chequeAmount: 0 }
    );
}

async function getCollectionSourceTransactions(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  cashCollectionId: Id<"cashCollections">
) {
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_cashCollection", (q) =>
      q.eq("cashCollectionId", cashCollectionId)
    )
    .collect();

  return transactions.filter(
    (transaction) => transaction.organizationId === organizationId
  );
}

async function calculateCollectionBankingState(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  cashCollectionId: Id<"cashCollections">,
  completedReconciliations: CashBankingReconciliation[],
  pendingSplit?: CollectionSplit
) {
  const sourceTransactions = await getCollectionSourceTransactions(
    ctx,
    organizationId,
    cashCollectionId
  );
  const expected = calculateCollectionBankingTotals(
    cashCollectionId,
    sourceTransactions
  );
  const banked = sumCollectionSplits(
    completedReconciliations,
    cashCollectionId
  );

  const bankedCashAmount = roundMoney(
    banked.cashAmount + (pendingSplit?.cashAmount ?? 0)
  );
  const bankedChequeAmount = roundMoney(
    banked.chequeAmount + (pendingSplit?.chequeAmount ?? 0)
  );
  const remainingCashAmount = roundMoney(expected.cashAmount - bankedCashAmount);
  const remainingChequeAmount = roundMoney(
    expected.chequeAmount - bankedChequeAmount
  );

  return {
    expectedCashAmount: expected.cashAmount,
    expectedChequeAmount: expected.chequeAmount,
    bankedCashAmount,
    bankedChequeAmount,
    remainingCashAmount,
    remainingChequeAmount,
  };
}

async function assertCollectionSplitsWithinOpenBalances(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  collectionSplits: CollectionSplit[],
  currentReconciliationId: Id<"cashBankingReconciliations">
) {
  const completedReconciliations = await getCompletedReconciliations(
    ctx,
    organizationId,
    currentReconciliationId
  );

  for (const split of collectionSplits) {
    const state = await calculateCollectionBankingState(
      ctx,
      organizationId,
      split.cashCollectionId,
      completedReconciliations
    );
    const remainingCashAmount = Math.max(0, state.remainingCashAmount);
    const remainingChequeAmount = Math.max(0, state.remainingChequeAmount);

    if (remainingCashAmount === 0 && remainingChequeAmount === 0) {
      throw new Error("Cash collection has no remaining balance to reconcile");
    }

    if (roundMoney(split.cashAmount) > remainingCashAmount) {
      throw new Error("Collection cash split exceeds remaining cash balance");
    }

    if (roundMoney(split.chequeAmount) > remainingChequeAmount) {
      throw new Error("Collection cheque split exceeds remaining cheque balance");
    }
  }
}

function normalizeBankSplitsFromTransactions(
  bankTransactionSplits: BankTransactionSplitInput[],
  transactions: Doc<"transactions">[]
): BankTransactionSplit[] {
  const transactionsById = new Map(
    transactions.map((transaction) => [transaction._id, transaction])
  );

  return normalizeBankTransactionSplits(
    bankTransactionSplits.map((split) => {
      const transaction = transactionsById.get(split.transactionId);
      return {
        ...split,
        transactionAmount: transaction?.amount ?? split.transactionAmount,
      };
    })
  ).map((split) => ({
    transactionId: split.transactionId as Id<"transactions">,
    medium: split.medium,
    cashAmount: split.cashAmount,
    chequeAmount: split.chequeAmount,
  }));
}

function assertBankSplitsMatchStored(
  normalizedBankSplits: BankTransactionSplit[],
  storedBankSplits: BankTransactionSplit[]
) {
  if (normalizedBankSplits.length !== storedBankSplits.length) {
    throw new Error("Bank transaction splits are stale; update the draft first");
  }

  for (let index = 0; index < storedBankSplits.length; index += 1) {
    const normalized = normalizedBankSplits[index];
    const stored = storedBankSplits[index];

    if (
      normalized.transactionId !== stored.transactionId ||
      normalized.medium !== stored.medium ||
      roundMoney(normalized.cashAmount) !== roundMoney(stored.cashAmount) ||
      roundMoney(normalized.chequeAmount) !== roundMoney(stored.chequeAmount)
    ) {
      throw new Error("Bank transaction splits are stale; update the draft first");
    }
  }
}

function assertVarianceDetails(
  varianceAmount: number,
  varianceType?: VarianceType,
  varianceNote?: string
) {
  if (varianceAmount === 0) {
    return;
  }

  if (!varianceType) {
    throw new Error("Variance type is required when there is a variance");
  }

  if (!varianceNote || varianceNote.trim().length < 3) {
    throw new Error("Variance note must be at least 3 characters");
  }
}

export const createDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const now = Date.now();

    const reconciliationId = await ctx.db.insert("cashBankingReconciliations", {
      organizationId: user.organizationId,
      cashCollectionIds: [],
      cashCollectionSplits: [],
      bankTransactionIds: [],
      bankTransactionSplits: [],
      status: "draft",
      expectedCashAmount: 0,
      expectedChequeAmount: 0,
      expectedTotal: 0,
      bankedCashAmount: 0,
      bankedChequeAmount: 0,
      bankedTotal: 0,
      varianceAmount: 0,
      createdAt: now,
      createdBy: user._id,
      updatedAt: now,
    });

    return { reconciliationId };
  },
});

export const updateDraft = mutation({
  args: {
    reconciliationId: v.id("cashBankingReconciliations"),
    cashCollectionSplits: v.array(collectionSplitValidator),
    bankTransactionSplits: v.array(bankTransactionSplitInputValidator),
    varianceType: v.optional(varianceTypeValidator),
    varianceNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const reconciliation = await ctx.db.get(args.reconciliationId);
    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      throw new Error("Cash banking reconciliation not found");
    }

    if (reconciliation.status === "completed") {
      throw new Error("Completed reconciliations cannot be updated");
    }

    assertUniqueCollectionSplits(args.cashCollectionSplits);
    assertUniqueBankTransactionSplits(args.bankTransactionSplits);
    await assertCollectionsBelongToOrganization(
      ctx,
      user.organizationId,
      args.cashCollectionSplits
    );
    await assertCollectionSplitsWithinOpenBalances(
      ctx,
      user.organizationId,
      args.cashCollectionSplits,
      args.reconciliationId
    );
    const bankTransactions = await getAndValidateBankTransactions(
      ctx,
      user.organizationId,
      args.bankTransactionSplits,
      args.reconciliationId
    );
    const bankTransactionSplits = normalizeBankSplitsFromTransactions(
      args.bankTransactionSplits,
      bankTransactions
    );
    const summary = calculateReconciliationSummary({
      collectionSplits: args.cashCollectionSplits,
      bankTransactionSplits,
    });
    const varianceNote = args.varianceNote?.trim();

    assertVarianceDetails(summary.varianceAmount, args.varianceType, varianceNote);

    // Reopened bank deposits removed from the draft stay linked so reporting does not
    // expose overwritten deposit credits while the reconciliation is being edited.
    await ctx.db.patch(args.reconciliationId, {
      cashCollectionIds: args.cashCollectionSplits.map(
        (split) => split.cashCollectionId
      ),
      cashCollectionSplits: args.cashCollectionSplits,
      bankTransactionIds: bankTransactionSplits.map((split) => split.transactionId),
      bankTransactionSplits,
      expectedCashAmount: summary.expectedCashAmount,
      expectedChequeAmount: summary.expectedChequeAmount,
      expectedTotal: summary.expectedTotal,
      bankedCashAmount: summary.bankedCashAmount,
      bankedChequeAmount: summary.bankedChequeAmount,
      bankedTotal: summary.bankedTotal,
      varianceAmount: summary.varianceAmount,
      varianceType: args.varianceType,
      varianceNote: varianceNote || undefined,
      updatedAt: Date.now(),
    });

    return { reconciliationId: args.reconciliationId };
  },
});

export const complete = mutation({
  args: {
    reconciliationId: v.id("cashBankingReconciliations"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const reconciliation = await ctx.db.get(args.reconciliationId);
    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      throw new Error("Cash banking reconciliation not found");
    }

    if (reconciliation.status === "completed") {
      throw new Error("Cash banking reconciliation is already completed");
    }

    if (reconciliation.cashCollectionSplits.length === 0) {
      throw new Error("At least one cash collection is required");
    }

    if (reconciliation.bankTransactionSplits.length === 0) {
      throw new Error("At least one bank transaction is required");
    }

    assertVarianceDetails(
      reconciliation.varianceAmount,
      reconciliation.varianceType,
      reconciliation.varianceNote
    );

    assertUniqueCollectionSplits(reconciliation.cashCollectionSplits);
    assertUniqueBankTransactionSplits(reconciliation.bankTransactionSplits);
    await assertCollectionsBelongToOrganization(
      ctx,
      user.organizationId,
      reconciliation.cashCollectionSplits
    );
    await assertCollectionSplitsWithinOpenBalances(
      ctx,
      user.organizationId,
      reconciliation.cashCollectionSplits,
      args.reconciliationId
    );
    const bankTransactions = await getAndValidateBankTransactions(
      ctx,
      user.organizationId,
      reconciliation.bankTransactionSplits.map((split) => ({
        transactionId: split.transactionId,
        transactionAmount: split.cashAmount + split.chequeAmount,
        medium: split.medium,
        cashAmount: split.cashAmount,
        chequeAmount: split.chequeAmount,
      })),
      args.reconciliationId
    );
    const normalizedBankSplits = normalizeBankSplitsFromTransactions(
      reconciliation.bankTransactionSplits.map((split) => ({
        transactionId: split.transactionId,
        transactionAmount: split.cashAmount + split.chequeAmount,
        medium: split.medium,
        cashAmount: split.cashAmount,
        chequeAmount: split.chequeAmount,
      })),
      bankTransactions
    );
    assertBankSplitsMatchStored(
      normalizedBankSplits,
      reconciliation.bankTransactionSplits
    );

    for (const split of reconciliation.bankTransactionSplits) {
      await ctx.db.patch(split.transactionId, {
        category: "Cash/cheque banking",
        cashBankingReconciliationId: args.reconciliationId,
        cashBankingRole: "bank_deposit",
        bankingMedium: split.medium,
        isReconciled: true,
      });
    }

    const completedReconciliations = await getCompletedReconciliations(
      ctx,
      user.organizationId,
      args.reconciliationId
    );

    for (const cashCollectionId of reconciliation.cashCollectionIds) {
      const sourceTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_cashCollection", (q) =>
          q.eq("cashCollectionId", cashCollectionId)
        )
        .collect();

      for (const transaction of sourceTransactions) {
        if (
          transaction.organizationId === user.organizationId &&
          isActiveTransaction(transaction) &&
          transaction.type === "Income" &&
          (transaction.paymentMethod === "Cash" ||
            transaction.paymentMethod === "Cheque")
        ) {
          await ctx.db.patch(transaction._id, {
            cashBankingReconciliationId: args.reconciliationId,
            cashBankingRole: "source_giving",
          });
        }
      }

      const currentSplit = reconciliation.cashCollectionSplits.find(
        (split) => split.cashCollectionId === cashCollectionId
      );
      const state = await calculateCollectionBankingState(
        ctx,
        user.organizationId,
        cashCollectionId,
        completedReconciliations,
        currentSplit
      );

      await ctx.db.patch(cashCollectionId, {
        cashBankingLastReconciliationId: args.reconciliationId,
        cashBankingStatus:
          Math.max(0, state.remainingCashAmount) === 0 &&
          Math.max(0, state.remainingChequeAmount) === 0
            ? "banked"
            : "partially_banked",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.reconciliationId, {
      status: "completed",
      completedAt: now,
      completedBy: user._id,
      updatedAt: now,
    });

    return { reconciliationId: args.reconciliationId };
  },
});

export const reopen = mutation({
  args: {
    reconciliationId: v.id("cashBankingReconciliations"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const reason = args.reason.trim();

    if (reason.length < 3) {
      throw new Error("Reopen reason must be at least 3 characters");
    }

    const reconciliation = await ctx.db.get(args.reconciliationId);
    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      throw new Error("Cash banking reconciliation not found");
    }

    if (reconciliation.status !== "completed") {
      throw new Error("Only completed reconciliations can be reopened");
    }

    const completedReconciliations = await getCompletedReconciliations(
      ctx,
      user.organizationId,
      args.reconciliationId
    );

    for (const cashCollectionId of reconciliation.cashCollectionIds) {
      const sourceTransactions = await getCollectionSourceTransactions(
        ctx,
        user.organizationId,
        cashCollectionId
      );

      for (const transaction of sourceTransactions) {
        if (
          transaction.cashBankingReconciliationId === args.reconciliationId &&
          transaction.cashBankingRole === "source_giving" &&
          isActiveTransaction(transaction) &&
          transaction.type === "Income" &&
          (transaction.paymentMethod === "Cash" ||
            transaction.paymentMethod === "Cheque")
        ) {
          await ctx.db.patch(transaction._id, {
            cashBankingReconciliationId: undefined,
            cashBankingRole: undefined,
          });
        }
      }

      const state = await calculateCollectionBankingState(
        ctx,
        user.organizationId,
        cashCollectionId,
        completedReconciliations
      );
      const remainingCashAmount = Math.max(0, state.remainingCashAmount);
      const remainingChequeAmount = Math.max(0, state.remainingChequeAmount);
      const bankedTotal = roundMoney(
        state.bankedCashAmount + state.bankedChequeAmount
      );
      const latestCompletedReconciliation = completedReconciliations
        .filter((completedReconciliation) =>
          completedReconciliation.cashCollectionSplits.some(
            (split) => split.cashCollectionId === cashCollectionId
          )
        )
        .sort(
          (a, b) =>
            (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)
        )[0];

      await ctx.db.patch(cashCollectionId, {
        cashBankingLastReconciliationId: latestCompletedReconciliation?._id,
        cashBankingStatus:
          bankedTotal <= 0
            ? "not_started"
            : remainingCashAmount === 0 && remainingChequeAmount === 0
              ? "banked"
              : "partially_banked",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.reconciliationId, {
      status: "reopened",
      reopenedAt: now,
      reopenedBy: user._id,
      reopenReason: reason,
      updatedAt: now,
    });

    return { reconciliationId: args.reconciliationId };
  },
});
