import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, isAdmin } from "../lib/auth";
import { Id, Doc } from "../_generated/dataModel";

// True when a webhook event is older than the newest one already applied,
// in which case it must not overwrite current state (Stripe retries webhooks
// and does not guarantee delivery order).
const isStaleStripeEvent = (
  subscription: Doc<"subscriptions">,
  eventTimestamp?: number
) =>
  eventTimestamp !== undefined &&
  subscription.lastStripeEventAt !== undefined &&
  eventTimestamp < subscription.lastStripeEventAt;

// Upsert subscription (called by webhook handler)
export const upsert = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    plan: v.union(
      v.literal("starter"),
      v.literal("growing"),
      v.literal("thriving")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("unpaid"),
      v.literal("paused")
    ),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    eventTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      if (isStaleStripeEvent(existing, args.eventTimestamp)) {
        return existing._id;
      }
      await ctx.db.patch(existing._id, {
        stripeSubscriptionId: args.stripeSubscriptionId,
        stripeCustomerId: args.stripeCustomerId,
        stripePriceId: args.stripePriceId,
        plan: args.plan,
        status: args.status,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        pastDueSince:
          args.status === "past_due"
            ? existing.pastDueSince ?? now
            : undefined,
        lastStripeEventAt: args.eventTimestamp,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("subscriptions", {
        organizationId: args.organizationId,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        stripePriceId: args.stripePriceId,
        plan: args.plan,
        status: args.status,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        pastDueSince: args.status === "past_due" ? now : undefined,
        lastStripeEventAt: args.eventTimestamp,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Update subscription status (for webhook events like payment_failed)
export const updateStatus = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("unpaid"),
      v.literal("paused")
    ),
    eventTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (subscription && !isStaleStripeEvent(subscription, args.eventTimestamp)) {
      await ctx.db.patch(subscription._id, {
        status: args.status,
        pastDueSince:
          args.status === "past_due"
            ? subscription.pastDueSince ?? Date.now()
            : undefined,
        lastStripeEventAt: args.eventTimestamp ?? subscription.lastStripeEventAt,
        updatedAt: Date.now(),
      });
    }
  },
});

// Mark subscription as canceled
export const markCanceled = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    eventTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (subscription && !isStaleStripeEvent(subscription, args.eventTimestamp)) {
      await ctx.db.patch(subscription._id, {
        status: "canceled",
        lastStripeEventAt: args.eventTimestamp ?? subscription.lastStripeEventAt,
        updatedAt: Date.now(),
      });
    }
  },
});

// Get subscription to return cancel info (user-facing)
export const getForCancel = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (!isAdmin(user)) {
      throw new Error("Only admins can manage subscriptions");
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .first();

    if (!subscription) {
      throw new Error("No active subscription found");
    }

    return {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeCustomerId: subscription.stripeCustomerId,
    };
  },
});
