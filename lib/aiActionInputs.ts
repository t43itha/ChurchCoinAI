// Arguments for the AI report, chat and categorisation actions. The server
// refuses oversized input (AI_INPUT_LIMITS in convex/lib/aiValidation), so
// each payload grows with donors, categories or months, never with the number
// of transactions a church has recorded.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";
import { AI_INPUT_LIMITS } from "../convex/lib/aiValidation";
import { sumMoney } from "../convex/lib/money";
import type { Fund, Transaction } from "../types";
import { groupGivingByDonor } from "./reportSummary";

export type ReportRange = { start?: string; end?: string };

// Large gifts and payments the treasurer's commentary may mention.
export const TREASURER_LARGE_TRANSACTIONS = 25;
const PROJECT_RECENT_TRANSACTIONS = 15;

const inRange = (date: string, { start, end }: ReportRange) => (!start || date >= start) && (!end || date <= end);
const incomeOf = (rows: Transaction[]) => sumMoney(rows.filter((t) => t.type === "Income"), (t) => t.amount);
const spendingOf = (rows: Transaction[]) => sumMoney(rows.filter((t) => t.type !== "Income"), (t) => t.amount);

// One total per donor: the schedule needs each giver's total, not each gift.
export function giftAidScheduleArgs(transactions: Transaction[], range: ReportRange) {
  const eligible = transactions.filter((t) => t.type === "Income" && t.isGiftAidEligible && inRange(t.date, range));
  const { givers } = groupGivingByDonor(eligible);
  return {
    eligibleTransactions: JSON.stringify(givers.map((giver) => ({ donorName: giver.donor, amount: giver.total }))),
    startDate: range.start,
    endDate: range.end,
  };
}

export function treasurerReportArgs(transactions: Transaction[], funds: Fund[]) {
  const recentLargeTransactions = transactions
    .filter((t) => t.amount > 500)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, TREASURER_LARGE_TRANSACTIONS)
    .map((t) => ({ desc: t.description, amount: t.amount }));
  return {
    summaryData: JSON.stringify({
      totalIncome: incomeOf(transactions),
      totalExpenditure: sumMoney(transactions.filter((t) => t.type === "Expenditure"), (t) => t.amount),
      fundsStatus: funds.map((f) => ({ name: f.name, balance: f.balance })),
      recentLargeTransactions,
    }),
  };
}

export function projectReportArgs(transactions: Transaction[], fund: Fund, range: ReportRange) {
  const periodTxns = transactions.filter((t) => t.fundId === fund._id && inRange(t.date, range));
  return {
    fundName: fund.name,
    fundBalance: fund.balance,
    targetAmount: fund.targetAmount,
    periodIncome: incomeOf(periodTxns),
    periodExpense: sumMoney(periodTxns.filter((t) => t.type === "Expenditure"), (t) => t.amount),
    recentTransactions: JSON.stringify(
      periodTxns.slice(0, PROJECT_RECENT_TRANSACTIONS).map((t) => ({
        date: t.date, description: t.description, amount: t.amount, type: t.type, category: t.category,
      }))
    ),
  };
}

export function annualStatementArgs(transactions: Transaction[], range: ReportRange) {
  const periodTxns = transactions.filter((t) => inRange(t.date, range));
  const byCategory = (rows: Transaction[]) => {
    const groups = new Map<string, Transaction[]>();
    for (const row of rows) groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
    return Object.fromEntries([...groups].map(([category, group]) => [category, sumMoney(group, (t) => t.amount)]));
  };
  return {
    period: `${range.start || "Start"} to ${range.end || "End"}`,
    incomeByCategory: JSON.stringify(byCategory(periodTxns.filter((t) => t.type === "Income"))),
    expenditureByCategory: JSON.stringify(byCategory(periodTxns.filter((t) => t.type !== "Income"))),
    totalIncome: incomeOf(periodTxns),
    totalExpenditure: spendingOf(periodTxns),
  };
}

export function monthlyBreakdownArgs(transactions: Transaction[], range: ReportRange) {
  const months = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!inRange(t.date, range)) continue;
    const month = t.date.substring(0, 7);
    months.set(month, [...(months.get(month) ?? []), t]);
  }
  const monthlyData = [...months]
    .map(([month, rows]) => ({ month, income: incomeOf(rows), expense: spendingOf(rows) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  return { monthlyData: JSON.stringify(monthlyData) };
}

export type AIContext = FunctionReturnType<typeof api.queries.aiContext.getAIContext>;

export function chatContextData(aiContext: AIContext | undefined) {
  return JSON.stringify({
    // Monthly summaries for aggregate questions
    monthlySummaries: aiContext?.monthlySummaries,
    // Top donors for "who are our best donors" questions
    topDonors: aiContext?.topDonors,
    // Fund balances with progress
    fundBalances: aiContext?.fundBalances,
    // Category breakdowns
    incomeByCategory: aiContext?.incomeByCategory,
    expenditureByCategory: aiContext?.expenditureByCategory,
    // Key totals
    totals: {
      totalIncome: aiContext?.totalIncome,
      totalExpenditure: aiContext?.totalExpenditure,
      netBalance: aiContext?.netBalance,
      ytdIncome: aiContext?.ytdIncome,
      ytdExpenditure: aiContext?.ytdExpenditure,
    },
    // Pre-computed insights for common questions
    insights: {
      bestMonth: aiContext?.bestMonth,
      worstMonth: aiContext?.worstMonth,
      dateRange: aiContext?.dateRange,
    },
    // Operational status
    metrics: {
      transactionCount: aiContext?.transactionCount,
      donorCount: aiContext?.donorCount,
      uncategorizedCount: aiContext?.uncategorizedCount,
    },
    // Recent transactions for context
    recentTransactions: aiContext?.recentTransactions,
  });
}

// One auto-categorise request takes at most AI_INPUT_LIMITS.items rows; the
// rest of a larger selection stays selected for the next run.
export function autoCategoriseBatch<T extends Pick<Transaction, "description">>(rows: T[]) {
  const batch = rows.slice(0, AI_INPUT_LIMITS.items);
  return { batch, descriptions: batch.map((row) => row.description), remaining: rows.length - batch.length };
}
