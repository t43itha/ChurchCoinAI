import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";

// Get pending suggestions for dashboard
export const getPendingSuggestions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const limit = args.limit ?? 10;

    const suggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .order("desc")
      .take(limit * 2); // Take more to filter, then slice

    // Sort by severity (critical > warning > info), then by date
    const sorted = suggestions.sort((a, b) => {
      const severityOrder: Record<string, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.createdAt - a.createdAt;
    });

    return sorted.slice(0, limit);
  },
});

// Get suggestions by type
export const getSuggestionsByType = query({
  args: {
    insightType: v.union(
      v.literal("donor"),
      v.literal("operations"),
      v.literal("financial"),
      v.literal("compliance")
    ),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("dismissed"),
        v.literal("deferred")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const suggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_type", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("insightType", args.insightType)
      )
      .collect();

    if (args.status) {
      return suggestions.filter((s) => s.status === args.status);
    }

    return suggestions;
  },
});

// Get suggestion counts for badges
export const getSuggestionCounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const suggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .collect();

    return {
      total: suggestions.length,
      critical: suggestions.filter((s) => s.severity === "critical").length,
      warning: suggestions.filter((s) => s.severity === "warning").length,
      info: suggestions.filter((s) => s.severity === "info").length,
      donor: suggestions.filter((s) => s.insightType === "donor").length,
      operations: suggestions.filter((s) => s.insightType === "operations")
        .length,
    };
  },
});

// Get all suggestions with pagination
export const listAll = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("dismissed"),
        v.literal("deferred")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const limit = args.limit ?? 50;

    if (args.status) {
      return await ctx.db
        .query("intelligenceSuggestions")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", user.organizationId).eq("status", args.status!)
        )
        .order("desc")
        .take(limit);
    }

    // Get all suggestions for the organization
    const suggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc")
      .take(limit);

    return suggestions;
  },
});
