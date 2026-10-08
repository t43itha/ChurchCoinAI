import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";
import type { NamedTableInfo, OrderedQuery } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { isGiftAidEnabled } from "../../lib/giftAid";
import { DONOR_RULES } from "../intelligence/rules/donorRules";

const giftAidRuleIds = new Set(
  DONOR_RULES.filter((rule) => rule.requiresGiftAid).map((rule) => rule.id)
);

const visibleSuggestions = (
  suggestions: Doc<"intelligenceSuggestions">[],
  giftAidEnabled: boolean
) => suggestions.filter((suggestion) => giftAidEnabled || !giftAidRuleIds.has(suggestion.ruleId));

// Read the tenant index incrementally and stop once enough visible rows are
// found, so hidden reminders cannot crowd out the remaining suggestions.
async function takeVisibleSuggestions(
  query: OrderedQuery<NamedTableInfo<DataModel, "intelligenceSuggestions">>,
  limit: number,
  giftAidEnabled: boolean
) {
  if (giftAidEnabled) return query.take(limit);
  const result: Doc<"intelligenceSuggestions">[] = [];
  if (limit <= 0) return result;
  for await (const suggestion of query) {
    if (giftAidRuleIds.has(suggestion.ruleId)) continue;
    result.push(suggestion);
    if (result.length >= limit) break;
  }
  return result.slice(0, limit);
}

// Get pending suggestions for dashboard
export const getPendingSuggestions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const limit = args.limit ?? 10;
    const giftAidEnabled = isGiftAidEnabled(await ctx.db.get(user.organizationId));

    const suggestions = await takeVisibleSuggestions(ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .order("desc"), limit * 2, giftAidEnabled);

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
    const giftAidEnabled = isGiftAidEnabled(await ctx.db.get(user.organizationId));

    const suggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_type", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("insightType", args.insightType)
      )
      .collect();

    if (args.status) {
      return visibleSuggestions(suggestions, giftAidEnabled).filter((s) => s.status === args.status);
    }

    return visibleSuggestions(suggestions, giftAidEnabled);
  },
});

// Get suggestion counts for badges
export const getSuggestionCounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const giftAidEnabled = isGiftAidEnabled(await ctx.db.get(user.organizationId));

    const storedSuggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .collect();
    const suggestions = visibleSuggestions(storedSuggestions, giftAidEnabled);

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
    const giftAidEnabled = isGiftAidEnabled(await ctx.db.get(user.organizationId));

    if (args.status) {
      return await takeVisibleSuggestions(ctx.db
        .query("intelligenceSuggestions")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", user.organizationId).eq("status", args.status!)
        )
        .order("desc"), limit, giftAidEnabled);
    }

    // Get all suggestions for the organization
    const suggestions = await takeVisibleSuggestions(ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc"), limit, giftAidEnabled);

    return suggestions;
  },
});
