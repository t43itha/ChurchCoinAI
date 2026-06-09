import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";
import {
  filterReportableTransactions,
  sumReportableSigned,
} from "../../lib/reportableTransactions";
import {
  buildExecutiveDashboardSummary,
  type DashboardPeriodKey,
} from "../../lib/dashboardKpis";

// Get dashboard summary data (KPIs)
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    // Get all funds
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Current month calculations
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    // Fetch only YTD transactions (covers current month + last month).
    const yearStart = `${now.getFullYear()}-01-01`;
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", user.organizationId).gte("date", yearStart)
      )
      .collect();
    const reportableTransactions = filterReportableTransactions(transactions);

    const currentMonthTxns = reportableTransactions.filter((t) =>
      t.date.startsWith(currentMonth)
    );
    const lastMonthTxns = reportableTransactions.filter((t) =>
      t.date.startsWith(lastMonthStr)
    );

    // Net Monthly Movement
    const currentMonthIncome = currentMonthTxns
      .filter((t) => t.type === "Income")
      .reduce((sum, t) => sum + t.amount, 0);
    const currentMonthExpenditure = currentMonthTxns
      .filter((t) => t.type === "Expenditure")
      .reduce((sum, t) => sum + t.amount, 0);
    const netMonthlyMovement = currentMonthIncome - currentMonthExpenditure;

    // Active Donors (unique donors this month vs last month)
    const currentDonors = new Set(
      currentMonthTxns
        .filter((t) => t.type === "Income" && t.donorName)
        .map((t) => t.donorName)
    );
    const lastDonors = new Set(
      lastMonthTxns
        .filter((t) => t.type === "Income" && t.donorName)
        .map((t) => t.donorName)
    );
    const activeDonorsCount = currentDonors.size;
    const donorGrowth = currentDonors.size - lastDonors.size;

    // Campaign Velocity (primary restricted fund progress)
    const restrictedFunds = funds.filter((f) => f.type === "Restricted");
    let campaignProgress = 0;
    let primaryCampaignName = "";

    if (restrictedFunds.length > 0) {
      // Find the fund with a target
      const campaignFund = restrictedFunds.find((f) => f.targetAmount);
      if (campaignFund) {
        const fundTxns = reportableTransactions.filter(
          (t) => t.fundId === campaignFund._id
        );
        const balance = sumReportableSigned(fundTxns);

        primaryCampaignName = campaignFund.name;
        campaignProgress = campaignFund.targetAmount
          ? Math.min((balance / campaignFund.targetAmount) * 100, 100)
          : 0;
      }
    }

    // Fund balances
    const fundsWithBalance = await Promise.all(
      funds.map(async (fund) => {
        const fundTxns = reportableTransactions.filter((t) => t.fundId === fund._id);
        const balance = sumReportableSigned(fundTxns);
        return { ...fund, balance };
      })
    );

    // Total balance across all funds
    const totalBalance = fundsWithBalance.reduce((sum, f) => sum + f.balance, 0);

    // Year to date totals
    const ytdTxns = reportableTransactions.filter((t) => t.date >= yearStart);
    const ytdIncome = ytdTxns
      .filter((t) => t.type === "Income")
      .reduce((sum, t) => sum + t.amount, 0);
    const ytdExpenditure = ytdTxns
      .filter((t) => t.type === "Expenditure")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      netMonthlyMovement,
      currentMonthIncome,
      currentMonthExpenditure,
      activeDonorsCount,
      donorGrowth,
      campaignProgress,
      primaryCampaignName,
      totalBalance,
      ytdIncome,
      ytdExpenditure,
      fundsWithBalance,
      transactionCount: reportableTransactions.length,
    };
  },
});

// Get data for 6-month trend chart
export const trendData = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startDate = sixMonthsAgo.toISOString().split("T")[0];

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", user.organizationId).gte("date", startDate)
      )
      .collect();
    const reportableTransactions = filterReportableTransactions(transactions);

    // Group by month
    const monthly: Record<string, { income: number; expenditure: number }> = {};

    // Initialize all 6 months
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthly[month] = { income: 0, expenditure: 0 };
    }

    // Populate with actual data
    reportableTransactions.forEach((t) => {
      const month = t.date.substring(0, 7);
      if (monthly[month]) {
        if (t.type === "Income") {
          monthly[month].income += t.amount;
        } else {
          monthly[month].expenditure += t.amount;
        }
      }
    });

    // Convert to array
    return Object.entries(monthly)
      .map(([month, data]) => ({
        month,
        name: new Date(month + "-01").toLocaleDateString("en-GB", {
          month: "short",
        }),
        ...data,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  },
});

export const executiveSummary = query({
  args: {
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
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect(),
    ]);

    return buildExecutiveDashboardSummary({
      periodKey,
      funds: funds.map((fund) => ({
        _id: String(fund._id),
        name: fund.name,
        type: fund.type,
        targetAmount: fund.targetAmount,
      })),
      transactions: transactions.map((transaction) => ({
        _id: String(transaction._id),
        date: transaction.date,
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
    });
  },
});
