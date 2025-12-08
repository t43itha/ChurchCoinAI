import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";

// Get all funds with computed balances
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Compute balance for each fund from transactions
    const fundsWithBalance = await Promise.all(
      funds.map(async (fund) => {
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_fund", (q) => q.eq("fundId", fund._id))
          .collect();

        const balance = transactions.reduce((sum, t) => {
          return t.type === "Income" ? sum + t.amount : sum - t.amount;
        }, 0);

        return { ...fund, balance };
      })
    );

    return fundsWithBalance;
  },
});

// Get a specific fund by ID with computed balance
export const getById = query({
  args: { fundId: v.id("funds") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const fund = await ctx.db.get(args.fundId);

    if (!fund || fund.organizationId !== user.organizationId) {
      return null;
    }

    // Compute balance
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_fund", (q) => q.eq("fundId", fund._id))
      .collect();

    const balance = transactions.reduce((sum, t) => {
      return t.type === "Income" ? sum + t.amount : sum - t.amount;
    }, 0);

    return { ...fund, balance };
  },
});

// Get priority funds (restricted or low balance)
export const listPriority = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Compute balances and filter
    const fundsWithBalance = await Promise.all(
      funds.map(async (fund) => {
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_fund", (q) => q.eq("fundId", fund._id))
          .collect();

        const balance = transactions.reduce((sum, t) => {
          return t.type === "Income" ? sum + t.amount : sum - t.amount;
        }, 0);

        return { ...fund, balance };
      })
    );

    // Filter: restricted funds or low balance (< 1000)
    const priorityFunds = fundsWithBalance.filter(
      (f) => f.type === "Restricted" || f.balance < 1000
    );

    // Sort: funds with targets first, then by balance
    return priorityFunds.sort((a, b) => {
      if (a.targetAmount && !b.targetAmount) return -1;
      if (!a.targetAmount && b.targetAmount) return 1;
      return a.balance - b.balance;
    });
  },
});

// Get funds by type
export const listByType = query({
  args: {
    fundType: v.union(
      v.literal("Unrestricted"),
      v.literal("Restricted"),
      v.literal("Designated"),
      v.literal("Endowment")
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization_type", (q) =>
        q.eq("organizationId", user.organizationId).eq("type", args.fundType)
      )
      .collect();

    // Compute balances
    const fundsWithBalance = await Promise.all(
      funds.map(async (fund) => {
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_fund", (q) => q.eq("fundId", fund._id))
          .collect();

        const balance = transactions.reduce((sum, t) => {
          return t.type === "Income" ? sum + t.amount : sum - t.amount;
        }, 0);

        return { ...fund, balance };
      })
    );

    return fundsWithBalance;
  },
});
