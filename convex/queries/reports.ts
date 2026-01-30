import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

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

    // Tithe breakdown (individual donors)
    const tithes = incomeTransactions
      .filter((t) => t.category === "Tithe" && t.donorName)
      .map((t) => ({
        donorName: t.donorName,
        amount: t.amount,
        isGiftAidEligible: t.isGiftAidEligible,
      }));

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
