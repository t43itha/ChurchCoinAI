import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "../lib/auth";

// List all cash collections for the organization
export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("submitted"), v.literal("banked"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    let collections;

    if (args.status) {
      collections = await ctx.db
        .query("cashCollections")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", user.organizationId).eq("status", args.status!)
        )
        .collect();
    } else {
      collections = await ctx.db
        .query("cashCollections")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .collect();
    }

    // Sort by week ending date descending
    return collections.sort(
      (a, b) =>
        new Date(b.weekEndingDate).getTime() -
        new Date(a.weekEndingDate).getTime()
    );
  },
});

// Get a single cash collection by ID
export const getById = query({
  args: { cashCollectionId: v.id("cashCollections") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      return null;
    }

    return collection;
  },
});

// Get a cash collection with all its linked transactions
export const getWithTransactions = query({
  args: { cashCollectionId: v.id("cashCollections") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      return null;
    }

    // Get all transactions linked to this collection
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_cashCollection", (q) =>
        q.eq("cashCollectionId", args.cashCollectionId)
      )
      .collect();

    // Get the user who recorded this
    const recordedByUser = await ctx.db.get(collection.recordedBy);

    // Separate into income (tithes + category totals) and expenditure (petty cash)
    const incomeTransactions = transactions.filter((t) => t.type === "Income");
    const expenditureTransactions = transactions.filter(
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

    // Group income by category
    const byCategory = incomeTransactions.reduce(
      (acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      ...collection,
      recordedByName: recordedByUser?.name || "Unknown",
      transactions,
      incomeTransactions,
      expenditureTransactions,
      summary: {
        grossIncome,
        pettyCashTotal,
        bankableTotal,
        giftAidEligible,
        byCategory,
        transactionCount: transactions.length,
      },
    };
  },
});

// Get collections for a specific week
export const getByWeekEnding = query({
  args: { weekEndingDate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const collections = await ctx.db
      .query("cashCollections")
      .withIndex("by_organization_weekEnding", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("weekEndingDate", args.weekEndingDate)
      )
      .collect();

    return collections;
  },
});

// Get recent collections (last N weeks)
export const getRecent = query({
  args: { weeks: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const weeksToFetch = args.weeks || 4;

    const collections = await ctx.db
      .query("cashCollections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Sort by week ending date descending and take last N weeks worth
    const sorted = collections.sort(
      (a, b) =>
        new Date(b.weekEndingDate).getTime() -
        new Date(a.weekEndingDate).getTime()
    );

    // Get unique week ending dates
    const uniqueWeeks = [...new Set(sorted.map((c) => c.weekEndingDate))];
    const recentWeeks = uniqueWeeks.slice(0, weeksToFetch);

    return sorted.filter((c) => recentWeeks.includes(c.weekEndingDate));
  },
});
