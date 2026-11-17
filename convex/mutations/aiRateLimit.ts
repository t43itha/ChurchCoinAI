import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { aiUsageLimits, AI_USAGE_WINDOW_MS } from "../lib/aiValidation";

// Charges `units` of AI work against the caller, their organization and the
// deployment's daily budget. Every limit is checked before any is charged.
export const checkAndConsume = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    units: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.units) || args.units < 1) throw new Error("Invalid AI usage units");
    const limits = aiUsageLimits();
    const now = Date.now();
    const windowStart = Math.floor(now / AI_USAGE_WINDOW_MS) * AI_USAGE_WINDOW_MS;
    const day = new Date(now).toISOString().slice(0, 10);

    const [organizationWindow, userWindow, daily] = await Promise.all([
      ctx.db
        .query("aiRateLimits")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", undefined)
        )
        .first(),
      ctx.db
        .query("aiRateLimits")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", args.userId)
        )
        .first(),
      ctx.db.query("aiDailyUsage").withIndex("by_day", (q) => q.eq("day", day)).first(),
    ]);
    const used = (row: { windowStart: number; requestCount: number } | null) =>
      row && row.windowStart === windowStart ? row.requestCount : 0;

    if ((daily?.units ?? 0) + args.units > limits.deploymentPerDay) {
      throw new Error("AI features have reached today's usage limit. Please try again tomorrow.");
    }
    if (
      used(userWindow) + args.units > limits.userPerMinute ||
      used(organizationWindow) + args.units > limits.organizationPerMinute
    ) {
      throw new Error("AI rate limit exceeded. Please wait a minute and try again.");
    }

    const charge = async (row: Doc<"aiRateLimits"> | null, userId: Id<"users"> | undefined) => {
      const requestCount = used(row) + args.units;
      if (row) await ctx.db.patch(row._id, { windowStart, requestCount, updatedAt: now });
      else {
        await ctx.db.insert("aiRateLimits", {
          organizationId: args.organizationId,
          ...(userId ? { userId } : {}),
          windowStart,
          requestCount,
          updatedAt: now,
        });
      }
    };
    await charge(organizationWindow, undefined);
    await charge(userWindow, args.userId);
    if (daily) await ctx.db.patch(daily._id, { units: daily.units + args.units, updatedAt: now });
    else await ctx.db.insert("aiDailyUsage", { day, units: args.units, updatedAt: now });

    return { remaining: limits.userPerMinute - used(userWindow) - args.units, resetAt: windowStart + AI_USAGE_WINDOW_MS };
  },
});
