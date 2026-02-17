import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const checkAndConsume = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const currentWindowStart = Math.floor(now / args.windowMs) * args.windowMs;

    const existing = await ctx.db
      .query("aiRateLimits")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (!existing) {
      await ctx.db.insert("aiRateLimits", {
        organizationId: args.organizationId,
        windowStart: currentWindowStart,
        requestCount: 1,
        updatedAt: now,
      });
      return {
        allowed: true,
        remaining: Math.max(args.limit - 1, 0),
        resetAt: currentWindowStart + args.windowMs,
      };
    }

    // New time window: reset counter.
    if (existing.windowStart !== currentWindowStart) {
      await ctx.db.patch(existing._id, {
        windowStart: currentWindowStart,
        requestCount: 1,
        updatedAt: now,
      });
      return {
        allowed: true,
        remaining: Math.max(args.limit - 1, 0),
        resetAt: currentWindowStart + args.windowMs,
      };
    }

    if (existing.requestCount >= args.limit) {
      throw new Error("AI rate limit exceeded. Please wait and try again.");
    }

    const nextCount = existing.requestCount + 1;
    await ctx.db.patch(existing._id, {
      requestCount: nextCount,
      updatedAt: now,
    });

    return {
      allowed: true,
      remaining: Math.max(args.limit - nextCount, 0),
      resetAt: currentWindowStart + args.windowMs,
    };
  },
});
