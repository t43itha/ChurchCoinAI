import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireCapability } from "../lib/auth";
import type { NamedTableInfo, OrderedQuery } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { isGiftAidEnabled } from "../../lib/giftAid";
import { can } from "../../lib/permissions";
import { DONOR_RULES } from "../intelligence/rules/donorRules";

type Suggestion = Doc<"intelligenceSuggestions">;

const giftAidRuleIds = new Set(
  DONOR_RULES.filter((rule) => rule.requiresGiftAid).map((rule) => rule.id)
);

// Donor insights name donors with amounts and Gift Aid status, so readers
// without donors.read get none of them, by type rather than by donor name.
function readerView(user: Doc<"users">, organization: Doc<"organizations"> | null) {
  const giftAidEnabled = isGiftAidEnabled(organization);
  const readsDonors = can(user.role, "donors.read");
  const isVisible = (suggestion: Suggestion) =>
    (giftAidEnabled || !giftAidRuleIds.has(suggestion.ruleId)) &&
    (readsDonors || suggestion.insightType !== "donor");
  const present = (suggestion: Suggestion): Suggestion => {
    if (readsDonors || !suggestion.actionData || typeof suggestion.actionData !== "object") {
      return suggestion;
    }
    const actionData = Object.fromEntries(
      Object.entries(suggestion.actionData as Record<string, unknown>).filter(
        ([key]) => !/^(donor|pledge)/i.test(key)
      )
    );
    return { ...suggestion, actionData };
  };
  return {
    filtersRows: !giftAidEnabled || !readsDonors,
    isVisible,
    visible: (suggestions: Suggestion[]) => suggestions.filter(isVisible).map(present),
    present,
  };
}

async function readSuggestions(ctx: Parameters<typeof requireCapability>[0]) {
  const user = await requireCapability(ctx, "ledger.read");
  return { user, view: readerView(user, await ctx.db.get(user.organizationId)) };
}

// Read the tenant index incrementally and stop once enough visible rows are
// found, so hidden suggestions cannot crowd out the remaining ones.
async function takeVisibleSuggestions(
  query: OrderedQuery<NamedTableInfo<DataModel, "intelligenceSuggestions">>,
  limit: number,
  view: ReturnType<typeof readerView>
) {
  if (!view.filtersRows) return (await query.take(limit)).map(view.present);
  const result: Suggestion[] = [];
  if (limit <= 0) return result;
  for await (const suggestion of query) {
    if (!view.isVisible(suggestion)) continue;
    result.push(view.present(suggestion));
    if (result.length >= limit) break;
  }
  return result.slice(0, limit);
}

// Get pending suggestions for dashboard
export const getPendingSuggestions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user, view } = await readSuggestions(ctx);
    const limit = args.limit ?? 10;

    const suggestions = await takeVisibleSuggestions(ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .order("desc"), limit * 2, view);

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
    const { user, view } = await readSuggestions(ctx);

    const suggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_type", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("insightType", args.insightType)
      )
      .collect();

    if (args.status) {
      return view.visible(suggestions).filter((s) => s.status === args.status);
    }

    return view.visible(suggestions);
  },
});

// Get suggestion counts for badges
export const getSuggestionCounts = query({
  args: {},
  handler: async (ctx) => {
    const { user, view } = await readSuggestions(ctx);

    const storedSuggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .collect();
    const suggestions = view.visible(storedSuggestions);

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
    const { user, view } = await readSuggestions(ctx);
    const limit = args.limit ?? 50;

    if (args.status) {
      return await takeVisibleSuggestions(ctx.db
        .query("intelligenceSuggestions")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", user.organizationId).eq("status", args.status!)
        )
        .order("desc"), limit, view);
    }

    // Get all suggestions for the organization
    const suggestions = await takeVisibleSuggestions(ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc"), limit, view);

    return suggestions;
  },
});
