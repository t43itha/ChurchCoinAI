import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";
import {
  calculateCollectionBankingTotals,
  getCollectionBankingStatus,
} from "../../lib/cashChequeBanking";
import { isActiveTransaction } from "../../lib/voidedTransactions";

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

type CashBankingReconciliation = Doc<"cashBankingReconciliations">;

export function sumCompletedCollectionBanked(
  reconciliations: CashBankingReconciliation[],
  cashCollectionId: Id<"cashCollections">
) {
  const totals = reconciliations
    .filter((reconciliation) => reconciliation.status === "completed")
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

  return {
    cashAmount: roundMoney(totals.cashAmount),
    chequeAmount: roundMoney(totals.chequeAmount),
    totalAmount: roundMoney(totals.cashAmount + totals.chequeAmount),
  };
}

export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("completed"), v.literal("reopened"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const reconciliations = args.status
      ? await ctx.db
          .query("cashBankingReconciliations")
          .withIndex("by_organization_status", (q) =>
            q.eq("organizationId", user.organizationId).eq("status", args.status!)
          )
          .collect()
      : await ctx.db
          .query("cashBankingReconciliations")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", user.organizationId)
          )
          .collect();

    return reconciliations.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getById = query({
  args: { reconciliationId: v.id("cashBankingReconciliations") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const reconciliation = await ctx.db.get(args.reconciliationId);
    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      return null;
    }

    return reconciliation;
  },
});

export const getAwaitingBanking = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const [collections, transactions, reconciliations] = await Promise.all([
      ctx.db
        .query("cashCollections")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("cashBankingReconciliations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
    ]);

    return collections
      .filter(
        (collection) =>
          collection.status === "submitted" || collection.status === "banked"
      )
      .map((collection) => {
        const expected = calculateCollectionBankingTotals(
          collection._id,
          transactions
        );
        const banked = sumCompletedCollectionBanked(
          reconciliations,
          collection._id
        );
        const openCashAmount = roundMoney(expected.cashAmount - banked.cashAmount);
        const openChequeAmount = roundMoney(
          expected.chequeAmount - banked.chequeAmount
        );
        const openTotal = roundMoney(openCashAmount + openChequeAmount);

        return {
          ...collection,
          expectedCashAmount: expected.cashAmount,
          expectedChequeAmount: expected.chequeAmount,
          expectedTotal: expected.totalAmount,
          bankedCashAmount: banked.cashAmount,
          bankedChequeAmount: banked.chequeAmount,
          bankedTotal: banked.totalAmount,
          openCashAmount,
          openChequeAmount,
          openTotal,
          cashBankingStatus: getCollectionBankingStatus(
            expected.totalAmount,
            banked.totalAmount
          ),
        };
      })
      .filter(
        (collection) => collection.expectedTotal > 0 && collection.openTotal > 0
      )
      .sort(
        (a, b) =>
          new Date(b.weekEndingDate).getTime() -
          new Date(a.weekEndingDate).getTime()
      );
  },
});

export const getCandidateBankCredits = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const transactions =
      args.startDate && args.endDate
        ? await ctx.db
            .query("transactions")
            .withIndex("by_organization_date", (q) =>
              q
                .eq("organizationId", user.organizationId)
                .gte("date", args.startDate!)
                .lte("date", args.endDate!)
            )
            .collect()
        : args.startDate
          ? await ctx.db
              .query("transactions")
              .withIndex("by_organization_date", (q) =>
                q.eq("organizationId", user.organizationId).gte("date", args.startDate!)
              )
              .collect()
          : args.endDate
            ? await ctx.db
                .query("transactions")
                .withIndex("by_organization_date", (q) =>
                  q.eq("organizationId", user.organizationId).lte("date", args.endDate!)
                )
                .collect()
            : await ctx.db
                .query("transactions")
                .withIndex("by_organization", (q) =>
                  q.eq("organizationId", user.organizationId)
                )
                .collect();

    const normalizedSearchTerm = args.searchTerm?.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        if (!isActiveTransaction(transaction)) return false;
        if (transaction.type !== "Income") return false;
        if (transaction.cashBankingRole === "bank_deposit") return false;
        if (transaction.cashBankingReconciliationId) return false;
        if (transaction.cashCollectionId) return false;

        if (normalizedSearchTerm) {
          const searchableText = [
            transaction.description,
            transaction.category,
            transaction.notes,
          ]
            .filter((value): value is string => typeof value === "string")
            .join(" ")
            .toLowerCase();

          return searchableText.includes(normalizedSearchTerm);
        }

        return true;
      })
      .sort((a, b) => {
        const dateComparison =
          new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateComparison !== 0) return dateComparison;
        return b.createdAt - a.createdAt;
      });
  },
});
