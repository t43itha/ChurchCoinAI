import { query, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { requireCapability } from "../lib/auth";
import { roundMoney, sumMoney } from "../lib/money";
import { CATEGORY_ALIASES, INCOME_MAIN_CATEGORY_ORDER } from "../../constants/rciCategories";
import {
  buildTransferSummary,
  filterIncomeAndExpenditure,
  isReportableIncomeTransaction,
} from "../../lib/reportableTransactions";
import { resolveReportingMainCategory } from "../intelligence/categorization/categoryResolver";
import { loanReportRows } from "../../lib/movementMatching";
import {
  clipToElapsedDays,
  financialYearPeriod,
  financialYearStartFor,
  isWithinRange,
  likeForLikePrior,
  monthBuckets,
  monthPeriod,
  type DateRange,
  type ReportingPeriod,
} from "../../lib/reportPeriods";
import {
  buildFundStatement,
  buildReadiness,
  buildTrend,
  groupGivingByDonor,
  periodTotals,
  rankCategoryGroups,
  reserveCover,
  type ReportFund,
  type ReportTransaction,
} from "../../lib/reportSummary";
import type {
  AnnualReportData,
  CategoryGroup,
  MonthlyReportData,
  ReportComparison,
  WeeklyBreakdownItem,
} from "../../types";

// Mission Tithe eligible categories (canonical names only)
const MISSION_TITHE_CATEGORIES = new Set([
  "Offerings",
  "Tithes & First Fruits",
  "Thanksgiving",
]);

// Resolve a category name to its canonical RCI name using the alias map
const resolveCategory = (category: string): string => {
  return CATEGORY_ALIASES[category] ?? category;
};

// Loans as they stood at a period end. Lender names are not redacted: reports
// need reports.read, which leadership holds with donors.read.
async function loadLoanRows(ctx: QueryCtx, organizationId: Id<"organizations">, throughDate: string) {
  const movements = await ctx.db
    .query("movements")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const loans = await Promise.all(
    movements
      .filter((movement) => movement.kind === "loan")
      .map(async (movement) => ({
        lender: movement.lender,
        dueDate: movement.dueDate,
        legs: await ctx.db
          .query("transactions")
          .withIndex("by_movement", (q) => q.eq("movementId", movement._id))
          .collect(),
      }))
  );
  return loanReportRows(loans, throughDate);
}

// Helper to get the Sunday (week ending) for a given date
function getWeekEndingDate(date: Date): string {
  const dayOfWeek = date.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + daysUntilSunday);
  return sunday.toISOString().split("T")[0];
}

// Helper to get all Sundays in a month
function getSundaysInMonth(year: number, month: number): string[] {
  const sundays: string[] = [];
  // UTC throughout, so the Sundays do not depend on the host's timezone.
  const date = new Date(Date.UTC(year, month, 1));

  // Find first Sunday
  while (date.getUTCDay() !== 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  // Collect all Sundays in the month
  while (date.getUTCMonth() === month) {
    sundays.push(date.toISOString().split("T")[0]);
    date.setUTCDate(date.getUTCDate() + 7);
  }

  return sundays;
}

// Weekly cash summary - aggregate all transactions for a specific week ending date
export const weeklyCashSummary = query({
  args: { weekEndingDate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "reports.read");

    // Get all cash collections for this week
    const collections = await ctx.db
      .query("cashCollections")
      .withIndex("by_organization_weekEnding", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("weekEndingDate", args.weekEndingDate)
      )
      .collect();

    if (collections.length === 0) {
      return null;
    }

    // Get all transactions linked to these collections
    const allTransactions: any[] = [];
    for (const collection of collections) {
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_cashCollection", (q) =>
          q.eq("cashCollectionId", collection._id)
        )
        .filter((q) => q.neq(q.field("isVoided"), true))
        .collect();
      allTransactions.push(
        ...filterIncomeAndExpenditure(
          transactions.filter(
            (transaction) => transaction.organizationId === collection.organizationId
          )
        )
      );
    }

    // Get fund details for enriching the report
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const fundMap = new Map(funds.map((f) => [f._id, f]));

    // Separate income and expenditure
    const incomeTransactions = allTransactions.filter((t) => t.type === "Income");
    const expenditureTransactions = allTransactions.filter(
      (t) => t.type === "Expenditure"
    );

    // Calculate totals
    const grossIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const pettyCashTotal = expenditureTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const bankableTotal = grossIncome - pettyCashTotal;
    const giftAidEligible = incomeTransactions
      .filter((t) => t.isGiftAidEligible)
      .reduce((sum, t) => sum + t.amount, 0);

    // Group by category
    const byCategory = incomeTransactions.reduce(
      (acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    // Group by fund
    const byFund = incomeTransactions.reduce(
      (acc, t) => {
        const fund = fundMap.get(t.fundId);
        const fundName = fund?.name || "Unknown";
        acc[fundName] = (acc[fundName] || 0) + t.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    // Tithe breakdown (individual donors + anonymous aggregate)
    const titheTransactions = incomeTransactions.filter(
      (t) => resolveCategory(t.category) === "Tithes & First Fruits"
    );
    const namedTithes = titheTransactions
      .filter((t) => t.donorName)
      .map((t) => ({
        donorName: t.donorName,
        amount: t.amount,
        isGiftAidEligible: t.isGiftAidEligible,
      }));
    const anonymousTitheTotal = titheTransactions
      .filter((t) => !t.donorName)
      .reduce((sum, t) => sum + t.amount, 0);
    const tithes = [
      ...namedTithes,
      ...(anonymousTitheTotal > 0
        ? [{ donorName: "Anonymous", amount: anonymousTitheTotal, isGiftAidEligible: false }]
        : []),
    ];

    // Petty cash breakdown
    const pettyCashItems = expenditureTransactions.map((t) => ({
      purpose: t.description.replace("Petty Cash - ", ""),
      amount: t.amount,
      category: t.category,
    }));

    return {
      weekEndingDate: args.weekEndingDate,
      collections: collections.map((c) => ({
        _id: c._id,
        collectionDate: c.collectionDate,
        status: c.status,
        bankedDate: c.bankedDate,
      })),
      summary: {
        grossIncome,
        pettyCashTotal,
        bankableTotal,
        giftAidEligible,
        transactionCount: allTransactions.length,
      },
      byCategory,
      byFund,
      tithes,
      pettyCashItems,
    };
  },
});

// Monthly cash breakdown - week-by-week summary for a month
export const monthlyCashBreakdown = query({
  args: {
    year: v.number(),
    month: v.number(), // 0-indexed (0 = January)
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "reports.read");

    // Get all Sundays in the month
    const sundays = getSundaysInMonth(args.year, args.month);

    // Get all collections for this month
    const allCollections = await ctx.db
      .query("cashCollections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Filter to collections within the month's Sundays
    const monthCollections = allCollections.filter((c) =>
      sundays.includes(c.weekEndingDate)
    );

    // Get all transactions for these collections
    const weeklyData: Array<{
      weekEndingDate: string;
      grossIncome: number;
      pettyCashTotal: number;
      bankableTotal: number;
      giftAidEligible: number;
      byCategory: Record<string, number>;
      status: "draft" | "submitted" | "banked" | "none";
    }> = [];

    const monthlyTotals = {
      grossIncome: 0,
      pettyCashTotal: 0,
      bankableTotal: 0,
      giftAidEligible: 0,
    };

    const monthlyByCategory: Record<string, number> = {};

    for (const sunday of sundays) {
      const weekCollections = monthCollections.filter(
        (c) => c.weekEndingDate === sunday
      );

      if (weekCollections.length === 0) {
        weeklyData.push({
          weekEndingDate: sunday,
          grossIncome: 0,
          pettyCashTotal: 0,
          bankableTotal: 0,
          giftAidEligible: 0,
          byCategory: {},
          status: "none",
        });
        continue;
      }

      // Get all transactions for this week
      const allTransactions: any[] = [];
      for (const collection of weekCollections) {
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_cashCollection", (q) =>
            q.eq("cashCollectionId", collection._id)
          )
          .filter((q) => q.neq(q.field("isVoided"), true))
          .collect();
        allTransactions.push(
          ...filterIncomeAndExpenditure(
            transactions.filter(
              (transaction) => transaction.organizationId === collection.organizationId
            )
          )
        );
      }

      const incomeTransactions = allTransactions.filter(
        (t) => t.type === "Income"
      );
      const expenditureTransactions = allTransactions.filter(
        (t) => t.type === "Expenditure"
      );

      const grossIncome = incomeTransactions.reduce(
        (sum, t) => sum + t.amount,
        0
      );
      const pettyCashTotal = expenditureTransactions.reduce(
        (sum, t) => sum + t.amount,
        0
      );
      const bankableTotal = grossIncome - pettyCashTotal;
      const giftAidEligible = incomeTransactions
        .filter((t) => t.isGiftAidEligible)
        .reduce((sum, t) => sum + t.amount, 0);

      const byCategory = incomeTransactions.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      // Determine overall status (banked > submitted > draft)
      const statuses = weekCollections.map((c) => c.status);
      let status: "draft" | "submitted" | "banked" = "draft";
      if (statuses.every((s) => s === "banked")) {
        status = "banked";
      } else if (statuses.some((s) => s === "submitted" || s === "banked")) {
        status = "submitted";
      }

      weeklyData.push({
        weekEndingDate: sunday,
        grossIncome,
        pettyCashTotal,
        bankableTotal,
        giftAidEligible,
        byCategory,
        status,
      });

      // Accumulate monthly totals
      monthlyTotals.grossIncome += grossIncome;
      monthlyTotals.pettyCashTotal += pettyCashTotal;
      monthlyTotals.bankableTotal += bankableTotal;
      monthlyTotals.giftAidEligible += giftAidEligible;

      // Accumulate category totals
      for (const [category, amount] of Object.entries(byCategory)) {
        monthlyByCategory[category] =
          (monthlyByCategory[category] || 0) + (amount as number);
      }
    }

    return {
      year: args.year,
      month: args.month,
      monthName: new Date(args.year, args.month).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
      weeks: weeklyData,
      monthlyTotals,
      monthlyByCategory,
    };
  },
});

// Get current week ending date (next Sunday)
export const getCurrentWeekEnding = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "reports.read");
    const [yearText, monthText, dayText] = args.today.split("-");
    return getWeekEndingDate(
      new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 12))
    );
  },
});


// Shared by the monthly and annual reports: one load per query, then every
// figure is derived in memory by date range.
type ReportLookup = {
  categoryDetails: Parameters<typeof resolveReportingMainCategory>[2];
  fundMap: Map<string, Doc<"funds">>;
};

type ReportInputs = Awaited<ReturnType<typeof loadReportInputs>>;

function toReportTransaction(transaction: Doc<"transactions">): ReportTransaction {
  return {
    ...transaction,
    fundId: String(transaction.fundId),
    donorId: transaction.donorId ? String(transaction.donorId) : undefined,
  };
}

async function loadReportingPeriod(
  ctx: QueryCtx,
  organizationId: Id<"organizations">
): Promise<ReportingPeriod> {
  const organization = await ctx.db.get(organizationId);
  return organization?.reportingPeriod ?? "tax_year";
}

// Non-voided transactions on or before endDate, plus categories and funds.
// Ranges are applied in memory.
async function loadReportInputs(ctx: QueryCtx, organizationId: Id<"organizations">, endDate: string) {
  const [transactions, categories, funds] = await Promise.all([
    ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", organizationId).lte("date", endDate)
      )
      .filter((q) => q.neq(q.field("isVoided"), true))
      .collect(),
    ctx.db
      .query("categories")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect(),
    ctx.db
      .query("funds")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect(),
  ]);

  const lookup: ReportLookup = {
    categoryDetails: categories.map((cat) => ({
      name: cat.name,
      mainCategory: cat.mainCategory,
      transactionType: cat.transactionType,
      displayOrder: cat.displayOrder,
    })),
    fundMap: new Map(funds.map((fund) => [String(fund._id), fund])),
  };

  return {
    rows: transactions.map(toReportTransaction),
    funds,
    reportFunds: funds.map(
      (fund): ReportFund => ({ _id: String(fund._id), name: fund.name, type: fund.type })
    ),
    lookup,
  };
}

function rowsIn(rows: ReportTransaction[], range: DateRange): ReportTransaction[] {
  return rows.filter((row) => isWithinRange(row.date, range));
}


function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

// Resolve a transaction's main category, with a fund-based grouping for
// "Donation"/"Donations" (primarily the Building Fund).
function mainCategoryFor(
  row: ReportTransaction,
  type: "Income" | "Expenditure",
  lookup: ReportLookup
): string {
  if (row.category === "Donation" || row.category === "Donations") {
    const fund = lookup.fundMap.get(row.fundId);
    if (fund) {
      if (fund.type === "Unrestricted" && !INCOME_MAIN_CATEGORY_ORDER.includes(fund.name)) {
        return "Donations";
      }
      return fund.name;
    }
  }
  return resolveReportingMainCategory(row.category, type, lookup.categoryDetails);
}

// Groups reportable rows by main category and subcategory, largest first.
function groupByMainCategory(
  rows: ReportTransaction[],
  type: "Income" | "Expenditure",
  lookup: ReportLookup
): CategoryGroup[] {
  const groups = [...groupBy(rows, (row) => mainCategoryFor(row, type, lookup))].map(
    ([mainCategory, groupRows]) => ({
      mainCategory,
      subcategories: [...groupBy(groupRows, (row) => row.category)].map(([name, subRows]) => ({
        name,
        total: sumMoney(subRows, (row) => row.amount),
      })),
      total: sumMoney(groupRows, (row) => row.amount),
    })
  );
  return rankCategoryGroups(groups).map(({ mainCategory, subcategories, total }) => ({
    mainCategory,
    subcategories,
    total,
  }));
}

function groupReport(reportable: ReportTransaction[], lookup: ReportLookup) {
  return {
    receipts: groupByMainCategory(reportable.filter(isReportableIncomeTransaction), "Income", lookup),
    payments: groupByMainCategory(
      reportable.filter((row) => row.type === "Expenditure"),
      "Expenditure",
      lookup
    ),
  };
}

function comparisonFor(inputs: ReportInputs, label: string, range: DateRange): ReportComparison {
  const reportable = filterIncomeAndExpenditure(rowsIn(inputs.rows, range));
  return {
    label,
    range,
    totals: periodTotals(inputs.rows, range),
    ...groupReport(reportable, inputs.lookup),
  };
}

// Mission Tithe: Offerings, Tithes & First Fruits and Thanksgiving in Unrestricted funds.
function isMissionTitheRow(row: ReportTransaction, lookup: ReportLookup): boolean {
  return (
    MISSION_TITHE_CATEGORIES.has(resolveCategory(row.category)) &&
    lookup.fundMap.get(row.fundId)?.type === "Unrestricted"
  );
}

function addDays(isoDate: string, days: number): string {
  return new Date(new Date(isoDate).getTime() + days * 86_400_000).toISOString().split("T")[0];
}

function categoryTotals(rows: ReportTransaction[]): Record<string, number> {
  return Object.fromEntries(
    [...groupBy(rows, (row) => row.category)].map(([category, categoryRows]) => [
      category,
      sumMoney(categoryRows, (row) => row.amount),
    ])
  );
}

// Receipts and payments for one week or partial week.
function weekBreakdown(
  reportable: ReportTransaction[],
  startDate: string,
  endDate: string,
  weekEnding: string
): WeeklyBreakdownItem {
  const weekRows = rowsIn(reportable, { startDate, endDate });
  return {
    weekEnding,
    receiptsTotal: sumMoney(weekRows.filter((row) => row.type === "Income"), (row) => row.amount),
    paymentsTotal: sumMoney(weekRows.filter((row) => row.type === "Expenditure"), (row) => row.amount),
    byCategory: categoryTotals(weekRows),
  };
}

// RCI Monthly Accounts data for one calendar month. month is 0-indexed.
export const monthlyReportData = query({
  args: {
    year: v.number(),
    month: v.number(), // 0-indexed (0 = January)
    today: v.string(), // client's yyyy-mm-dd
  },
  handler: async (ctx, args): Promise<MonthlyReportData> => {
    const user = await requireCapability(ctx, "reports.read");

    const period = monthPeriod(args.year, args.month, args.today);
    const [inputs, reportingPeriod] = await Promise.all([
      loadReportInputs(ctx, user.organizationId, period.endDate),
      loadReportingPeriod(ctx, user.organizationId),
    ]);
    const { rows, lookup } = inputs;

    // Figures cover the month up to today (the whole month once it has finished).
    const activity: DateRange = { startDate: period.startDate, endDate: period.throughDate };
    const activityRows = rowsIn(rows, activity);
    const reportable = filterIncomeAndExpenditure(activityRows);
    const incomeRows = reportable.filter(isReportableIncomeTransaction);
    const expenditureRows = reportable.filter((row) => row.type === "Expenditure");
    const { receipts, payments } = groupReport(reportable, lookup);

    // Weekly breakdown: a row per Sunday, plus a partial week after the last Sunday.
    // Weeks after throughDate are listed but total 0.
    const sundays = getSundaysInMonth(args.year, args.month);
    const weeklyBreakdown = sundays.map((weekEnding) =>
      weekBreakdown(reportable, addDays(weekEnding, -6), weekEnding, weekEnding)
    );
    const lastSunday = sundays[sundays.length - 1];
    if (lastSunday && lastSunday < activity.endDate) {
      const partial = weekBreakdown(reportable, addDays(lastSunday, 1), activity.endDate, activity.endDate);
      if (partial.receiptsTotal > 0 || partial.paymentsTotal > 0) weeklyBreakdown.push(partial);
    }

    // Mission Tithe
    const missionRows = incomeRows.filter((row) => isMissionTitheRow(row, lookup));
    const missionWeekTotal = (startDate: string, endDate: string) =>
      sumMoney(rowsIn(missionRows, { startDate, endDate }), (row) => row.amount);
    const missionTitheBreakdown = sundays.map((weekEnding) => ({
      weekEnding,
      total: missionWeekTotal(addDays(weekEnding, -6), weekEnding),
    }));
    if (lastSunday && lastSunday < activity.endDate) {
      const partialTotal = missionWeekTotal(addDays(lastSunday, 1), activity.endDate);
      if (partialTotal > 0) {
        missionTitheBreakdown.push({ weekEnding: activity.endDate, total: partialTotal });
      }
    }
    const missionTitheTotal = sumMoney(missionRows, (row) => row.amount);

    // Tithes (individual donors + anonymous aggregate)
    const titheRows = incomeRows.filter(
      (row) => resolveCategory(row.category) === "Tithes & First Fruits"
    );
    const namedTithes = titheRows
      .filter((row) => row.donorName)
      .map((row) => ({
        donorName: row.donorName!,
        amount: row.amount,
        isGiftAidEligible: row.isGiftAidEligible || false,
      }));
    const anonymousTitheTotal = sumMoney(
      titheRows.filter((row) => !row.donorName),
      (row) => row.amount
    );
    const tithes = [
      ...namedTithes,
      ...(anonymousTitheTotal > 0
        ? [{ donorName: "Anonymous", amount: anonymousTitheTotal, isGiftAidEligible: false }]
        : []),
    ];
    const titheGivers = groupGivingByDonor(
      titheRows.map((row) => ({
        donorId: row.donorId,
        donorName: row.donorName,
        amount: row.amount,
        isGiftAidEligible: row.isGiftAidEligible,
      }))
    );

    // Gift Aid
    const giftAidEligible = sumMoney(
      incomeRows.filter((row) => row.isGiftAidEligible),
      (row) => row.amount
    );

    const grossIncome = sumMoney(incomeRows, (row) => row.amount);
    const totalExpenditure = sumMoney(expenditureRows, (row) => row.amount);

    // Comparisons. Month -1 rolls back to the previous December.
    const previous = monthPeriod(args.year, args.month - 1, args.today);
    const sameMonthLastYear = monthPeriod(args.year - 1, args.month, args.today);

    // Trend: the twelve calendar months ending with this one.
    const trendStart = monthPeriod(args.year, args.month - 11, args.today).startDate;
    const trend = buildTrend(
      rows,
      monthBuckets({ startDate: trendStart, endDate: period.endDate }),
      period.throughDate
    );

    // Year to date: from the start of the financial year containing the last day
    // covered, up to that day.
    const financialYear = financialYearPeriod(
      financialYearStartFor(period.throughDate, reportingPeriod),
      reportingPeriod,
      args.today
    );

    return {
      year: args.year,
      month: args.month,
      monthName: period.label,
      period,
      receipts,
      payments,
      weeklyBreakdown,
      missionTithe: {
        weeklyBreakdown: missionTitheBreakdown,
        total: missionTitheTotal,
        titheToPay: missionTitheTotal * 0.1,
      },
      tithes,
      titheGivers,
      giftAidSummary: {
        eligible: giftAidEligible,
        claimable: giftAidEligible * 0.25,
      },
      totals: {
        grossIncome,
        totalExpenditure,
        netBankable: roundMoney(grossIncome - totalExpenditure),
      },
      comparison: {
        previousMonth: comparisonFor(inputs, previous.label, clipToElapsedDays(previous, period)),
        sameMonthLastYear: comparisonFor(
          inputs,
          sameMonthLastYear.label,
          clipToElapsedDays(sameMonthLastYear, period)
        ),
      },
      trend,
      yearToDate: {
        label: financialYear.label,
        totals: periodTotals(rows, {
          startDate: financialYear.startDate,
          endDate: period.throughDate,
        }),
      },
      fundStatement: buildFundStatement(inputs.reportFunds, rows, {
        startDate: period.startDate,
        endDate: period.throughDate,
      }),
      readiness: buildReadiness(rows, activity),
      transfers: buildTransferSummary(activityRows, inputs.funds),
      loans: await loadLoanRows(ctx, user.organizationId, period.throughDate),
    };
  },
});

// RCI Annual Report data for a financial year. year is the START year.
export const annualReportData = query({
  args: {
    year: v.number(),
    today: v.string(), // client's yyyy-mm-dd
  },
  handler: async (ctx, args): Promise<AnnualReportData> => {
    const user = await requireCapability(ctx, "reports.read");

    const reportingPeriod = await loadReportingPeriod(ctx, user.organizationId);
    const period = financialYearPeriod(args.year, reportingPeriod, args.today);
    const inputs = await loadReportInputs(ctx, user.organizationId, period.endDate);
    const { rows, lookup } = inputs;

    // Figures cover the elapsed part of the year (up to today, once started).
    const elapsed: DateRange = { startDate: period.startDate, endDate: period.throughDate };
    const elapsedRows = rowsIn(rows, elapsed);
    const reportable = filterIncomeAndExpenditure(elapsedRows);
    const incomeRows = reportable.filter(isReportableIncomeTransaction);
    const expenditureRows = reportable.filter((row) => row.type === "Expenditure");
    const { receipts, payments } = groupReport(reportable, lookup);

    // Prior year over the same elapsed months. Null when it has no reportable rows.
    const priorRange = likeForLikePrior(period);
    const priorLabel = financialYearPeriod(args.year - 1, reportingPeriod, args.today).label;
    const prior =
      filterIncomeAndExpenditure(rowsIn(rows, priorRange)).length === 0
        ? null
        : comparisonFor(
            inputs,
            `${priorLabel}${period.isComplete ? "" : " (same months)"}`,
            priorRange
          );

    const monthlyTrend = buildTrend(rows, monthBuckets(period), period.throughDate, rows);

    const fundStatement = buildFundStatement(inputs.reportFunds, rows, elapsed);

    // Reserve cover: unrestricted balance against the average monthly
    // unrestricted spending over complete months (partial months if none).
    const unrestrictedFundIds = new Set(
      inputs.reportFunds.filter((fund) => fund.type === "Unrestricted").map((fund) => fund._id)
    );
    const unrestrictedRows = rows.filter((row) => unrestrictedFundIds.has(row.fundId));
    const completeMonths = monthlyTrend.filter((point) => !point.isFuture && !point.isPartial);
    const basis =
      completeMonths.length > 0 ? completeMonths : monthlyTrend.filter((point) => !point.isFuture);
    // A partial month counts only the days up to today, so future spending stays out.
    const reserve = reserveCover(
      sumMoney(
        fundStatement.rows.filter((row) => row.type === "Unrestricted"),
        (row) => row.closing
      ),
      basis.map(
        (point) =>
          periodTotals(unrestrictedRows, {
            startDate: point.startDate,
            endDate: point.endDate < period.throughDate ? point.endDate : period.throughDate,
          }).expenditure
      )
    );

    // Mission Tithe over the elapsed span.
    const missionEligible = sumMoney(
      incomeRows.filter((row) => isMissionTitheRow(row, lookup)),
      (row) => row.amount
    );

    // Giving: every gift counts; donorCount is named givers only. regularGivers
    // are the named givers who gave in at least half the elapsed months.
    const giving = groupGivingByDonor(
      incomeRows.map((row) => ({
        donorId: row.donorId,
        donorName: row.donorName,
        amount: row.amount,
        isGiftAidEligible: row.isGiftAidEligible,
      }))
    );
    const givingRows = incomeRows.filter((row) => row.donorId || row.donorName);
    const elapsedMonths = monthBuckets(elapsed);
    const regularThreshold = Math.max(1, Math.ceil(period.monthsElapsed / 2));
    const regularGivers = [
      ...groupBy(givingRows, (row) => (row.donorId ? `id:${row.donorId}` : `name:${row.donorName}`)).values(),
    ].filter((giverRows) => {
      const months = new Set(
        giverRows.map((row) => elapsedMonths.findIndex((bucket) => isWithinRange(row.date, bucket)))
      );
      return months.size >= regularThreshold;
    }).length;

    const totalIncome = sumMoney(incomeRows, (row) => row.amount);
    const totalExpenditure = sumMoney(expenditureRows, (row) => row.amount);
    const giftAidEligible = sumMoney(
      incomeRows.filter((row) => row.isGiftAidEligible),
      (row) => row.amount
    );

    return {
      year: args.year,
      reportingPeriod,
      period,
      receipts,
      payments,
      monthlyTrend,
      prior,
      giftAidAnnual: {
        totalEligible: giftAidEligible,
        totalClaimable: giftAidEligible * 0.25,
      },
      missionTithe: {
        eligible: missionEligible,
        due: roundMoney(missionEligible * 0.1),
      },
      giving: {
        donorCount: giving.donorCount,
        giftCount: giving.giftCount,
        regularGivers,
      },
      fundStatement,
      reserveCover: reserve,
      readiness: buildReadiness(rows, elapsed),
      totals: {
        totalIncome,
        totalExpenditure,
        netMovement: roundMoney(totalIncome - totalExpenditure),
      },
      transfers: buildTransferSummary(elapsedRows, inputs.funds),
      loans: await loadLoanRows(ctx, user.organizationId, period.throughDate),
    };
  },
});
