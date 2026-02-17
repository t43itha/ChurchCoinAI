import { query, internalQuery } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "../lib/auth";
import { ALL_INCOME_SUBCATEGORIES } from "../../constants/rciCategories";

const MIN_DATE = "0000-01-01";
const MAX_DATE = "9999-12-31";

const getDateBounds = (startDate?: string, endDate?: string) => ({
  startDate: startDate ?? MIN_DATE,
  endDate: endDate ?? MAX_DATE,
});

// List all transactions
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc")
      .collect();

    return transactions;
  },
});

// Get transactions with pagination (for usePaginatedQuery hook)
export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    return await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// Get transactions by fund
export const byFund = query({
  args: { fundId: v.id("funds") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Verify fund belongs to organization
    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      return [];
    }

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_fund", (q) => q.eq("fundId", args.fundId))
      .order("desc")
      .collect();

    return transactions;
  },
});

// Get transactions by donor
export const byDonor = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Ensure the donor belongs to the caller's organization
    const donor = await ctx.db.get(args.donorId);
    if (!donor || donor.organizationId !== user.organizationId) {
      throw new Error("Donor not found in your organization");
    }

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .order("desc")
      .collect();

    return transactions;
  },
});

// Get transactions by pledge
export const byPledge = query({
  args: { pledgeId: v.id("pledges") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Verify pledge belongs to organization
    const pledge = await ctx.db.get(args.pledgeId);
    if (!pledge || pledge.organizationId !== user.organizationId) {
      return [];
    }

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_pledge", (q) => q.eq("pledgeId", args.pledgeId))
      .order("desc")
      .collect();

    return transactions;
  },
});

// Get transactions by date range
export const byDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .gte("date", args.startDate)
          .lte("date", args.endDate)
      )
      .collect();

    return transactions;
  },
});

// Get recent transactions (for AI context)
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const limit = args.limit ?? 20;

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc")
      .take(limit);

    return transactions;
  },
});

// Get unreconciled transactions
export const listUnreconciled = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("isReconciled"), false))
      .order("desc")
      .collect();

    return transactions;
  },
});

// Get Gift Aid eligible transactions
export const listGiftAidEligible = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    if (args.startDate || args.endDate) {
      const { startDate, endDate } = getDateBounds(args.startDate, args.endDate);
      const boundedTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_organization_date", (q) =>
          q
            .eq("organizationId", user.organizationId)
            .gte("date", startDate)
            .lte("date", endDate)
        )
        .collect();
      return boundedTransactions.filter(
        (t) => t.isGiftAidEligible === true && t.type === "Income"
      );
    }

    return await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("isGiftAidEligible"), true),
          q.eq(q.field("type"), "Income")
        )
      )
      .collect();
  },
});

// Aggregate transactions by category (for reports)
export const aggregateByCategory = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    transactionType: v.optional(
      v.union(v.literal("Income"), v.literal("Expenditure"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dateBounds = getDateBounds(args.startDate, args.endDate);

    const transactions = args.startDate || args.endDate
      ? await ctx.db
          .query("transactions")
          .withIndex("by_organization_date", (q) =>
            q
              .eq("organizationId", user.organizationId)
              .gte("date", dateBounds.startDate)
              .lte("date", dateBounds.endDate)
          )
          .collect()
      : await ctx.db
          .query("transactions")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", user.organizationId)
          )
          .collect();

    const filtered = args.transactionType
      ? transactions.filter((t) => t.type === args.transactionType)
      : transactions;

    // Aggregate by category
    const aggregated = filtered.reduce(
      (acc, t) => {
        if (!acc[t.category]) {
          acc[t.category] = 0;
        }
        acc[t.category] += t.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.entries(aggregated).map(([category, total]) => ({
      category,
      total,
    }));
  },
});

// Get unlinked income transactions (for Smart Link AI)
export const listUnlinkedIncome = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("type"), "Income"))
      .order("desc")
      .collect();

    return transactions.filter((t) => t.pledgeId == null);
  },
});

// Get monthly summary (for dashboard chart)
export const monthlySummary = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const monthsBack = args.months ?? 6;

    // Calculate start date
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
    const startDateStr = startDate.toISOString().split("T")[0];

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", user.organizationId).gte("date", startDateStr)
      )
      .collect();

    // Group by month
    const monthly: Record<string, { income: number; expenditure: number }> = {};

    transactions.forEach((t) => {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthly[month]) {
        monthly[month] = { income: 0, expenditure: 0 };
      }
      if (t.type === "Income") {
        monthly[month].income += t.amount;
      } else {
        monthly[month].expenditure += t.amount;
      }
    });

    // Convert to array and sort
    return Object.entries(monthly)
      .map(([month, data]) => ({
        month,
        name: new Date(month + "-01").toLocaleDateString("en-GB", {
          month: "short",
          year: "2-digit",
        }),
        ...data,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  },
});

// Find transactions with mismatched type/category (e.g., Expenditure with Income category)
export const findMismatchedTransactions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    const results: any[] = [];

    // Income category names (lowercase for comparison)
    const incomeCategories = new Set(
      ALL_INCOME_SUBCATEGORIES.map((c) => c.toLowerCase())
    );
    // Also add main category names
    incomeCategories.add("donations");
    incomeCategories.add("building fund");
    incomeCategories.add("charitable activities");
    incomeCategories.add("other income");

    for (const org of organizations) {
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();

      // Find expenditure transactions using income category names
      const mismatched = transactions.filter((t) => {
        const categoryLower = t.category.toLowerCase();
        return (
          t.type === "Expenditure" &&
          (incomeCategories.has(categoryLower) ||
            categoryLower.includes("tithe") ||
            categoryLower.includes("offering") ||
            categoryLower === "donations")
        );
      });

      if (mismatched.length > 0) {
        results.push({
          organization: org.name,
          mismatched: mismatched.map((t) => ({
            _id: t._id,
            date: t.date,
            description: t.description,
            category: t.category,
            type: t.type,
            amount: t.amount,
          })),
        });
      }
    }

    return results;
  },
});
