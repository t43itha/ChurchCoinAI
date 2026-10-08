import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";
import {
  buildExecutiveDashboardSummary,
  type DashboardPeriodKey,
} from "../../lib/dashboardKpis";
import { isGiftAidEnabled } from "../../lib/giftAid";

export const executiveSummary = query({
  args: {
    today: v.string(),
    periodKey: v.optional(
      v.union(
        v.literal("currentMonth"),
        v.literal("previousMonth"),
        v.literal("quarter"),
        v.literal("ytd")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const periodKey: DashboardPeriodKey | undefined = args.periodKey;

    const [
      funds,
      transactions,
      donors,
      pledges,
      cashCollections,
      cashReconciliations,
      statementSessions,
      bankConnections,
    ] = await Promise.all([
      ctx.db
        .query("funds")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      // All-time transactions are currently required for fund balances and helper-built trends.
      ctx.db
        .query("transactions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("donors")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("pledges")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("cashCollections")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
      ctx.db
        .query("cashBankingReconciliations")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", user.organizationId).eq("status", "completed")
        )
        .collect(),
      ctx.db
        .query("reconciliationSessions")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", user.organizationId).eq("status", "completed")
        )
        .collect(),
      ctx.db
        .query("bankConnections")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .take(100),
    ]);

    const [yearText, monthText, dayText] = args.today.split("-");
    const organization = await ctx.db.get(user.organizationId);
    return buildExecutiveDashboardSummary({
      periodKey,
      giftAidEnabled: isGiftAidEnabled(organization),
      now: new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 12)),
      funds: funds.map((fund) => ({
        _id: String(fund._id),
        name: fund.name,
        type: fund.type,
        targetAmount: fund.targetAmount,
        deadline: fund.deadline,
      })),
      transactions: transactions.map((transaction) => ({
        _id: String(transaction._id),
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        fundId: String(transaction.fundId),
        isReconciled: transaction.isReconciled,
        donorId: transaction.donorId ? String(transaction.donorId) : undefined,
        donorName: transaction.donorName,
        pledgeId: transaction.pledgeId ? String(transaction.pledgeId) : undefined,
        isGiftAidEligible: transaction.isGiftAidEligible,
        cashCollectionId: transaction.cashCollectionId
          ? String(transaction.cashCollectionId)
          : undefined,
        cashBankingRole: transaction.cashBankingRole,
        paymentMethod: transaction.paymentMethod,
        isVoided: transaction.isVoided,
        movementKind: transaction.movementKind,
        movementId: transaction.movementId,
        isJournal: transaction.isJournal,
      })),
      donors: donors.map((donor) => ({
        _id: String(donor._id),
        name: donor.name,
        type: donor.type,
        isGiftAidActive: donor.isGiftAidActive,
      })),
      pledges: pledges.map((pledge) => ({
        _id: String(pledge._id),
        donorId: pledge.donorId ? String(pledge.donorId) : undefined,
        donorName: pledge.donorName,
        fundId: String(pledge.fundId),
        amount: pledge.amount,
        frequency: pledge.frequency,
        startDate: pledge.startDate,
        endDate: pledge.endDate,
        status: pledge.status,
      })),
      cashCollections: cashCollections.map((collection) => ({
        _id: String(collection._id),
        weekEndingDate: collection.weekEndingDate,
        status: collection.status,
      })),
      cashReconciliations: cashReconciliations.map((reconciliation) => ({
        _id: String(reconciliation._id),
        status: reconciliation.status,
        cashCollectionSplits: reconciliation.cashCollectionSplits.map((split) => ({
          cashCollectionId: String(split.cashCollectionId),
          cashAmount: split.cashAmount,
          chequeAmount: split.chequeAmount,
        })),
      })),
      statementSessions: statementSessions.map((session) => ({
        fundId: String(session.fundId),
        periodStart: session.periodStart,
        periodEnd: session.periodEnd,
        status: session.status,
      })),
      bankAccountFundIds: bankConnections.flatMap((connection) =>
        connection.accounts.flatMap((account) => (account.fundId ? [String(account.fundId)] : []))
      ),
    });
  },
});
