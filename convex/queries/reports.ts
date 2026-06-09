import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { CATEGORY_ALIASES, INCOME_MAIN_CATEGORY_ORDER } from "../../constants/rciCategories";
import {
  filterReportableTransactions,
  isReportableIncomeTransaction,
} from "../../lib/reportableTransactions";
import { resolveReportingMainCategory } from "../intelligence/categorization/categoryResolver";

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
  const date = new Date(year, month, 1);

  // Find first Sunday
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }

  // Collect all Sundays in the month
  while (date.getMonth() === month) {
    sundays.push(date.toISOString().split("T")[0]);
    date.setDate(date.getDate() + 7);
  }

  return sundays;
}

// Weekly cash summary - aggregate all transactions for a specific week ending date
export const weeklyCashSummary = query({
  args: { weekEndingDate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team", "Pastorate"]);

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
      allTransactions.push(...transactions);
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
    const user = await requireRole(ctx, ["Admin", "Finance Team", "Pastorate"]);

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

    let monthlyTotals = {
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
        allTransactions.push(...transactions);
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
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["Admin", "Finance Team"]);

    const today = new Date();
    return getWeekEndingDate(today);
  },
});

// RCI Monthly Report Data - structured for RCI Monthly Accounts template
export const monthlyReportData = query({
  args: {
    year: v.number(),
    month: v.number(), // 0-indexed (0 = January)
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team", "Pastorate"]);

    // Calculate date range for the month
    const startDate = new Date(args.year, args.month, 1);
    const endDate = new Date(args.year, args.month + 1, 0);
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get all transactions for this organization in the date range
    // Use .gte() in index and filter for upper bound (Convex doesn't support both .gte and .lte in same query)
    const allTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .gte("date", startDateStr)
      )
      .filter((q) =>
        q.and(
          q.lte(q.field("date"), endDateStr),
          q.neq(q.field("isVoided"), true)
        )
      )
      .collect();
    const reportableTransactions = filterReportableTransactions(allTransactions);

    // Get categories with mainCategory data
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Get funds for Mission Tithe fund-type filtering and Donation grouping
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const fundMap = new Map(funds.map((f) => [f._id, f]));

    const categoryDetails = categories.map((cat) => ({
      name: cat.name,
      mainCategory: cat.mainCategory,
      transactionType: cat.transactionType,
      displayOrder: cat.displayOrder,
    }));

    // Resolve mainCategory for a transaction, with alias fallback and fund-based grouping
    const getMainCategory = (
      category: string,
      fundId: Id<"funds">,
      transactionType: "Income" | "Expenditure"
    ): string => {
      const resolvedMainCategory = resolveReportingMainCategory(
        category,
        transactionType,
        categoryDetails
      );

      // Special case for "Donation"/"Donations": group by fund (primarily for Building Fund)
      if (category === "Donation" || category === "Donations") {
        if (fundId) {
          const fund = fundMap.get(fundId);
          if (fund) {
            if (INCOME_MAIN_CATEGORY_ORDER.includes(fund.name)) {
              return fund.name;
            }
            if (fund.type === "Unrestricted") {
              return "Donations";
            }
            return fund.name;
          }
        }
        return resolvedMainCategory;
      }

      return resolvedMainCategory;
    };

    // Separate income and expenditure
    const incomeTransactions = reportableTransactions.filter(
      isReportableIncomeTransaction
    );
    const expenditureTransactions = reportableTransactions.filter(
      (t) => t.type === "Expenditure"
    );

    // Group income by mainCategory
    const receiptsMap = new Map<string, { subcategories: Map<string, number>; total: number }>();
    for (const t of incomeTransactions) {
      const mainCategory = getMainCategory(t.category, t.fundId, "Income");

      if (!receiptsMap.has(mainCategory)) {
        receiptsMap.set(mainCategory, { subcategories: new Map(), total: 0 });
      }
      const group = receiptsMap.get(mainCategory)!;
      group.subcategories.set(t.category, (group.subcategories.get(t.category) || 0) + t.amount);
      group.total += t.amount;
    }

    // Group expenditure by mainCategory
    const paymentsMap = new Map<string, { subcategories: Map<string, number>; total: number }>();
    for (const t of expenditureTransactions) {
      const mainCategory = getMainCategory(t.category, t.fundId, "Expenditure");

      if (!paymentsMap.has(mainCategory)) {
        paymentsMap.set(mainCategory, { subcategories: new Map(), total: 0 });
      }
      const group = paymentsMap.get(mainCategory)!;
      group.subcategories.set(t.category, (group.subcategories.get(t.category) || 0) + t.amount);
      group.total += t.amount;
    }

    // Convert maps to arrays
    const receipts = Array.from(receiptsMap.entries()).map(([mainCategory, data]) => ({
      mainCategory,
      subcategories: Array.from(data.subcategories.entries()).map(([name, total]) => ({ name, total })),
      total: data.total,
    }));

    const payments = Array.from(paymentsMap.entries()).map(([mainCategory, data]) => ({
      mainCategory,
      subcategories: Array.from(data.subcategories.entries()).map(([name, total]) => ({ name, total })),
      total: data.total,
    }));

    // Weekly breakdown
    const sundays = getSundaysInMonth(args.year, args.month);
    const weeklyBreakdown = sundays.map((weekEnding) => {
      const weekStart = new Date(weekEnding);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      const weekTransactions = reportableTransactions.filter(
        (t) => t.date >= weekStartStr && t.date <= weekEnding
      );

      const receiptsTotal = weekTransactions
        .filter((t) => t.type === "Income")
        .reduce((sum, t) => sum + t.amount, 0);
      const paymentsTotal = weekTransactions
        .filter((t) => t.type === "Expenditure")
        .reduce((sum, t) => sum + t.amount, 0);

      const byCategory = weekTransactions.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        weekEnding,
        receiptsTotal,
        paymentsTotal,
        byCategory,
      };
    });

    // Add partial-week row for days after the last Sunday of the month
    const lastSunday = sundays[sundays.length - 1];
    if (lastSunday && lastSunday < endDateStr) {
      const dayAfterLastSunday = new Date(lastSunday);
      dayAfterLastSunday.setDate(dayAfterLastSunday.getDate() + 1);
      const partialStartStr = dayAfterLastSunday.toISOString().split("T")[0];

      const partialWeekTransactions = reportableTransactions.filter(
        (t) => t.date >= partialStartStr && t.date <= endDateStr
      );

      const partialReceipts = partialWeekTransactions
        .filter((t) => t.type === "Income")
        .reduce((sum, t) => sum + t.amount, 0);
      const partialPayments = partialWeekTransactions
        .filter((t) => t.type === "Expenditure")
        .reduce((sum, t) => sum + t.amount, 0);

      const partialByCategory = partialWeekTransactions.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      if (partialReceipts > 0 || partialPayments > 0) {
        weeklyBreakdown.push({
          weekEnding: endDateStr,
          receiptsTotal: partialReceipts,
          paymentsTotal: partialPayments,
          byCategory: partialByCategory,
        });
      }
    }

    // Mission Tithe breakdown (10% of Offerings + Tithes & First Fruits + Thanksgiving in General Fund only)
    const missionTitheBreakdown = sundays.map((weekEnding) => {
      const weekStart = new Date(weekEnding);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      const weekDonations = incomeTransactions.filter((t) => {
        if (t.date < weekStartStr || t.date > weekEnding) return false;
        const resolved = resolveCategory(t.category);
        if (!MISSION_TITHE_CATEGORIES.has(resolved)) return false;
        const fund = fundMap.get(t.fundId);
        return fund?.type === "Unrestricted";
      });

      const total = weekDonations.reduce((sum, t) => sum + t.amount, 0);

      return { weekEnding, total };
    });

    // Add partial-week row for donation days after the last Sunday
    if (lastSunday && lastSunday < endDateStr) {
      const dayAfterLastSunday = new Date(lastSunday);
      dayAfterLastSunday.setDate(dayAfterLastSunday.getDate() + 1);
      const partialStartStr = dayAfterLastSunday.toISOString().split("T")[0];

      const partialWeekDonations = incomeTransactions.filter((t) => {
        if (t.date < partialStartStr || t.date > endDateStr) return false;
        const resolved = resolveCategory(t.category);
        if (!MISSION_TITHE_CATEGORIES.has(resolved)) return false;
        const fund = fundMap.get(t.fundId);
        return fund?.type === "Unrestricted";
      });
      const partialTotal = partialWeekDonations.reduce((sum, t) => sum + t.amount, 0);

      if (partialTotal > 0) {
        missionTitheBreakdown.push({ weekEnding: endDateStr, total: partialTotal });
      }
    }

    // Compute total from ALL month's Mission Tithe eligible donations
    const missionTitheTotal = incomeTransactions
      .filter((t) => {
        const resolved = resolveCategory(t.category);
        if (!MISSION_TITHE_CATEGORIES.has(resolved)) return false;
        const fund = fundMap.get(t.fundId);
        return fund?.type === "Unrestricted";
      })
      .reduce((sum, t) => sum + t.amount, 0);

    // Tithes breakdown (individual donors + anonymous aggregate)
    const titheTransactions = incomeTransactions.filter(
      (t) => resolveCategory(t.category) === "Tithes & First Fruits"
    );

    const namedTithes = titheTransactions
      .filter((t) => t.donorName)
      .map((t) => ({
        donorName: t.donorName!,
        amount: t.amount,
        isGiftAidEligible: t.isGiftAidEligible || false,
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

    // Gift Aid summary
    const giftAidEligible = incomeTransactions
      .filter((t) => t.isGiftAidEligible)
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate totals
    const grossIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenditure = expenditureTransactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      year: args.year,
      month: args.month,
      monthName: new Date(args.year, args.month).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
      receipts,
      payments,
      weeklyBreakdown,
      missionTithe: {
        weeklyBreakdown: missionTitheBreakdown,
        total: missionTitheTotal,
        titheToPay: missionTitheTotal * 0.1,
      },
      tithes,
      giftAidSummary: {
        eligible: giftAidEligible,
        claimable: giftAidEligible * 0.25,
      },
      totals: {
        grossIncome,
        totalExpenditure,
        netBankable: grossIncome - totalExpenditure,
      },
    };
  },
});

// RCI Annual Report Data - structured for RCI Annual Report template
export const annualReportData = query({
  args: {
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team", "Pastorate"]);

    // Calculate date range for the year
    const startDate = `${args.year}-01-01`;
    const endDate = `${args.year}-12-31`;

    // Get all transactions for this organization in the year
    // Use .gte() in index and filter for upper bound (Convex doesn't support both .gte and .lte in same query)
    const allTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .gte("date", startDate)
      )
      .filter((q) =>
        q.and(
          q.lte(q.field("date"), endDate),
          q.neq(q.field("isVoided"), true)
        )
      )
      .collect();
    const reportableTransactions = filterReportableTransactions(allTransactions);

    // Get previous year transactions for comparison
    const prevStartDate = `${args.year - 1}-01-01`;
    const prevEndDate = `${args.year - 1}-12-31`;
    const prevYearTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .gte("date", prevStartDate)
      )
      .filter((q) =>
        q.and(
          q.lte(q.field("date"), prevEndDate),
          q.neq(q.field("isVoided"), true)
        )
      )
      .collect();
    const prevYearReportableTransactions =
      filterReportableTransactions(prevYearTransactions);

    // Get categories with mainCategory data
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Get funds for balance calculation
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const categoryDetails = categories.map((cat) => ({
      name: cat.name,
      mainCategory: cat.mainCategory,
      transactionType: cat.transactionType,
      displayOrder: cat.displayOrder,
    }));

    // Separate income and expenditure
    const incomeTransactions = reportableTransactions.filter(
      isReportableIncomeTransaction
    );
    const expenditureTransactions = reportableTransactions.filter(
      (t) => t.type === "Expenditure"
    );

    // Group income by mainCategory
    const incomeByMainCategory: Record<string, { total: number; subcategories: { name: string; total: number }[] }> = {};
    const incomeSubcategoryMap = new Map<string, Map<string, number>>();

    for (const t of incomeTransactions) {
      const mainCategory = resolveReportingMainCategory(
        t.category,
        "Income",
        categoryDetails
      );

      if (!incomeByMainCategory[mainCategory]) {
        incomeByMainCategory[mainCategory] = { total: 0, subcategories: [] };
        incomeSubcategoryMap.set(mainCategory, new Map());
      }
      incomeByMainCategory[mainCategory].total += t.amount;

      const subcatMap = incomeSubcategoryMap.get(mainCategory)!;
      subcatMap.set(t.category, (subcatMap.get(t.category) || 0) + t.amount);
    }

    // Convert subcategory maps to arrays
    for (const [mainCategory, subcatMap] of incomeSubcategoryMap.entries()) {
      incomeByMainCategory[mainCategory].subcategories = Array.from(subcatMap.entries()).map(
        ([name, total]) => ({ name, total })
      );
    }

    // Group expenditure by mainCategory
    const expenditureByMainCategory: Record<string, { total: number; subcategories: { name: string; total: number }[] }> = {};
    const expenditureSubcategoryMap = new Map<string, Map<string, number>>();

    for (const t of expenditureTransactions) {
      const mainCategory = resolveReportingMainCategory(
        t.category,
        "Expenditure",
        categoryDetails
      );

      if (!expenditureByMainCategory[mainCategory]) {
        expenditureByMainCategory[mainCategory] = { total: 0, subcategories: [] };
        expenditureSubcategoryMap.set(mainCategory, new Map());
      }
      expenditureByMainCategory[mainCategory].total += t.amount;

      const subcatMap = expenditureSubcategoryMap.get(mainCategory)!;
      subcatMap.set(t.category, (subcatMap.get(t.category) || 0) + t.amount);
    }

    // Convert subcategory maps to arrays
    for (const [mainCategory, subcatMap] of expenditureSubcategoryMap.entries()) {
      expenditureByMainCategory[mainCategory].subcategories = Array.from(subcatMap.entries()).map(
        ([name, total]) => ({ name, total })
      );
    }

    // Monthly trend
    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const monthStr = `${args.year}-${String(i + 1).padStart(2, "0")}`;
      const monthTransactions = reportableTransactions.filter((t) => t.date.startsWith(monthStr));

      const income = monthTransactions
        .filter((t) => t.type === "Income")
        .reduce((sum, t) => sum + t.amount, 0);
      const expenditure = monthTransactions
        .filter((t) => t.type === "Expenditure")
        .reduce((sum, t) => sum + t.amount, 0);

      return {
        month: new Date(args.year, i).toLocaleDateString("en-GB", { month: "short" }),
        income,
        expenditure,
      };
    });

    // Calculate totals
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenditure = expenditureTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Previous year totals for comparison
    const prevYearIncome = prevYearReportableTransactions
      .filter(isReportableIncomeTransaction)
      .reduce((sum, t) => sum + t.amount, 0);
    const prevYearExpenditure = prevYearReportableTransactions
      .filter((t) => t.type === "Expenditure")
      .reduce((sum, t) => sum + t.amount, 0);

    // Year over year comparison
    const yearOverYear = prevYearReportableTransactions.length > 0
      ? {
          current: { income: totalIncome, expenditure: totalExpenditure },
          previous: { income: prevYearIncome, expenditure: prevYearExpenditure },
          incomeChange: prevYearIncome > 0 ? ((totalIncome - prevYearIncome) / prevYearIncome) * 100 : 0,
          expenditureChange: prevYearExpenditure > 0 ? ((totalExpenditure - prevYearExpenditure) / prevYearExpenditure) * 100 : 0,
        }
      : undefined;

    // Gift Aid annual summary
    const giftAidEligible = incomeTransactions
      .filter((t) => t.isGiftAidEligible)
      .reduce((sum, t) => sum + t.amount, 0);

    // Fund balances - calculate from all transactions up to end of year
    const allTimeTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", user.organizationId).lte("date", endDate)
      )
      .filter((q) => q.neq(q.field("isVoided"), true))
      .collect();
    const allTimeReportableTransactions =
      filterReportableTransactions(allTimeTransactions);

    const fundBalances = funds.map((fund) => {
      const fundTransactions = allTimeReportableTransactions.filter((t) => t.fundId === fund._id);
      const income = fundTransactions
        .filter((t) => t.type === "Income")
        .reduce((sum, t) => sum + t.amount, 0);
      const expenditure = fundTransactions
        .filter((t) => t.type === "Expenditure")
        .reduce((sum, t) => sum + t.amount, 0);

      return {
        fund: fund.name,
        balance: income - expenditure,
        type: fund.type,
      };
    });

    return {
      year: args.year,
      incomeByMainCategory,
      expenditureByMainCategory,
      monthlyTrend,
      yearOverYear,
      giftAidAnnual: {
        totalEligible: giftAidEligible,
        totalClaimable: giftAidEligible * 0.25,
      },
      fundBalances,
      totals: {
        totalIncome,
        totalExpenditure,
        netMovement: totalIncome - totalExpenditure,
      },
    };
  },
});
