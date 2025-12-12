import { query } from "../_generated/server";
import { requireAuth } from "../lib/auth";

// Pre-computed context for AI chat - comprehensive summaries
// This replaces the 20-transaction limit in AICoPilot
export const getAIContext = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    // Get all transactions
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Get all funds
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Get all donors
    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // === MONTHLY SUMMARIES (ALL MONTHS) ===
    const monthlyMap: Record<
      string,
      { income: number; expenditure: number; transactionCount: number }
    > = {};

    transactions.forEach((t) => {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthlyMap[month]) {
        monthlyMap[month] = { income: 0, expenditure: 0, transactionCount: 0 };
      }
      monthlyMap[month].transactionCount++;
      if (t.type === "Income") {
        monthlyMap[month].income += t.amount;
      } else {
        monthlyMap[month].expenditure += t.amount;
      }
    });

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

    // === TOP DONORS BY TOTAL GIVING ===
    const donorGiving = donors.map((d) => {
      const total = transactions
        .filter((t) => t.donorId === d._id && t.type === "Income")
        .reduce((sum, t) => sum + t.amount, 0);
      return { name: d.name, total, id: d._id };
    }).sort((a, b) => b.total - a.total);

    const topDonors = donorGiving.slice(0, 10);

    // === CATEGORY BREAKDOWNS ===
    const incomeByCategory: Record<string, number> = {};
    const expenditureByCategory: Record<string, number> = {};

    transactions.forEach((t) => {
      const category = t.category || "Uncategorized";
      if (t.type === "Income") {
        incomeByCategory[category] =
          (incomeByCategory[category] || 0) + t.amount;
      } else {
        expenditureByCategory[category] =
          (expenditureByCategory[category] || 0) + t.amount;
      }
    });

    // === FUND BALANCES WITH TRENDS ===
    const fundBalances = funds.map((f) => {
      const fundTxns = transactions.filter((t) => t.fundId === f._id);
      const balance = fundTxns.reduce((sum, t) => {
        return t.type === "Income" ? sum + t.amount : sum - t.amount;
      }, 0);

      // Last 3 months trend
      const now = new Date();
      const threeMonthsAgo = new Date(
        now.getFullYear(),
        now.getMonth() - 3,
        1
      )
        .toISOString()
        .split("T")[0];
      const recentTxns = fundTxns.filter((t) => t.date >= threeMonthsAgo);
      const recentIncome = recentTxns
        .filter((t) => t.type === "Income")
        .reduce((s, t) => s + t.amount, 0);
      const recentExpense = recentTxns
        .filter((t) => t.type === "Expenditure")
        .reduce((s, t) => s + t.amount, 0);

      return {
        name: f.name,
        type: f.type,
        balance,
        targetAmount: f.targetAmount,
        recentIncome,
        recentExpense,
        progressPercent: f.targetAmount
          ? Math.round((balance / f.targetAmount) * 100)
          : null,
      };
    });

    // === UNCATEGORIZED COUNTS ===
    const uncategorizedCount = transactions.filter(
      (t) => !t.category || t.category === "Uncategorized"
    ).length;
    const unreconciledCount = transactions.filter(
      (t) => !t.isReconciled
    ).length;

    // === BEST/WORST MONTHS FOR DONATIONS ===
    const donationsByMonth = monthlySummaries.filter((m) => m.income > 0);
    const bestMonth =
      donationsByMonth.length > 0
        ? donationsByMonth.reduce((best, m) =>
            m.income > best.income ? m : best
          )
        : null;
    const worstMonth =
      donationsByMonth.length > 0
        ? donationsByMonth.reduce((worst, m) =>
            m.income < worst.income ? m : worst
          )
        : null;

    // === OVERALL TOTALS ===
    const totalIncome = transactions
      .filter((t) => t.type === "Income")
      .reduce((s, t) => s + t.amount, 0);
    const totalExpenditure = transactions
      .filter((t) => t.type === "Expenditure")
      .reduce((s, t) => s + t.amount, 0);

    // YTD calculations
    const currentYear = new Date().getFullYear().toString();
    const ytdIncome = transactions
      .filter((t) => t.type === "Income" && t.date.startsWith(currentYear))
      .reduce((s, t) => s + t.amount, 0);
    const ytdExpenditure = transactions
      .filter(
        (t) => t.type === "Expenditure" && t.date.startsWith(currentYear)
      )
      .reduce((s, t) => s + t.amount, 0);

    // === RECENT TRANSACTIONS (for context) ===
    const recentTransactions = transactions
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        category: t.category,
      }));

    return {
      // Summaries for AI to reference
      monthlySummaries,
      topDonors,
      incomeByCategory: Object.entries(incomeByCategory)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total),
      expenditureByCategory: Object.entries(expenditureByCategory)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total),
      fundBalances,

      // Operational status
      uncategorizedCount,
      unreconciledCount,
      transactionCount: transactions.length,
      donorCount: donors.length,

      // Key metrics
      totalIncome,
      totalExpenditure,
      netBalance: totalIncome - totalExpenditure,
      ytdIncome,
      ytdExpenditure,
      ytdNet: ytdIncome - ytdExpenditure,

      // Insights
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

      // Recent activity
      recentTransactions,

      // Date range
      dateRange:
        transactions.length > 0
          ? {
              earliest: transactions.reduce(
                (min, t) => (t.date < min ? t.date : min),
                transactions[0].date
              ),
              latest: transactions.reduce(
                (max, t) => (t.date > max ? t.date : max),
                transactions[0].date
              ),
            }
          : null,
    };
  },
});
