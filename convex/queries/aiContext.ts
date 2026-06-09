import { query } from "../_generated/server";
import { requireAuth } from "../lib/auth";
import { filterReportableTransactions } from "../../lib/reportableTransactions";

const AI_CONTEXT_MONTH_WINDOW = 24;
const AI_CONTEXT_MAX_TRANSACTIONS = 5000;

// Pre-computed context for AI chat - comprehensive summaries
export const getAIContext = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const now = new Date();
    const analysisPeriodStart = new Date(
      now.getFullYear(),
      now.getMonth() - AI_CONTEXT_MONTH_WINDOW,
      1
    )
      .toISOString()
      .split("T")[0];
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      .toISOString()
      .split("T")[0];

    const transactions: Array<{
      date: string;
      amount: number;
      type: "Income" | "Expenditure";
      category?: string;
      fundId: string;
      donorId?: string;
      donorName?: string;
      isReconciled?: boolean;
      description: string;
    }> = [];

    const rawTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", user.organizationId).gte("date", analysisPeriodStart)
      )
      .take(AI_CONTEXT_MAX_TRANSACTIONS + 1);

    const isTruncated = rawTransactions.length > AI_CONTEXT_MAX_TRANSACTIONS;

    transactions.push(
      ...filterReportableTransactions(rawTransactions)
        .slice(0, AI_CONTEXT_MAX_TRANSACTIONS)
        .map((transaction) => ({
          date: transaction.date,
          amount: transaction.amount,
          type: transaction.type,
          category: transaction.category,
          fundId: transaction.fundId as string,
          donorId: transaction.donorId ? (transaction.donorId as string) : undefined,
          donorName: transaction.donorName ?? undefined,
          isReconciled: transaction.isReconciled,
          description: transaction.description,
        }))
    );

    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const monthlyMap: Record<
      string,
      { income: number; expenditure: number; transactionCount: number }
    > = {};
    const donorGivingMap = new Map<string, { id: string; name: string; total: number }>();
    const incomeByCategory: Record<string, number> = {};
    const expenditureByCategory: Record<string, number> = {};
    const fundMetrics = new Map<
      string,
      { balance: number; recentIncome: number; recentExpense: number }
    >();

    let uncategorizedCount = 0;
    let unreconciledCount = 0;
    let totalIncome = 0;
    let totalExpenditure = 0;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const transaction of transactions) {
      const month = transaction.date.substring(0, 7);
      if (!monthlyMap[month]) {
        monthlyMap[month] = { income: 0, expenditure: 0, transactionCount: 0 };
      }
      monthlyMap[month].transactionCount++;

      if (!transaction.category || transaction.category === "Uncategorized") {
        uncategorizedCount++;
      }
      if (!transaction.isReconciled) {
        unreconciledCount++;
      }

      const category = transaction.category || "Uncategorized";
      const fundId = transaction.fundId;
      const existingFundMetrics = fundMetrics.get(fundId) ?? {
        balance: 0,
        recentIncome: 0,
        recentExpense: 0,
      };

      if (transaction.type === "Income") {
        monthlyMap[month].income += transaction.amount;
        totalIncome += transaction.amount;
        incomeByCategory[category] = (incomeByCategory[category] || 0) + transaction.amount;
        existingFundMetrics.balance += transaction.amount;

        if (transaction.date >= threeMonthsAgo) {
          existingFundMetrics.recentIncome += transaction.amount;
        }

        const donorKey = transaction.donorId ?? transaction.donorName;
        if (donorKey) {
          const existingDonor = donorGivingMap.get(donorKey);
          if (existingDonor) {
            existingDonor.total += transaction.amount;
          } else {
            donorGivingMap.set(donorKey, {
              id: donorKey,
              name: transaction.donorName || "Unknown Donor",
              total: transaction.amount,
            });
          }
        }
      } else {
        monthlyMap[month].expenditure += transaction.amount;
        totalExpenditure += transaction.amount;
        expenditureByCategory[category] =
          (expenditureByCategory[category] || 0) + transaction.amount;
        existingFundMetrics.balance -= transaction.amount;
        if (transaction.date >= threeMonthsAgo) {
          existingFundMetrics.recentExpense += transaction.amount;
        }
      }

      fundMetrics.set(fundId, existingFundMetrics);

      if (!earliestDate || transaction.date < earliestDate) {
        earliestDate = transaction.date;
      }
      if (!latestDate || transaction.date > latestDate) {
        latestDate = transaction.date;
      }
    }

    const monthlySummaries = Object.entries(monthlyMap)
      .map(([month, data]) => ({
        month,
        monthName: new Date(month + "-01").toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        }),
        ...data,
        net: data.income - data.expenditure,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const donorGiving = Array.from(donorGivingMap.values()).sort(
      (a, b) => b.total - a.total
    );
    const topDonors = donorGiving.slice(0, 10);

    const fundBalances = funds.map((fund) => {
      const metrics = fundMetrics.get(fund._id as string) ?? {
        balance: 0,
        recentIncome: 0,
        recentExpense: 0,
      };
      return {
        name: fund.name,
        type: fund.type,
        balance: metrics.balance,
        targetAmount: fund.targetAmount,
        recentIncome: metrics.recentIncome,
        recentExpense: metrics.recentExpense,
        progressPercent: fund.targetAmount
          ? Math.round((metrics.balance / fund.targetAmount) * 100)
          : null,
      };
    });

    const donationsByMonth = monthlySummaries.filter((month) => month.income > 0);
    const bestMonth =
      donationsByMonth.length > 0
        ? donationsByMonth.reduce((best, month) =>
            month.income > best.income ? month : best
          )
        : null;
    const worstMonth =
      donationsByMonth.length > 0
        ? donationsByMonth.reduce((worst, month) =>
            month.income < worst.income ? month : worst
          )
        : null;

    const currentYear = new Date().getFullYear().toString();
    const ytdIncome = transactions
      .filter((transaction) => transaction.type === "Income" && transaction.date.startsWith(currentYear))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const ytdExpenditure = transactions
      .filter(
        (transaction) =>
          transaction.type === "Expenditure" && transaction.date.startsWith(currentYear)
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const recentTransactions = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((transaction) => ({
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
      }));

    return {
      monthlySummaries,
      topDonors,
      incomeByCategory: Object.entries(incomeByCategory)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total),
      expenditureByCategory: Object.entries(expenditureByCategory)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total),
      fundBalances,
      uncategorizedCount,
      unreconciledCount,
      transactionCount: transactions.length,
      donorCount: donorGiving.length,
      totalIncome,
      totalExpenditure,
      netBalance: totalIncome - totalExpenditure,
      ytdIncome,
      ytdExpenditure,
      ytdNet: ytdIncome - ytdExpenditure,
      bestMonth: bestMonth
        ? {
            month: bestMonth.monthName,
            income: bestMonth.income,
          }
        : null,
      worstMonth: worstMonth
        ? {
            month: worstMonth.monthName,
            income: worstMonth.income,
          }
        : null,
      recentTransactions,
      dateRange:
        earliestDate && latestDate
          ? {
              earliest: earliestDate,
              latest: latestDate,
            }
          : null,
      analysisPeriodStart,
      isTruncated,
      maxTransactions: AI_CONTEXT_MAX_TRANSACTIONS,
    };
  },
});
