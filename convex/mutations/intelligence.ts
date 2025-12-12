import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Accept a suggestion
export const acceptSuggestion = mutation({
  args: { suggestionId: v.id("intelligenceSuggestions") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion || suggestion.organizationId !== user.organizationId) {
      throw new Error("Suggestion not found");
    }

    await ctx.db.patch(args.suggestionId, {
      status: "accepted",
      acceptedAt: Date.now(),
    });

    return args.suggestionId;
  },
});

// Dismiss a suggestion
export const dismissSuggestion = mutation({
  args: {
    suggestionId: v.id("intelligenceSuggestions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion || suggestion.organizationId !== user.organizationId) {
      throw new Error("Suggestion not found");
    }

    await ctx.db.patch(args.suggestionId, {
      status: "dismissed",
      dismissedAt: Date.now(),
      dismissReason: args.reason,
    });

    return args.suggestionId;
  },
});

// Defer a suggestion
export const deferSuggestion = mutation({
  args: {
    suggestionId: v.id("intelligenceSuggestions"),
    deferDays: v.number(), // Defer for N days
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion || suggestion.organizationId !== user.organizationId) {
      throw new Error("Suggestion not found");
    }

    const deferredUntil = Date.now() + args.deferDays * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.suggestionId, {
      status: "deferred",
      deferredUntil,
    });

    return args.suggestionId;
  },
});

// Provide feedback on whether suggestion was helpful
export const provideFeedback = mutation({
  args: {
    suggestionId: v.id("intelligenceSuggestions"),
    wasHelpful: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion || suggestion.organizationId !== user.organizationId) {
      throw new Error("Suggestion not found");
    }

    await ctx.db.patch(args.suggestionId, {
      wasHelpful: args.wasHelpful,
    });

    return args.suggestionId;
  },
});

// Manually trigger insight generation
export const regenerateInsights = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Schedule the internal mutation to run immediately
    await ctx.scheduler.runAfter(
      0,
      internal.intelligence.generateInsights.generateForOrganization,
      {
        organizationId: user.organizationId,
      }
    );

    return { scheduled: true };
  },
});

// Clear all pending suggestions (for testing/reset)
export const clearPendingSuggestions = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin"]);

    const pendingSuggestions = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "pending")
      )
      .collect();

    for (const suggestion of pendingSuggestions) {
      await ctx.db.delete(suggestion._id);
    }

    return { deleted: pendingSuggestions.length };
  },
});
