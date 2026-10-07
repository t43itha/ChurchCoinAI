import { mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireCapability } from "../lib/auth";
import { Doc, Id } from "../_generated/dataModel";
import { movementProblem } from "../../lib/movementMatching";
import { ensureTypedCategories } from "../lib/categoryIntegrity";
import {
  assertValidTransactionAmount,
  assertValidTransactionDate,
} from "../lib/transactionValidation";
import { roundMoney } from "../lib/money";
import {
  deleteTransaction,
  detachFromMovement,
  patchTransaction,
} from "../lib/transactionWrites";

const legsOf = (ctx: MutationCtx, movementId: Id<"movements">) =>
  ctx.db
    .query("transactions")
    .withIndex("by_movement", (q) => q.eq("movementId", movementId))
    .collect();

export const link = mutation({
  args: {
    transactionIds: v.array(v.id("transactions")),
    movementId: v.optional(v.id("movements")),
    lender: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.write");
    if (args.transactionIds.length === 0) throw new Error("Choose the transactions to link.");
    if (new Set(args.transactionIds).size !== args.transactionIds.length) {
      throw new Error("Choose each transaction once.");
    }

    const legs: Doc<"transactions">[] = [];
    for (const transactionId of args.transactionIds) {
      const leg = await ctx.db.get(transactionId);
      if (!leg || leg.organizationId !== user.organizationId) throw new Error("Transaction not found");
      if (leg.movementId !== undefined) {
        throw new Error("This transaction is already linked. Unlink it first.");
      }
      legs.push(leg);
    }

    const movement = args.movementId ? await ctx.db.get(args.movementId) : null;
    if (args.movementId && (!movement || movement.organizationId !== user.organizationId)) {
      throw new Error("Movement not found");
    }
    const existing = movement ? await legsOf(ctx, movement._id) : [];

    const kind = movement ? movement.kind : legs[0].movementKind;
    if (!kind) throw new Error("Mark the transaction as a transfer, returned payment or loan first.");

    const isNewLoan = !movement && kind === "loan";
    const lender = isNewLoan ? args.lender?.trim() : undefined;
    if (isNewLoan && !lender) throw new Error("Enter who lent the money.");
    const dueDate = isNewLoan ? args.dueDate : undefined;
    if (dueDate !== undefined) assertValidTransactionDate(dueDate);

    const problem = movementProblem(kind, [...existing, ...legs]);
    if (problem) throw new Error(problem);

    const movementId =
      movement?._id ??
      (await ctx.db.insert("movements", {
        organizationId: user.organizationId,
        kind,
        note: args.note?.trim() || undefined,
        lender,
        dueDate,
        createdBy: user._id,
        createdAt: Date.now(),
      }));

    for (const leg of legs) {
      await patchTransaction(ctx, leg, { movementId });
    }
    return movementId;
  },
});

export const unlink = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.write");
    const leg = await ctx.db.get(args.transactionId);
    if (!leg || leg.organizationId !== user.organizationId) throw new Error("Transaction not found");
    if (leg.movementId === undefined) throw new Error("This transaction isn't linked.");

    await detachFromMovement(ctx, leg);
    return null;
  },
});

export const updateLoan = mutation({
  args: {
    movementId: v.id("movements"),
    lender: v.string(),
    dueDate: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.write");
    const loan = await ctx.db.get(args.movementId);
    if (!loan || loan.organizationId !== user.organizationId || loan.kind !== "loan") {
      throw new Error("Loan not found");
    }
    const lender = args.lender.trim();
    if (!lender) throw new Error("Enter who lent the money.");
    if (args.dueDate !== undefined) assertValidTransactionDate(args.dueDate);

    await ctx.db.patch(args.movementId, {
      lender,
      dueDate: args.dueDate,
      note: args.note?.trim() || undefined,
    });
    return null;
  },
});

export const createJournalTransfer = mutation({
  args: {
    fromFundId: v.id("funds"),
    toFundId: v.id("funds"),
    amount: v.number(),
    date: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.write");
    assertValidTransactionAmount(args.amount);
    assertValidTransactionDate(args.date);

    const fromFund = await ctx.db.get(args.fromFundId);
    const toFund = await ctx.db.get(args.toFundId);
    if (
      !fromFund || fromFund.organizationId !== user.organizationId ||
      !toFund || toFund.organizationId !== user.organizationId
    ) {
      throw new Error("Invalid fund");
    }
    if (args.fromFundId === args.toFundId) throw new Error("Choose two different funds.");

    const categories = await ensureTypedCategories(ctx, user.organizationId);
    const transferCategory = categories.find((category) => category.movementKind === "transfer");
    if (!transferCategory) throw new Error("The transfer between funds category is missing.");

    const now = Date.now();
    const note = args.note?.trim() || undefined;
    const movementId = await ctx.db.insert("movements", {
      organizationId: user.organizationId,
      kind: "transfer",
      note,
      createdBy: user._id,
      createdAt: now,
    });

    const common = {
      organizationId: user.organizationId,
      date: args.date,
      amount: roundMoney(args.amount),
      category: transferCategory.name,
      movementKind: "transfer" as const,
      movementId,
      isJournal: true,
      isReconciled: false,
      notes: note,
      isGiftAidEligible: false,
      createdAt: now,
    };
    await ctx.db.insert("transactions", {
      ...common,
      type: "Expenditure",
      fundId: args.fromFundId,
      description: `Transfer to ${toFund.name}`,
    });
    await ctx.db.insert("transactions", {
      ...common,
      type: "Income",
      fundId: args.toFundId,
      description: `Transfer from ${fromFund.name}`,
    });
    return movementId;
  },
});

// Deleting either side deletes the whole transfer (see deleteTransaction).
export const deleteJournalTransfer = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.delete");
    const leg = await ctx.db.get(args.transactionId);
    if (!leg || leg.organizationId !== user.organizationId || !leg.isJournal) {
      throw new Error("Transfer not found");
    }
    await deleteTransaction(ctx, leg);
    return null;
  },
});
