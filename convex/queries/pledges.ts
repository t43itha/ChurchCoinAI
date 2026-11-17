import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { redactDonorFields, requireCapability } from "../lib/auth";
import {
  isReportableIncomeTransaction,
  sumReportableIncome,
} from "../../lib/reportableTransactions";
import { pledgeFulfillmentTarget } from "../../lib/pledgeProgress";
import { earliestPledgeStart, planSmartLinkRequest, smartLinkPageSizes } from "../../lib/smartLink";
import { aiUsageLimits } from "../lib/aiValidation";
import { roundMoney } from "../lib/money";

// List all pledges
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "pledges.read");

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return pledges.map((pledge) => redactDonorFields(user, pledge));
  },
});

// Get pledges by status
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("Active"),
      v.literal("Completed"),
      v.literal("Cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "pledges.read");

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", args.status)
      )
      .collect();

    return pledges.map((pledge) => redactDonorFields(user, pledge));
  },
});

// Get pledges for a specific fund
export const byFund = query({
  args: { fundId: v.id("funds") },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "pledges.read");

    // Verify fund belongs to organization
    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      return [];
    }

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_fund", (q) => q.eq("fundId", args.fundId))
      .collect();

    return pledges.map((pledge) => redactDonorFields(user, pledge));
  },
});

// Get pledges for a specific donor
export const byDonor = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "donors.read");

    // Verify donor belongs to organization
    const donor = await ctx.db.get(args.donorId);
    if (!donor || donor.organizationId !== user.organizationId) {
      return [];
    }

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    return pledges.filter((pledge) => pledge.organizationId === user.organizationId)
      .map((pledge) => redactDonorFields(user, pledge));
  },
});

// Get a specific pledge with linked transactions and progress
export const getWithProgress = query({
  args: { pledgeId: v.id("pledges") },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "pledges.read");
    const pledge = await ctx.db.get(args.pledgeId);

    if (!pledge || pledge.organizationId !== user.organizationId) {
      return null;
    }

    // Get transactions linked to this pledge
    const linkedTransactions = (
      await ctx.db
        .query("transactions")
        .withIndex("by_pledge", (q) => q.eq("pledgeId", args.pledgeId))
        .collect()
    ).filter(
      (transaction) =>
        transaction.organizationId === user.organizationId &&
        isReportableIncomeTransaction(transaction)
    );

    const totalReceived = sumReportableIncome(linkedTransactions);
    const target = pledgeFulfillmentTarget(pledge) ?? pledge.amount;
    const progress =
      target > 0 ? Math.min((totalReceived / target) * 100, 100) : 0;

    // Get fund name for display
    const fund = await ctx.db.get(pledge.fundId);

    return {
      ...redactDonorFields(user, pledge),
      fundName: fund?.name ?? "Unknown Fund",
      linkedTransactions: linkedTransactions.map((transaction) => redactDonorFields(user, transaction)),
      totalReceived,
      progress,
      remaining: Math.max(roundMoney(target - totalReceived), 0),
    };
  },
});

// Where Smart Link's next request starts (lib/smartLink SmartLinkCursor). Ids
// are only compared, never loaded, so they are plain strings.
const pledgeKeyValidator = v.object({ createdAt: v.number(), pledgeId: v.string() });
export const smartLinkCursorValidator = v.object({
  pledgesAfter: v.optional(pledgeKeyValidator),
  pledgesThrough: v.optional(pledgeKeyValidator),
  giftsAfter: v.optional(v.object({ date: v.string(), transactionId: v.string() })),
});

// The next Smart Link request for a church: a batch of open pledges and a
// page of unlinked income dated on or after the earliest of them, continuing
// from `after`. Null when nothing is left to check. The action has already
// checked the caller may run Smart Link.
export const smartLinkCandidates = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    after: v.optional(smartLinkCursorValidator),
  },
  handler: async (ctx, args) => {
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization_status", (q) => q.eq("organizationId", args.organizationId).eq("status", "Active"))
      .collect();
    if (pledges.length === 0) return null;

    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId).gte("date", earliestPledgeStart(pledges))
      )
      .collect();
    const gifts = rows.filter((t) => t.pledgeId == null && isReportableIncomeTransaction(t));
    return planSmartLinkRequest(pledges, gifts, args.after, smartLinkPageSizes(aiUsageLimits()));
  },
});
